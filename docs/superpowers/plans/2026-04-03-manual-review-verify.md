# Manual Review Verify + Budget Range Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `[V]` verify option to the flag resolution menu so users can confirm their manual JSON edits were saved before pressing `[A]`, and widen the budget range to avoid false positives.

**Architecture:** Two independent changes — a one-line config change and a new read-only function in the pipeline orchestrator. The verify function re-reads flagged JSONs from disk and re-runs existing `validate_crop()` on them, printing pass/fail per crop. No writes, no new dependencies.

**Tech Stack:** Python stdlib only (`json`, `pathlib`). Uses existing `validate_crop` from `pipeline/04_validate.py`.

---

## File Map

| File | Change |
|---|---|
| `pipeline/config.py` | Widen `BUDGET_REQUIRED_RANGE` from `(90.0, 115.0)` to `(80.0, 150.0)` |
| `pipeline/run_pipeline.py` | Add `_verify_flagged()` function; add `[V]` branch in `_flag_resolution_menu` |
| `tests/test_02b_sanity.py` | Update budget range test values to match new range |
| `tests/test_04_validate.py` | New file — tests for `_verify_flagged` behaviour |

---

### Task 1: Widen the budget range in config

**Files:**
- Modify: `pipeline/config.py:117`

- [ ] **Step 1: Update `BUDGET_REQUIRED_RANGE`**

In `pipeline/config.py`, change line 117:

```python
# Before
BUDGET_REQUIRED_RANGE = (90.0, 115.0)

# After
BUDGET_REQUIRED_RANGE = (80.0, 150.0)
```

- [ ] **Step 2: Fix the now-failing sanity tests**

`tests/test_02b_sanity.py` has two tests that use values which were outside the old range but are now inside the new range. Update them:

```python
# test_budget_range_too_low — change value to something below 80.0
def test_budget_range_too_low():
    crop = _make_crop({"header.budget_required": 70.0})
    flags = sanity_check(crop)
    assert "budget_range" in flags


# test_budget_range_too_high — change value to something above 150.0
def test_budget_range_too_high():
    crop = _make_crop({"header.budget_required": 160.0})
    flags = sanity_check(crop)
    assert "budget_range" in flags
```

- [ ] **Step 3: Run the sanity tests**

```
pytest tests/test_02b_sanity.py -v
```

Expected: all 11 tests pass.

- [ ] **Step 4: Commit**

```bash
git add pipeline/config.py tests/test_02b_sanity.py
git commit -m "fix: widen BUDGET_REQUIRED_RANGE to (80.0, 150.0) for season-end coverage"
```

---

### Task 2: Write failing tests for `_verify_flagged`

**Files:**
- Create: `tests/test_04_validate.py`

The function `_verify_flagged` will live in `pipeline/run_pipeline.py` and is not easily unit-testable in isolation (it reads files from disk). We test its behaviour via a temporary directory fixture.

- [ ] **Step 1: Write the test file**

Create `tests/test_04_validate.py`:

```python
"""Tests for _verify_flagged in run_pipeline."""

import json
import sys
from pathlib import Path

import pytest

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _write_crop_json(tmp_path, name, record):
    """Helper: write a crop JSON to tmp_path."""
    p = tmp_path / name
    p.write_text(json.dumps(record))
    return p


def _valid_record():
    return {
        "header": {
            "budget_required": 102.5,
            "avg_xpts": 185.3,
            "avg_xpts_dollar_impact": 201.1,
            "avg_budget_uplift": 0.55,
        },
        "percentiles": {"p95": 274, "p75": 219, "p50": 187, "p25": 153, "p05": 92},
        "drivers": [
            {"name": "LEC", "multiplier": "2X"},
            {"name": "LAW", "multiplier": None},
            {"name": "OCO", "multiplier": None},
            {"name": "BEA", "multiplier": None},
            {"name": "BOT", "multiplier": None},
        ],
        "constructors": None,
        "flagged": True,
        "flag_reasons": ["range_error: budget_required=88 outside [80, 150]"],
        "confidence": "low",
    }


def _invalid_record():
    r = _valid_record()
    r["header"]["budget_required"] = 70.0  # below new range of 80.0
    return r


def test_verify_flagged_all_ok(tmp_path, monkeypatch):
    """All flagged crops now pass validation — returns all-clear."""
    import pipeline.run_pipeline as rp
    monkeypatch.setattr(rp, "DATA_OUTPUT", tmp_path)

    _write_crop_json(tmp_path, "row0_col00.json", _valid_record())
    _write_crop_json(tmp_path, "row0_col01.json", _valid_record())

    results = rp._verify_flagged(["row0_col00.json", "row0_col01.json"])

    assert results == {"row0_col00.json": [], "row0_col01.json": []}


def test_verify_flagged_still_flagged(tmp_path, monkeypatch):
    """A crop that still fails validation is reported with its flags."""
    import pipeline.run_pipeline as rp
    monkeypatch.setattr(rp, "DATA_OUTPUT", tmp_path)

    _write_crop_json(tmp_path, "row0_col00.json", _invalid_record())

    results = rp._verify_flagged(["row0_col00.json"])

    assert len(results["row0_col00.json"]) > 0
    assert any("budget_required" in f for f in results["row0_col00.json"])


def test_verify_flagged_missing_file(tmp_path, monkeypatch, capsys):
    """A crop JSON that doesn't exist on disk is reported as an error."""
    import pipeline.run_pipeline as rp
    monkeypatch.setattr(rp, "DATA_OUTPUT", tmp_path)

    results = rp._verify_flagged(["row9_col99.json"])

    captured = capsys.readouterr()
    assert "row9_col99.json" in captured.out
    assert results["row9_col99.json"] == ["file_not_found"]


def test_verify_flagged_does_not_write(tmp_path, monkeypatch):
    """Verify must not write any files — disk state unchanged after call."""
    import pipeline.run_pipeline as rp
    monkeypatch.setattr(rp, "DATA_OUTPUT", tmp_path)

    record = _valid_record()
    _write_crop_json(tmp_path, "row0_col00.json", record)
    before = list(tmp_path.iterdir())

    rp._verify_flagged(["row0_col00.json"])

    after = list(tmp_path.iterdir())
    assert before == after
```

- [ ] **Step 2: Run to confirm tests fail (function not yet implemented)**

```
pytest tests/test_04_validate.py -v
```

Expected: `ImportError` or `AttributeError: module 'pipeline.run_pipeline' has no attribute '_verify_flagged'`

---

### Task 3: Implement `_verify_flagged`

**Files:**
- Modify: `pipeline/run_pipeline.py` — add function after `_rerun_flagged` (around line 167)

- [ ] **Step 1: Add `_verify_flagged` function**

Insert after the closing of `_rerun_flagged` (after line 167) in `pipeline/run_pipeline.py`:

```python
def _verify_flagged(flagged_list):
    """Re-read flagged crop JSONs from disk and re-run validate_crop on each.

    Returns a dict mapping crop name -> list of current flag reasons.
    An empty list means the crop now passes validation.
    A list containing 'file_not_found' means the JSON was missing on disk.

    Does NOT write anything to disk.
    """
    print(f"\nVerifying {len(flagged_list)} flagged crop(s)...")

    results = {}
    resolved = 0

    for name in flagged_list:
        base = name.replace(".json", "").replace(".png", "")
        json_path = DATA_OUTPUT / f"{base}.json"

        if not json_path.exists():
            print(f"  {name}: ERROR — file not found on disk")
            results[name] = ["file_not_found"]
            continue

        with open(json_path) as f:
            record = json.load(f)

        current_flags = validate_crop(record)

        if not current_flags:
            print(f"  {name}: OK (no flags — edits look good, ready to accept)")
            resolved += 1
        else:
            reasons = ", ".join(current_flags)
            print(f"  {name}: STILL FLAGGED — {reasons}")

        results[name] = current_flags

    still_flagged = len(flagged_list) - resolved
    print(f"\n{resolved}/{len(flagged_list)} resolved. ", end="")
    if still_flagged > 0:
        print("Fix remaining crops and press [V] again, or [A] to accept all anyway.")
    else:
        print("All clear — press [A] to write results.")

    return results
```

- [ ] **Step 2: Run tests to verify they pass**

```
pytest tests/test_04_validate.py -v
```

Expected: all 4 tests pass.

---

### Task 4: Add `[V]` to the flag resolution menu

**Files:**
- Modify: `pipeline/run_pipeline.py` — update `_flag_resolution_menu`

- [ ] **Step 1: Add `[V]` option to the menu print block and input handler**

In `_flag_resolution_menu`, update the print block and the if/elif chain. The full updated function body:

```python
def _flag_resolution_menu(flagged_list):
    """Interactive menu for resolving flagged crops.

    Returns True if final results should be written, False to quit without writing.
    """
    while True:
        print(f"\n{'='*60}")
        print(f"{len(flagged_list)} crop(s) flagged for review:")
        for name in flagged_list:
            print(f"  - {name}")
        print()
        print("  [R] Rerun flagged crops through Stages 2-4")
        print("  [V] Verify edits — re-check flagged crops on disk")
        print("  [S] Show details for a specific flagged crop")
        print("  [A] Accept all and write results.json (flags preserved)")
        print("  [Q] Quit without writing final output")
        print()

        choice = input("Choice: ").strip().upper()

        if choice == "R":
            flagged_list = _rerun_flagged(flagged_list)
            if not flagged_list:
                print("All flags resolved!")
                return True
        elif choice == "V":
            _verify_flagged(flagged_list)
        elif choice == "S":
            print("Enter crop name (e.g. row0_col00.png):")
            crop = input("  > ").strip()
            _show_crop_details(crop)
        elif choice == "A":
            return True
        elif choice == "Q":
            return False
        else:
            print(f"Unknown option: {choice!r}")
```

- [ ] **Step 2: Run full test suite**

```
pytest tests/ -v
```

Expected: all tests pass (test_02b_sanity.py + test_02a_llama_mapping.py + test_04_validate.py).

- [ ] **Step 3: Commit**

```bash
git add pipeline/run_pipeline.py tests/test_04_validate.py
git commit -m "feat: add [V] verify-edits option to flag resolution menu"
```

---

## Self-Review

**Spec coverage:**
- Fix 1 (budget range): covered in Task 1 ✓
- Fix 2 (`[V]` verify): covered in Tasks 2, 3, 4 ✓
- Output format from spec: matches `_verify_flagged` print statements ✓
- "Does not write anything": covered by `test_verify_flagged_does_not_write` ✓
- Missing file case: covered by `test_verify_flagged_missing_file` ✓
- Menu layout order from spec (`[R]`, `[V]`, `[S]`, `[A]`, `[Q]`): matches Task 4 ✓

**Placeholder scan:** None found.

**Type consistency:** `_verify_flagged` returns `dict[str, list[str]]` — used only for printing in the menu (return value discarded), consistent across Tasks 3 and 4.
