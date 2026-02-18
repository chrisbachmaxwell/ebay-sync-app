# Self-Hosted Image Processing Service — Project Documentation

> **Last updated:** 2026-02-18 06:07 MST  
> **⚠️ Any agent working on this project MUST update this file before finishing.**

---

## 1. Project Overview

**What:** A self-hosted background removal and product photography pipeline replacing PhotoRoom (paid SaaS).

**Why:**
- PhotoRoom costs money per image; Pictureline processes 1000s of product photos/month
- Full control over quality, speed, and customization
- Can fine-tune models on Pictureline's specific product types (camera gear)
- Eliminates vendor dependency

**Business context:** Pictureline is a camera store selling new and used gear. Products are photographed on a StyleShoots automated photo booth (white backgrounds, 4000×4000 JPEG). Photos need background removal → clean white bg → shadow → branding overlay → Shopify upload. Currently PhotoRoom handles the bg removal step.

**Location:** `~/projects/product-pipeline/image-service/`

---

## 2. Architecture

### Service Components

| Component | File | Purpose |
|-----------|------|---------|
| **API Server** | `server.py` | FastAPI, concurrency controls, timeouts, metrics, structured logging |
| **Background Removal** | `bg_removal.py` | BiRefNet ONNX inference (1024×1024 input, sigmoid mask) |
| **Image Processor** | `image_processor.py` | Edge refinement, centering, padding, dual-layer shadow, bg color |
| **Template Renderer** | `template_renderer.py` | Semi-transparent branding text bar overlay |
| **Logger** | `logger.py` | JSON structured logging with request ID tracking |
| **Startup** | `start.sh`, `run_server.py` | Convenience runners |

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health + system stats |
| `GET /metrics` | Processing metrics |
| `POST /remove-background` | BG removal only → PNG w/ transparency |
| `POST /process` | BG removal + white bg + padding + shadow |
| `POST /render-template` | Branding text bar overlay |
| `POST /process-full` | Full pipeline: remove → process → template |

### Integration with ProductPipeline

- Factory pattern: `IMAGE_PROCESSOR` env var selects processor
- Fallback: if self-hosted service is down, falls back to PhotoRoom
- Drive watcher (`src/watcher/drive-search.ts`) finds originals on StyleShoots drive

### Deployment Options

- **Local:** `uvicorn server:app --host 0.0.0.0 --port 8100`
- **Docker:** Multi-stage Dockerfile (Python 3.12-slim, non-root user, health checks)
- **VPS:** Deploy Docker image to any VPS with ≥4GB RAM

---

## 3. Current State

### Components

| Component | Status | Notes |
|-----------|--------|-------|
| FastAPI server | ✅ Done | Port 8100, concurrency controls, request queuing, structured logging |
| Background removal | ✅ Done | BiRefNet ONNX (upgraded from u2net), auto-downloads model |
| Image processor | ✅ Done | v3: color decontamination, adaptive erosion, dual-layer shadow |
| Template renderer | ✅ Done | Semi-transparent bar with configurable text/colors |
| Docker build | ✅ Done | Multi-stage, non-root, health checks |
| Quality benchmarking | ✅ Done | 7 test images, 3 iterations of improvement |
| Training data collection | ✅ Done | 254 originals from StyleShoots, 94 matched pairs with Shopify |
| Fine-tune pipeline | ✅ Done | 1,346 lines: prepare_data, finetune, evaluate, deploy |
| BRIA/BiRefNet upgrade | ✅ Done | Replaced u2net with BiRefNet (1024×1024 vs 320×320) |
| ProductPipeline integration | ⏳ Partial | Factory pattern designed, not yet wired |
| GPU acceleration | ❌ Not started | CPU-only currently |
| Authentication | ❌ Not started | No auth on endpoints |
| Batch processing | ❌ Not started | Single-image only |

### Build Timeline (2026-02-18)

| Time | Agent | What |
|------|-------|------|
| 3:50 AM | `self-hosted-photoroom` | Initial build: server, bg_removal, processor, template, Docker |
| 5:10 AM | `photoroom-foundation` | Got service running, bypassed rembg for direct ONNX |
| 5:10 AM | `photoroom-hardening` | Health checks, concurrency, metrics, structured logging |
| 5:10 AM | `photoroom-quality` | 3 iterations of quality improvement, benchmarking |
| 5:10 AM | `photoroom-integration` | ProductPipeline factory pattern wiring |
| 6:01 AM | `photoroom-bria-upgrade` | Swapped u2net → BiRefNet ONNX |
| 6:01 AM | `training-data-styleshoots` | Downloaded 254 originals from StyleShoots drive |
| 6:01 AM | `training-data-shopify` | Pulled processed images, matched 94 pairs |
| 6:01 AM | `finetune-pipeline` | Built full fine-tuning toolchain (1,346 lines) |

### Quality Level

- **Overall: 5.4/10** (iteration 3 average across 7 test images)
- Best case (single dark lens): **7/10**
- Worst case (tripod, white-on-white): **4/10**
- Good enough for secondary marketplace listings, not yet for hero product images

---

## 4. What's In Progress

### BiRefNet Upgrade ✅ (Complete)
- Replaced u2net (320×320) with BiRefNet ONNX (1024×1024)
- Significantly better edge quality, especially on complex shapes
- Model auto-downloads from HuggingFace to `~/.birefnet/`

### Training Data ✅ (Collected, awaiting fine-tune)
- **254 StyleShoots originals** across 6 categories (cameras, lenses, accessories)
- **94 matched pairs** (original + PhotoRoom-processed from Shopify)
- **5,555 total images available** on StyleShoots drive for future collection
- Gap: 160 originals unmatched due to filename divergence (fixable with fuzzy matching)

### Fine-Tune Pipeline ✅ (Built, awaiting execution)
- `prepare_data.py` — Match pairs → generate binary masks → train/val split
- `finetune.py` — BRIA RMBG-2.0 fine-tune with cosine LR, mixed precision, early stopping
- `evaluate.py` — Base vs fine-tuned comparison (IoU, Dice, edge accuracy)
- `deploy_model.py` — ONNX export + deploy to image-service
- **Needs:** GPU with ≥16GB VRAM to actually run (RTX 4090, A100, or cloud GPU)

---

## 5. Next Steps (Prioritized)

| # | Task | Who | Depends On | Impact |
|---|------|-----|------------|--------|
| 1 | **Run fine-tuning** on matched pairs | Agent + GPU | Cloud GPU (Vast.ai/RunPod) | High — model quality is the #1 bottleneck |
| 2 | **Evaluate fine-tuned model** vs base BiRefNet | Agent | Step 1 | Validates if training helped |
| 3 | **Expand training data** — fuzzy match remaining 160 originals | Agent | None | More data = better model |
| 4 | **Wire ProductPipeline integration** — factory pattern, fallback | Agent | Service stable | Enables actual production use |
| 5 | **Add authentication** to API endpoints | Agent | None | Security for production |
| 6 | **Deploy to VPS** for always-on availability | Agent/Chris | Steps 4-5 | Production readiness |
| 7 | **Add batch processing** endpoint | Agent | None | Throughput for bulk operations |
| 8 | **White-on-white handling** — subtle edge detection for light products | Agent | None | Addresses worst-case quality |
| 9 | **GPU acceleration** (onnxruntime-gpu or move to PyTorch) | Agent | GPU hardware | Speed: 2-5s → <1s per image |

---

## 6. How to Continue

### Start the Service
```bash
cd ~/projects/product-pipeline/image-service
source .venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8100
```

### Test It
```bash
# Quick test
curl -X POST http://localhost:8100/process \
  -F "image=@test_input.jpg" \
  -F "background=FFFFFF" \
  -F "shadow=true" \
  -o test_output.png

# Health check
curl http://localhost:8100/health

# Run quality benchmarks
python test_quality.py
```

### Fine-Tune (when GPU available)
```bash
# 1. Prepare data from matched pairs
python training/prepare_data.py \
    --originals training-data/originals \
    --processed training-data/processed \
    --output training-data/prepared

# 2. Fine-tune (needs GPU)
python training/finetune.py \
    --data training-data/prepared \
    --output runs/finetune \
    --epochs 50 --batch-size 4 --lr 1e-5

# 3. Evaluate
python training/evaluate.py \
    --finetuned runs/finetune/checkpoints/best_model.pt \
    --data training-data/prepared

# 4. Deploy
python training/deploy_model.py \
    --checkpoint runs/finetune/checkpoints/best_model.pt \
    --export-onnx --model-dir ~/.birefnet
```

### Key File Locations

| What | Where |
|------|-------|
| Service code | `~/projects/product-pipeline/image-service/*.py` |
| Docker config | `~/projects/product-pipeline/image-service/Dockerfile` |
| Training scripts | `~/projects/product-pipeline/image-service/training/` |
| Training data | `~/projects/product-pipeline/image-service/training-data/` |
| StyleShoots originals | `training-data/originals/` (254 images) |
| Matched pairs manifest | `training-data/manifest.json` (94 pairs) |
| BiRefNet model cache | `~/.birefnet/model_lite.onnx` |
| Test outputs | `test_output/` and `test-results/` |
| Quality report | `QUALITY-REPORT.md` |
| This document | `PROJECT.md` |

---

## 7. Decision Log

| Decision | Choice | Why |
|----------|--------|-----|
| **BG removal model** | BiRefNet (was u2net) | u2net uses 320×320 input — too low res. BiRefNet uses 1024×1024, much better edges. BRIA RMBG-2.0 is BiRefNet-based. |
| **ONNX vs PyTorch** | ONNX for inference | Faster CPU inference, no PyTorch dependency in production, smaller container |
| **Direct ONNX vs rembg** | Direct ONNX | rembg requires numba/llvmlite which won't build on Python 3.13. Direct ONNX is simpler and more reliable. |
| **Edge refinement approach** | Color decontamination + erosion | Post-hoc fix for model imperfections. Light erosion for BiRefNet (cleaner edges than u2net). |
| **Shadow style** | Dual-layer (contact + cast) | Single shadow looked flat. Contact shadow (tight blur) + cast shadow (wide blur) = realistic grounding. |
| **Integration pattern** | Factory + env var + fallback | `IMAGE_PROCESSOR=self-hosted` with automatic fallback to PhotoRoom if service is down. Zero-risk migration. |
| **Training strategy** | Fine-tune BRIA RMBG-2.0 on matched pairs | StyleShoots originals paired with PhotoRoom output gives us ground-truth masks for free. |
| **Python version** | 3.12 in Docker (3.13 local) | 3.13 has dependency issues (llvmlite). Docker uses 3.12 for stability. |

---

## 8. Quality Metrics

### Current Scores (Iteration 3, u2net — BiRefNet scores pending)

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Overall visual quality | 5.4/10 | 8/10 | Average across 7 diverse test images |
| Best case (single lens) | 7/10 | 9/10 | Dark object on white bg |
| Edge quality | 5.0/10 | 8/10 | Color decontamination helped |
| Shadow quality | 5.5/10 | 7/10 | Dual-layer approach |
| Centering accuracy | 5.5/10 | 9/10 | 10x improvement from iteration 1 |
| White-on-white | 4/10 | 7/10 | Hardest case, needs model improvement |

### How to Benchmark
```bash
# Run full quality test suite
python test_quality.py

# Results go to test-results/iteration-N/
# Metrics JSON at test-results/iteration-N/metrics.json
# Visual comparison: review output images manually
```

### Key Quality Bottleneck
The #1 quality limiter is the **background removal model**, not the post-processing pipeline. Fine-tuning on Pictureline's product types should yield the biggest improvement. The processing pipeline (shadow, centering, edges) is already at diminishing returns without better masks.

---

## Appendix: Dependencies

**Production:** `onnxruntime`, `fastapi`, `uvicorn`, `pillow`, `python-multipart`, `numpy`, `psutil`  
**Training:** `torch`, `torchvision`, `transformers`, `wandb` (optional)  
**Dev:** `scipy`, `pooch`, `tqdm`
