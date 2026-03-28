"""Detect precise column boundaries in RHTER screenshot.

Analyzes vertical strips to find gaps between violin plots by looking for
columns of pixels that are close to the dark background color. The gaps
between violins show up as vertical dark strips ~10-12px wide.

Outputs the x-coordinates of each column boundary.
"""

import numpy as np
from PIL import Image

from pipeline.config import DATA_SCREENSHOTS, BACKGROUND_RGB, DATA_RAW

# Row 0 boundaries (known good)
ROW_Y_TOP = 80
ROW_Y_BOTTOM = 333

# Approximate content area
CONTENT_X_START = 28
CONTENT_X_END = 1340


def detect_column_boundaries(screenshot_path):
    """Detect column boundaries by finding vertical dark gaps."""
    img = Image.open(screenshot_path).convert("RGB")
    arr = np.array(img)
    print(f"Screenshot: {arr.shape[1]}x{arr.shape[0]}")

    # Extract Row 0 region
    row_strip = arr[ROW_Y_TOP:ROW_Y_BOTTOM, CONTENT_X_START:CONTENT_X_END]

    # For each x position, compute average distance from background color
    bg = np.array(BACKGROUND_RGB, dtype=np.float32)
    h, w, _ = row_strip.shape

    # Vectorized: compute per-column mean color distance from background
    pixels = row_strip.astype(np.float32)
    diffs = np.sqrt(np.sum((pixels - bg) ** 2, axis=2))  # shape: (h, w)
    distances = diffs.mean(axis=0)  # shape: (w,)

    # Smooth slightly to reduce noise
    from scipy.ndimage import uniform_filter1d
    smoothed = uniform_filter1d(distances, size=3)

    threshold = np.percentile(smoothed, 25)
    is_dark = smoothed < threshold

    print(f"\nDistance stats: min={smoothed.min():.1f}, max={smoothed.max():.1f}, "
          f"mean={smoothed.mean():.1f}, threshold={threshold:.1f}")

    # Find runs of dark pixels (these are the gaps between violins)
    gaps = []
    in_gap = False
    gap_start = 0
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
                'start': gap_start + CONTENT_X_START,
                'end': gap_end + CONTENT_X_START,
                'mid': gap_mid + CONTENT_X_START,
                'width': gap_width,
            })

    print(f"\nAll detected gaps ({len(gaps)}):")
    for i, g in enumerate(gaps):
        print(f"  Gap {i:2d}: x={g['start']:4d} to {g['end']:4d} "
              f"(width {g['width']:2d}px, mid {g['mid']})")

    # Filter: keep only gaps that are 8-20px wide (real inter-violin gaps are 10-14px)
    # This filters out both thin noise artifacts AND wide margin areas
    real_gaps = [g for g in gaps if 8 <= g['width'] <= 20]

    print(f"\nFiltered gaps (width >= 8px): {len(real_gaps)}")
    for i, g in enumerate(real_gaps):
        print(f"  Gap {i:2d}: x={g['start']:4d} to {g['end']:4d} "
              f"(width {g['width']:2d}px, mid {g['mid']})")

    # We expect 23 gaps between 24 violins.
    # The first violin starts at the left edge of the first gap's preceding content,
    # and the last violin ends at the right edge of the last gap's following content.

    # Build boundaries: use the midpoint of each gap as the divider
    # First boundary = left edge of content area (or left edge of first gap)
    # Last boundary = right edge of content area (or right edge of last gap)

    if len(real_gaps) == 23:
        # Perfect: 23 gaps = 24 columns
        # Find the actual content start (left edge of first violin)
        # and content end (right edge of last violin)
        first_gap_start = real_gaps[0]['start']
        last_gap_end = real_gaps[-1]['end']

        # Column width is roughly the distance between consecutive gap midpoints
        avg_col_width = (real_gaps[-1]['mid'] - real_gaps[0]['mid']) / 22
        print(f"\nAvg column width (gap-to-gap): {avg_col_width:.1f}px")

        # First column starts one column-width before first gap midpoint
        col_start = real_gaps[0]['mid'] - int(round(avg_col_width))
        # Last column ends one column-width after last gap midpoint
        col_end = real_gaps[-1]['mid'] + int(round(avg_col_width))

        boundaries = [col_start]
        for g in real_gaps:
            boundaries.append(g['mid'])
        boundaries.append(col_end)

    elif len(real_gaps) == 25:
        # 25 gaps: likely includes left edge and right edge gaps
        # The real 23 inter-violin gaps are in the middle
        # Check spacing: real gaps should be ~53-54px apart
        mids = [g['mid'] for g in real_gaps]
        spacings = [mids[i+1] - mids[i] for i in range(len(mids)-1)]
        print(f"\nGap spacings: {spacings}")

        # Real gaps should be ~53-54px apart; edge artifacts will be much closer
        # Find the 23 consecutive gaps with most consistent spacing
        # Simple: drop the first and last gap if they're too close to their neighbor
        inner_gaps = real_gaps
        if spacings[0] < 40:  # first gap too close to second
            inner_gaps = inner_gaps[1:]
            spacings = spacings[1:]
        if spacings[-1] < 40:  # last gap too close to second-to-last
            inner_gaps = inner_gaps[:-1]

        print(f"\nAfter edge cleanup: {len(inner_gaps)} gaps")
        if len(inner_gaps) == 23:
            avg_col_width = (inner_gaps[-1]['mid'] - inner_gaps[0]['mid']) / 22
            col_start = inner_gaps[0]['mid'] - int(round(avg_col_width))
            col_end = inner_gaps[-1]['mid'] + int(round(avg_col_width))
            boundaries = [col_start]
            for g in inner_gaps:
                boundaries.append(g['mid'])
            boundaries.append(col_end)
        else:
            print(f"Still {len(inner_gaps)} gaps after cleanup, expected 23")
            return None, distances
    else:
        print(f"\nExpected 23 gaps, got {len(real_gaps)}. Manual inspection needed.")
        return None, distances

    print(f"\nFinal column boundaries ({len(boundaries)} points = {len(boundaries)-1} columns):")
    for i in range(len(boundaries) - 1):
        w_col = boundaries[i+1] - boundaries[i]
        print(f"  Col {i:2d}: x={boundaries[i]:4d} to {boundaries[i+1]:4d} (width {w_col}px)")

    return boundaries, distances


def save_row0_samples(screenshot_path, boundaries, sample_cols=None):
    """Save sample crops from Row 0 for visual verification."""
    if sample_cols is None:
        sample_cols = (0, 1, 8, 12, 22, 23)

    img = Image.open(screenshot_path).convert("RGB")
    DATA_RAW.mkdir(parents=True, exist_ok=True)

    saved = []
    for col in sample_cols:
        if col >= len(boundaries) - 1:
            print(f"  Skipping col {col} - only {len(boundaries)-1} columns detected")
            continue
        x_left = boundaries[col]
        x_right = boundaries[col + 1]
        crop = img.crop((x_left, ROW_Y_TOP, x_right, ROW_Y_BOTTOM))
        fname = f"row0_col{col:02d}_detect.png"
        crop.save(DATA_RAW / fname)
        saved.append(fname)
        print(f"  Saved {fname} ({x_right - x_left}px wide)")

    return saved


if __name__ == "__main__":
    screenshots = sorted(
        p for p in DATA_SCREENSHOTS.iterdir()
        if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg")
    )
    if not screenshots:
        print("No screenshots found")
        exit(1)

    path = screenshots[0]
    print(f"Analyzing: {path.name}\n")

    boundaries, distances = detect_column_boundaries(path)

    if boundaries and len(boundaries) - 1 == 24:
        print(f"\n24 columns detected. Saving samples...")
        save_row0_samples(path, boundaries)
        print("\nCheck data/raw/row0_col*_detect.png for visual verification.")
    else:
        print("\nColumn detection failed. Check output above.")
