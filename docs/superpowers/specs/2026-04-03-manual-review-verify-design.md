# Manual Review UX Fix + Budget Range Correction

**Date:** 2026-04-03  
**Status:** Approved

## Problem

Two issues with the current pipeline:

1. **Silent edit acceptance:** When the pipeline flags crops for manual review, the user edits `data/output/*.json` in VSCode, then returns to the terminal and presses `[A]`. If the user forgot to save (`Ctrl+S`), the pipeline silently reads the unchanged files and writes stale data to `results.json`. There is no way to know edits landed before committing.

2. **Budget range too tight:** `BUDGET_REQUIRED_RANGE = (90.0, 115.0)` flags valid crops at the start and end of the season where budget values legitimately fall outside this window.

## Fix 1 — Budget range

In `pipeline/config.py`, change:

```python
BUDGET_REQUIRED_RANGE = (90.0, 115.0)
```

to:

```python
BUDGET_REQUIRED_RANGE = (80.0, 150.0)
```

No other changes.

## Fix 2 — `[V]` Verify option in flag resolution menu

### Behaviour

A new `[V]` option is added to the `_flag_resolution_menu` in `pipeline/run_pipeline.py`.

When pressed, it:
1. Re-reads each flagged crop JSON from `data/output/`
2. Re-runs `validate_crop()` on each
3. Prints one status line per crop:
   - `OK` if no flags remain (edits were saved and valid)
   - `STILL FLAGGED — <reason>` if flags remain
4. Prints a summary count of resolved vs still-flagged
5. Returns to the menu — does **not** write anything

### Output format

```
Verifying 3 flagged crop(s)...
  row0_col03: OK (no flags — edits look good, ready to accept)
  row1_col11: STILL FLAGGED — range_error: budget_required=88 outside [80, 150]
  row2_col07: STILL FLAGGED — null_field: p50 is null

1/3 resolved. Fix remaining crops and press [V] again, or [A] to accept all anyway.
```

### Menu layout after change

```
  [R] Rerun flagged crops through Stages 2-4
  [V] Verify edits — re-check flagged crops on disk
  [S] Show details for a specific flagged crop
  [A] Accept all and write results.json (flags preserved)
  [Q] Quit without writing final output
```

### What it does NOT do

- Does not write to any file
- Does not update the flagged list used by `[A]`
- Does not re-run Gemini or any ML stage
- Pressing `[A]` after `[V]` still reads whatever is on disk at that moment

### Implementation

Add a `_verify_flagged(flagged_list)` function in `run_pipeline.py` alongside the existing helpers. It uses the already-imported `validate_crop` function. No new imports needed.

## Files changed

| File | Change |
|---|---|
| `pipeline/config.py` | `BUDGET_REQUIRED_RANGE` lower bound 90→80, upper bound 115→150 |
| `pipeline/run_pipeline.py` | Add `_verify_flagged()` function; add `[V]` branch in `_flag_resolution_menu` |
