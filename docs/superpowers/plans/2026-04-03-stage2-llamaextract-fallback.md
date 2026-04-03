# Stage 2 Redesign: LlamaExtract + Gemini Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Gemini-only Stage 2 with LlamaExtract as primary extractor (Cost Effective tier, async parallel) and Gemini Flash as fallback for flagged crops.

**Architecture:** LlamaExtract processes all 72 crops in parallel via async SDK. A sanity filter catches known LlamaExtract failure modes (budget uplift decimal truncation, driver misreads). Flagged crops fall back to Gemini Flash (sequential, 13s delay). Crops that fail both go to manual review. Output JSON schema is unchanged — Stages 3 and 4 see no difference.

**Tech Stack:** `llama-cloud` Python SDK (AsyncLlamaCloud), existing `google-genai`, asyncio, pytest

**Spec:** `docs/superpowers/specs/2026-04-03-stage2-llamaextract-fallback-design.md`

---

## File Structure

| File | Role | Status |
|---|---|---|
| `pipeline/config.py` | Add LlamaExtract constants (schema, tier, env var name) | Modify |
| `pipeline/02b_sanity.py` | Shared sanity filter used by both extractors | Create |
| `pipeline/02a_llama_extract.py` | LlamaExtract bulk extraction + output mapping | Create |
| `pipeline/02_extract.py` | Becomes Stage 2 orchestrator; Gemini functions stay as fallback | Modify |
| `pipeline/run_pipeline.py` | Update prerequisite check for new env var | Modify |
| `pipeline/requirements.txt` | Add `llama-cloud` | Modify |
| `tests/test_02b_sanity.py` | Tests for sanity filter | Create |
| `tests/test_02a_llama_mapping.py` | Tests for LlamaExtract output mapping | Create |

---

### Task 1: Add `llama-cloud` dependency and config constants

**Files:**
- Modify: `pipeline/requirements.txt`
- Modify: `pipeline/config.py`

- [ ] **Step 1: Add `llama-cloud` to requirements.txt**

In `pipeline/requirements.txt`, add `llama-cloud` after the existing deps:

```
Pillow>=10.0
numpy>=1.24
scikit-learn>=1.3
google-genai>=1.0
llama-cloud>=0.1
```

- [ ] **Step 2: Install the new dependency**

Run: `.venv/Scripts/pip install llama-cloud`

Expected: installs successfully, `llama_cloud` importable.

- [ ] **Step 3: Add LlamaExtract constants to config.py**

Add a new section after the existing Stage 2 Gemini constants in `pipeline/config.py`:

```python
# ---------------------------------------------------------------------------
# Stage 2A — LlamaExtract (primary extractor)
# ---------------------------------------------------------------------------
LLAMA_CLOUD_API_KEY_ENV = "LLAMA_CLOUD_API_KEY"
LLAMA_EXTRACT_TIER = "cost_effective"
LLAMA_EXTRACT_CONCURRENCY = 5          # asyncio.Semaphore limit

LLAMA_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "budget_required": {
            "type": "number",
            "description": "Budget Required (top header number)",
        },
        "avg_xpts": {
            "type": "number",
            "description": "Average xPts (second header number)",
        },
        "avg_xpts_dollar_impact": {
            "type": "number",
            "description": "Avg xPts + ($ impact) (third header number)",
        },
        "budget_uplift": {
            "type": "number",
            "description": "Avg Budget Uplift (fourth header number, always 2 decimal places e.g. 0.55)",
        },
        "p95": {"type": "number"},
        "p75": {"type": "number"},
        "p50": {"type": "number"},
        "p25": {"type": "number"},
        "p05": {"type": "number"},
        "driver_1": {"type": "string"},
        "driver_1_2x": {"type": "boolean"},
        "driver_2": {"type": "string"},
        "driver_3": {"type": "string"},
        "driver_4": {"type": "string"},
        "driver_5": {"type": "string"},
    },
}
```

- [ ] **Step 4: Verify import works**

Run: `.venv/Scripts/python -c "from pipeline.config import LLAMA_EXTRACT_SCHEMA, LLAMA_EXTRACT_TIER; print('OK')"`

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add pipeline/requirements.txt pipeline/config.py
git commit -m "feat: add llama-cloud dependency and LlamaExtract config constants"
```

---

### Task 2: Create sanity filter (`02b_sanity.py`)

**Files:**
- Create: `tests/test_02b_sanity.py`
- Create: `pipeline/02b_sanity.py`

- [ ] **Step 1: Create test directory and test file**

Create `tests/test_02b_sanity.py`:

```python
"""Tests for Stage 2B/2D sanity filter."""

import sys
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline._02b_sanity import sanity_check


def _make_crop(overrides=None):
    """Build a valid internal-schema crop dict, with optional overrides."""
    crop = {
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
    }
    if overrides:
        for key_path, value in overrides.items():
            keys = key_path.split(".")
            obj = crop
            for k in keys[:-1]:
                if k.isdigit():
                    obj = obj[int(k)]
                else:
                    obj = obj[k]
            last = keys[-1]
            if last.isdigit():
                obj[int(last)] = value
            else:
                obj[last] = value
    return crop


def test_valid_crop_passes():
    flags = sanity_check(_make_crop())
    assert flags == []


def test_budget_uplift_single_decimal_flagged():
    """0.5 instead of 0.55 — the known LlamaExtract failure."""
    crop = _make_crop({"header.avg_budget_uplift": 0.5})
    flags = sanity_check(crop, raw_budget_uplift="0.5")
    assert "budget_uplift_precision" in flags


def test_budget_uplift_two_decimals_passes():
    crop = _make_crop({"header.avg_budget_uplift": 0.55})
    flags = sanity_check(crop, raw_budget_uplift="0.55")
    assert "budget_uplift_precision" not in flags


def test_budget_uplift_integer_flagged():
    """Integer like 1 instead of 1.00."""
    crop = _make_crop({"header.avg_budget_uplift": 1.0})
    flags = sanity_check(crop, raw_budget_uplift="1")
    assert "budget_uplift_precision" in flags


def test_missing_2x_marker_flagged():
    crop = _make_crop()
    crop["drivers"][0]["multiplier"] = None
    flags = sanity_check(crop)
    assert "missing_2x_marker" in flags


def test_invalid_driver_flagged():
    crop = _make_crop()
    crop["drivers"][2]["name"] = "COI"  # should be COL
    flags = sanity_check(crop)
    assert any("invalid_driver" in f for f in flags)


def test_percentile_order_flagged():
    crop = _make_crop({"percentiles.p75": 300})  # p75 > p95 (274)
    flags = sanity_check(crop)
    assert "percentile_order" in flags


def test_missing_field_flagged():
    crop = _make_crop({"header.avg_xpts": None})
    flags = sanity_check(crop)
    assert any("missing_field" in f for f in flags)


def test_budget_range_too_low():
    crop = _make_crop({"header.budget_required": 80.0})
    flags = sanity_check(crop)
    assert "budget_range" in flags


def test_budget_range_too_high():
    crop = _make_crop({"header.budget_required": 120.0})
    flags = sanity_check(crop)
    assert "budget_range" in flags


def test_multiple_flags_accumulate():
    crop = _make_crop({
        "header.budget_required": 80.0,
        "header.avg_xpts": None,
    })
    crop["drivers"][0]["multiplier"] = None
    flags = sanity_check(crop)
    assert len(flags) >= 3
```

- [ ] **Step 2: Install pytest if not present**

Run: `.venv/Scripts/pip install pytest`

- [ ] **Step 3: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_02b_sanity.py -v`

Expected: ImportError — `pipeline._02b_sanity` does not exist yet.

- [ ] **Step 4: Create `pipeline/02b_sanity.py`**

```python
"""Stage 2B/2D — Sanity filter for extraction results.

Quick checks that catch known extractor failure modes before full
Stage 4 validation. Used after both LlamaExtract (2B) and Gemini (2D).

Operates on the internal nested schema (header/percentiles/drivers).
"""

import re

from pipeline.config import (
    VALID_DRIVERS_2026,
    BUDGET_REQUIRED_RANGE,
)


def sanity_check(crop_data, raw_budget_uplift=None):
    """Run sanity checks on a single crop's extracted data.

    Args:
        crop_data: Dict in internal schema format (header, percentiles, drivers).
        raw_budget_uplift: The budget_uplift value as a raw string before float
            conversion (e.g. "0.5" vs "0.55"). If provided, used for decimal
            precision check. If None, precision check is skipped.

    Returns:
        List of flag reason strings (empty = all checks passed).
    """
    flags = []
    header = crop_data.get("header") or {}
    percentiles = crop_data.get("percentiles") or {}
    drivers = crop_data.get("drivers") or []

    # --- Missing field checks ---
    header_fields = ["budget_required", "avg_xpts", "avg_xpts_dollar_impact", "avg_budget_uplift"]
    for field in header_fields:
        if header.get(field) is None:
            flags.append(f"missing_field: {field}")

    pct_fields = ["p95", "p75", "p50", "p25", "p05"]
    for field in pct_fields:
        if percentiles.get(field) is None:
            flags.append(f"missing_field: {field}")

    # --- Budget uplift decimal precision ---
    # LlamaExtract misreads "0.55" as "0.5" — detect by checking raw string
    if raw_budget_uplift is not None:
        # Match: optional sign, digits, dot, then at least 2 decimal digits
        if not re.match(r"^[+-]?\d+\.\d{2,}$", raw_budget_uplift):
            flags.append("budget_uplift_precision")

    # --- Budget required range ---
    budget = header.get("budget_required")
    budget_lo, budget_hi = BUDGET_REQUIRED_RANGE
    if budget is not None and not (budget_lo <= budget <= budget_hi):
        flags.append("budget_range")

    # --- Driver 1 must have 2X multiplier ---
    if len(drivers) >= 1:
        d1 = drivers[0]
        if d1 is None or d1.get("multiplier") != "2X":
            flags.append("missing_2x_marker")
    else:
        flags.append("missing_2x_marker")

    # --- Driver names must be in valid set ---
    for i, d in enumerate(drivers):
        if d and d.get("name") and d["name"] not in VALID_DRIVERS_2026:
            flags.append(f"invalid_driver: {d['name']}")

    # --- Percentile monotonicity: p95 > p75 > p50 > p25 > p05 ---
    pct_values = [percentiles.get(k) for k in pct_fields]
    if all(v is not None for v in pct_values):
        for i in range(len(pct_values) - 1):
            if pct_values[i] <= pct_values[i + 1]:
                flags.append("percentile_order")
                break  # one flag is enough

    return flags
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_02b_sanity.py -v`

Expected: all 11 tests pass.

- [ ] **Step 6: Commit**

```bash
git add pipeline/02b_sanity.py tests/test_02b_sanity.py
git commit -m "feat: add sanity filter for Stage 2B/2D extraction checks"
```

---

### Task 3: Create LlamaExtract extraction + output mapping (`02a_llama_extract.py`)

**Files:**
- Create: `tests/test_02a_llama_mapping.py`
- Create: `pipeline/02a_llama_extract.py`

- [ ] **Step 1: Create mapping tests**

Create `tests/test_02a_llama_mapping.py`:

```python
"""Tests for LlamaExtract output mapping to internal schema."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline._02a_llama_extract import map_llama_to_internal


def test_maps_header_fields():
    raw = {
        "budget_required": 102.5,
        "avg_xpts": 185.3,
        "avg_xpts_dollar_impact": 201.1,
        "budget_uplift": 0.55,
        "p95": 274, "p75": 219, "p50": 187, "p25": 153, "p05": 92,
        "driver_1": "LEC", "driver_1_2x": True,
        "driver_2": "LAW", "driver_3": "OCO", "driver_4": "BEA", "driver_5": "BOT",
    }
    result = map_llama_to_internal(raw)
    assert result["header"]["budget_required"] == 102.5
    assert result["header"]["avg_xpts"] == 185.3
    assert result["header"]["avg_xpts_dollar_impact"] == 201.1
    assert result["header"]["avg_budget_uplift"] == 0.55


def test_maps_percentiles():
    raw = {
        "budget_required": 102.5, "avg_xpts": 185.3,
        "avg_xpts_dollar_impact": 201.1, "budget_uplift": 0.55,
        "p95": 274, "p75": 219, "p50": 187, "p25": 153, "p05": 92,
        "driver_1": "LEC", "driver_1_2x": True,
        "driver_2": "LAW", "driver_3": "OCO", "driver_4": "BEA", "driver_5": "BOT",
    }
    result = map_llama_to_internal(raw)
    assert result["percentiles"] == {"p95": 274, "p75": 219, "p50": 187, "p25": 153, "p05": 92}


def test_maps_drivers_with_2x_on_first():
    raw = {
        "budget_required": 102.5, "avg_xpts": 185.3,
        "avg_xpts_dollar_impact": 201.1, "budget_uplift": 0.55,
        "p95": 274, "p75": 219, "p50": 187, "p25": 153, "p05": 92,
        "driver_1": "LEC", "driver_1_2x": True,
        "driver_2": "LAW", "driver_3": "OCO", "driver_4": "BEA", "driver_5": "BOT",
    }
    result = map_llama_to_internal(raw)
    drivers = result["drivers"]
    assert len(drivers) == 5
    assert drivers[0] == {"name": "LEC", "multiplier": "2X"}
    assert drivers[1] == {"name": "LAW", "multiplier": None}
    assert drivers[4] == {"name": "BOT", "multiplier": None}


def test_handles_missing_fields_gracefully():
    raw = {"budget_required": 102.5}  # most fields missing
    result = map_llama_to_internal(raw)
    assert result["header"]["avg_xpts"] is None
    assert result["percentiles"]["p95"] is None
    assert result["drivers"][0]["name"] is None


def test_driver_1_2x_false_still_maps():
    """Even if driver_1_2x is False, we map it — sanity filter catches it."""
    raw = {
        "budget_required": 102.5, "avg_xpts": 185.3,
        "avg_xpts_dollar_impact": 201.1, "budget_uplift": 0.55,
        "p95": 274, "p75": 219, "p50": 187, "p25": 153, "p05": 92,
        "driver_1": "LEC", "driver_1_2x": False,
        "driver_2": "LAW", "driver_3": "OCO", "driver_4": "BEA", "driver_5": "BOT",
    }
    result = map_llama_to_internal(raw)
    # 2X only set when driver_1_2x is True
    assert result["drivers"][0]["multiplier"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_02a_llama_mapping.py -v`

Expected: ImportError — module doesn't exist yet.

- [ ] **Step 3: Create `pipeline/02a_llama_extract.py`**

```python
"""Stage 2A — LlamaExtract bulk extraction.

Uploads preprocessed crops to LlamaExtract (Cost Effective tier),
extracts structured data via JSON schema, maps to internal format.

Input:  preprocessed PNGs in data/preprocessed/
Output: dict keyed by (row, col) with (parsed_data, flags, raw_response)
"""

import asyncio
import json
import os
import re
import time
from pathlib import Path

from pipeline.config import (
    LLAMA_CLOUD_API_KEY_ENV,
    LLAMA_EXTRACT_SCHEMA,
    LLAMA_EXTRACT_TIER,
    LLAMA_EXTRACT_CONCURRENCY,
    DATA_PREPROCESSED,
)

FILENAME_PATTERN = re.compile(r"^row(\d+)_col(\d+)\.png$")


def map_llama_to_internal(raw):
    """Convert flat LlamaExtract output to nested internal schema.

    Args:
        raw: Dict with flat keys from LlamaExtract (budget_required, p95, driver_1, etc.)

    Returns:
        Dict in internal schema format (header, percentiles, drivers).
    """
    header = {
        "budget_required": raw.get("budget_required"),
        "avg_xpts": raw.get("avg_xpts"),
        "avg_xpts_dollar_impact": raw.get("avg_xpts_dollar_impact"),
        "avg_budget_uplift": raw.get("budget_uplift"),
    }

    percentiles = {
        "p95": raw.get("p95"),
        "p75": raw.get("p75"),
        "p50": raw.get("p50"),
        "p25": raw.get("p25"),
        "p05": raw.get("p05"),
    }

    drivers = []
    for i in range(1, 6):
        name = raw.get(f"driver_{i}")
        if i == 1 and raw.get("driver_1_2x") is True:
            multiplier = "2X"
        else:
            multiplier = None
        drivers.append({"name": name, "multiplier": multiplier})

    return {
        "header": header,
        "percentiles": percentiles,
        "drivers": drivers,
    }


def get_raw_budget_uplift(extract_result):
    """Extract the raw budget_uplift string from LlamaExtract result.

    LlamaExtract returns numbers as floats, but we need the raw string
    to check decimal precision. We reconstruct it from the JSON representation.

    Args:
        extract_result: The raw extract_result dict from LlamaExtract.

    Returns:
        String representation of budget_uplift, or None if not present.
    """
    val = extract_result.get("budget_uplift")
    if val is None:
        return None
    # Convert to string via JSON to get the canonical representation
    # json.dumps(0.5) -> "0.5", json.dumps(0.55) -> "0.55"
    return json.dumps(val)


async def _extract_single_crop(client, semaphore, crop_path):
    """Extract data from a single crop via LlamaExtract.

    Returns (row, col, extract_result_dict, raw_json_str) or
            (row, col, None, error_str) on failure.
    """
    m = FILENAME_PATTERN.match(crop_path.name)
    if not m:
        return None, None, None, f"bad filename: {crop_path.name}"
    row, col = int(m.group(1)), int(m.group(2))

    async with semaphore:
        try:
            # Upload
            file_obj = await client.files.create(
                file=str(crop_path), purpose="extract"
            )

            # Extract
            job = await client.extract.create(
                file_input=file_obj.id,
                configuration={
                    "data_schema": LLAMA_EXTRACT_SCHEMA,
                    "extraction_target": "per_doc",
                    "tier": LLAMA_EXTRACT_TIER,
                    "confidence_scores": True,
                },
            )

            # Poll for completion
            while job.status not in ("COMPLETED", "FAILED", "CANCELLED"):
                await asyncio.sleep(2)
                job = await client.extract.get(job.id)

            if job.status != "COMPLETED":
                return row, col, None, f"job {job.status}"

            result = job.extract_result
            raw_json = json.dumps(result, indent=2) if result else ""
            return row, col, result, raw_json

        except Exception as e:
            return row, col, None, f"api_error: {e}"


async def _extract_all_async(crops):
    """Process all crops through LlamaExtract in parallel.

    Returns dict keyed by (row, col) -> (extract_result, raw_json).
    """
    from llama_cloud import AsyncLlamaCloud

    api_key = os.environ.get(LLAMA_CLOUD_API_KEY_ENV)
    if not api_key:
        raise RuntimeError(
            f"{LLAMA_CLOUD_API_KEY_ENV} environment variable is not set. "
            "Get a free key at https://cloud.llamaindex.ai"
        )

    client = AsyncLlamaCloud(api_key=api_key)
    semaphore = asyncio.Semaphore(LLAMA_EXTRACT_CONCURRENCY)

    tasks = [_extract_single_crop(client, semaphore, path) for path in crops]
    raw_results = await asyncio.gather(*tasks)

    results = {}
    for row, col, extract_result, raw_json in raw_results:
        if row is not None:
            results[(row, col)] = (extract_result, raw_json)

    return results


def extract_all_llama(crops=None):
    """Process all preprocessed crops through LlamaExtract.

    Args:
        crops: Optional list of Path objects. If None, scans DATA_PREPROCESSED.

    Returns:
        Dict keyed by (row, col) -> (parsed_data, flags, raw_response).
        parsed_data is in internal schema format (header/percentiles/drivers).
        flags is a list from sanity_check.
        raw_response is the raw JSON string from LlamaExtract.
    """
    from pipeline._02b_sanity import sanity_check

    if crops is None:
        crops = sorted(
            p for p in DATA_PREPROCESSED.iterdir()
            if p.is_file() and FILENAME_PATTERN.match(p.name)
        )

    if not crops:
        print("WARNING: No preprocessed crops found")
        return {}

    print(f"  Sending {len(crops)} crops to LlamaExtract ({LLAMA_EXTRACT_TIER})...")
    start = time.time()
    raw_results = asyncio.run(_extract_all_async(crops))
    elapsed = time.time() - start
    print(f"  LlamaExtract complete in {elapsed:.1f}s")

    results = {}
    for (row, col), (extract_result, raw_json) in raw_results.items():
        if extract_result is None:
            # API failure
            results[(row, col)] = (None, [f"llama_api_error: {raw_json}"], raw_json)
            print(f"  row{row}_col{col:02d} FAILED: {raw_json}")
            continue

        parsed = map_llama_to_internal(extract_result)
        raw_uplift = get_raw_budget_uplift(extract_result)
        flags = sanity_check(parsed, raw_budget_uplift=raw_uplift)

        status = "OK" if not flags else f"FLAGGED: {', '.join(flags)}"
        print(f"  row{row}_col{col:02d} {status}")

        results[(row, col)] = (parsed, flags, raw_json)

    passed = sum(1 for _, (_, flags, _) in results.items() if not flags)
    flagged = len(results) - passed
    print(f"  LlamaExtract: {passed} passed, {flagged} flagged")

    return results
```

- [ ] **Step 4: Run mapping tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_02a_llama_mapping.py -v`

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add pipeline/02a_llama_extract.py tests/test_02a_llama_mapping.py
git commit -m "feat: add LlamaExtract bulk extraction and output mapping"
```

---

### Task 4: Refactor `02_extract.py` into Stage 2 orchestrator

**Files:**
- Modify: `pipeline/02_extract.py`

- [ ] **Step 1: Rewrite `extract_all()` to orchestrate two-tier flow**

The existing Gemini functions (`_get_client`, `extract_crop`, `_parse_response`, `PROMPT`, `write_crop_json`) stay unchanged. Only `extract_all()` is rewritten.

Replace the `extract_all()` function (lines 187-227) in `pipeline/02_extract.py` with:

```python
def extract_all():
    """Process all preprocessed crops through two-tier extraction.

    Tier 1: LlamaExtract (all crops, async parallel)
    Tier 2: Gemini Flash (flagged crops only, sequential)

    Returns (success_count, flagged_count, flagged_list).
    """
    import os
    from pipeline.config import LLAMA_CLOUD_API_KEY_ENV

    crops = sorted(
        p for p in DATA_PREPROCESSED.iterdir()
        if p.is_file() and FILENAME_PATTERN.match(p.name)
    )

    if not crops:
        print("WARNING: No preprocessed crops found in", DATA_PREPROCESSED)
        return 0, 0, []

    # --- Check which extractors are available ---
    has_llama = bool(os.environ.get(LLAMA_CLOUD_API_KEY_ENV))
    has_gemini = bool(os.environ.get("GEMINI_API_KEY"))

    if not has_llama:
        print("  LLAMA_CLOUD_API_KEY not set — using Gemini-only mode")
        return _extract_all_gemini_only(crops)

    # --- Stage 2A: LlamaExtract (all crops) ---
    from pipeline._02a_llama_extract import extract_all_llama
    llama_results = extract_all_llama(crops)

    # --- Separate passed vs flagged ---
    passed_results = {}
    flagged_crops = []

    for crop_path in crops:
        m = FILENAME_PATTERN.match(crop_path.name)
        row, col = int(m.group(1)), int(m.group(2))
        key = (row, col)

        if key not in llama_results:
            flagged_crops.append((crop_path, row, col))
            continue

        parsed, flags, raw = llama_results[key]
        if flags:
            flagged_crops.append((crop_path, row, col))
        else:
            # Write passing LlamaExtract results immediately
            write_crop_json(row, col, parsed, flags, raw)
            passed_results[key] = True

    # --- Stage 2C: Gemini fallback for flagged crops ---
    gemini_passed = 0
    still_flagged = []

    if flagged_crops and has_gemini:
        print(f"\n  Falling back to Gemini Flash for {len(flagged_crops)} flagged crops...")
        from pipeline._02b_sanity import sanity_check
        import time

        client = _get_client()

        for idx, (crop_path, row, col) in enumerate(flagged_crops):
            parsed, flags, raw = extract_crop(crop_path, client)

            # Stage 2D: Sanity check on Gemini output
            gemini_flags = []
            if parsed:
                gemini_flags = sanity_check(parsed)

            all_flags = flags + gemini_flags
            write_crop_json(row, col, parsed, all_flags, raw)

            status = "OK" if not all_flags else f"STILL FLAGGED: {', '.join(all_flags)}"
            print(f"    [{idx+1}/{len(flagged_crops)}] {crop_path.name} {status}")

            if all_flags:
                still_flagged.append(crop_path.name)
            else:
                gemini_passed += 1

            if idx < len(flagged_crops) - 1:
                time.sleep(API_DELAY_SECONDS)

        print(f"  Gemini fallback: {gemini_passed} resolved, {len(still_flagged)} still flagged")

    elif flagged_crops and not has_gemini:
        print(f"\n  GEMINI_API_KEY not set — {len(flagged_crops)} crops go to manual review")
        for crop_path, row, col in flagged_crops:
            key = (row, col)
            if key in llama_results:
                parsed, flags, raw = llama_results[key]
            else:
                parsed, flags, raw = None, ["llama_extract_missing"], ""
            write_crop_json(row, col, parsed, flags, raw)
            still_flagged.append(crop_path.name)

    total_passed = len(passed_results) + gemini_passed
    total_flagged = len(still_flagged)

    print(f"Stage 2 complete: {total_passed} success, {total_flagged} flagged")
    return total_passed, total_flagged, still_flagged


def _extract_all_gemini_only(crops):
    """Fallback: process all crops through Gemini only (original behavior).

    Returns (success_count, flagged_count, flagged_list).
    """
    client = _get_client()
    success = 0
    flagged_list = []

    for idx, path in enumerate(crops):
        m = FILENAME_PATTERN.match(path.name)
        row, col = int(m.group(1)), int(m.group(2))

        parsed, flags, raw = extract_crop(path, client)
        write_crop_json(row, col, parsed, flags, raw)

        status = "OK" if not flags else f"FLAGGED: {', '.join(flags)}"
        print(f"  [{idx+1:>2}/{len(crops)}] {path.name} {status}")

        if flags:
            flagged_list.append(path.name)
        else:
            success += 1

        if idx < len(crops) - 1:
            time.sleep(API_DELAY_SECONDS)

    flagged_count = len(flagged_list)
    print(f"Stage 2 complete: {success} success, {flagged_count} flagged")
    return success, flagged_count, flagged_list
```

- [ ] **Step 2: Verify the module still imports cleanly**

Run: `.venv/Scripts/python -c "import importlib; m = importlib.import_module('pipeline.02_extract'); print('extract_all' in dir(m))"`

Expected: `True`

- [ ] **Step 3: Verify existing tests still pass**

Run: `.venv/Scripts/python -m pytest tests/ -v`

Expected: all tests pass (mapping + sanity tests from Tasks 2-3).

- [ ] **Step 4: Commit**

```bash
git add pipeline/02_extract.py
git commit -m "feat: refactor 02_extract.py into two-tier orchestrator (LlamaExtract + Gemini fallback)"
```

---

### Task 5: Update `run_pipeline.py` prerequisite check

**Files:**
- Modify: `pipeline/run_pipeline.py`

- [ ] **Step 1: Update `_check_prerequisites()` for dual API keys**

Replace the `_check_prerequisites()` function (lines 33-53) in `pipeline/run_pipeline.py`:

```python
def _check_prerequisites():
    """Verify data/raw/ has PNGs and at least one API key is set.

    Returns list of error messages (empty if all OK).
    """
    errors = []

    if not DATA_RAW.exists():
        errors.append(f"Directory not found: {DATA_RAW}")
    else:
        pngs = [p for p in DATA_RAW.iterdir() if p.suffix.lower() == ".png"]
        if not pngs:
            errors.append(f"No PNG files found in {DATA_RAW}")

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

    return errors
```

- [ ] **Step 2: Update the Stage 2 print header**

In `run_pipeline.py`, change line 247:

```python
    # Before:
    print("Stage 2: Extract numbers (Gemini Flash)")
    # After:
    print("Stage 2: Extract numbers (LlamaExtract + Gemini fallback)")
```

- [ ] **Step 3: Verify orchestrator still runs without errors (dry check)**

Run: `.venv/Scripts/python -c "from pipeline.run_pipeline import _check_prerequisites; print(_check_prerequisites())"`

Expected: prints list of errors (since API keys probably aren't set in this shell), but no import errors.

- [ ] **Step 4: Commit**

```bash
git add pipeline/run_pipeline.py
git commit -m "feat: update run_pipeline prerequisite check for dual API keys"
```

---

### Task 6: Handle numeric-prefix import convention

**Files:**
- Modify: `pipeline/02_extract.py` (import lines)
- Modify: `pipeline/02a_llama_extract.py` (if needed)

The pipeline uses numeric-prefixed filenames (`01_preprocess.py`, `02_extract.py`). Python can't `import pipeline.02_extract` normally — the codebase uses `importlib.import_module()` in `run_pipeline.py`.

The new files `02a_llama_extract.py` and `02b_sanity.py` face the same issue. Imports within the pipeline already work (e.g., `02_extract.py` imports from `pipeline.config`), but cross-imports between numbered modules need `importlib`.

- [ ] **Step 1: Fix imports in `02_extract.py`**

In `pipeline/02_extract.py`, the new `extract_all()` uses:
```python
from pipeline._02a_llama_extract import extract_all_llama
from pipeline._02b_sanity import sanity_check
```

These won't work because the files are named `02a_llama_extract.py` (no leading underscore). Fix by using importlib:

```python
# At the top of 02_extract.py, after existing imports:
import importlib

_llama = importlib.import_module("pipeline.02a_llama_extract")
_sanity = importlib.import_module("pipeline.02b_sanity")
```

Then in `extract_all()`, replace:
```python
from pipeline._02a_llama_extract import extract_all_llama
```
with:
```python
extract_all_llama = _llama.extract_all_llama
```

And replace:
```python
from pipeline._02b_sanity import sanity_check
```
with:
```python
sanity_check = _sanity.sanity_check
```

- [ ] **Step 2: Fix imports in `02a_llama_extract.py`**

In `pipeline/02a_llama_extract.py`, the `extract_all_llama()` function uses:
```python
from pipeline._02b_sanity import sanity_check
```

Replace with:
```python
import importlib
_sanity = importlib.import_module("pipeline.02b_sanity")
sanity_check = _sanity.sanity_check
```

- [ ] **Step 3: Fix test imports**

In `tests/test_02b_sanity.py`, change:
```python
from pipeline._02b_sanity import sanity_check
```
to:
```python
import importlib
_sanity = importlib.import_module("pipeline.02b_sanity")
sanity_check = _sanity.sanity_check
```

In `tests/test_02a_llama_mapping.py`, change:
```python
from pipeline._02a_llama_extract import map_llama_to_internal
```
to:
```python
import importlib
_llama = importlib.import_module("pipeline.02a_llama_extract")
map_llama_to_internal = _llama.map_llama_to_internal
```

- [ ] **Step 4: Also update `run_pipeline.py` to import new modules**

In `pipeline/run_pipeline.py`, after the existing `importlib` imports (around line 17), the `_rerun_flagged` function calls `extract_crop` and `_get_client` which still come from `02_extract.py`. No change needed there. But add these for completeness so the orchestrator can access them if needed later:

No change needed — `run_pipeline.py` calls `extract_all()` from `02_extract.py`, which internally handles the LlamaExtract imports. The interface is unchanged.

- [ ] **Step 5: Run all tests**

Run: `.venv/Scripts/python -m pytest tests/ -v`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add pipeline/02_extract.py pipeline/02a_llama_extract.py pipeline/02b_sanity.py tests/test_02b_sanity.py tests/test_02a_llama_mapping.py
git commit -m "fix: use importlib for numeric-prefix module cross-imports"
```

---

### Task 7: Integration test with real crops (manual)

This task is a manual verification step — not automated tests.

- [ ] **Step 1: Set environment variables**

```bash
export LLAMA_CLOUD_API_KEY="your-key-here"
export GEMINI_API_KEY="your-key-here"
```

- [ ] **Step 2: Run the full pipeline**

Run: `.venv/Scripts/python -m pipeline`

Expected output should show:
- Stage 1: Preprocess (as before)
- Stage 2: LlamaExtract processes all 72 crops, reports passed/flagged split
- Flagged crops fall through to Gemini Flash
- Gemini resolves most/all flagged crops
- Stage 3 and 4 proceed as before

- [ ] **Step 3: Verify output JSON format is unchanged**

Check a few output files in `data/output/`:
```bash
cat data/output/row0_col00.json | python -m json.tool
```

Verify the JSON has the same structure: `row`, `col`, `header`, `percentiles`, `drivers`, `constructors` (null until Stage 3), `confidence`, `flagged`, `flag_reasons`, `raw_response`.

- [ ] **Step 4: Compare LlamaExtract-only results vs Gemini results**

For a crop that passed LlamaExtract sanity: compare its JSON against the Gemini result from the previous run (if available in git history). Values should match except possibly budget_uplift precision.

- [ ] **Step 5: Commit any adjustments**

If the integration test reveals needed tweaks (concurrency limit, polling interval, etc.), fix and commit:

```bash
git add -u
git commit -m "fix: integration test adjustments for LlamaExtract pipeline"
```
