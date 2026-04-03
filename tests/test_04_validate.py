"""Tests for _verify_flagged in run_pipeline."""

import json
import sys
from pathlib import Path

import pytest

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _write_crop_json(tmp_path, name, record):
    """Helper: write a crop JSON to tmp_path."""
    p = tmp_path / name
    p.write_text(json.dumps(record))
    return p


def _valid_record():
    return {
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
        "constructors": None,
        "flagged": True,
        "flag_reasons": ["range_error: budget_required=88 outside [80, 150]"],
        "confidence": "low",
    }


def _invalid_record():
    r = _valid_record()
    r["header"]["budget_required"] = 70.0  # below new range of 80.0
    return r


def test_verify_flagged_all_ok(tmp_path, monkeypatch):
    """All flagged crops now pass validation — returns all-clear."""
    import pipeline.run_pipeline as rp
    monkeypatch.setattr(rp, "DATA_OUTPUT", tmp_path)

    _write_crop_json(tmp_path, "row0_col00.json", _valid_record())
    _write_crop_json(tmp_path, "row0_col01.json", _valid_record())

    results = rp._verify_flagged(["row0_col00.json", "row0_col01.json"])

    assert results == {"row0_col00.json": [], "row0_col01.json": []}


def test_verify_flagged_still_flagged(tmp_path, monkeypatch):
    """A crop that still fails validation is reported with its flags."""
    import pipeline.run_pipeline as rp
    monkeypatch.setattr(rp, "DATA_OUTPUT", tmp_path)

    _write_crop_json(tmp_path, "row0_col00.json", _invalid_record())

    results = rp._verify_flagged(["row0_col00.json"])

    assert len(results["row0_col00.json"]) > 0
    assert any("budget_required" in f for f in results["row0_col00.json"])


def test_verify_flagged_missing_file(tmp_path, monkeypatch, capsys):
    """A crop JSON that doesn't exist on disk is reported as an error."""
    import pipeline.run_pipeline as rp
    monkeypatch.setattr(rp, "DATA_OUTPUT", tmp_path)

    results = rp._verify_flagged(["row9_col99.json"])

    captured = capsys.readouterr()
    assert "row9_col99.json" in captured.out
    assert results["row9_col99.json"] == ["file_not_found"]


def test_verify_flagged_does_not_write(tmp_path, monkeypatch):
    """Verify must not write any files — disk state unchanged after call."""
    import pipeline.run_pipeline as rp
    monkeypatch.setattr(rp, "DATA_OUTPUT", tmp_path)

    record = _valid_record()
    _write_crop_json(tmp_path, "row0_col00.json", record)
    before = list(tmp_path.iterdir())

    rp._verify_flagged(["row0_col00.json"])

    after = list(tmp_path.iterdir())
    assert before == after
