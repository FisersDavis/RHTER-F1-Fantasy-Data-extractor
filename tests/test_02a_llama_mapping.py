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
