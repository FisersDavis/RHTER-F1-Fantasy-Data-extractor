"""Tests for run_pipeline changes: prerequisites, output naming, Stage 0 wiring."""

import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Mock the numeric-prefixed pipeline modules (and their heavy deps) before
# run_pipeline is imported, so PIL / sklearn / etc. are not required at test time.
_mock_crop = MagicMock()
_mock_preprocess = MagicMock()
_mock_extract = MagicMock()
_mock_colors = MagicMock()
_mock_validate = MagicMock()

sys.modules.setdefault("pipeline.00_crop", _mock_crop)
sys.modules.setdefault("pipeline.01_preprocess", _mock_preprocess)
sys.modules.setdefault("pipeline.02_extract", _mock_extract)
sys.modules.setdefault("pipeline.03_colors", _mock_colors)
sys.modules.setdefault("pipeline.04_validate", _mock_validate)

import pipeline.run_pipeline as rp


# ---------------------------------------------------------------------------
# _check_prerequisites
# ---------------------------------------------------------------------------

def test_prerequisites_no_screenshots_dir(tmp_path, monkeypatch):
    """Missing screenshots dir → error message, no screenshot path returned."""
    monkeypatch.setattr(rp, "DATA_SCREENSHOTS", tmp_path / "screenshots")
    # Simulate API key present so only the dir error fires
    monkeypatch.setenv("GEMINI_API_KEY", "fake")

    errors, screenshot_path = rp._check_prerequisites()

    assert any("screenshots" in e for e in errors)
    assert screenshot_path is None


def test_prerequisites_no_screenshot_files(tmp_path, monkeypatch):
    """Empty screenshots dir → clear error, no screenshot path returned."""
    screenshots = tmp_path / "screenshots"
    screenshots.mkdir()
    monkeypatch.setattr(rp, "DATA_SCREENSHOTS", screenshots)
    monkeypatch.setenv("GEMINI_API_KEY", "fake")

    errors, screenshot_path = rp._check_prerequisites()

    assert any("screenshots" in e.lower() or "No screenshot" in e for e in errors)
    assert screenshot_path is None


def test_prerequisites_screenshot_found(tmp_path, monkeypatch):
    """Valid screenshot present → no dir error, screenshot path returned."""
    screenshots = tmp_path / "screenshots"
    screenshots.mkdir()
    webp = screenshots / "rw1_2026_r04.webp"
    webp.write_bytes(b"fake")
    monkeypatch.setattr(rp, "DATA_SCREENSHOTS", screenshots)
    monkeypatch.setenv("GEMINI_API_KEY", "fake")

    errors, screenshot_path = rp._check_prerequisites()

    dir_errors = [e for e in errors if "screenshot" in e.lower()]
    assert dir_errors == []
    assert screenshot_path == webp


def test_prerequisites_no_api_keys(tmp_path, monkeypatch):
    """No API keys → error returned regardless of screenshot."""
    screenshots = tmp_path / "screenshots"
    screenshots.mkdir()
    (screenshots / "shot.webp").write_bytes(b"x")
    monkeypatch.setattr(rp, "DATA_SCREENSHOTS", screenshots)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("LLAMA_CLOUD_API_KEY", raising=False)

    errors, _ = rp._check_prerequisites()

    assert any("API" in e or "api" in e.lower() for e in errors)


# ---------------------------------------------------------------------------
# _write_final_results
# ---------------------------------------------------------------------------

def _make_crop_jsons(output_dir, count=3):
    """Write minimal row/col JSON files to output_dir."""
    output_dir.mkdir(parents=True, exist_ok=True)
    for i in range(count):
        p = output_dir / f"row0_col{i:02d}.json"
        p.write_text(json.dumps({"row": 0, "col": i}))


def test_write_final_results_named_file(tmp_path, monkeypatch):
    """stem parameter controls output filename."""
    output_dir = tmp_path / "output"
    final_dir = tmp_path / "final"
    _make_crop_jsons(output_dir)
    monkeypatch.setattr(rp, "DATA_OUTPUT", output_dir)
    monkeypatch.setattr(rp, "DATA_FINAL", final_dir)

    result_path = rp._write_final_results(stem="rw1_2026_r04")

    assert result_path == final_dir / "rw1_2026_r04.json"
    assert result_path.exists()
    data = json.loads(result_path.read_text())
    assert len(data) == 3


def test_write_final_results_overwrites_same_stem(tmp_path, monkeypatch):
    """Calling twice with the same stem overwrites the file."""
    output_dir = tmp_path / "output"
    final_dir = tmp_path / "final"
    _make_crop_jsons(output_dir, count=2)
    monkeypatch.setattr(rp, "DATA_OUTPUT", output_dir)
    monkeypatch.setattr(rp, "DATA_FINAL", final_dir)

    rp._write_final_results(stem="myshot")
    _make_crop_jsons(output_dir, count=4)  # add more crops
    rp._write_final_results(stem="myshot")

    data = json.loads((final_dir / "myshot.json").read_text())
    assert len(data) == 4  # second write wins


def test_write_final_results_different_stems_coexist(tmp_path, monkeypatch):
    """Different stems produce separate files without touching each other."""
    output_dir = tmp_path / "output"
    final_dir = tmp_path / "final"
    monkeypatch.setattr(rp, "DATA_OUTPUT", output_dir)
    monkeypatch.setattr(rp, "DATA_FINAL", final_dir)

    _make_crop_jsons(output_dir, count=2)
    rp._write_final_results(stem="race_a")
    _make_crop_jsons(output_dir, count=3)
    rp._write_final_results(stem="race_b")

    assert (final_dir / "race_a.json").exists()
    assert (final_dir / "race_b.json").exists()
    assert len(json.loads((final_dir / "race_a.json").read_text())) == 2
    assert len(json.loads((final_dir / "race_b.json").read_text())) == 3
