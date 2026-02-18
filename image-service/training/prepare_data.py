#!/usr/bin/env python3
"""Training data preparation for BRIA RMBG-2.0 / BiRefNet fine-tuning.

Takes matched pairs of original images (with background) and processed images
(background removed by Shopify/existing pipeline) and generates binary
segmentation masks suitable for fine-tuning.

Directory structure expected:
    data/originals/   - Original product photos (from StyleShoots)
    data/processed/   - Background-removed versions (from Shopify)

Files are matched by name (stem must match, extensions can differ).

Output structure:
    data/prepared/
        train/
            images/     - Resized originals (1024x1024)
            masks/      - Binary masks (1024x1024, single channel)
        val/
            images/
            masks/
        manifest.json   - Metadata about the dataset
"""

import argparse
import json
import logging
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageFilter
from sklearn.model_selection import train_test_split

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# Supported image extensions
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".bmp"}

# Default output size matching BiRefNet input
DEFAULT_SIZE = 1024

# Thresholds for mask generation and validation
ALPHA_THRESHOLD = 128          # Alpha channel threshold for foreground
DIFF_THRESHOLD = 30            # Color difference threshold (0-255)
MIN_FOREGROUND_RATIO = 0.01    # Reject if foreground < 1% of image
MAX_FOREGROUND_RATIO = 0.99    # Reject if foreground > 99% of image
MIN_EDGE_PIXELS = 50           # Minimum edge pixels for a valid mask
SSIM_THRESHOLD = 0.3           # Minimum structural similarity for pair validation


def find_image_pairs(
    originals_dir: Path, processed_dir: Path
) -> list[tuple[Path, Path]]:
    """Match original and processed images by filename stem."""
    orig_by_stem: dict[str, Path] = {}
    for f in originals_dir.iterdir():
        if f.suffix.lower() in IMAGE_EXTS and not f.name.startswith("."):
            stem = f.stem.lower()
            orig_by_stem[stem] = f

    pairs = []
    unmatched_processed = []
    for f in processed_dir.iterdir():
        if f.suffix.lower() in IMAGE_EXTS and not f.name.startswith("."):
            stem = f.stem.lower()
            if stem in orig_by_stem:
                pairs.append((orig_by_stem[stem], f))
            else:
                unmatched_processed.append(f.name)

    unmatched_originals = set(orig_by_stem.keys()) - {
        f.stem.lower() for _, f in pairs
    }

    log.info(f"Found {len(pairs)} matched pairs")
    if unmatched_originals:
        log.warning(f"{len(unmatched_originals)} originals without processed match")
    if unmatched_processed:
        log.warning(f"{len(unmatched_processed)} processed without original match")

    return sorted(pairs, key=lambda p: p[0].stem.lower())


def generate_mask_from_alpha(processed: Image.Image) -> Optional[np.ndarray]:
    """Generate mask from alpha channel if present."""
    if processed.mode != "RGBA":
        return None
    alpha = np.array(processed.split()[-1])
    mask = (alpha >= ALPHA_THRESHOLD).astype(np.uint8) * 255
    return mask


def generate_mask_from_diff(
    original: Image.Image, processed: Image.Image
) -> np.ndarray:
    """Generate mask by comparing original vs processed (background-removed).

    The processed image typically has a white or transparent background.
    We detect foreground by finding pixels that are similar between both images
    (the product itself) vs pixels that differ (background replaced with white).
    """
    # Ensure same size
    if original.size != processed.size:
        processed = processed.resize(original.size, Image.LANCZOS)

    orig_arr = np.array(original.convert("RGB")).astype(np.float32)
    proc_arr = np.array(processed.convert("RGB")).astype(np.float32)

    # Per-pixel color difference
    diff = np.sqrt(np.mean((orig_arr - proc_arr) ** 2, axis=2))

    # Where images are similar = foreground (product is preserved)
    # Where images differ = background (was replaced)
    # But we need to handle the case where the original background is also white
    
    # Strategy: pixels where processed is near-white AND original differs → background
    proc_brightness = np.mean(proc_arr, axis=2)
    is_white_in_processed = proc_brightness > 240

    # Foreground: either not white in processed, or similar to original
    foreground = (~is_white_in_processed) | (diff < DIFF_THRESHOLD)
    mask = foreground.astype(np.uint8) * 255

    return mask


def refine_mask(mask: np.ndarray) -> np.ndarray:
    """Clean up mask with morphological operations."""
    from PIL import ImageFilter

    mask_img = Image.fromarray(mask, mode="L")

    # Remove small noise with median filter
    mask_img = mask_img.filter(ImageFilter.MedianFilter(5))

    # Slight dilation then erosion to close small gaps
    mask_img = mask_img.filter(ImageFilter.MaxFilter(3))
    mask_img = mask_img.filter(ImageFilter.MinFilter(3))

    # Re-threshold to ensure binary
    arr = np.array(mask_img)
    arr = ((arr > 128).astype(np.uint8)) * 255
    return arr


def validate_mask(mask: np.ndarray, name: str) -> bool:
    """Validate that a mask looks reasonable."""
    total = mask.size
    fg_ratio = np.sum(mask > 128) / total

    if fg_ratio < MIN_FOREGROUND_RATIO:
        log.warning(f"[{name}] Rejected: foreground ratio {fg_ratio:.3f} too low")
        return False
    if fg_ratio > MAX_FOREGROUND_RATIO:
        log.warning(f"[{name}] Rejected: foreground ratio {fg_ratio:.3f} too high")
        return False

    # Check edge complexity (should have meaningful contours)
    mask_img = Image.fromarray(mask, mode="L")
    edges = mask_img.filter(ImageFilter.FIND_EDGES)
    edge_count = np.sum(np.array(edges) > 50)
    if edge_count < MIN_EDGE_PIXELS:
        log.warning(f"[{name}] Rejected: only {edge_count} edge pixels (trivial mask)")
        return False

    return True


def validate_pair(original: Image.Image, processed: Image.Image, name: str) -> bool:
    """Validate that a pair of images is a reasonable match."""
    # Check aspect ratio similarity (allow some crop tolerance)
    orig_aspect = original.width / original.height
    proc_aspect = processed.width / processed.height
    if abs(orig_aspect - proc_aspect) > 0.3:
        log.warning(
            f"[{name}] Rejected: aspect ratio mismatch "
            f"({orig_aspect:.2f} vs {proc_aspect:.2f})"
        )
        return False

    # Check that images aren't too small
    if original.width < 100 or original.height < 100:
        log.warning(f"[{name}] Rejected: original too small ({original.size})")
        return False

    return True


def process_pair(
    orig_path: Path,
    proc_path: Path,
    output_size: int,
) -> Optional[tuple[Image.Image, Image.Image]]:
    """Process a single image pair into (resized_original, mask)."""
    name = orig_path.stem

    try:
        original = Image.open(orig_path).convert("RGB")
        processed = Image.open(proc_path)
    except Exception as e:
        log.warning(f"[{name}] Failed to open images: {e}")
        return None

    if not validate_pair(original, processed, name):
        return None

    # Try alpha channel first, fall back to diff-based
    mask = generate_mask_from_alpha(processed)
    if mask is None:
        mask = generate_mask_from_diff(original, processed)

    # Handle resolution mismatch
    if mask.shape[:2] != (original.height, original.width):
        mask_img = Image.fromarray(mask, mode="L")
        mask_img = mask_img.resize(original.size, Image.LANCZOS)
        mask = np.array(mask_img)
        mask = ((mask > 128).astype(np.uint8)) * 255

    mask = refine_mask(mask)

    if not validate_mask(mask, name):
        return None

    # Resize to output size
    resized_orig = original.resize((output_size, output_size), Image.LANCZOS)
    resized_mask = Image.fromarray(mask, mode="L").resize(
        (output_size, output_size), Image.NEAREST
    )

    return resized_orig, resized_mask


def prepare_dataset(
    originals_dir: Path,
    processed_dir: Path,
    output_dir: Path,
    output_size: int = DEFAULT_SIZE,
    val_split: float = 0.1,
    seed: int = 42,
    max_samples: Optional[int] = None,
):
    """Prepare the full dataset."""
    pairs = find_image_pairs(originals_dir, processed_dir)
    if not pairs:
        log.error("No matched pairs found!")
        sys.exit(1)

    if max_samples:
        pairs = pairs[:max_samples]

    # Process all pairs
    results = []
    stats = defaultdict(int)

    for orig_path, proc_path in pairs:
        result = process_pair(orig_path, proc_path, output_size)
        if result is not None:
            results.append((orig_path.stem, result[0], result[1]))
            stats["accepted"] += 1
        else:
            stats["rejected"] += 1

    log.info(
        f"Processed {len(pairs)} pairs: "
        f"{stats['accepted']} accepted, {stats['rejected']} rejected"
    )

    if not results:
        log.error("No valid pairs after processing!")
        sys.exit(1)

    # Split into train/val
    names = [r[0] for r in results]
    train_names, val_names = train_test_split(
        names, test_size=val_split, random_state=seed
    )
    train_set = set(train_names)
    val_set = set(val_names)

    # Create output directories
    for split in ["train", "val"]:
        (output_dir / split / "images").mkdir(parents=True, exist_ok=True)
        (output_dir / split / "masks").mkdir(parents=True, exist_ok=True)

    # Save images and masks
    for name, image, mask in results:
        split = "train" if name in train_set else "val"
        image.save(output_dir / split / "images" / f"{name}.png")
        mask.save(output_dir / split / "masks" / f"{name}.png")

    # Write manifest
    manifest = {
        "created": datetime.now().isoformat(),
        "output_size": output_size,
        "total_pairs_found": len(pairs),
        "accepted": stats["accepted"],
        "rejected": stats["rejected"],
        "train_count": len(train_names),
        "val_count": len(val_names),
        "val_split": val_split,
        "seed": seed,
        "train_files": sorted(train_names),
        "val_files": sorted(val_names),
    }
    with open(output_dir / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    log.info(
        f"Dataset ready: {len(train_names)} train, {len(val_names)} val "
        f"→ {output_dir}"
    )
    return manifest


def main():
    parser = argparse.ArgumentParser(
        description="Prepare training data for background removal fine-tuning"
    )
    parser.add_argument(
        "--originals",
        type=Path,
        required=True,
        help="Directory of original images (with background)",
    )
    parser.add_argument(
        "--processed",
        type=Path,
        required=True,
        help="Directory of processed images (background removed)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/prepared"),
        help="Output directory (default: data/prepared)",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=DEFAULT_SIZE,
        help=f"Output image size (default: {DEFAULT_SIZE})",
    )
    parser.add_argument(
        "--val-split",
        type=float,
        default=0.1,
        help="Validation split ratio (default: 0.1)",
    )
    parser.add_argument(
        "--seed", type=int, default=42, help="Random seed (default: 42)"
    )
    parser.add_argument(
        "--max-samples",
        type=int,
        default=None,
        help="Max samples to process (for testing)",
    )

    args = parser.parse_args()
    prepare_dataset(
        originals_dir=args.originals,
        processed_dir=args.processed,
        output_dir=args.output,
        output_size=args.size,
        val_split=args.val_split,
        seed=args.seed,
        max_samples=args.max_samples,
    )


if __name__ == "__main__":
    main()
