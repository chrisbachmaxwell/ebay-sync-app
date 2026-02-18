# BRIA RMBG-2.0 Fine-Tuning Pipeline

Fine-tune the BRIA RMBG-2.0 background removal model on Pictureline's product images for better results on camera gear, tripods, and other photography equipment.

## Overview

| Script | Purpose |
|--------|---------|
| `prepare_data.py` | Match original/processed pairs → generate masks → train/val split |
| `finetune.py` | Fine-tune RMBG-2.0 with cosine LR, mixed precision, early stopping |
| `evaluate.py` | Compare base vs fine-tuned: IoU, Dice, edge accuracy, timing |
| `deploy_model.py` | Export to ONNX and deploy to image-service |

## Prerequisites

```bash
# From the image-service directory
pip install -r requirements-training.txt

# For GPU training (recommended):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

**Hardware requirements:**
- Fine-tuning: GPU with ≥16GB VRAM (RTX 4090, A100, etc.)
- Data prep/eval: CPU is fine (GPU speeds up eval)
- The 1024×1024 input size is memory-hungry; reduce `--input-size 512` if needed

## Step 1: Prepare Training Data

You need two directories:
- **originals/** — Product photos with background (from StyleShoots)
- **processed/** — Same products with background removed (from Shopify)

Files are matched by filename (e.g., `canon-r5.jpg` ↔ `canon-r5.png`).

```bash
python training/prepare_data.py \
    --originals data/originals \
    --processed data/processed \
    --output data/prepared \
    --size 1024 \
    --val-split 0.1

# Quick test with fewer images:
python training/prepare_data.py \
    --originals data/originals \
    --processed data/processed \
    --output data/prepared \
    --max-samples 10
```

Output structure:
```
data/prepared/
├── train/
│   ├── images/    # Resized originals (1024×1024 PNG)
│   └── masks/     # Binary segmentation masks
├── val/
│   ├── images/
│   └── masks/
└── manifest.json  # Dataset metadata
```

**Inspect the output!** Check a few masks visually to make sure they look correct before training.

## Step 2: Fine-Tune

### Local (GPU required)

```bash
python training/finetune.py \
    --model briaai/RMBG-2.0 \
    --data data/prepared \
    --output runs/finetune \
    --epochs 50 \
    --batch-size 4 \
    --lr 1e-5 \
    --grad-accum 4 \
    --patience 10

# With WandB logging:
python training/finetune.py \
    --data data/prepared \
    --wandb pictureline-rmbg

# Resume interrupted training:
python training/finetune.py \
    --data data/prepared \
    --resume runs/finetune/checkpoints/best_model.pt
```

### Cloud GPU (Vast.ai / RunPod)

1. **Launch instance:** Pick a GPU with ≥16GB VRAM (RTX 4090 is great value)

2. **Setup:**
   ```bash
   # SSH into the instance
   git clone <your-repo> && cd product-pipeline/image-service
   pip install -r requirements-training.txt
   ```

3. **Upload data:**
   ```bash
   # From your local machine
   rsync -avz data/prepared/ user@instance:/workspace/data/prepared/
   ```

4. **Train:**
   ```bash
   python training/finetune.py \
       --data /workspace/data/prepared \
       --output /workspace/runs/finetune \
       --epochs 50 --batch-size 8 --fp16
   ```

5. **Download results:**
   ```bash
   rsync -avz user@instance:/workspace/runs/finetune/ runs/finetune/
   ```

### Training Tips

- **Start small:** Test with `--max-samples 20` and `--epochs 5` first
- **Batch size:** 4 on 16GB, 8 on 24GB, 16+ on 40GB+
- **Grad accumulation:** Effective batch = batch_size × grad_accum (default: 4×4=16)
- **Learning rate:** 1e-5 is a safe default; try 5e-6 if unstable
- **Encoder freezing:** The script freezes the encoder during warmup, then unfreezes for full fine-tuning. This prevents early catastrophic forgetting.

## Step 3: Evaluate

```bash
python training/evaluate.py \
    --base briaai/RMBG-2.0 \
    --finetuned runs/finetune/checkpoints/best_model.pt \
    --data data/prepared \
    --output eval_results

# Quick check with fewer samples:
python training/evaluate.py \
    --finetuned runs/finetune/checkpoints/best_model.pt \
    --data data/prepared \
    --max-samples 20
```

Output:
```
eval_results/
├── evaluation_report.json    # Full metrics
└── comparisons/              # Side-by-side PNGs
    ├── sample_0000.png       # Original | GT | Base | Fine-tuned
    ├── sample_0001.png
    └── ...
```

**What to look for:**
- IoU improvement > 0.02 means the fine-tuning helped
- Check edge_accuracy especially — that's where product-specific training shines
- Look at the comparison images for your hardest cases (white products, thin tripod legs)

## Step 4: Deploy

```bash
# Deploy with ONNX export (recommended for production):
python training/deploy_model.py \
    --checkpoint runs/finetune/checkpoints/best_model.pt \
    --export-onnx \
    --model-dir ~/.birefnet

# Deploy PyTorch checkpoint only:
python training/deploy_model.py \
    --checkpoint runs/finetune/checkpoints/best_model.pt \
    --model-dir ~/.birefnet
```

Then restart the image-service:
```bash
# Docker
docker-compose restart image-service

# Or direct
./start.sh
```

The deployment script:
- Backs up the existing model automatically
- Exports to ONNX for fast CPU inference
- Writes `deployment_info.json` with metadata
- Replaces `model_lite.onnx` (what `bg_removal.py` loads)

## Troubleshooting

**Out of memory during training:**
- Reduce `--batch-size` (try 2 or 1)
- Reduce `--input-size 512`
- Increase `--grad-accum` to compensate for smaller batch

**Poor mask quality from prepare_data:**
- Check that originals and processed images actually match
- The processed images should have either alpha transparency or white backgrounds
- Try adjusting thresholds in `prepare_data.py` (DIFF_THRESHOLD, ALPHA_THRESHOLD)

**Training loss not decreasing:**
- Lower learning rate (`--lr 5e-6`)
- Check your data — bad masks = bad training
- Make sure you have enough data (50+ pairs minimum, 200+ ideal)

**ONNX export fails:**
- Some model variants have unsupported ops
- Try a different `--opset-version` (14, 16, 17)
- Fall back to PyTorch checkpoint deployment
