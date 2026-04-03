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
