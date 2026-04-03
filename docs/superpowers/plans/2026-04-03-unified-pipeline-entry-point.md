# Unified Pipeline Entry Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pipeline a single command — drop a screenshot into `data/screenshots/`, run `python -m pipeline.run_pipeline`, get a named JSON in `data/final/`.

**Architecture:** Three targeted changes to `run_pipeline.py` only: (1) `_check_prerequisites()` detects the screenshot and returns its path instead of checking `data/raw/`; (2) `main()` calls `crop_all()` as Stage 0 before Stage 1; (3) `_write_final_results()` accepts a `stem` parameter and writes to `data/final/<stem>.json`. No other files change.

**Tech Stack:** Python stdlib (`importlib`, `pathlib`, `re`), existing `pipeline.00_crop.crop_all`, existing `pipeline.config` path constants.

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `pipeline/run_pipeline.py` | Modify | `_check_prerequisites`, `_write_final_results`, `main`, import block |
| `tests/test_run_pipeline.py` | Create | Unit tests for the three changed functions |

No other files are touched.

---

### Task 1: Write tests for `_check_prerequisites` — screenshots directory

**Files:**
- Create: `tests/test_run_pipeline.py`

- [ ] **Step 1: Write the failing tests**

```python
"""Tests for run_pipeline changes: prerequisites, output naming, Stage 0 wiring."""

import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pipeline.run_pipeline as rp


# ---------------------------------------------------------------------------
# _check_prerequisites
# ---------------------------------------------------------------------------

def test_prerequisites_no_screenshots_dir(tmp_path, monkeypatch):
    """Missing screenshots dir → error message, no screenshot path returned."""
    monkeypatch.setattr(rp, "DATA_SCREENSHOTS", tmp_path / "screenshots")
    monkeypatch.setattr(rp, "DATA_RAW", tmp_path / "raw")
    # Simulate API key present so only the dir error fires
    monkeypatch.setenv("GEMINI_API_KEY", "fake")

    errors, screenshot_path = rp._check_prerequisites()

    assert any("screenshots" in e for e in errors)
    assert screenshot_path is None


def test_prerequisites_no_screenshot_files(tmp_path, monkeypatch):
    """Empty screenshots dir → clear error, no screenshot path returned."""
    screenshots = tmp_path / "screenshots"
    screenshots.mkdir()
    monkeypatch.setattr(rp, "DATA_SCREENSHOTS", screenshots)
    monkeypatch.setattr(rp, "DATA_RAW", tmp_path / "raw")
    monkeypatch.setenv("GEMINI_API_KEY", "fake")

    errors, screenshot_path = rp._check_prerequisites()

    assert any("screenshots" in e.lower() or "No screenshot" in e for e in errors)
    assert screenshot_path is None


def test_prerequisites_screenshot_found(tmp_path, monkeypatch):
    """Valid screenshot present → no dir error, screenshot path returned."""
    screenshots = tmp_path / "screenshots"
    screenshots.mkdir()
    webp = screenshots / "rw1_2026_r04.webp"
    webp.write_bytes(b"fake")
    monkeypatch.setattr(rp, "DATA_SCREENSHOTS", screenshots)
    monkeypatch.setattr(rp, "DATA_RAW", tmp_path / "raw")
    monkeypatch.setenv("GEMINI_API_KEY", "fake")

    errors, screenshot_path = rp._check_prerequisites()

    dir_errors = [e for e in errors if "screenshot" in e.lower()]
    assert dir_errors == []
    assert screenshot_path == webp


def test_prerequisites_no_api_keys(tmp_path, monkeypatch):
    """No API keys → error returned regardless of screenshot."""
    screenshots = tmp_path / "screenshots"
    screenshots.mkdir()
    (screenshots / "shot.webp").write_bytes(b"x")
    monkeypatch.setattr(rp, "DATA_SCREENSHOTS", screenshots)
    monkeypatch.setattr(rp, "DATA_RAW", tmp_path / "raw")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("LLAMA_CLOUD_API_KEY", raising=False)

    errors, _ = rp._check_prerequisites()

    assert any("API" in e or "api" in e.lower() for e in errors)
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_run_pipeline.py -v
```

Expected: `AttributeError` or `TypeError` — `_check_prerequisites` currently returns a list, not a tuple.

---

### Task 2: Update `_check_prerequisites` to return `(errors, screenshot_path)`

**Files:**
- Modify: `pipeline/run_pipeline.py:36-64`

- [ ] **Step 1: Replace `_check_prerequisites`**

Replace the entire function body (lines 36–64 in the current file):

```python
def _check_prerequisites():
    """Verify data/screenshots/ has an image and at least one API key is set.

    Returns (errors, screenshot_path).
    errors is a list of strings (empty if all OK).
    screenshot_path is the Path of the found screenshot, or None on error.
    """
    errors = []
    screenshot_path = None

    if not DATA_SCREENSHOTS.exists():
        errors.append(
            f"No screenshot found in data/screenshots/ — "
            "add a .webp, .png, or .jpg file and rerun."
        )
    else:
        candidates = sorted(
            p for p in DATA_SCREENSHOTS.iterdir()
            if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg")
        )
        if not candidates:
            errors.append(
                "No screenshot found in data/screenshots/ — "
                "add a .webp, .png, or .jpg file and rerun."
            )
        else:
            screenshot_path = candidates[0]
            if len(candidates) > 1:
                print(f"  Found {len(candidates)} screenshots, using: {screenshot_path.name}")

    has_llama = bool(os.environ.get("LLAMA_CLOUD_API_KEY"))
    has_gemini = bool(os.environ.get("GEMINI_API_KEY"))

    if not has_llama and not has_gemini:
        errors.append(
            "No API keys set. Set at least one of:\n"
            "  LLAMA_CLOUD_API_KEY — get at https://cloud.llamaindex.ai\n"
            "  GEMINI_API_KEY — get at https://aistudio.google.com/apikey"
        )
    elif has_llama and not has_gemini:
        print("  NOTE: GEMINI_API_KEY not set — flagged crops will go to manual review")
    elif not has_llama and has_gemini:
        print("  NOTE: LLAMA_CLOUD_API_KEY not set — using Gemini-only mode (slow)")

    return errors, screenshot_path
```

- [ ] **Step 2: Run prerequisite tests**

```
pytest tests/test_run_pipeline.py -v -k "prerequisites"
```

Expected: 4 PASS

- [ ] **Step 3: Commit**

```bash
git add pipeline/run_pipeline.py tests/test_run_pipeline.py
git commit -m "feat: _check_prerequisites returns screenshot path from data/screenshots/"
```

---

### Task 3: Write tests for `_write_final_results` — named output file

**Files:**
- Modify: `tests/test_run_pipeline.py`

- [ ] **Step 1: Add tests for `_write_final_results`**

Append to `tests/test_run_pipeline.py`:

```python
# ---------------------------------------------------------------------------
# _write_final_results
# ---------------------------------------------------------------------------

def _make_crop_jsons(output_dir, count=3):
    """Write minimal row/col JSON files to output_dir."""
    output_dir.mkdir(parents=True, exist_ok=True)
    for i in range(count):
        p = output_dir / f"row0_col{i:02d}.json"
        p.write_text(json.dumps({"row": 0, "col": i}))


def test_write_final_results_named_file(tmp_path, monkeypatch):
    """stem parameter controls output filename."""
    output_dir = tmp_path / "output"
    final_dir = tmp_path / "final"
    _make_crop_jsons(output_dir)
    monkeypatch.setattr(rp, "DATA_OUTPUT", output_dir)
    monkeypatch.setattr(rp, "DATA_FINAL", final_dir)

    result_path = rp._write_final_results(stem="rw1_2026_r04")

    assert result_path == final_dir / "rw1_2026_r04.json"
    assert result_path.exists()
    data = json.loads(result_path.read_text())
    assert len(data) == 3


def test_write_final_results_overwrites_same_stem(tmp_path, monkeypatch):
    """Calling twice with the same stem overwrites the file."""
    output_dir = tmp_path / "output"
    final_dir = tmp_path / "final"
    _make_crop_jsons(output_dir, count=2)
    monkeypatch.setattr(rp, "DATA_OUTPUT", output_dir)
    monkeypatch.setattr(rp, "DATA_FINAL", final_dir)

    rp._write_final_results(stem="myshot")
    _make_crop_jsons(output_dir, count=4)  # add more crops
    rp._write_final_results(stem="myshot")

    data = json.loads((final_dir / "myshot.json").read_text())
    assert len(data) == 4  # second write wins


def test_write_final_results_different_stems_coexist(tmp_path, monkeypatch):
    """Different stems produce separate files without touching each other."""
    output_dir = tmp_path / "output"
    final_dir = tmp_path / "final"
    monkeypatch.setattr(rp, "DATA_OUTPUT", output_dir)
    monkeypatch.setattr(rp, "DATA_FINAL", final_dir)

    _make_crop_jsons(output_dir, count=2)
    rp._write_final_results(stem="race_a")
    _make_crop_jsons(output_dir, count=3)
    rp._write_final_results(stem="race_b")

    assert (final_dir / "race_a.json").exists()
    assert (final_dir / "race_b.json").exists()
    assert len(json.loads((final_dir / "race_a.json").read_text())) == 2
    assert len(json.loads((final_dir / "race_b.json").read_text())) == 3
```

- [ ] **Step 2: Run to confirm they fail**

```
pytest tests/test_run_pipeline.py -v -k "write_final"
```

Expected: `TypeError` — `_write_final_results()` doesn't accept a `stem` parameter yet.

---

### Task 4: Update `_write_final_results` to accept `stem`

**Files:**
- Modify: `pipeline/run_pipeline.py:217-238`

- [ ] **Step 1: Replace `_write_final_results`**

Replace the entire function (lines 217–238 in the current file):

```python
def _write_final_results(stem):
    """Collect all per-crop JSONs into data/final/<stem>.json."""
    import re
    pattern = re.compile(r"^row(\d+)_col(\d+)\.json$")

    json_files = sorted(
        p for p in DATA_OUTPUT.iterdir()
        if p.is_file() and pattern.match(p.name)
    )

    all_crops = []
    for json_path in json_files:
        with open(json_path) as f:
            all_crops.append(json.load(f))

    DATA_FINAL.mkdir(parents=True, exist_ok=True)
    results_path = DATA_FINAL / f"{stem}.json"
    with open(results_path, "w") as f:
        json.dump(all_crops, f, indent=2)

    print(f"Final results written to {results_path} ({len(all_crops)} crops)")
    return results_path
```

- [ ] **Step 2: Run output naming tests**

```
pytest tests/test_run_pipeline.py -v -k "write_final"
```

Expected: 3 PASS

- [ ] **Step 3: Commit**

```bash
git add pipeline/run_pipeline.py tests/test_run_pipeline.py
git commit -m "feat: _write_final_results accepts stem, writes data/final/<stem>.json"
```

---

### Task 5: Wire Stage 0 and the new return values into `main()`

**Files:**
- Modify: `pipeline/run_pipeline.py` — import block and `main()`

- [ ] **Step 1: Add `00_crop` import after the existing numeric-module imports**

In the import block (after line 23, `_validate = importlib.import_module("pipeline.04_validate")`), add:

```python
_crop = importlib.import_module("pipeline.00_crop")
crop_all = _crop.crop_all
```

- [ ] **Step 2: Update `main()` to use the new prerequisites return and call Stage 0**

Replace the `main()` function (lines 280–354 in the current file) with:

```python
def main():
    """Run the full extraction pipeline."""
    print("=" * 60)
    print("RHTER F1 Fantasy Data Extraction Pipeline")
    print("=" * 60)

    # Check prerequisites
    errors, screenshot_path = _check_prerequisites()
    if errors:
        print("\nPrerequisite check failed:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("Prerequisites OK\n")

    stem = screenshot_path.stem  # e.g. "rw1_2026_r04"

    # Stage 0 — Crop
    print("-" * 40)
    print("Stage 0: Crop")
    print("-" * 40)
    crop_all()
    print()

    # Stage 1 — Preprocess
    print("-" * 40)
    print("Stage 1: Preprocess")
    print("-" * 40)
    processed, count = preprocess_all()
    if count == 0:
        print("No crops to process. Exiting.")
        sys.exit(1)
    print()

    # Stage 2 — Extract numbers
    print("-" * 40)
    print("Stage 2: Extract numbers (LlamaExtract + Gemini fallback)")
    print("-" * 40)
    s2_success, s2_flagged, s2_flagged_list = extract_all()
    print()

    # Stage 3 — Extract colors
    print("-" * 40)
    print("Stage 3: Extract colors (k-means)")
    print("-" * 40)
    s3_success, s3_flagged, s3_flagged_list = extract_colors_all()
    print()

    # Stage 4 — Validate
    print("-" * 40)
    print("Stage 4: Validate")
    print("-" * 40)
    s4_passed, s4_flagged, s4_flagged_list = validate_all()
    print()

    # Summary
    print("=" * 60)
    print("Pipeline Summary")
    print("=" * 60)
    print(f"  Crops processed:  {count}")
    print(f"  Stage 2 flagged:  {s2_flagged}")
    print(f"  Stage 3 flagged:  {s3_flagged}")
    print(f"  Stage 4 flagged:  {s4_flagged}")
    print(f"  Final passed:     {s4_passed}/{count}")
    print()

    if not s4_flagged_list:
        # No flags — auto-write results
        print("No flags detected. Writing final results...")
        _write_final_results(stem)
        print("\nPipeline complete!")
    else:
        # Flags exist — show resolution menu
        should_write = _flag_resolution_menu(s4_flagged_list)
        if should_write:
            _write_final_results(stem)
            print("\nPipeline complete!")
        else:
            print("\nExiting without writing final results.")
            print("Per-crop JSONs in data/output/ are still available.")
```

- [ ] **Step 3: Run all tests**

```
pytest tests/ -v
```

Expected: All existing tests PASS, all new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add pipeline/run_pipeline.py
git commit -m "feat: wire Stage 0 crop into main(), use screenshot stem for named output"
```

---

### Task 6: Smoke-test the updated docstring

**Files:**
- Modify: `pipeline/run_pipeline.py:1-7`

- [ ] **Step 1: Update the module docstring to reflect the new usage**

Replace lines 1–7:

```python
"""Pipeline orchestrator — single entry point for the full extraction pipeline.

Drop a screenshot into data/screenshots/, then run:

    python -m pipeline.run_pipeline

Stage 0 crops the screenshot, Stages 1-4 extract and validate, the flag
resolution menu handles any issues, and the final JSON is written to
data/final/<screenshot-stem>.json.
"""
```

- [ ] **Step 2: Run all tests one final time**

```
pytest tests/ -v
```

Expected: All PASS.

- [ ] **Step 3: Final commit**

```bash
git add pipeline/run_pipeline.py
git commit -m "docs: update run_pipeline module docstring for unified entry point"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|-----------------|-----------|
| Check `data/screenshots/` for `.webp`/`.png`/`.jpg`/`.jpeg` | Task 2 |
| Clear error message if no screenshot found | Task 2 (exact wording matches spec) |
| `_check_prerequisites` returns screenshot path | Task 2 |
| `main()` calls `crop_all()` before Stage 1, always overwrites | Task 5 (`crop_all()` itself handles this — no prompt, no check) |
| Import `00_crop` via `importlib` matching existing pattern | Task 5 |
| `_write_final_results` accepts `stem`, writes `data/final/<stem>.json` | Task 4 |
| `stem` derived from screenshot filename without extension | Task 5 (`screenshot_path.stem`) |
| Same screenshot twice → overwrites that JSON | Task 3 (test + Task 4 impl) |
| Other files in `data/final/` never touched | Task 3 (coexist test) |
| `00_crop.py` unchanged | Not touched — ✓ |
| Stages 1–4 unchanged | Not touched — ✓ |
| `data/output/` per-crop JSONs still written there | Not touched — ✓ |
| Flag resolution menu unchanged | Not touched — ✓ |

All spec requirements covered. No gaps found.

### Placeholder scan

No TBDs, no "similar to Task N" references, no steps without code. ✓

### Type consistency

- `_check_prerequisites()` returns `(list[str], Path | None)` in Task 2 — consumed as `errors, screenshot_path` in Task 5. ✓
- `_write_final_results(stem: str)` defined in Task 4 — called as `_write_final_results(stem)` in Task 5 where `stem = screenshot_path.stem`. ✓
- `crop_all()` called with no arguments in Task 5 — matches `00_crop.crop_all` signature (no parameters). ✓
