# Stage 2 Redesign — LlamaExtract Primary + Gemini Flash Fallback

## Problem

Gemini 2.5 Flash free tier has a 5 req/min rate limit. With 72 crops needing individual API calls (1 violin per call is mandatory), the minimum run time is ~14.5 minutes. In practice, 429 RESOURCE_EXHAUSTED errors cause partial failures — only 18/72 crops succeeded in the first full run.

## Solution

Replace the single-extractor Gemini pipeline with a two-tier architecture:

1. **LlamaExtract** (Cost Effective tier) handles all 72 crops in parallel — fast, cheap, no rate limit pain.
2. **Gemini Flash** fires only on the ~5-10% of crops that fail sanity checks — proven 100% accuracy when it succeeds.
3. Crops that fail both extractors go to **manual review** via the existing orchestrator menu.

## Constraints

- 1 violin crop per API call (non-negotiable — multi-image calls produce garbage).
- Stages 1, 3, 4 are untouched — only Stage 2 changes.
- Per-crop JSON output schema is unchanged — downstream stages see no difference.
- Must work with free tiers: LlamaExtract 10k credits/month, Gemini Flash 5 req/min.

## Architecture

```
72 preprocessed PNGs
  |
  v
+------------------------------+
|  Stage 2A: LlamaExtract      |  All 72, async parallel
|  - Cost Effective tier        |  72 credits/run (~138 runs/month free)
|  - Structured JSON schema     |
|  - confidence_scores: true    |
+--------------+---------------+
               v
+------------------------------+
|  Stage 2B: Sanity filter     |  Quick checks on LlamaExtract output
+------+--------------+--------+
    passed          flagged
       |               v
       |  +------------------------+
       |  | Stage 2C: Gemini Flash |  Sequential, 13s delay
       |  | (temp 0, fallback)     |  Only flagged crops
       |  +-----------+------------+
       |              v
       |  +------------------------+
       |  | Stage 2D: Sanity       |  Same checks on Gemini output
       |  | filter (Gemini)        |
       |  +----+----------+-------+
       |    passed     still flagged
       |       |            |
       v       v            v
+----------------+   +--------------+
| Merge -> JSON  |   | Manual review|
| confidence:    |   | flagged in   |
| high           |   | output JSON  |
+----------------+   +--------------+
```

## Credit budget

- LlamaExtract Cost Effective: 1 credit per image.
- 72 crops x 1 credit = 72 credits per full run.
- 10,000 credits/month free = ~138 full pipeline runs per month.
- Gemini Flash: only fires on flagged crops (~5-10%), so 4-7 calls at 13s each = under 2 minutes.

## LlamaExtract JSON schema

Stored in `config.py` as `LLAMA_EXTRACT_SCHEMA`:

```json
{
  "type": "object",
  "properties": {
    "budget_required": { "type": "number", "description": "Budget Required (top header number)" },
    "avg_xpts": { "type": "number", "description": "Average xPts (second header number)" },
    "avg_xpts_dollar_impact": { "type": "number", "description": "Avg xPts + ($ impact) (third header number)" },
    "budget_uplift": { "type": "number", "description": "Avg Budget Uplift (fourth header number, always 2 decimal places)" },
    "p95": { "type": "number" },
    "p75": { "type": "number" },
    "p50": { "type": "number" },
    "p25": { "type": "number" },
    "p05": { "type": "number" },
    "driver_1": { "type": "string" },
    "driver_1_2x": { "type": "boolean" },
    "driver_2": { "type": "string" },
    "driver_3": { "type": "string" },
    "driver_4": { "type": "string" },
    "driver_5": { "type": "string" }
  }
}
```

Notes:
- `driver_1_2x` is always `true` — the 2X multiplier is always on the first (top) driver.
- Field names align with internal schema to minimize mapping logic.
- `budget_uplift` description hints at 2 decimal places but LlamaExtract ignores this — the sanity filter catches truncation.

## LlamaExtract API flow (per crop)

```python
# Upload
file_obj = await client.files.create(file=crop_path, purpose="extract")

# Extract
job = await client.extract.create(
    file_input=file_obj.id,
    configuration={
        "data_schema": LLAMA_EXTRACT_SCHEMA,
        "extraction_target": "per_doc",
        "tier": "cost_effective",
        "confidence_scores": True,
    },
)

# Poll
while job.status not in ("COMPLETED", "FAILED", "CANCELLED"):
    await asyncio.sleep(2)
    job = await client.extract.get(job.id)

# Result
result = job.extract_result  # dict matching schema
```

Batch processing uses `AsyncLlamaCloud` with `asyncio.Semaphore(5)` for concurrency control.

## Sanity filter

A shared function `sanity_check(extracted: dict) -> list[str]` used by both Stage 2B and 2D. Returns a list of flag reason strings (empty = passed).

| Check | Catches | Flag reason |
|---|---|---|
| `budget_uplift` has < 2 decimal places (check raw JSON string before float conversion, e.g. `"0.5"` vs `"0.55"`) | LlamaExtract `$` misread (0.55 -> 0.5) | `budget_uplift_precision` |
| `driver_1_2x` is not `true` | Missing 2X marker | `missing_2x_marker` |
| Any driver not in `VALID_DRIVERS_2026` | OCR misread (COI instead of COL) | `invalid_driver` |
| Percentiles not monotonic (p95 > p75 > p50 > p25 > p05) | Swapped/misread values | `percentile_order` |
| Any field is `null` / missing | Extraction failed to find value | `missing_field` |
| `budget_required` outside 90-115 | Implausible value | `budget_range` |

## Output mapping

LlamaExtract returns a flat dict. A mapping function converts it to the existing nested internal schema:

```python
# LlamaExtract flat output:
{"budget_required": 102.5, "avg_xpts": 185.3, ..., "driver_1": "LEC", "driver_1_2x": true, ...}

# Mapped to internal schema:
{
  "header": {
    "budget_required": 102.5,
    "avg_xpts": 185.3,
    "avg_xpts_dollar_impact": 201.1,
    "avg_budget_uplift": 0.5
  },
  "percentiles": {"p95": 274, "p75": 219, "p50": 187, "p25": 153, "p05": 92},
  "drivers": [
    {"name": "LEC", "multiplier": "2X"},
    {"name": "LAW", "multiplier": null},
    {"name": "OCO", "multiplier": null},
    {"name": "BEA", "multiplier": null},
    {"name": "BOT", "multiplier": null}
  ]
}
```

Driver 1 always gets `"multiplier": "2X"` (validated by sanity check). Drivers 2-5 always get `null`.

After mapping, results feed into the existing `write_crop_json()` — identical output format to what Gemini produces today. Stages 3 and 4 see no difference.

## File changes

### New files

**`pipeline/02a_llama_extract.py`** — LlamaExtract bulk extraction:
- `extract_all_llama(crops: list[Path]) -> dict[tuple[int,int], tuple[dict, list, str]]` — uploads all crops via async `AsyncLlamaCloud`, polls for completion, maps results to internal schema.
- `map_llama_to_internal(result: dict) -> dict` — flat LlamaExtract dict to nested internal schema.
- Uses `asyncio.Semaphore(5)` for concurrency control.
- Returns `(parsed_data, flags, raw_response)` per crop, same interface as Gemini path.

**`pipeline/02b_sanity.py`** — Shared sanity filter:
- `sanity_check(extracted: dict) -> list[str]` — runs the 6 checks, returns flag reasons.
- Operates on the internal schema format (nested dict), not the raw LlamaExtract format.

### Modified files

**`pipeline/02_extract.py`** — Becomes the Stage 2 orchestrator:
- `extract_all()` rewritten to:
  1. Call `extract_all_llama()` for all 72 crops.
  2. Run `sanity_check()` on each result (Stage 2B).
  3. Pass flagged crops to existing `extract_crop()` via Gemini (Stage 2C).
  4. Run `sanity_check()` on Gemini results (Stage 2D).
  5. Merge all results, write per-crop JSON.
- Existing Gemini functions (`_get_client`, `extract_crop`, `_parse_response`, `PROMPT`) stay — they become the fallback path.
- `write_crop_json()` unchanged.

**`pipeline/config.py`** — New constants:
- `LLAMA_EXTRACT_SCHEMA` — the JSON schema dict.
- `LLAMA_EXTRACT_TIER` — `"cost_effective"`.
- `LLAMA_CLOUD_API_KEY_ENV` — env var name `"LLAMA_CLOUD_API_KEY"`.
- `LLAMA_EXTRACT_CONCURRENCY` — semaphore limit, default 5.

**`pipeline/requirements.txt`** — Add `llama-cloud`.

### Unchanged files

- `pipeline/run_pipeline.py` — still calls `extract_all()`, same interface and return signature.
- `pipeline/01_preprocess.py` — untouched.
- `pipeline/03_colors.py` — untouched.
- `pipeline/04_validate.py` — untouched.
- `pipeline/__main__.py` — untouched.

## Environment variables

Two API keys now required:
- `LLAMA_CLOUD_API_KEY` — for LlamaExtract (primary).
- `GEMINI_API_KEY` — for Gemini Flash (fallback).

The orchestrator checks both at startup. If `LLAMA_CLOUD_API_KEY` is missing, it falls back to Gemini-only mode (current behavior). If `GEMINI_API_KEY` is missing but LlamaExtract key is present, flagged crops go straight to manual review instead of Gemini fallback.

## Known LlamaExtract limitations (from testing)

- Misreads second decimal digit on budget uplift when the digit is 5 or 6 (e.g., `+0.55` -> `0.5`, `+0.46` -> `0.4`). Caught by `budget_uplift_precision` sanity check.
- Occasional driver code misreads (e.g., `COI` instead of `COL`). Caught by `invalid_driver` sanity check. Preprocessed images reduce this.
- All three extract tiers (Cost Effective, Agentic, Agentic Plus) produce identical errors on these crops — no benefit to using a higher tier.
- Stray characters (`-`, `nil>`) sometimes appear in raw text output but are cleaned by structured extraction.

## Expected performance

- **Normal case (~90% of crops):** LlamaExtract succeeds, sanity passes. Total time: under 2 minutes for all 72 crops.
- **Flagged crops (~10%):** ~5-7 crops go to Gemini. At 13s delay each: ~1-1.5 minutes additional.
- **Total pipeline time:** ~3-4 minutes (down from 14.5+ minutes with Gemini-only).
- **Credit cost:** 72 LlamaExtract credits + 0 Gemini calls (normal) or 5-7 Gemini calls (with flags).
