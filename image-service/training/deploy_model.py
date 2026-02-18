#!/usr/bin/env python3
"""Deploy a fine-tuned model to the image-service.

Steps:
1. Load fine-tuned checkpoint
2. Optionally export to ONNX for faster CPU inference
3. Copy to the image-service model directory
4. Update server config

Usage:
    python deploy_model.py \
        --checkpoint runs/finetune/checkpoints/best_model.pt \
        --export-onnx \
        --model-dir ~/.birefnet
"""

import argparse
import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path

import torch

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def export_to_onnx(
    model_name: str,
    checkpoint_path: Path,
    output_path: Path,
    input_size: int = 1024,
    opset_version: int = 17,
):
    """Export fine-tuned model to ONNX format."""
    log.info("Exporting to ONNX...")

    from transformers import AutoModelForImageSegmentation
    model = AutoModelForImageSegmentation.from_pretrained(model_name, trust_remote_code=True)
    ckpt = torch.load(checkpoint_path, map_location="cpu")
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    dummy_input = torch.randn(1, 3, input_size, input_size)

    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        opset_version=opset_version,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "output": {0: "batch_size"},
        },
    )

    size_mb = output_path.stat().st_size / (1024 * 1024)
    log.info(f"ONNX model saved: {output_path} ({size_mb:.1f} MB)")

    # Validate ONNX
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(str(output_path))
        test_input = {session.get_inputs()[0].name: dummy_input.numpy()}
        session.run(None, test_input)
        log.info("ONNX validation passed ✓")
    except Exception as e:
        log.warning(f"ONNX validation failed: {e}")

    return output_path


def deploy(
    checkpoint_path: Path,
    model_dir: Path,
    export_onnx: bool = False,
    model_name: str = "briaai/RMBG-2.0",
    input_size: int = 1024,
    backup: bool = True,
):
    """Deploy fine-tuned model."""
    model_dir.mkdir(parents=True, exist_ok=True)

    # Load checkpoint metadata
    ckpt = torch.load(checkpoint_path, map_location="cpu")
    ckpt_model_name = ckpt.get("model_name", model_name)
    val_metrics = ckpt.get("val_metrics", {})
    epoch = ckpt.get("epoch", "unknown")

    log.info(f"Deploying checkpoint from epoch {epoch}")
    if val_metrics:
        log.info(f"  Val metrics: {json.dumps(val_metrics, indent=2)}")

    # Backup existing model
    if backup:
        existing_onnx = model_dir / "model_lite.onnx"
        if existing_onnx.exists():
            backup_name = f"model_lite.onnx.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            shutil.copy2(existing_onnx, model_dir / backup_name)
            log.info(f"Backed up existing model to {backup_name}")

    if export_onnx:
        onnx_path = model_dir / "model_finetuned.onnx"
        export_to_onnx(ckpt_model_name, checkpoint_path, onnx_path, input_size)

        # Also create a symlink/copy as the active model
        active_path = model_dir / "model_lite.onnx"
        if active_path.exists():
            active_path.unlink()
        shutil.copy2(onnx_path, active_path)
        log.info(f"Active model updated: {active_path}")
    else:
        # Copy PyTorch checkpoint
        dest = model_dir / "finetuned_checkpoint.pt"
        shutil.copy2(checkpoint_path, dest)
        log.info(f"Checkpoint copied to {dest}")

    # Write deployment metadata
    meta = {
        "deployed_at": datetime.now().isoformat(),
        "source_checkpoint": str(checkpoint_path),
        "model_name": ckpt_model_name,
        "epoch": epoch,
        "val_metrics": val_metrics,
        "onnx_exported": export_onnx,
        "input_size": input_size,
    }
    with open(model_dir / "deployment_info.json", "w") as f:
        json.dump(meta, f, indent=2)

    log.info(f"Deployment complete → {model_dir}")
    log.info("Restart the image-service to use the new model.")


def main():
    parser = argparse.ArgumentParser(description="Deploy fine-tuned model")
    parser.add_argument("--checkpoint", type=Path, required=True, help="Fine-tuned checkpoint")
    parser.add_argument("--model-dir", type=Path, default=Path.home() / ".birefnet", help="Model directory")
    parser.add_argument("--model-name", default="briaai/RMBG-2.0", help="Base model name (for ONNX export)")
    parser.add_argument("--export-onnx", action="store_true", help="Export to ONNX")
    parser.add_argument("--input-size", type=int, default=1024)
    parser.add_argument("--no-backup", action="store_true")
    args = parser.parse_args()

    deploy(
        checkpoint_path=args.checkpoint,
        model_dir=args.model_dir,
        export_onnx=args.export_onnx,
        model_name=args.model_name,
        input_size=args.input_size,
        backup=not args.no_backup,
    )


if __name__ == "__main__":
    main()
