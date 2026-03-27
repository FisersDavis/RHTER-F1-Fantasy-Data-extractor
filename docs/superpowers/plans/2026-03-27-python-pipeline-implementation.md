# Implementation Plan — Python Pipeline

**Spec:** [2026-03-27-python-pipeline-design.md](../specs/2026-03-27-python-pipeline-design.md)
**Scope:** Python pipeline only (Stages 1–4 + config + orchestrator)
**Date:** 2026-03-27

---

## Prerequisites (Step 0)

**Goal:** Working Python environment with all dependencies installed.

**Tasks:**
1. Bootstrap pip on Python 3.14: `py -m ensurepip --upgrade`
2. Create venv: `py -m venv .venv`
3. Activate and install: `.venv/Scripts/activate && pip install -r pipeline/requirements.txt`
4. Create `data/final/` and `data/screenshots/` directories
5. Copy test screenshot into `data/screenshots/` for calibration work

**Verify:** `python -c "from PIL import Image; import numpy; import sklearn; import google.generativeai; print('OK')"` prints `OK`.

**Files touched:** None (environment only)

---

## Step 1 — Shared Constants (`config.py`)

**Goal:** Central config module that all stages import.

**Tasks:**
1. Create `pipeline/config.py` with all constants from the spec:
   - Path constants (`DATA_RAW`, `DATA_PREPROCESSED`, `DATA_OUTPUT`, `DATA_FINAL`)
   - Stage 1 constants (`BACKGROUND_RGB`, `UPSCALE_FACTOR`, `CONTRAST_FACTOR`)
   - Stage 2 constants (`GEMINI_MODEL`, `EXPECTED_LINES`, `API_DELAY_SECONDS`)
   - Stage 3 constants (`KMEANS_K`, `COLOR_CONFIDENCE_THRESHOLD`, `CONSTRUCTOR_COLORS_RGB`)
   - Stage 4 constants (`VALID_DRIVERS_2026`, range tuples)
2. Use `pathlib.Path` for all path constants, resolved relative to project root (parent of `pipeline/`)

**Verify:** `python -c "from pipeline.config import CONSTRUCTOR_COLORS_RGB; print(len(CONSTRUCTOR_COLORS_RGB))"` prints `11`.

**Files created:** `pipeline/config.py`
**Depends on:** Step 0

---

## Step 2 — Stage 1: Preprocess (`01_preprocess.py`)

**Goal:** Transform 72 raw variable-height crops into uniform, inverted, upscaled, contrast-boosted PNGs.

**Tasks:**
1. Implement `preprocess_all()` function:
   - Scan `data/raw/` for `row{r}_col{cc}.png` files
   - Parse row/col from filenames with regex
   - Find max height across all crops
2. Implement `preprocess_crop(path, target_height)`:
   - Pad to uniform height (dark background fill, paste at bottom-left)
   - Invert via `ImageOps.invert()`
   - Upscale 3× with `Image.LANCZOS`
   - Boost contrast with `ImageEnhance.Contrast`
   - Save to `data/preprocessed/` with same filename
3. Handle edge case: fewer than 72 crops → log warning, process what's there
4. Return list of processed filenames + count

**Verify manually:** Place 2–3 test crops from the web app into `data/raw/`. Run Stage 1. Open preprocessed outputs — they should be light-background, upscaled, uniform height.

**Files modified:** `pipeline/01_preprocess.py`
**Depends on:** Step 1

---

## Step 3 — Stage 2: Extract Numbers (`02_extract.py`)

**Goal:** Send each preprocessed crop to Gemini 2.5 Flash, parse 14-line response into structured JSON.

**Tasks:**
1. Implement `extract_all()` function:
   - Scan `data/preprocessed/` for PNGs
   - Process sequentially with `API_DELAY_SECONDS` between calls
   - Print progress: `[14/72] row0_col13 ✓` or `✗ FLAGGED: reason`
   - Return summary (success count, flagged count, flagged list)
2. Implement `extract_crop(path)`:
   - Load image, encode for Gemini API
   - Build prompt per spec (read top-to-bottom, 14 lines, temperature 0)
   - Call `google.generativeai` with the preprocessed image
   - Parse response: split lines, expect 14
   - Lines 1–4 → floats (header), lines 5–9 → floats (percentiles), lines 10–14 → driver strings
   - Handle `2X` suffix on exactly one driver
3. Implement `write_crop_json(row, col, parsed_data, flags)`:
   - Write per-crop JSON to `data/output/row{r}_col{cc}.json` using internal schema
   - Include `confidence`, `flagged`, `flag_reasons` fields
   - `constructors` field set to `null` (Stage 3 fills it)
4. Flag reasons: `line_count_mismatch`, `parse_error`, `api_error`
5. API key from `os.environ["GEMINI_API_KEY"]` — fail fast with clear message if missing

**Verify:** Run on 2–3 preprocessed crops. Check JSON output matches schema. Verify flagging works by sending a blank/garbage image.

**Files modified:** `pipeline/02_extract.py`
**Depends on:** Step 2 (needs preprocessed crops to test)

---

## Step 4 — Stage 3: Extract Colors (`03_colors.py`)

**Goal:** Identify CN1 and CN2 constructor teams from violin body colors in raw (non-inverted) crops.

**Tasks:**
1. Implement `extract_colors_all()` function:
   - Scan `data/raw/` for PNGs
   - For each, load corresponding JSON from `data/output/` (skip if no JSON exists — Stage 2 may have failed for this crop)
   - Print progress summary
2. Implement `extract_colors_crop(raw_path)`:
   - Load raw crop as NumPy array
   - Define sampling region: middle 40% of height, inset 10% from left/right
   - Filter out background pixels (within threshold of `BACKGROUND_RGB`)
   - Run k-means (k=3) on remaining pixels
   - Convert cluster centroids RGB → Lab, compute Delta-E against all 11 constructor reference colors
   - Pick top 2 distinct team matches
   - Handle edge cases: duplicate team match, high Delta-E, insufficient pixels
3. Update existing per-crop JSON in `data/output/` — add `constructors` field
4. Flag reasons: `color_ambiguous`, `duplicate_team`, `insufficient_pixels`

**Verify:** Run on 2–3 raw crops that have known constructor colors. Check that the matched teams are correct. Test with a crop that has similar colors (e.g., WIL vs VRB) to verify Delta-E discrimination.

**Files modified:** `pipeline/03_colors.py`
**Depends on:** Step 3 (needs JSON files from Stage 2 to update)

---

## Step 5 — Stage 4: Validate (`04_validate.py`)

**Goal:** Run sanity checks on all extracted data, flag outliers, produce combined output.

**Tasks:**
1. Implement `validate_all()` function:
   - Load all per-crop JSONs from `data/output/`
   - Run validation checks on each
   - Preserve existing flags from Stages 2–3, add new ones
   - Update each per-crop JSON with final `confidence`, `flagged`, `flag_reasons`
   - Write combined `data/final/results.json`
   - Print summary: `68/72 passed, 4 flagged`
   - Return flagged crop list
2. Implement `validate_crop(crop_data)` with checks:
   - Numeric ranges: budget_required, avg_xpts, avg_xpts_dollar_impact, avg_budget_uplift
   - Percentile monotonicity: p95 > p75 > p50 > p25 > p05
   - Percentile range: 50–500
   - Driver validation: 3-letter uppercase, in `VALID_DRIVERS_2026`, exactly one `2X`, no duplicates
   - Constructor validation: CN1 ≠ CN2, both in known 11 constructors
3. Create `data/final/` directory if it doesn't exist

**Verify:** Craft a test JSON with known violations (out-of-range value, non-monotonic percentiles, invalid driver). Confirm each triggers the correct flag.

**Files modified:** `pipeline/04_validate.py`
**Depends on:** Step 4 (needs color-annotated JSONs)

---

## Step 6 — Orchestrator (`run_pipeline.py`)

**Goal:** Single entry point that chains all stages and provides interactive flag resolution.

**Tasks:**
1. Implement `main()`:
   - Check prerequisites: `data/raw/` has PNGs, `GEMINI_API_KEY` is set
   - Run Stage 1 → print summary
   - Run Stage 2 → print per-crop progress + summary
   - Run Stage 3 → print summary
   - Run Stage 4 → print summary
2. Implement flag resolution menu (only shown if flags exist):
   - `[R]` Rerun flagged crops through Stages 2–4
   - `[S]` Show details for a specific flagged crop (raw response + parsed JSON)
   - `[A]` Accept all and write `results.json` with flags intact
   - `[Q]` Quit without writing final output
3. Zero flags → automatically write `results.json` and print success

**Verify:** Full end-to-end run with 2–3 test crops. Test each menu option. Test with missing API key, empty `data/raw/`, and a crop that triggers flags.

**Files created:** `pipeline/run_pipeline.py`
**Depends on:** Steps 1–5

---

## Step 7 — End-to-End Calibration

**Goal:** Run the full pipeline against real RHTER crops and calibrate constants.

**Tasks:**
1. Use the web app to crop the real screenshot (`data/screenshots/`) into 72 PNGs in `data/raw/`
2. Run the full pipeline
3. Calibrate `BACKGROUND_RGB` — sample actual background pixels from the real screenshot
4. Calibrate `CONTRAST_FACTOR` — compare Gemini extraction accuracy at different values
5. Verify `CONSTRUCTOR_COLORS_RGB` — compare k-means centroids against reference colors, adjust if needed
6. Tune `COLOR_CONFIDENCE_THRESHOLD` — check which crops get flagged as ambiguous
7. Update `config.py` with calibrated values

**Verify:** Full 72-crop run produces reasonable JSON with minimal flags. Flagged crops are genuinely ambiguous, not false positives from miscalibrated constants.

**Files modified:** `pipeline/config.py` (calibrated values)
**Depends on:** Step 6

---

## Execution Notes

- **Steps 0–1** can be done together (environment + config).
- **Steps 2–5** are strictly sequential — each stage's output feeds the next.
- **Step 6** (orchestrator) wires everything together — light integration work.
- **Step 7** is the real validation — calibrating against actual data.
- Each step has a code review checkpoint before proceeding to the next.
- All paths use `pathlib.Path` relative to project root — no hardcoded absolute paths in pipeline code (the test screenshot path in the spec is for human reference only).
