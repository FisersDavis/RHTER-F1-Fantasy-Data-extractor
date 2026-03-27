# RHTER F1 Fantasy Data Extractor — Pipeline & Analysis Design

## Goal

Extract structured data from RHTER violin plot screenshots (2786×1567px, 24 columns × 3 budget tiers = 72 violins) into tabular form, then run Kelly criterion analysis to identify optimal F1 fantasy team selections.

## Constraints

- **1 violin per LLM call** — multi-violin extraction tested and failed (shifted/missing data).
- **Constructor ID from violin body colors** — k-means clustering, not header bars.
- **Static web app** — GitHub Pages, no server, no bundlers.
- **Python pipeline runs offline** — all image/ML work is Python.

## LLM output format

Plain text, one value per line, read top-to-bottom matching the visual layout of the violin. This is cheaper (~40 tokens vs ~150+ for JSON) and more aligned with how the model sees the image.

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

**Line order (fixed):**
1. Budget Required
2. Avg. xPts
3. Avg. xPts + ($ impact)
4. Avg. Budget Uplift
5. 95th percentile
6. 75th percentile
7. 50th percentile
8. 25th percentile
9. 5th percentile
10–14. Driver abbreviations top-to-bottom (append ` 2X` to the multiplied driver)

Python parses line-by-line by position into the internal JSON schema. Any deviation from 14 lines flags the crop for review.

## Internal data schema (after parsing + color extraction)

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
  "constructors": {
    "cn1": {"color_rgb": [255, 135, 0], "team": "MCL"},
    "cn2": {"color_rgb": [0, 210, 210], "team": "MER"}
  },
  "confidence": "high",
  "flagged": false
}
```

## Pipeline stages

### Stage 1 — Preprocess (Pillow)

Input: raw crops from web app (variable height per row).

1. **Normalize** — pad all crops to tallest row height, dark background fill, padding at top.
2. **Invert** — dark-to-light via `ImageOps.invert()`.
3. **Upscale** — 3× with LANCZOS.
4. **Contrast boost** — on text regions.

Output: 72 uniform preprocessed PNGs in `data/preprocessed/`.

Image dimensions: source is 2786×1567px. Grid coordinates to be calibrated against real screenshot (the 2000×1124 reference frame in CLAUDE.local.md is outdated).

### Stage 2 — Extract numbers (Gemini Flash)

- 1 preprocessed crop → 1 API call → plain text (14 lines, top-to-bottom).
- Single pass first. Dual-pass (varied prompts + comparison) deferred until single-pass accuracy is measured.
- Prompt instructs model to read values top-to-bottom: 4 header numbers, 5 percentile values, 5 driver labels (append ` 2X` to multiplied driver).
- Temperature 0, plain text output.
- Python parser maps lines by position to internal JSON schema. Any response that isn't exactly 14 lines flags the crop for review.
- Per-crop error handling — one failure doesn't lose the batch.

### Stage 3 — Extract colors (NumPy, scikit-learn)

- Sample pixels from center band of each violin body (avoid anti-aliased edges).
- k-means clustering (k=2–3), filter out dark background cluster.
- Match dominant colors to 11 F1 constructors via Delta-E in Lab color space.
- Constructor color reference: MCL=orange, MER=cyan, RED=navy, FER=red, WIL=blue, VRB=light blue, AST=dark green, HAA=white, AUD=maroon, ALP=pink, CAD=grey.

### Stage 4 — Validate

- Range checks on all numeric values.
- Driver abbreviations must be valid 3-letter codes from known F1 2026 grid.
- Constructor colors must match known teams.
- Cross-check budget_required is plausible (e.g., 95–110 range).
- Flag outliers for human review.
- Output: final JSON per crop → `data/output/`.

## Web app changes needed

### Extractor tab (extractor.js)

- Import pipeline JSON results (user uploads JSON or pastes).
- Display all 72 results in a review grid.
- Inline editing for corrections.
- Flag indicators for low-confidence or validation-failed crops.
- "Accept all" / "Accept row" bulk actions.
- Save corrected results to dataStore.

### Analysis tab (analysis.js)

- Load validated dataset from dataStore.
- Display unified table (sortable, filterable).
- Kelly criterion calculation:
  - Uses percentile distributions to estimate probability of each team combo outperforming.
  - Rank team combos by Kelly score.
  - Display recommended picks with confidence levels.
- Budget constraint filtering (user sets available budget).

## Python environment prerequisite

Python 3.14 is installed but has no pip. Before any pipeline work:
- Install pip (or use a venv/conda).
- Install dependencies from requirements.txt.

## Build order

1. Fix Python environment (pip)
2. Stage 1 — preprocess (with real screenshot calibration)
3. Stage 2 — Gemini extraction (single crop first, then batch)
4. Stage 3 — color extraction (can parallel with Stage 2)
5. Stage 4 — validation
6. Web app extractor tab (review UI)
7. Web app analysis tab (Kelly criterion)
8. Update CLAUDE.local.md with real dimensions

## Out of scope for v1

- Dual-pass extraction (deferred until single-pass accuracy measured)
- Week-over-week tracking
- Local model fallback (Qwen2.5-VL)
- Chart.js visualizations beyond basic tables
