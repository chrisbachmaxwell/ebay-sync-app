#!/usr/bin/env python3
"""Fine-tune BRIA RMBG-2.0 / BiRefNet on custom product images.

Loads the base model from HuggingFace and fine-tunes on prepared
segmentation data (from prepare_data.py).

Usage:
    python finetune.py --data data/prepared --epochs 50 --batch-size 4

Supports:
    - Mixed precision (fp16/bf16)
    - Gradient accumulation
    - Cosine LR schedule with warmup
    - Early stopping on validation loss
    - Best model checkpointing
    - WandB logging (optional)
"""

import argparse
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.cuda.amp import GradScaler, autocast
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingWarmRestarts, LinearLR, SequentialLR
from torch.utils.data import DataLoader, Dataset
from PIL import Image
from torchvision import transforms

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


# ─── Dataset ───────────────────────────────────────────────────────────────────


class SegmentationDataset(Dataset):
    """Dataset of (image, mask) pairs for segmentation training."""

    def __init__(self, data_dir: Path, split: str = "train", size: int = 1024):
        self.image_dir = data_dir / split / "images"
        self.mask_dir = data_dir / split / "masks"
        self.size = size

        self.files = sorted(
            f.stem for f in self.image_dir.glob("*.png")
            if (self.mask_dir / f.name).exists()
        )
        if not self.files:
            raise ValueError(f"No data found in {data_dir / split}")

        # ImageNet normalization (what BiRefNet expects)
        self.img_transform = transforms.Compose([
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])
        self.mask_transform = transforms.Compose([
            transforms.Resize((size, size), interpolation=transforms.InterpolationMode.NEAREST),
            transforms.ToTensor(),
        ])

        # Training augmentations
        self.is_train = split == "train"

    def __len__(self):
        return len(self.files)

    def __getitem__(self, idx):
        name = self.files[idx]
        image = Image.open(self.image_dir / f"{name}.png").convert("RGB")
        mask = Image.open(self.mask_dir / f"{name}.png").convert("L")

        # Random horizontal flip for training
        if self.is_train and torch.rand(1).item() > 0.5:
            image = image.transpose(Image.FLIP_LEFT_RIGHT)
            mask = mask.transpose(Image.FLIP_LEFT_RIGHT)

        image = self.img_transform(image)
        mask = self.mask_transform(mask)
        # Binarize mask
        mask = (mask > 0.5).float()

        return image, mask


# ─── Losses ────────────────────────────────────────────────────────────────────


class DiceLoss(nn.Module):
    def __init__(self, smooth=1.0):
        super().__init__()
        self.smooth = smooth

    def forward(self, pred, target):
        pred = torch.sigmoid(pred)
        pred_flat = pred.view(-1)
        target_flat = target.view(-1)
        intersection = (pred_flat * target_flat).sum()
        return 1 - (2.0 * intersection + self.smooth) / (
            pred_flat.sum() + target_flat.sum() + self.smooth
        )


class CombinedLoss(nn.Module):
    """BCE + Dice loss, standard for segmentation."""
    def __init__(self, bce_weight=0.5, dice_weight=0.5):
        super().__init__()
        self.bce = nn.BCEWithLogitsLoss()
        self.dice = DiceLoss()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight

    def forward(self, pred, target):
        return self.bce_weight * self.bce(pred, target) + self.dice_weight * self.dice(pred, target)


# ─── Metrics ───────────────────────────────────────────────────────────────────


def compute_iou(pred: torch.Tensor, target: torch.Tensor, threshold=0.5) -> float:
    pred_bin = (torch.sigmoid(pred) > threshold).float()
    intersection = (pred_bin * target).sum()
    union = pred_bin.sum() + target.sum() - intersection
    if union == 0:
        return 1.0
    return (intersection / union).item()


def compute_dice(pred: torch.Tensor, target: torch.Tensor, threshold=0.5) -> float:
    pred_bin = (torch.sigmoid(pred) > threshold).float()
    intersection = (pred_bin * target).sum()
    total = pred_bin.sum() + target.sum()
    if total == 0:
        return 1.0
    return (2.0 * intersection / total).item()


# ─── Model Loading ─────────────────────────────────────────────────────────────


def load_model(model_name: str, device: torch.device):
    """Load BRIA RMBG-2.0 or BiRefNet from HuggingFace."""
    log.info(f"Loading model: {model_name}")

    if "RMBG" in model_name or "rmbg" in model_name:
        # BRIA RMBG-2.0
        from transformers import AutoModelForImageSegmentation
        model = AutoModelForImageSegmentation.from_pretrained(
            model_name, trust_remote_code=True
        )
    elif "BiRefNet" in model_name or "birefnet" in model_name:
        from transformers import AutoModelForImageSegmentation
        model = AutoModelForImageSegmentation.from_pretrained(
            model_name, trust_remote_code=True
        )
    else:
        # Generic fallback
        from transformers import AutoModelForImageSegmentation
        model = AutoModelForImageSegmentation.from_pretrained(
            model_name, trust_remote_code=True
        )

    model = model.to(device)
    log.info(f"Model loaded: {sum(p.numel() for p in model.parameters()):,} parameters")

    return model


def get_model_output(model, images) -> torch.Tensor:
    """Extract the primary segmentation output from model (handles multi-output)."""
    output = model(images)

    # BiRefNet / RMBG-2.0 may return a list of outputs at different scales
    if isinstance(output, (list, tuple)):
        # Last output is typically the finest/best
        out = output[-1]
    elif hasattr(output, "logits"):
        out = output.logits
    else:
        out = output

    # Ensure spatial dimensions match
    if out.shape[2:] != images.shape[2:]:
        out = F.interpolate(out, size=images.shape[2:], mode="bilinear", align_corners=False)

    # If output has >1 channel, take first (foreground channel)
    if out.shape[1] > 1:
        out = out[:, 0:1, :, :]

    return out


# ─── Training Loop ─────────────────────────────────────────────────────────────


def train_one_epoch(
    model, loader, optimizer, criterion, scaler, device, grad_accum_steps
):
    model.train()
    total_loss = 0
    total_iou = 0
    total_dice = 0
    n_batches = 0

    optimizer.zero_grad()
    for i, (images, masks) in enumerate(loader):
        images = images.to(device)
        masks = masks.to(device)

        with autocast(device_type=device.type, enabled=scaler is not None):
            pred = get_model_output(model, images)
            loss = criterion(pred, masks) / grad_accum_steps

        if scaler:
            scaler.scale(loss).backward()
        else:
            loss.backward()

        if (i + 1) % grad_accum_steps == 0 or (i + 1) == len(loader):
            if scaler:
                scaler.step(optimizer)
                scaler.update()
            else:
                optimizer.step()
            optimizer.zero_grad()

        total_loss += loss.item() * grad_accum_steps
        with torch.no_grad():
            total_iou += compute_iou(pred, masks)
            total_dice += compute_dice(pred, masks)
        n_batches += 1

    return {
        "loss": total_loss / n_batches,
        "iou": total_iou / n_batches,
        "dice": total_dice / n_batches,
    }


@torch.no_grad()
def validate(model, loader, criterion, device):
    model.eval()
    total_loss = 0
    total_iou = 0
    total_dice = 0
    n_batches = 0

    for images, masks in loader:
        images = images.to(device)
        masks = masks.to(device)

        with autocast(device_type=device.type, enabled=False):
            pred = get_model_output(model, images)
            loss = criterion(pred, masks)

        total_loss += loss.item()
        total_iou += compute_iou(pred, masks)
        total_dice += compute_dice(pred, masks)
        n_batches += 1

    return {
        "loss": total_loss / n_batches,
        "iou": total_iou / n_batches,
        "dice": total_dice / n_batches,
    }


def train(
    model_name: str,
    data_dir: Path,
    output_dir: Path,
    epochs: int = 50,
    batch_size: int = 4,
    lr: float = 1e-5,
    weight_decay: float = 0.01,
    grad_accum_steps: int = 4,
    patience: int = 10,
    input_size: int = 1024,
    use_fp16: bool = True,
    num_workers: int = 4,
    wandb_project: Optional[str] = None,
    resume_from: Optional[Path] = None,
):
    """Main training function."""
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    log.info(f"Using device: {device}")

    if device.type == "cpu":
        log.warning("Training on CPU — this will be very slow!")
        use_fp16 = False

    if device.type == "mps":
        use_fp16 = False  # MPS fp16 support is limited

    # Load data
    train_ds = SegmentationDataset(data_dir, "train", input_size)
    val_ds = SegmentationDataset(data_dir, "val", input_size)
    log.info(f"Dataset: {len(train_ds)} train, {len(val_ds)} val")

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=num_workers, pin_memory=True, drop_last=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, pin_memory=True,
    )

    # Load model
    model = load_model(model_name, device)

    # Freeze encoder, train decoder (transfer learning approach)
    # This is much faster and prevents catastrophic forgetting
    encoder_params = []
    decoder_params = []
    for name, param in model.named_parameters():
        if any(k in name.lower() for k in ["encoder", "backbone", "swin", "pvt"]):
            encoder_params.append(param)
            param.requires_grad = False  # Freeze encoder initially
        else:
            decoder_params.append(param)

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    log.info(f"Trainable: {trainable:,} / {total:,} parameters ({100*trainable/total:.1f}%)")

    optimizer = AdamW(
        [p for p in model.parameters() if p.requires_grad],
        lr=lr, weight_decay=weight_decay,
    )

    # Cosine schedule with linear warmup
    warmup_epochs = min(5, epochs // 5)
    warmup_scheduler = LinearLR(optimizer, start_factor=0.1, total_iters=warmup_epochs)
    cosine_scheduler = CosineAnnealingWarmRestarts(
        optimizer, T_0=epochs - warmup_epochs, T_mult=1
    )
    scheduler = SequentialLR(
        optimizer, [warmup_scheduler, cosine_scheduler], milestones=[warmup_epochs]
    )

    criterion = CombinedLoss()
    scaler = GradScaler() if use_fp16 else None

    # Output setup
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoints_dir = output_dir / "checkpoints"
    checkpoints_dir.mkdir(exist_ok=True)

    # Resume if requested
    start_epoch = 0
    best_val_loss = float("inf")
    if resume_from and resume_from.exists():
        ckpt = torch.load(resume_from, map_location=device)
        model.load_state_dict(ckpt["model_state_dict"])
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        start_epoch = ckpt.get("epoch", 0) + 1
        best_val_loss = ckpt.get("best_val_loss", float("inf"))
        log.info(f"Resumed from epoch {start_epoch}, best val loss: {best_val_loss:.4f}")

    # WandB
    if wandb_project:
        try:
            import wandb
            wandb.init(project=wandb_project, config={
                "model": model_name, "epochs": epochs, "batch_size": batch_size,
                "lr": lr, "grad_accum": grad_accum_steps, "input_size": input_size,
            })
        except ImportError:
            log.warning("wandb not installed, skipping logging")
            wandb_project = None

    # Training loop
    no_improve = 0
    history = []

    for epoch in range(start_epoch, epochs):
        t0 = time.time()

        # Unfreeze encoder after warmup for full fine-tuning
        if epoch == warmup_epochs:
            log.info("Unfreezing encoder for full fine-tuning")
            for param in encoder_params:
                param.requires_grad = True
            # Add encoder params to optimizer with lower LR
            optimizer.add_param_group({
                "params": encoder_params,
                "lr": lr * 0.1,
            })

        train_metrics = train_one_epoch(
            model, train_loader, optimizer, criterion, scaler, device, grad_accum_steps
        )
        val_metrics = validate(model, val_loader, criterion, device)
        scheduler.step()

        elapsed = time.time() - t0
        current_lr = optimizer.param_groups[0]["lr"]

        log.info(
            f"Epoch {epoch+1}/{epochs} ({elapsed:.0f}s) | "
            f"Train loss: {train_metrics['loss']:.4f} IoU: {train_metrics['iou']:.4f} | "
            f"Val loss: {val_metrics['loss']:.4f} IoU: {val_metrics['iou']:.4f} Dice: {val_metrics['dice']:.4f} | "
            f"LR: {current_lr:.2e}"
        )

        record = {
            "epoch": epoch + 1,
            "train": train_metrics,
            "val": val_metrics,
            "lr": current_lr,
            "time_s": elapsed,
        }
        history.append(record)

        if wandb_project:
            import wandb
            wandb.log({
                "train/loss": train_metrics["loss"],
                "train/iou": train_metrics["iou"],
                "train/dice": train_metrics["dice"],
                "val/loss": val_metrics["loss"],
                "val/iou": val_metrics["iou"],
                "val/dice": val_metrics["dice"],
                "lr": current_lr,
                "epoch": epoch + 1,
            })

        # Checkpointing
        is_best = val_metrics["loss"] < best_val_loss
        if is_best:
            best_val_loss = val_metrics["loss"]
            no_improve = 0
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "best_val_loss": best_val_loss,
                "val_metrics": val_metrics,
                "model_name": model_name,
            }, checkpoints_dir / "best_model.pt")
            log.info(f"  ★ New best model (val loss: {best_val_loss:.4f})")
        else:
            no_improve += 1

        # Save periodic checkpoint
        if (epoch + 1) % 10 == 0:
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "best_val_loss": best_val_loss,
                "model_name": model_name,
            }, checkpoints_dir / f"checkpoint_epoch_{epoch+1}.pt")

        # Early stopping
        if no_improve >= patience:
            log.info(f"Early stopping after {patience} epochs without improvement")
            break

    # Save training history
    with open(output_dir / "training_history.json", "w") as f:
        json.dump(history, f, indent=2)

    # Save final model
    torch.save({
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "model_name": model_name,
        "val_metrics": val_metrics,
    }, checkpoints_dir / "final_model.pt")

    log.info(f"Training complete. Best val loss: {best_val_loss:.4f}")
    log.info(f"Checkpoints saved to {checkpoints_dir}")

    if wandb_project:
        import wandb
        wandb.finish()

    return history


def main():
    parser = argparse.ArgumentParser(description="Fine-tune BRIA RMBG-2.0")
    parser.add_argument("--model", default="briaai/RMBG-2.0", help="HuggingFace model name")
    parser.add_argument("--data", type=Path, required=True, help="Prepared data directory")
    parser.add_argument("--output", type=Path, default=Path("runs/finetune"), help="Output directory")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--patience", type=int, default=10, help="Early stopping patience")
    parser.add_argument("--input-size", type=int, default=1024)
    parser.add_argument("--fp16", action="store_true", default=True)
    parser.add_argument("--no-fp16", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--wandb", type=str, default=None, help="WandB project name")
    parser.add_argument("--resume", type=Path, default=None, help="Resume from checkpoint")

    args = parser.parse_args()
    use_fp16 = args.fp16 and not args.no_fp16

    train(
        model_name=args.model,
        data_dir=args.data,
        output_dir=args.output,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        grad_accum_steps=args.grad_accum,
        patience=args.patience,
        input_size=args.input_size,
        use_fp16=use_fp16,
        num_workers=args.workers,
        wandb_project=args.wandb,
        resume_from=args.resume,
    )


if __name__ == "__main__":
    main()
