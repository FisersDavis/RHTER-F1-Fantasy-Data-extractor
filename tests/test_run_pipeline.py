"""Tests for run_pipeline changes: prerequisites, output naming, Stage 0 wiring."""

import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Mock the numeric-prefixed pipeline modules (and their heavy deps) before
# run_pipeline is imported, so PIL / sklearn / etc. are not required at test time.
_mock_preprocess = MagicMock()
_mock_extract = MagicMock()
_mock_colors = MagicMock()
_mock_validate = MagicMock()

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
    monkeypatch.setattr(rp, "DATA_RAW", tmp_path / "raw")
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
    monkeypatch.setattr(rp, "DATA_RAW", tmp_path / "raw")
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
    monkeypatch.setattr(rp, "DATA_RAW", tmp_path / "raw")
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
    monkeypatch.setattr(rp, "DATA_RAW", tmp_path / "raw")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("LLAMA_CLOUD_API_KEY", raising=False)

    errors, _ = rp._check_prerequisites()

    assert any("API" in e or "api" in e.lower() for e in errors)
