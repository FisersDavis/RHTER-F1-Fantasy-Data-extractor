"""Stage 1 — Preprocess raw violin crops for extraction.

Reads 72 raw crops from data/raw/, applies:
  1. Normalize dimensions (pad to largest width AND height with dark background)
  2. Invert (dark background → light background)
  3. Upscale (LANCZOS resampling)
  4. Boost contrast

Output: uniform preprocessed PNGs in data/preprocessed/

Usage: python -m pipeline.01_preprocess
"""

import re

from PIL import Image, ImageEnhance, ImageOps

from pipeline.config import (
    BACKGROUND_RGB,
    CONTRAST_FACTOR,
    DATA_PREPROCESSED,
    DATA_RAW,
    UPSCALE_FACTOR,
)

FILENAME_PATTERN = re.compile(r"^row(\d+)_col(\d+)\.png$")


def normalize(img, target_w, target_h):
    """Pad crop to target dimensions with dark background.

    Width is centered; height pads at top so violin body + driver labels
    stay pinned to the bottom edge.
    """
    w, h = img.size
    if w == target_w and h == target_h:
        return img

    canvas = Image.new("RGB", (target_w, target_h), BACKGROUND_RGB)
    x_offset = (target_w - w) // 2
    y_offset = target_h - h  # pin content to bottom
    canvas.paste(img, (x_offset, y_offset))
    return canvas


def preprocess_crop(img, target_w, target_h):
    """Normalize, invert, upscale, and contrast-boost a single crop image."""
    img = normalize(img, target_w, target_h)
    img = ImageOps.invert(img)

    new_size = (img.width * UPSCALE_FACTOR, img.height * UPSCALE_FACTOR)
    img = img.resize(new_size, Image.LANCZOS)

    img = ImageEnhance.Contrast(img).enhance(CONTRAST_FACTOR)
    return img


def preprocess_all():
    """Preprocess all raw crops and save to data/preprocessed/.

    Returns (list_of_output_paths, count).
    """
    if not DATA_RAW.exists():
        print(f"ERROR: Raw crops directory not found: {DATA_RAW}")
        print("  Run Stage 0 (cropping) first.")
        return [], 0

    crops = sorted(
        p for p in DATA_RAW.iterdir()
        if p.is_file() and FILENAME_PATTERN.match(p.name)
    )

    if not crops:
        print(f"ERROR: No raw crops found in {DATA_RAW}")
        return [], 0

    if len(crops) < 72:
        print(f"WARNING: Expected 72 crops, found {len(crops)}")

    print(f"Stage 1: Preprocessing {len(crops)} crops from {DATA_RAW}")

    # Find uniform target dimensions (max width and max height across all crops)
    max_w, max_h = 0, 0
    for p in crops:
        with Image.open(p) as img:
            w, h = img.size
            max_w = max(max_w, w)
            max_h = max(max_h, h)

    print(f"  Target dimensions: {max_w}x{max_h}px (before {UPSCALE_FACTOR}x upscale)")

    DATA_PREPROCESSED.mkdir(parents=True, exist_ok=True)
    processed = []

    for p in crops:
        img = Image.open(p).convert("RGB")
        result = preprocess_crop(img, max_w, max_h)
        out_path = DATA_PREPROCESSED / p.name
        result.save(out_path)
        processed.append(out_path)

    out_w = max_w * UPSCALE_FACTOR
    out_h = max_h * UPSCALE_FACTOR
    print(f"  Output dimensions: {out_w}x{out_h}px")
    print(f"  Saved {len(processed)} preprocessed crops to {DATA_PREPROCESSED}")
    return processed, len(processed)


if __name__ == "__main__":
    preprocess_all()
