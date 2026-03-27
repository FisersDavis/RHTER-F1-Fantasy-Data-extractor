# Python Pipeline Design — RHTER F1 Fantasy Data Extractor

## Goal

Build a Python pipeline that processes 72 raw violin plot crops (exported from the web app) into validated, structured JSON — ready for import into the web app's review UI. The pipeline runs offline as a single command, automatically proceeding through all stages, but halts for human intervention when crops are flagged.

## Constraints

- **1 violin per LLM call** — multi-violin extraction tested and failed (shifted/missing data).
- **Constructor ID from raw crop colors** — k-means on original (non-inverted) pixel data.
- **All image/ML work in Python** — web app never touches pixel processing.
- **Per-crop error handling** — one failure must not lose the batch.

## Directory structure

```
pipeline/
├── run_pipeline.py          # Orchestrator — single entry point
├── 01_preprocess.py         # Stage 1: Pillow preprocessing
├── 02_extract.py            # Stage 2: Gemini Flash extraction
├── 03_colors.py             # Stage 3: k-means color matching
├── 04_validate.py           # Stage 4: Validation + flagging
├── config.py                # Shared constants (team colors, driver codes, paths)
├── requirements.txt         # Already exists
data/
├── raw/                     # Input: 72 crop PNGs from web app
├── preprocessed/            # Stage 1 output: uniform, inverted, upscaled PNGs
├── output/                  # Stages 2-3 output: per-crop JSON files
├── final/                   # Stage 4 output: combined results.json
└── screenshots/             # Source RHTER screenshots for reference
```

Data flows through files between stages. Each stage reads from disk and writes to disk, so intermediate results are always inspectable and a failed crop doesn't lose prior work.

## Stage 1 — Preprocess (Pillow)

Input: 72 raw crop PNGs in `data/raw/`, named `row{r}_col{cc}.png` (e.g., `row0_col03.png`). Variable height per budget tier row.

Steps per crop:

1. **Discover** — scan `data/raw/`, parse row/col from filenames.
2. **Find tallest crop height** — use the max across all crops as the target.
3. **Pad to uniform height** — create new image at target dimensions, fill with RHTER dark background color (`~rgb(32, 33, 44)`, calibrate from real screenshot). Paste crop at bottom-left so violin bodies and driver labels pin to the bottom edge. Skip if crop is already the tallest.
4. **Invert** — `ImageOps.invert()` to flip dark background to light.
5. **Upscale** — 3× with `Image.LANCZOS`.
6. **Contrast boost** — `ImageEnhance.Contrast` on the full image.
7. **Save** to `data/preprocessed/` with same filename.

Edge cases:
- Fewer than 72 crops: log warning, process what's there.

Output: uniform-size preprocessed PNGs in `data/preprocessed/`.

## Stage 2 — Extract numbers (Gemini 2.5 Flash)

Input: 72 preprocessed PNGs from `data/preprocessed/`.

Per-crop flow:

1. Load the image.
2. Send to Gemini 2.5 Flash with structured prompt: read top-to-bottom, return exactly 14 lines — 4 header numbers, 5 percentile values, 5 driver abbreviations (append ` 2X` to the multiplied driver). Temperature 0, plain text response.
3. Parse the response:
   - Split by newlines, strip whitespace.
   - 14 lines → parse lines 1–4 as floats, 5–9 as floats, 10–14 as driver strings.
   - != 14 lines → flag the crop, store raw response.
4. Write per-crop JSON to `data/output/row{r}_col{cc}.json` using the internal schema.

Batch handling:
- Sequential processing (respects free-tier rate limits).
- ~1s delay between calls.
- Per-crop error handling: log, flag, continue.
- Progress output: `[14/72] row0_col13 ✓` or `[14/72] row0_col13 ✗ FLAGGED: 12 lines returned`.

Flag reasons:
- `line_count_mismatch` — response wasn't 14 lines.
- `parse_error` — numeric line couldn't be parsed as float.
- `api_error` — Gemini call failed entirely.

API key: read from environment variable `GEMINI_API_KEY`.

### LLM output format

Plain text, 14 lines, ~40 tokens:

```
103.2
245.1
248.3
2.1
310.5
270.2
245.0
220.1
180.3
NOR 2X
PIA
VER
HAM
LEC
```

Line order (fixed):
1. Budget Required
2. Avg. xPts
3. Avg. xPts + ($ impact)
4. Avg. Budget Uplift
5. 95th percentile
6. 75th percentile
7. 50th percentile
8. 25th percentile
9. 5th percentile
10–14. Driver abbreviations top-to-bottom (append ` 2X` to multiplied driver)

### Internal data schema (per-crop JSON)

```json
{
  "row": 0,
  "col": 0,
  "header": {
    "budget_required": 103.2,
    "avg_xpts": 245.1,
    "avg_xpts_dollar_impact": 248.3,
    "avg_budget_uplift": 2.1
  },
  "percentiles": {
    "p95": 310.5,
    "p75": 270.2,
    "p50": 245.0,
    "p25": 220.1,
    "p05": 180.3
  },
  "drivers": [
    {"name": "NOR", "multiplier": "2X"},
    {"name": "PIA", "multiplier": null},
    {"name": "VER", "multiplier": null},
    {"name": "HAM", "multiplier": null},
    {"name": "LEC", "multiplier": null}
  ],
  "constructors": null,
  "confidence": "high",
  "flagged": false,
  "flag_reasons": []
}
```

## Stage 3 — Extract colors (NumPy, scikit-learn)

Input: 72 **raw** crop PNGs from `data/raw/` (original colors, not inverted).

Per-crop flow:

1. Load raw crop as NumPy array.
2. **Define sampling region** — horizontal band across the center of the violin body area. Roughly middle 40% of crop height (avoids header numbers at top and driver labels at bottom). Inset ~10% from left/right edges to avoid anti-aliased boundaries.
3. **Filter out background** — remove pixels close to the RHTER dark background color.
4. **k-means clustering** (k=3) on remaining pixels. Expect 2 violin colors + residual noise.
5. **Match each cluster centroid** — convert RGB to Lab, compute Delta-E distance to all 11 F1 constructor reference colors. Best match = lowest Delta-E.
6. **Pick top 2 distinct team matches** for CN1 and CN2.
   - If two clusters map to same team: take the one with more pixels as that team, re-match the other.
   - If best Delta-E exceeds confidence threshold (~20), flag as ambiguous.

Flag reasons:
- `color_ambiguous` — Delta-E too high for confident match.
- `duplicate_team` — multiple clusters matched the same constructor.
- `insufficient_pixels` — sampling region had too few non-background pixels.

Output: updates the existing per-crop JSON in `data/output/` by adding the `constructors` field:

```json
"constructors": {
  "cn1": {"color_rgb": [255, 135, 0], "team": "MCL"},
  "cn2": {"color_rgb": [0, 210, 190], "team": "MER"}
}
```

## Stage 4 — Validate

Input: 72 per-crop JSON files in `data/output/` (now containing header, percentiles, drivers, and constructors).

Validation checks per crop:

1. **Numeric ranges:**
   - `budget_required`: 90–150
   - `avg_xpts`, `avg_xpts_dollar_impact`: 100–400
   - `avg_budget_uplift`: -10 to +20
   - Percentiles must be monotonically decreasing: `p95 > p75 > p50 > p25 > p05`
   - All percentiles: 50–500

2. **Driver validation:**
   - Each must be a 3-letter uppercase string.
   - Checked against valid F1 2026 driver list (22 drivers — see config).
   - Exactly one driver must have `"multiplier": "2X"`, rest `null`.
   - No duplicate drivers within a crop.

3. **Constructor validation:**
   - CN1 and CN2 must be different teams.
   - Both must be from the 11 known constructors.

4. **Cross-checks:**
   - Existing flags from Stages 2–3 are preserved (new flags add, never replace).

Output:
- Updates each per-crop JSON with final `confidence`, `flagged`, and `flag_reasons`.
- Writes combined `data/final/results.json` containing all 72 crops in one array.
- Prints summary: `68/72 passed, 4 flagged`.

## Orchestrator (`run_pipeline.py`)

Single entry point: `python run_pipeline.py`

### Normal flow

1. **Check prerequisites:** `data/raw/` exists with PNG files, `GEMINI_API_KEY` env var is set.
2. **Stage 1** — preprocess. Print: `Stage 1: Preprocessing 72 crops...done`.
3. **Stage 2** — extract. Print per-crop progress, then summary.
4. **Stage 3** — colors. Print summary.
5. **Stage 4** — validate. Print final summary.

### Decision point after Stage 4

**Zero flags →** write `data/final/results.json`, print success message. Done.

**Flags exist →** print flagged crop table and interactive menu:

```
4 crops flagged:

  row0_col05  line_count_mismatch (Stage 2)
  row1_col11  color_ambiguous (Stage 3)
  row1_col18  p95 < p75 (Stage 4)
  row2_col03  api_error (Stage 2)

Options:
  [R] Rerun flagged crops (Stages 2-4)
  [S] Show details for a flagged crop
  [A] Accept all and write output anyway
  [Q] Quit (intermediate files preserved)
>
```

- **Rerun (R):** re-processes only flagged crops through Stages 2–4 (skips preprocessing). Then re-evaluates flags.
- **Show details (S):** prompts for a crop identifier (e.g., `row0_col05`), then prints the raw Gemini response and parsed JSON for that crop.
- **Accept (A):** writes `results.json` with flags intact (web app review UI handles corrections later).
- **Quit (Q):** exits without writing final output. All intermediate files preserved.

## Shared constants (`config.py`)

```python
# Paths
DATA_RAW = "data/raw"
DATA_PREPROCESSED = "data/preprocessed"
DATA_OUTPUT = "data/output"
DATA_FINAL = "data/final"

# Stage 1
BACKGROUND_RGB = (32, 33, 44)       # Calibrate from real screenshot
UPSCALE_FACTOR = 3
CONTRAST_FACTOR = 1.5               # Calibrate during testing

# Stage 2
GEMINI_MODEL = "gemini-2.5-flash"
EXPECTED_LINES = 14
API_DELAY_SECONDS = 1.0

# Stage 3
KMEANS_K = 3
COLOR_CONFIDENCE_THRESHOLD = 20.0   # Max Delta-E for confident match

CONSTRUCTOR_COLORS_RGB = {
    "MCL": (255, 135, 0),
    "MER": (0, 210, 190),
    "RED": (6, 0, 239),
    "FER": (220, 0, 0),
    "WIL": (0, 90, 255),
    "VRB": (102, 146, 255),
    "AST": (0, 111, 98),
    "HAA": (255, 255, 255),
    "AUD": (144, 0, 0),
    "ALP": (245, 150, 200),
    "CAD": (160, 160, 160),
}

# Stage 4
VALID_DRIVERS_2026 = [
    "RUS", "ANT", "LEC", "HAM", "NOR", "PIA",
    "OCO", "BEA", "VER", "HAD", "LAW", "LIN",
    "GAS", "COL", "HUL", "BOR", "SAI", "ALB",
    "PER", "BOT", "ALO", "STR",
]

BUDGET_RANGE = (90, 150)
XPTS_RANGE = (100, 400)
BUDGET_UPLIFT_RANGE = (-10, 20)
PERCENTILE_RANGE = (50, 500)
```

Constructor RGB values and driver list will need verification against actual RHTER data. `BACKGROUND_RGB` and `CONTRAST_FACTOR` will be calibrated during Stage 1 testing with the real screenshot.

## Python environment prerequisite

Python 3.14 is installed but has no pip. Before any pipeline work:
- Install pip or create a venv/conda environment.
- `pip install -r pipeline/requirements.txt`

## Test screenshot

Real RHTER screenshot available at `C:\Users\Dave\Downloads\f1_2026_rhter_rw2_20260313_1302_teams_7680_wm.webp` (2786×1567px). Use for calibrating grid coordinates, background color, and verifying all stages.

## Out of scope for v1

- Dual-pass extraction (deferred until single-pass accuracy measured).
- Week-over-week tracking.
- Local model fallback (Qwen2.5-VL).
- Chart.js visualizations.
- Web app extractor/analysis tabs (separate plan).
