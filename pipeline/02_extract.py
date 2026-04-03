"""Stage 2 — Extract numbers via Gemini Flash.

Send each preprocessed crop with a structured prompt.
Input:  preprocessed PNGs in data/preprocessed/
Output: per-crop JSON in data/output/
"""

import json
import os
import re
import time
from pathlib import Path

from PIL import Image
from google import genai
from google.genai import types

from pipeline.config import (
    DATA_PREPROCESSED,
    DATA_OUTPUT,
    GEMINI_MODEL,
    EXPECTED_LINES,
    API_DELAY_SECONDS,
)

FILENAME_PATTERN = re.compile(r"^row(\d+)_col(\d+)\.png$")

PROMPT = """\
Read this violin plot crop top-to-bottom. Return exactly 14 lines of plain text, nothing else.

Lines 1-4: the four header numbers at the top, reading top-to-bottom:
1. Budget Required (e.g. 103.2)
2. Avg. xPts (e.g. 245.1)
3. Avg. xPts + ($ impact) (e.g. 248.3)
4. Avg. Budget Uplift (e.g. 2.1)

Lines 5-9: the five percentile values shown on/beside the violin body, top-to-bottom:
5. 95th percentile
6. 75th percentile
7. 50th percentile (median)
8. 25th percentile
9. 5th percentile

Lines 10-14: the five driver abbreviations at the bottom, top-to-bottom.
Each is a 3-letter uppercase code (e.g. NOR, PIA, VER).
Exactly one driver has a (2X) multiplier marker — append " 2X" after that driver's code.

Example output:
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
"""


def _get_client():
    """Create Gemini client. Fails fast if API key is missing."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY environment variable is not set. "
            "Get a free key at https://aistudio.google.com/apikey"
        )
    return genai.Client(api_key=api_key)


def _parse_response(text):
    """Parse the 14-line response into structured data.

    Returns (parsed_data, flags) where flags is a list of flag reason strings.
    """
    flags = []
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]

    if len(lines) != EXPECTED_LINES:
        flags.append(f"line_count_mismatch (got {len(lines)}, expected {EXPECTED_LINES})")

    # Attempt to parse whatever we have
    header = {}
    header_keys = ["budget_required", "avg_xpts", "avg_xpts_dollar_impact", "avg_budget_uplift"]
    for i, key in enumerate(header_keys):
        if i < len(lines):
            try:
                header[key] = float(lines[i])
            except ValueError:
                header[key] = None
                flags.append(f"parse_error: line {i+1} not a number: {lines[i]!r}")
        else:
            header[key] = None

    percentiles = {}
    pct_keys = ["p95", "p75", "p50", "p25", "p05"]
    for j, key in enumerate(pct_keys):
        i = 4 + j
        if i < len(lines):
            try:
                percentiles[key] = float(lines[i])
            except ValueError:
                percentiles[key] = None
                flags.append(f"parse_error: line {i+1} not a number: {lines[i]!r}")
        else:
            percentiles[key] = None

    drivers = []
    for j in range(5):
        i = 9 + j
        if i < len(lines):
            raw = lines[i].strip()
            if raw.upper().endswith(" 2X"):
                name = raw[:-3].strip().upper()
                multiplier = "2X"
            elif raw.upper().endswith("2X"):
                name = raw[:-2].strip().upper()
                multiplier = "2X"
            else:
                name = raw.upper()
                multiplier = None
            drivers.append({"name": name, "multiplier": multiplier})
        else:
            drivers.append({"name": None, "multiplier": None})

    parsed = {
        "header": header,
        "percentiles": percentiles,
        "drivers": drivers,
    }
    return parsed, flags


def extract_crop(path, client):
    """Extract data from a single preprocessed crop via Gemini API.

    Returns (parsed_data, flags, raw_response).
    """
    try:
        image = Image.open(path)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[PROMPT, image],
            config=types.GenerateContentConfig(
                temperature=0.0,
            ),
        )
        raw_text = response.text
        parsed, flags = _parse_response(raw_text)
        return parsed, flags, raw_text
    except Exception as e:
        return None, [f"api_error: {e}"], ""


def write_crop_json(row, col, parsed_data, flags, raw_response=""):
    """Write per-crop JSON to data/output/."""
    DATA_OUTPUT.mkdir(parents=True, exist_ok=True)

    flagged = len(flags) > 0
    confidence = "low" if flagged else "high"

    record = {
        "row": row,
        "col": col,
        "header": parsed_data["header"] if parsed_data else None,
        "percentiles": parsed_data["percentiles"] if parsed_data else None,
        "drivers": parsed_data["drivers"] if parsed_data else None,
        "constructors": None,  # Stage 3 fills this
        "confidence": confidence,
        "flagged": flagged,
        "flag_reasons": flags,
        "raw_response": raw_response,
    }

    out_path = DATA_OUTPUT / f"row{row}_col{col:02d}.json"
    with open(out_path, "w") as f:
        json.dump(record, f, indent=2)
    return out_path


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


if __name__ == "__main__":
    extract_all()
