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
