"""Stage 1 — Preprocess violin crops.

Invert dark background, upscale, boost contrast.
Input:  individual violin crop PNGs in data/raw/
Output: preprocessed PNGs in data/preprocessed/
"""

import re
from PIL import Image, ImageOps, ImageEnhance

from pipeline.config import (
    DATA_RAW,
    DATA_PREPROCESSED,
    BACKGROUND_RGB,
    UPSCALE_FACTOR,
    CONTRAST_FACTOR,
)

FILENAME_PATTERN = re.compile(r"^row(\d+)_col(\d+)\.png$")


def preprocess_crop(path, target_height):
    """Pad, invert, upscale, and contrast-boost a single crop.

    Returns the output path.
    """
    img = Image.open(path).convert("RGB")

    # Pad to uniform height — padding at top, image pinned to bottom
    if img.height < target_height:
        padded = Image.new("RGB", (img.width, target_height), BACKGROUND_RGB)
        padded.paste(img, (0, target_height - img.height))
        img = padded

    img = ImageOps.invert(img)

    new_size = (img.width * UPSCALE_FACTOR, img.height * UPSCALE_FACTOR)
    img = img.resize(new_size, Image.LANCZOS)

    img = ImageEnhance.Contrast(img).enhance(CONTRAST_FACTOR)

    DATA_PREPROCESSED.mkdir(parents=True, exist_ok=True)
    out_path = DATA_PREPROCESSED / path.name
    img.save(out_path)
    return out_path


def preprocess_all():
    """Process all raw crops. Returns (processed_files, count)."""
    crops = sorted(
        p for p in DATA_RAW.iterdir()
        if p.is_file() and FILENAME_PATTERN.match(p.name)
    )

    if not crops:
        print("WARNING: No crops found in", DATA_RAW)
        return [], 0

    if len(crops) < 72:
        print(f"WARNING: Expected 72 crops, found {len(crops)}")

    # Find max height for uniform padding
    max_height = 0
    for p in crops:
        with Image.open(p) as img:
            if img.height > max_height:
                max_height = img.height

    processed = []
    for p in crops:
        out = preprocess_crop(p, max_height)
        processed.append(out)
        print(f"  [{len(processed):>2}/{len(crops)}] {p.name} -> {out.name}")

    print(f"Stage 1 complete: {len(processed)} crops preprocessed (target height: {max_height}px)")
    return processed, len(processed)


if __name__ == "__main__":
    preprocess_all()
