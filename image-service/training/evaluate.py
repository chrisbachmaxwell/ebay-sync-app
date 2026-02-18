#!/usr/bin/env python3
"""Evaluate base vs fine-tuned model on test images.

Generates metrics (IoU, Dice, edge accuracy, timing) and
side-by-side comparison images.

Usage:
    python evaluate.py \
        --base briaai/RMBG-2.0 \
        --finetuned runs/finetune/checkpoints/best_model.pt \
        --data data/prepared \
        --output eval_results
"""

import argparse
import json
import logging
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFont
from torch.utils.data import DataLoader

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def load_base_model(model_name: str, device: torch.device):
    from transformers import AutoModelForImageSegmentation
    model = AutoModelForImageSegmentation.from_pretrained(model_name, trust_remote_code=True)
    return model.to(device).eval()


def load_finetuned_model(model_name: str, checkpoint_path: Path, device: torch.device):
    from transformers import AutoModelForImageSegmentation
    model = AutoModelForImageSegmentation.from_pretrained(model_name, trust_remote_code=True)
    ckpt = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])
    return model.to(device).eval()


def get_prediction(model, images, device):
    """Run model and return sigmoid mask."""
    from finetune import get_model_output
    with torch.no_grad():
        pred = get_model_output(model, images)
    return torch.sigmoid(pred)


def compute_metrics(pred: np.ndarray, target: np.ndarray, threshold=0.5):
    """Compute all metrics for a single prediction."""
    pred_bin = (pred > threshold).astype(np.float32)
    target_bin = (target > threshold).astype(np.float32)

    # IoU
    intersection = (pred_bin * target_bin).sum()
    union = pred_bin.sum() + target_bin.sum() - intersection
    iou = intersection / max(union, 1e-8)

    # Dice
    dice = 2 * intersection / max(pred_bin.sum() + target_bin.sum(), 1e-8)

    # Edge accuracy (compare edges within 2px tolerance)
    from PIL import ImageFilter
    pred_edges = np.array(Image.fromarray((pred_bin * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)) > 50
    target_edges = np.array(Image.fromarray((target_bin * 255).astype(np.uint8)).filter(ImageFilter.FIND_EDGES)) > 50

    # Dilate target edges for tolerance
    target_edges_dilated = np.array(
        Image.fromarray(target_edges.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
    ) > 128

    if pred_edges.sum() > 0:
        edge_accuracy = (pred_edges & target_edges_dilated).sum() / pred_edges.sum()
    else:
        edge_accuracy = 1.0 if target_edges.sum() == 0 else 0.0

    return {
        "iou": float(iou),
        "dice": float(dice),
        "edge_accuracy": float(edge_accuracy),
    }


def create_comparison_image(
    original: np.ndarray,
    gt_mask: np.ndarray,
    base_mask: np.ndarray,
    ft_mask: np.ndarray,
    base_metrics: dict,
    ft_metrics: dict,
    name: str,
) -> Image.Image:
    """Create a side-by-side comparison image."""
    h, w = original.shape[:2]
    panel_w = w
    padding = 10
    label_h = 30
    total_w = panel_w * 4 + padding * 5
    total_h = h + label_h + padding * 2

    canvas = Image.new("RGB", (total_w, total_h), (30, 30, 30))
    draw = ImageDraw.Draw(canvas)

    panels = [
        ("Original", original),
        ("Ground Truth", np.stack([gt_mask]*3, axis=2)),
        (f"Base (IoU:{base_metrics['iou']:.3f})", np.stack([base_mask]*3, axis=2)),
        (f"Fine-tuned (IoU:{ft_metrics['iou']:.3f})", np.stack([ft_mask]*3, axis=2)),
    ]

    for i, (label, arr) in enumerate(panels):
        x = padding + i * (panel_w + padding)
        img = Image.fromarray(arr.astype(np.uint8))
        if img.size != (panel_w, h):
            img = img.resize((panel_w, h))
        canvas.paste(img, (x, label_h + padding))
        draw.text((x + 5, 5), label, fill=(255, 255, 255))

    return canvas


def evaluate(
    base_model_name: str,
    checkpoint_path: Path,
    data_dir: Path,
    output_dir: Path,
    input_size: int = 1024,
    max_samples: int = 0,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    log.info(f"Using device: {device}")

    # Load dataset
    from finetune import SegmentationDataset
    val_ds = SegmentationDataset(data_dir, "val", input_size)
    log.info(f"Evaluation set: {len(val_ds)} images")

    if max_samples > 0:
        from torch.utils.data import Subset
        indices = list(range(min(max_samples, len(val_ds))))
        val_ds = Subset(val_ds, indices)

    val_loader = DataLoader(val_ds, batch_size=1, shuffle=False, num_workers=2)

    # Load models
    log.info("Loading base model...")
    base_model = load_base_model(base_model_name, device)

    log.info("Loading fine-tuned model...")
    ft_model = load_finetuned_model(base_model_name, checkpoint_path, device)

    output_dir.mkdir(parents=True, exist_ok=True)
    comparisons_dir = output_dir / "comparisons"
    comparisons_dir.mkdir(exist_ok=True)

    base_all_metrics = []
    ft_all_metrics = []
    base_times = []
    ft_times = []

    for i, (images, masks) in enumerate(val_loader):
        images = images.to(device)
        name = f"sample_{i:04d}"

        # Base model
        t0 = time.time()
        base_pred = get_prediction(base_model, images, device)
        base_times.append(time.time() - t0)

        # Fine-tuned model
        t0 = time.time()
        ft_pred = get_prediction(ft_model, images, device)
        ft_times.append(time.time() - t0)

        # To numpy
        gt = masks[0, 0].numpy() * 255
        base_np = (base_pred[0, 0].cpu().numpy() * 255).clip(0, 255)
        ft_np = (ft_pred[0, 0].cpu().numpy() * 255).clip(0, 255)

        # Denormalize image for display
        mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
        orig_display = ((images[0].cpu() * std + mean) * 255).clamp(0, 255).permute(1, 2, 0).numpy().astype(np.uint8)

        base_m = compute_metrics(base_np / 255, gt / 255)
        ft_m = compute_metrics(ft_np / 255, gt / 255)

        base_all_metrics.append(base_m)
        ft_all_metrics.append(ft_m)

        # Save comparison
        comp = create_comparison_image(orig_display, gt, base_np, ft_np, base_m, ft_m, name)
        comp.save(comparisons_dir / f"{name}.png")

        if (i + 1) % 10 == 0:
            log.info(f"  Processed {i+1}/{len(val_loader)}")

    # Aggregate metrics
    def avg_metrics(metrics_list):
        keys = metrics_list[0].keys()
        return {k: np.mean([m[k] for m in metrics_list]) for k in keys}

    base_avg = avg_metrics(base_all_metrics)
    ft_avg = avg_metrics(ft_all_metrics)

    report = {
        "base_model": base_model_name,
        "checkpoint": str(checkpoint_path),
        "num_samples": len(base_all_metrics),
        "base_metrics": {k: round(v, 4) for k, v in base_avg.items()},
        "finetuned_metrics": {k: round(v, 4) for k, v in ft_avg.items()},
        "improvement": {
            k: round(ft_avg[k] - base_avg[k], 4) for k in base_avg
        },
        "timing": {
            "base_avg_ms": round(np.mean(base_times) * 1000, 1),
            "finetuned_avg_ms": round(np.mean(ft_times) * 1000, 1),
        },
    }

    with open(output_dir / "evaluation_report.json", "w") as f:
        json.dump(report, f, indent=2)

    # Print report
    print("\n" + "=" * 60)
    print("EVALUATION REPORT")
    print("=" * 60)
    print(f"Samples: {report['num_samples']}")
    print(f"\n{'Metric':<20} {'Base':>10} {'Fine-tuned':>12} {'Δ':>10}")
    print("-" * 52)
    for k in base_avg:
        print(f"{k:<20} {base_avg[k]:>10.4f} {ft_avg[k]:>12.4f} {ft_avg[k]-base_avg[k]:>+10.4f}")
    print(f"\n{'Avg inference (ms)':<20} {report['timing']['base_avg_ms']:>10.1f} {report['timing']['finetuned_avg_ms']:>12.1f}")
    print("=" * 60)
    print(f"\nComparisons saved to {comparisons_dir}")
    print(f"Full report: {output_dir / 'evaluation_report.json'}")

    return report


def main():
    parser = argparse.ArgumentParser(description="Evaluate base vs fine-tuned model")
    parser.add_argument("--base", default="briaai/RMBG-2.0", help="Base model name")
    parser.add_argument("--finetuned", type=Path, required=True, help="Fine-tuned checkpoint path")
    parser.add_argument("--data", type=Path, required=True, help="Prepared data directory")
    parser.add_argument("--output", type=Path, default=Path("eval_results"))
    parser.add_argument("--input-size", type=int, default=1024)
    parser.add_argument("--max-samples", type=int, default=0, help="Max samples (0=all)")
    args = parser.parse_args()

    evaluate(
        base_model_name=args.base,
        checkpoint_path=args.finetuned,
        data_dir=args.data,
        output_dir=args.output,
        input_size=args.input_size,
        max_samples=args.max_samples,
    )


if __name__ == "__main__":
    main()
