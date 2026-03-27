# Project: RHTER F1 Fantasy Data Extractor

## What this is

A two-part system for extracting structured data from RHTER F1 Fantasy Tools violin plot screenshots:

1. **Python pipeline** (runs locally, offline) — preprocesses crops, extracts numbers via Gemini Flash, identifies constructor colors via k-means, validates, and outputs JSON.
2. **Web app** (GitHub Pages) — handles image upload and cropping, receives pipeline JSON, provides a human review/correction UI, joins results into a unified dataset, and supports analysis/visualization.

The absolute input is a full RHTER violin plot screenshot (e.g. 2786×1567px). The web app slices it into 72 raw crops; the Python pipeline preprocesses and extracts data from those crops.

## Architecture boundary

Everything that touches image pixels or runs ML is Python. The web app never preprocesses images, samples colors, or runs k-means.

| Concern | Runs where | Tools |
|---|---|---|
| Image upload + grid cropping | Web app (Canvas API) | Browser Canvas |
| Preprocessing (invert, upscale, contrast) | Python offline | Pillow |
| Number extraction | Gemini Flash — TBD whether called from Python or browser | Gemini API |
| Color extraction | Python offline | NumPy, scikit-learn |
| Validation | Python offline | Python |
| Human review + correction | Web app | Browser UI |
| Data joining + storage | Web app | localStorage |
| Analysis + visualization | Web app | JS, Chart.js |

## Pipeline: Python batch (stages 1–4)

### Stage 1 — Preprocess (Pillow)

- Input: raw variable-size violin crops from web app (the 3 row regions have different heights: 323, 334, 335px in the 2000×1124 reference frame, so exported crops are not uniform)
- **Step 0 — Normalize crop dimensions**: Pad all crops to the tallest row height using `Image.paste()` with the RHTER dark background fill color. Padding goes at the **top** so driver labels and violin body are pinned to the bottom edge. After this step all 72 crops are identical in size.
- **Step 1 — Invert**: Dark background to light: `ImageOps.invert()`
- **Step 2 — Upscale**: 2–4× with LANCZOS resampling
- **Step 3 — Boost contrast** on text regions
- Output: uniform-size preprocessed PNGs (all 72 same dimensions), ready for Stages 2–3

### Stage 2 — Extract numbers (Gemini Flash)

- Send each preprocessed crop with a structured prompt; temperature 0, read top-to-bottom
- Run each crop twice with slightly varied prompts; compare outputs
- Discrepancies flag the crop for manual review or a third pass with Gemini 2.5 Pro (also free tier)
- Handle errors per crop — if one fails, don't lose the rest
- Can run from Python batch or from web app (browser, user-supplied API key) — decision deferred

### Stage 3 — Extract colors (NumPy, scikit-learn)

- Sample pixels from center of each violin body using NumPy array slicing (avoid anti-aliased edges)
- Cluster with k-means (k=2–3, filtering out dark background) to find dominant colors
- Match dominant colors to F1 team lookup using Delta-E perceptual distance in Lab color space
- 11 constructor colors documented in domain rules below

### Stage 4 — Validate (Python)

- Sanity checks: extracted numbers within plausible ranges, axis labels form consistent sequences
- Cross-check team IDs against any text labels visible in the crop
- Flag outliers for human review
- Output: final JSON per crop, ready for web app ingestion

## Web app: file structure

- **index.html** — page shell
- **style.css** — all styles
- **app.js** — main UI, navigation, state management, localStorage persistence
- **cropper.js** — image upload, grid overlay with visual confirmation, Canvas API slicing into 72 individual violin crops
- **extractor.js** — UI for extraction tab; may call Gemini Flash browser-side if Stage 2 runs here
- **dataStore.js** — joins individual extraction results into unified tables, manages datasets across sessions

If any file exceeds ~300 lines, split before adding more code. Use ES modules (import/export) to connect files.

## Web app: cropper workflow

1. User uploads RHTER screenshot (expected: 2000×1124px, 24 violin columns × 3 budget tier rows)
2. App overlays a predefined grid on the image (72 crops)
3. User visually confirms alignment (two-eye principle)
4. If grid is off (RHTER changed layout), user can drag grid lines to adjust
5. "Slice" button crops all 72 violins via Canvas API
6. Crops held in memory for export to Python pipeline

Grid coordinates are TBD — will be calibrated against actual RHTER screenshots in a future step.

## Web app: code patterns

- Build UI with `document.createElement`, not innerHTML string templates
- Show all validation errors at once with inline field highlighting, not one-at-a-time toasts
- Persist all app state to localStorage — config, extracted datasets, grid adjustments. User loses nothing on refresh
- All user-supplied values escaped or set via textContent/properties, never injected as raw HTML
- Pipeline steps independently testable: cropper works without extractor, extractor works with manually provided images, analysis works with manually provided data

## Web app: hosting constraints

- Must work as static files on GitHub Pages
- No npm, no bundlers, no server-side code
- External libraries loaded via CDN only (Chart.js for visualization)
- ES modules work natively in modern browsers, no transpilation needed

## F1 Fantasy domain rules

- Constructor picks (CN1, CN2) and driver picks are independent selections
- Each RHTER violin plot shows a score distribution for one team combination
- Two colored violin shapes per plot represent CN1 and CN2 — identified by color, not text
- The (2X) multiplier is on a driver, not a constructor
- All 5 bottom labels are driver abbreviations (3 uppercase letters)
- 11 constructor colors: MCL=orange, MER=cyan, RED=navy, FER=red, WIL=blue, VRB=light blue, AST=dark green, HAA=white, AUD=maroon, ALP=pink, CAD=grey

## Future phases

- **analysis.js** — statistical calculations: Kelly scores, portfolio comparisons, value detection
- **charts.js** — visualization rendering (split from analysis.js only when it exceeds ~300 lines)
- Local model fallback — Qwen2.5-VL-7B via LM Studio as offline alternative to Gemini Flash

## When making changes

- One feature at a time, verify it works before moving on
- Build in order: cropper → extractor → data joining → analysis → charts
- Before adding to a file, check its length and suggest a split if approaching 300 lines
- Don't rewrite unrelated code when editing an existing function
- When touching one pipeline stage, don't change other stages
