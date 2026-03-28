"""Stage 0 — Crop 72 individual violins from a full RHTER screenshot.

Uses gap-detection to find precise column boundaries (columns are NOT uniform
width). Each crop captures the full violin: 4 header numbers, violin body
with percentile labels, and 5 driver names.

Input:  full RHTER screenshot in data/screenshots/
Output: 72 PNGs in data/raw/ named row{r}_col{cc}.png

Grid coordinates calibrated against the 1560x877 RHTER RW1 screenshot,
then scaled proportionally for other resolutions.
"""

import sys

import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter1d

from pipeline.config import DATA_RAW, DATA_SCREENSHOTS, BACKGROUND_RGB

# ---------------------------------------------------------------------------
# Grid constants (calibrated from 1560x877 reference screenshot)
# All values are in reference coordinates; scaled at runtime.
# ---------------------------------------------------------------------------
NUM_COLS = 24
REF_W, REF_H = 1560, 877

# Row boundaries in reference coords (top of header numbers to bottom of driver names)
REF_ROW_BOUNDS = [
    (80, 333),   # Row 0 — height 253px
    (343, 596),  # Row 1 — height 253px
    (606, 860),  # Row 2 — height 254px
]

# Approximate content area in reference coords (for gap detection scan range)
REF_CONTENT_X_START = 28
REF_CONTENT_X_END = 1340

# Gap width filter in reference coords (real inter-violin gaps are 8-20px)
REF_GAP_MIN = 8
REF_GAP_MAX = 20


def detect_column_boundaries(img_array, scale_x, scale_y):
    """Detect column boundaries by finding vertical dark gaps between violins.

    Scans Row 0 for vertical strips close to the RHTER dark background color.
    All reference constants are scaled by scale_x / scale_y.

    Returns list of 25 x-coordinates (24 column boundaries) or None on failure.
    """
    # Scale reference coords to actual image
    y_top = int(REF_ROW_BOUNDS[0][0] * scale_y)
    y_bottom = int(REF_ROW_BOUNDS[0][1] * scale_y)
    x_start = int(REF_CONTENT_X_START * scale_x)
    x_end = int(REF_CONTENT_X_END * scale_x)
    gap_min = int(REF_GAP_MIN * scale_x)
    gap_max = int(REF_GAP_MAX * scale_x)
    smooth_size = max(3, int(3 * scale_x))

    row_strip = img_array[y_top:y_bottom, x_start:x_end]

    bg = np.array(BACKGROUND_RGB, dtype=np.float32)
    pixels = row_strip.astype(np.float32)
    diffs = np.sqrt(np.sum((pixels - bg) ** 2, axis=2))
    distances = diffs.mean(axis=0)

    smoothed = uniform_filter1d(distances, size=smooth_size)
    threshold = np.percentile(smoothed, 25)
    is_dark = smoothed < threshold

    # Find runs of dark pixels
    gaps = []
    in_gap = False
    gap_start = 0
    w = len(smoothed)
    for x in range(w):
        if is_dark[x] and not in_gap:
            in_gap = True
            gap_start = x
        elif not is_dark[x] and in_gap:
            in_gap = False
            gap_end = x
            gap_width = gap_end - gap_start
            gap_mid = (gap_start + gap_end) // 2
            gaps.append({
                'mid': gap_mid + x_start,
                'width': gap_width,
            })

    # Filter: real inter-violin gaps match scaled width range
    real_gaps = [g for g in gaps if gap_min <= g['width'] <= gap_max]

    if len(real_gaps) != 23:
        print(f"  WARNING: Expected 23 inter-violin gaps, found {len(real_gaps)}")
        return None

    # Build boundaries using gap midpoints
    avg_col_width = (real_gaps[-1]['mid'] - real_gaps[0]['mid']) / 22
    col_start = real_gaps[0]['mid'] - int(round(avg_col_width))
    col_end = real_gaps[-1]['mid'] + int(round(avg_col_width))

    boundaries = [col_start]
    for g in real_gaps:
        boundaries.append(g['mid'])
    boundaries.append(col_end)

    return boundaries


def crop_screenshot(screenshot_path):
    """Crop a full RHTER screenshot into 72 individual violin PNGs.

    Returns the number of crops saved.
    """
    img = Image.open(screenshot_path).convert("RGB")
    arr = np.array(img)
    w, h = img.size
    print(f"  Screenshot: {w}x{h}")

    scale_x = w / REF_W
    scale_y = h / REF_H
    print(f"  Scale: {scale_x:.2f}x, {scale_y:.2f}x (ref {REF_W}x{REF_H})")

    if w < 1500 or h < 800:
        print(f"  WARNING: Screenshot seems too small ({w}x{h}). "
              "Expected ~1560x877. Crops may be misaligned.")

    # Detect precise column boundaries
    boundaries = detect_column_boundaries(arr, scale_x, scale_y)
    if boundaries is None:
        print("  ERROR: Column boundary detection failed. Cannot crop.")
        sys.exit(1)

    if len(boundaries) - 1 != NUM_COLS:
        print(f"  ERROR: Detected {len(boundaries)-1} columns, expected {NUM_COLS}.")
        sys.exit(1)

    # Report column widths
    widths = [boundaries[i+1] - boundaries[i] for i in range(NUM_COLS)]
    print(f"  Column widths: min={min(widths)}px, max={max(widths)}px, "
          f"avg={sum(widths)/len(widths):.1f}px")

    # Scale row bounds to actual image size
    row_bounds = [(int(y0 * scale_y), int(y1 * scale_y)) for y0, y1 in REF_ROW_BOUNDS]

    DATA_RAW.mkdir(parents=True, exist_ok=True)
    count = 0

    for row_idx, (y_top, y_bottom) in enumerate(row_bounds):
        for col_idx in range(NUM_COLS):
            x_left = boundaries[col_idx]
            x_right = boundaries[col_idx + 1]

            crop = img.crop((x_left, y_top, x_right, y_bottom))
            fname = f"row{row_idx}_col{col_idx:02d}.png"
            crop.save(DATA_RAW / fname)
            count += 1

    print(f"  Saved {count} crops to {DATA_RAW}")
    return count


def crop_all():
    """Find the screenshot in data/screenshots/ and crop it.

    If multiple screenshots exist, processes the first .webp or .png found.
    """
    screenshots = sorted(
        p for p in DATA_SCREENSHOTS.iterdir()
        if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg")
    )

    if not screenshots:
        print("ERROR: No screenshots found in", DATA_SCREENSHOTS)
        sys.exit(1)

    if len(screenshots) > 1:
        print(f"  Found {len(screenshots)} screenshots, using: {screenshots[0].name}")

    screenshot_path = screenshots[0]
    print(f"Stage 0: Cropping {screenshot_path.name}")
    count = crop_screenshot(screenshot_path)
    print(f"Stage 0 complete: {count} crops")
    return count


if __name__ == "__main__":
    crop_all()
