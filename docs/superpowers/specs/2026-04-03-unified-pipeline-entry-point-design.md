# Unified Pipeline Entry Point Design

## Goal

Make the pipeline a single command: drop a screenshot into `data/screenshots/`, run `python -m pipeline.run_pipeline`, get a named JSON in `data/final/`.

## What changes

Only `run_pipeline.py` is modified. Three targeted changes:

### 1. Prerequisites check

Currently checks for PNGs in `data/raw/`. Change to check for an image file in `data/screenshots/` (`.webp`, `.png`, `.jpg`, `.jpeg`). If none found, exit with a clear message:

```
No screenshot found in data/screenshots/ — add a .webp, .png, or .jpg file and rerun.
```

The check also returns the screenshot path so `main()` can pass it to Stage 0 and derive the output filename.

### 2. Stage 0 in `main()`

Call `crop_all()` from `pipeline.00_crop` at the top of `main()`, before Stage 1. Raw crops in `data/raw/` are always overwritten — no check, no prompt.

Import pattern (matches existing style for numeric modules):
```python
_crop = importlib.import_module("pipeline.00_crop")
crop_all = _crop.crop_all
```

### 3. Output naming

`_write_final_results()` currently writes to `data/final/results.json`. Change it to accept a `stem` parameter and write to `data/final/<stem>.json`.

- `stem` = screenshot filename without extension (e.g. `rw1_2026_r04.webp` → `rw1_2026_r04`)
- Existing files in `data/final/` are never touched — only the current run's file is written
- Running the same screenshot twice overwrites that screenshot's JSON (raw crops are overwritten anyway, so the result would be identical)

## What doesn't change

- `00_crop.py` — no changes, still independently runnable as `python -m pipeline.00_crop`
- Stages 1–4 and their modules — untouched
- `data/output/` per-crop JSONs — still written there as intermediate files
- Flag resolution menu — unchanged

## End-to-end flow

```
data/screenshots/rw1_2026_r04.webp   ← user places screenshot here
        ↓  python -m pipeline.run_pipeline
Stage 0: crop → data/raw/ (72 PNGs, always overwritten)
Stage 1: preprocess → data/preprocessed/
Stage 2: extract numbers → data/output/
Stage 3: extract colors → data/output/
Stage 4: validate → data/output/
        ↓  [flag resolution menu if any flags]
data/final/rw1_2026_r04.json         ← named final output
```

## Out of scope

- Per-run isolation of `data/output/` intermediate files (overwritten each run, not archived)
- CLI flags for skipping stages
- Multiple screenshots in one run
