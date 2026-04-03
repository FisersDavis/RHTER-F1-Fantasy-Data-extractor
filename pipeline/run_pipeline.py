"""Pipeline orchestrator — single entry point for the full extraction pipeline.

Drop a screenshot into data/screenshots/, then run:

    python -m pipeline.run_pipeline

Stage 0 crops the screenshot, Stages 1-4 extract and validate, the flag
resolution menu handles any issues, and the final JSON is written to
data/final/<screenshot-stem>.json.
"""

import importlib
import json
import os
import sys

from dotenv import load_dotenv
load_dotenv()

from pipeline.config import DATA_RAW, DATA_OUTPUT, DATA_FINAL, DATA_SCREENSHOTS

# Numeric-prefixed modules can't use normal import syntax
_crop = importlib.import_module("pipeline.00_crop")
_preprocess = importlib.import_module("pipeline.01_preprocess")
_extract = importlib.import_module("pipeline.02_extract")
_colors = importlib.import_module("pipeline.03_colors")
_validate = importlib.import_module("pipeline.04_validate")

crop_all = _crop.crop_all
preprocess_all = _preprocess.preprocess_all
extract_all = _extract.extract_all
extract_crop = _extract.extract_crop
write_crop_json = _extract.write_crop_json
_get_client = _extract._get_client
extract_colors_all = _colors.extract_colors_all
extract_colors_crop = _colors.extract_colors_crop
validate_all = _validate.validate_all
validate_crop = _validate.validate_crop


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


def _show_crop_details(crop_name):
    """Print details for a specific flagged crop."""
    json_path = DATA_OUTPUT / crop_name.replace(".png", ".json")
    if not json_path.exists():
        print(f"  No JSON found for {crop_name}")
        return

    with open(json_path) as f:
        record = json.load(f)

    print(f"\n--- {crop_name} ---")
    print(f"  Confidence: {record.get('confidence')}")
    print(f"  Flags: {record.get('flag_reasons')}")
    print(f"  Header: {record.get('header')}")
    print(f"  Percentiles: {record.get('percentiles')}")
    print(f"  Drivers: {record.get('drivers')}")
    print(f"  Constructors: {record.get('constructors')}")
    raw = record.get("raw_response", "")
    if raw:
        print(f"  Raw Gemini response:\n    {raw.replace(chr(10), chr(10) + '    ')}")
    print()


def _rerun_flagged(flagged_list):
    """Rerun flagged crops through Stages 2-4.

    Returns updated flagged list.
    """
    import re
    import time
    from pipeline.config import API_DELAY_SECONDS

    pattern = re.compile(r"^row(\d+)_col(\d+)")
    client = _get_client()

    print(f"\nRerunning {len(flagged_list)} flagged crops through Stages 2-4...")

    still_flagged = []
    for idx, name in enumerate(flagged_list):
        # Parse row/col from the name (could be .png or .json)
        base = name.replace(".json", "").replace(".png", "")
        m = pattern.match(base)
        if not m:
            print(f"  Could not parse row/col from {name}, skipping")
            still_flagged.append(name)
            continue

        row, col = int(m.group(1)), int(m.group(2))
        png_name = f"row{row}_col{col:02d}.png"

        # Stage 2: re-extract via Gemini
        preprocessed_path = DATA_RAW.parent / "preprocessed" / png_name
        if not preprocessed_path.exists():
            print(f"  [{idx+1}/{len(flagged_list)}] {png_name} SKIPPED (no preprocessed file)")
            still_flagged.append(name)
            continue

        parsed, flags, raw = extract_crop(preprocessed_path, client)
        write_crop_json(row, col, parsed, flags, raw)

        # Stage 3: re-extract colors
        raw_path = DATA_RAW / png_name
        if raw_path.exists():
            json_path = DATA_OUTPUT / f"row{row}_col{col:02d}.json"
            constructors, color_flags = extract_colors_crop(raw_path)

            with open(json_path) as f:
                record = json.load(f)
            record["constructors"] = constructors
            existing_flags = record.get("flag_reasons", [])
            all_flags = existing_flags + color_flags
            record["flag_reasons"] = all_flags
            record["flagged"] = len(all_flags) > 0
            record["confidence"] = "low" if record["flagged"] else "high"
            with open(json_path, "w") as f:
                json.dump(record, f, indent=2)

        # Stage 4: re-validate
        json_path = DATA_OUTPUT / f"row{row}_col{col:02d}.json"
        with open(json_path) as f:
            record = json.load(f)
        new_flags = validate_crop(record)
        existing_flags = record.get("flag_reasons", [])
        all_flags = existing_flags + new_flags
        record["flag_reasons"] = all_flags
        record["flagged"] = len(all_flags) > 0
        record["confidence"] = "low" if record["flagged"] else "high"
        with open(json_path, "w") as f:
            json.dump(record, f, indent=2)

        status = "OK" if not all_flags else f"FLAGGED: {', '.join(all_flags)}"
        print(f"  [{idx+1}/{len(flagged_list)}] {png_name} {status}")

        if all_flags:
            still_flagged.append(name)

        if idx < len(flagged_list) - 1:
            time.sleep(API_DELAY_SECONDS)

    print(f"Rerun complete: {len(flagged_list) - len(still_flagged)} resolved, {len(still_flagged)} still flagged")
    return still_flagged


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


if __name__ == "__main__":
    main()
