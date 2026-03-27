"""Stage 4 — Validate extracted data.

Run sanity checks on all per-crop JSONs, flag outliers, produce
combined output for the web app.

Input:  per-crop JSONs in data/output/ (with constructors from Stage 3)
Output: updated per-crop JSONs + combined data/final/results.json
"""

import json
import re

from pipeline.config import (
    DATA_OUTPUT,
    DATA_FINAL,
    VALID_DRIVERS_2026,
    CONSTRUCTOR_COLORS_RGB,
    BUDGET_REQUIRED_RANGE,
    AVG_XPTS_RANGE,
    AVG_XPTS_DOLLAR_IMPACT_RANGE,
    AVG_BUDGET_UPLIFT_RANGE,
    PERCENTILE_RANGE,
)

FILENAME_PATTERN = re.compile(r"^row(\d+)_col(\d+)\.json$")


def validate_crop(crop_data):
    """Run validation checks on a single crop's data.

    Returns a list of flag reason strings (empty if all checks pass).
    """
    flags = []
    header = crop_data.get("header") or {}
    percentiles = crop_data.get("percentiles") or {}
    drivers = crop_data.get("drivers") or []
    constructors = crop_data.get("constructors")

    # --- Numeric range checks ---
    range_checks = [
        ("budget_required", header.get("budget_required"), BUDGET_REQUIRED_RANGE),
        ("avg_xpts", header.get("avg_xpts"), AVG_XPTS_RANGE),
        ("avg_xpts_dollar_impact", header.get("avg_xpts_dollar_impact"), AVG_XPTS_DOLLAR_IMPACT_RANGE),
        ("avg_budget_uplift", header.get("avg_budget_uplift"), AVG_BUDGET_UPLIFT_RANGE),
    ]
    for name, value, (lo, hi) in range_checks:
        if value is not None and not (lo <= value <= hi):
            flags.append(f"range_error: {name}={value} outside [{lo}, {hi}]")

    # --- Percentile range checks ---
    pct_keys = ["p95", "p75", "p50", "p25", "p05"]
    pct_lo, pct_hi = PERCENTILE_RANGE
    for key in pct_keys:
        val = percentiles.get(key)
        if val is not None and not (pct_lo <= val <= pct_hi):
            flags.append(f"range_error: {key}={val} outside [{pct_lo}, {pct_hi}]")

    # --- Percentile monotonicity: p95 > p75 > p50 > p25 > p05 ---
    pct_values = [percentiles.get(k) for k in pct_keys]
    if all(v is not None for v in pct_values):
        for i in range(len(pct_values) - 1):
            if pct_values[i] < pct_values[i + 1]:
                flags.append(
                    f"monotonicity_error: {pct_keys[i]}={pct_values[i]} "
                    f"< {pct_keys[i+1]}={pct_values[i+1]}"
                )

    # --- Driver validation ---
    if drivers:
        driver_names = [d.get("name") for d in drivers if d.get("name")]

        # 3-letter uppercase
        for name in driver_names:
            if not (len(name) == 3 and name.isalpha() and name.isupper()):
                flags.append(f"driver_format_error: {name!r} is not 3-letter uppercase")

        # Known drivers
        for name in driver_names:
            if name not in VALID_DRIVERS_2026:
                flags.append(f"unknown_driver: {name}")

        # No duplicates
        if len(driver_names) != len(set(driver_names)):
            flags.append("duplicate_driver")

        # Exactly one 2X multiplier
        multiplied = [d for d in drivers if d.get("multiplier") == "2X"]
        if len(multiplied) != 1:
            flags.append(f"multiplier_error: expected 1 driver with 2X, found {len(multiplied)}")

    # --- Constructor validation ---
    if constructors:
        cn1 = constructors.get("cn1")
        cn2 = constructors.get("cn2")
        known_teams = set(CONSTRUCTOR_COLORS_RGB.keys())

        if cn1 and cn1.get("team") not in known_teams:
            flags.append(f"unknown_constructor: cn1={cn1.get('team')}")
        if cn2 and cn2.get("team") not in known_teams:
            flags.append(f"unknown_constructor: cn2={cn2.get('team')}")
        if cn1 and cn2 and cn1.get("team") == cn2.get("team"):
            flags.append(f"duplicate_constructor: cn1=cn2={cn1.get('team')}")

    return flags


def validate_all():
    """Validate all per-crop JSONs and write combined results.

    Returns (passed_count, flagged_count, flagged_list).
    """
    json_files = sorted(
        p for p in DATA_OUTPUT.iterdir()
        if p.is_file() and FILENAME_PATTERN.match(p.name)
    )

    if not json_files:
        print("WARNING: No crop JSONs found in", DATA_OUTPUT)
        return 0, 0, []

    all_crops = []
    passed = 0
    flagged_list = []

    for idx, json_path in enumerate(json_files):
        with open(json_path) as f:
            record = json.load(f)

        # Run validation checks
        new_flags = validate_crop(record)

        # Merge with existing flags from Stages 2-3
        existing_flags = record.get("flag_reasons", [])
        all_flags = existing_flags + new_flags
        record["flag_reasons"] = all_flags
        record["flagged"] = len(all_flags) > 0
        record["confidence"] = "low" if record["flagged"] else "high"

        # Write updated per-crop JSON
        with open(json_path, "w") as f:
            json.dump(record, f, indent=2)

        all_crops.append(record)

        status = "OK" if not new_flags else f"FLAGGED: {', '.join(new_flags)}"
        print(f"  [{idx+1:>2}/{len(json_files)}] {json_path.name} {status}")

        if all_flags:
            flagged_list.append(json_path.name)
        else:
            passed += 1

    # Write combined results
    DATA_FINAL.mkdir(parents=True, exist_ok=True)
    results_path = DATA_FINAL / "results.json"
    with open(results_path, "w") as f:
        json.dump(all_crops, f, indent=2)
    print(f"Combined results written to {results_path}")

    flagged_count = len(flagged_list)
    print(f"Stage 4 complete: {passed}/{len(json_files)} passed, {flagged_count} flagged")
    return passed, flagged_count, flagged_list


if __name__ == "__main__":
    validate_all()
