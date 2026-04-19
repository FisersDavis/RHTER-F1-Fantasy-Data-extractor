# Spec: Port Python Gap Detection to Browser Cropper

**Date:** 2026-04-19  
**Status:** Draft  
**Scope:** `src/cropper.ts` only — no other files touched

---

## Problem

`cropper.ts` uses hardcoded placeholder pixel coordinates (`ROW_Y`, `COL_X`) that were never calibrated. This produces wrong crops — narrow strips instead of full violin cells — causing Gemini to fail with "very narrow vertical strip" errors.

## Solution

Port the Python gap-detection algorithm from `pipeline/00_crop.py` 1:1 into TypeScript. The algorithm dynamically detects column boundaries by scanning for dark vertical gaps between violins, scaled to the actual image dimensions at runtime.

---

## Reference Constants (from Python pipeline)

All sourced directly from `pipeline/00_crop.py` and `pipeline/config.py`:

| Constant | Value | Meaning |
|---|---|---|
| `REF_W` | 1560 | Reference image width (px) |
| `REF_H` | 877 | Reference image height (px) |
| `REF_ROW_BOUNDS` | `[(80,333),(343,596),(606,860)]` | Row y-bounds in reference coords |
| `REF_CONTENT_X_START` | 28 | Left edge of violin content area |
| `REF_CONTENT_X_END` | 1340 | Right edge of violin content area |
| `REF_GAP_MIN` | 8 | Min inter-violin gap width (px) |
| `REF_GAP_MAX` | 20 | Max inter-violin gap width (px) |
| `BACKGROUND_RGB` | `[52, 55, 61]` | RHTER dark background color |
| `NUM_COLS` | 24 | Expected number of violin columns |

---

## Algorithm (ported from Python, step by step)

### Step 1 — Scale reference coords to actual image

```
scale_x = imgWidth  / 1560
scale_y = imgHeight / 877
```

Apply `scale_x` to all x-constants, `scale_y` to all y-constants.

### Step 2 — Sample row 0 strip

Read pixel data for the rectangle:
- `x: [REF_CONTENT_X_START * scale_x, REF_CONTENT_X_END * scale_x]`
- `y: [REF_ROW_BOUNDS[0][0] * scale_y, REF_ROW_BOUNDS[0][1] * scale_y]`

Use `ctx.getImageData()` on an offscreen canvas already holding the full image.

### Step 3 — Compute column darkness scores

For each pixel column x in the strip, compute the mean Euclidean distance from `BACKGROUND_RGB` across all rows in the strip:

```
distance(r,g,b) = sqrt((r-52)² + (g-55)² + (b-61)²)
column_score[x] = mean(distance) over all rows in strip
```

### Step 4 — Smooth and threshold

Apply a box filter of size `max(3, round(3 * scale_x))` to `column_score`.  
Threshold at the **25th percentile** of smoothed scores → `is_dark[x]: boolean[]`.

### Step 5 — Find dark runs (gaps)

Walk `is_dark[]` left to right, recording contiguous `true` runs as gaps:
```
gap = { mid: (start + end) / 2 + x_start_offset, width: end - start }
```

Filter gaps to those with `width` in `[REF_GAP_MIN * scale_x, REF_GAP_MAX * scale_x]`.

### Step 6 — Validate and build boundaries

- Expect exactly **23 gaps** (23 inter-violin separators for 24 columns).
- If count ≠ 23 → throw a descriptive error surfaced in the UI.
- Build 25 boundaries:
  - `boundaries[0]` = `gaps[0].mid - avg_col_width` (extrapolate left edge)
  - `boundaries[1..23]` = gap midpoints
  - `boundaries[24]` = `gaps[22].mid + avg_col_width` (extrapolate right edge)
  - where `avg_col_width = (gaps[22].mid - gaps[0].mid) / 22`

### Step 7 — Crop 72 cells

For each of 3 rows and 24 columns:
```
x_left  = boundaries[col]
x_right = boundaries[col + 1]
y_top   = REF_ROW_BOUNDS[row][0] * scale_y
y_bottom= REF_ROW_BOUNDS[row][1] * scale_y
```
Crop via `ctx.drawImage()` into a per-cell canvas → `toBlob('image/png')`.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| Gap count ≠ 23 | Throw `Error('Gap detection found N gaps, expected 23. Screenshot may be cropped or layout changed.')` — caller surfaces this in the UI |
| `toBlob` returns null | Throw `Error('toBlob returned null for row R col C')` |
| Image too small | Log a warning (< 1500×800px) but still attempt detection |

---

## File Changes

| File | Change |
|---|---|
| `src/cropper.ts` | Replace hardcoded `ROW_Y`/`COL_X` with gap detection algorithm. Public API (`cropScreenshot`, `drawGridOverlay`) unchanged. |
| `src/config.ts` | No change — grid constants live in `cropper.ts` since they are implementation details of cropping |
| All other files | No change |

---

## Public API (unchanged)

```ts
export async function cropScreenshot(file: File): Promise<CropBlobs>
export function drawGridOverlay(file, onReady, onError?): void
```

`drawGridOverlay` should also use the detected boundaries to draw the overlay — so the user sees the same boundaries that will be used for cropping.

---

## Testing

Use the existing debug mechanism (`window.__debugPreprocess = true`) to download preprocessed crops and visually confirm they contain a full violin cell (header numbers + violin body + driver names), not a narrow strip.

No automated tests — visual confirmation against a real screenshot is the acceptance criterion.
