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
    crop = _make_crop({"header.budget_required": 70.0})
    flags = sanity_check(crop)
    assert "budget_range" in flags


def test_budget_range_too_high():
    crop = _make_crop({"header.budget_required": 160.0})
    flags = sanity_check(crop)
    assert "budget_range" in flags


def test_multiple_flags_accumulate():
    crop = _make_crop({
        "header.budget_required": 70.0,
        "header.avg_xpts": None,
    })
    crop["drivers"][0]["multiplier"] = None
    flags = sanity_check(crop)
    assert len(flags) >= 3
