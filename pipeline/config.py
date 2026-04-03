"""Shared constants for the RHTER F1 Fantasy extraction pipeline."""

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths (resolved relative to project root = parent of pipeline/)
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_PREPROCESSED = PROJECT_ROOT / "data" / "preprocessed"
DATA_OUTPUT = PROJECT_ROOT / "data" / "output"
DATA_FINAL = PROJECT_ROOT / "data" / "final"
DATA_SCREENSHOTS = PROJECT_ROOT / "data" / "screenshots"

# ---------------------------------------------------------------------------
# Stage 1 — Preprocess
# ---------------------------------------------------------------------------
BACKGROUND_RGB = (52, 55, 61)        # RHTER dark background (calibrated: mean of corner samples across 8 crops)
UPSCALE_FACTOR = 3
CONTRAST_FACTOR = 1.5               # ImageEnhance.Contrast multiplier

# ---------------------------------------------------------------------------
# Stage 2 — Gemini extraction
# ---------------------------------------------------------------------------
GEMINI_MODEL = "gemini-3.1-flash-lite-preview"
EXPECTED_LINES = 14
API_DELAY_SECONDS = 4.5             # delay between API calls (free tier: 15 req/min)

# ---------------------------------------------------------------------------
# Stage 2A — LlamaExtract (primary extractor)
# ---------------------------------------------------------------------------
LLAMA_CLOUD_API_KEY_ENV = "LLAMA_CLOUD_API_KEY"
LLAMA_EXTRACT_TIER = "cost_effective"
LLAMA_EXTRACT_CONCURRENCY = 5          # asyncio.Semaphore limit

LLAMA_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "budget_required": {
            "type": "number",
            "description": "Budget Required (top header number)",
        },
        "avg_xpts": {
            "type": "number",
            "description": "Average xPts (second header number)",
        },
        "avg_xpts_dollar_impact": {
            "type": "number",
            "description": "Avg xPts + ($ impact) (third header number)",
        },
        "budget_uplift": {
            "type": "number",
            "description": "Avg Budget Uplift (fourth header number, always 2 decimal places e.g. 0.55)",
        },
        "p95": {"type": "number"},
        "p75": {"type": "number"},
        "p50": {"type": "number"},
        "p25": {"type": "number"},
        "p05": {"type": "number"},
        "driver_1": {"type": "string"},
        "driver_1_2x": {"type": "boolean"},
        "driver_2": {"type": "string"},
        "driver_3": {"type": "string"},
        "driver_4": {"type": "string"},
        "driver_5": {"type": "string"},
    },
}

# ---------------------------------------------------------------------------
# Stage 3 — Color extraction
# ---------------------------------------------------------------------------
KMEANS_K = 3
COLOR_CONFIDENCE_THRESHOLD = 20.0   # max Delta-E for a confident match (calibrated: typical <4, worst VRB=17.8)
CONSTRUCTOR_COLORS_RGB = {
    # Calibrated from RHTER screenshot color legend bar
    "MCL": (255, 135, 0),           # orange (legend exact match)
    "MER": (0, 210, 190),           # cyan (legend: slightly green-shifted)
    "RED": (6, 0, 239),             # blue (legend: vivid blue, not navy)
    "FER": (220, 0, 0),             # red (legend exact match)
    "WIL": (0, 90, 255),            # blue (legend: pure blue)
    "VRB": (102, 146, 255),         # light blue (legend: periwinkle)
    "AST": (0, 111, 98),            # dark green/teal (legend)
    "HAA": (255, 255, 255),         # white (legend: pure white)
    "AUD": (144, 0, 0),             # dark red/maroon (legend)
    "ALP": (245, 150, 200),         # pink (legend)
    "CAD": (127, 127, 127),         # grey (legend)
}

# ---------------------------------------------------------------------------
# Stage 4 — Validation
# ---------------------------------------------------------------------------
VALID_DRIVERS_2026 = {
    # McLaren
    "NOR", "PIA",
    # Mercedes
    "RUS", "ANT",
    # Red Bull
    "VER", "HAD",
    # Ferrari
    "HAM", "LEC",
    # Williams
    "SAI", "ALB",
    # RB / VCARB
    "LAW", "LIN",
    # Aston Martin
    "ALO", "STR",
    # Haas
    "OCO", "BEA",
    # Audi / Kick Sauber
    "HUL", "BOR",
    # Alpine
    "GAS", "COL",
    # Cadillac
    "PER", "BOT",
}

BUDGET_REQUIRED_RANGE = (80.0, 150.0)
AVG_XPTS_RANGE = (100.0, 400.0)
AVG_XPTS_DOLLAR_IMPACT_RANGE = (100.0, 400.0)
AVG_BUDGET_UPLIFT_RANGE = (-10.0, 20.0)
PERCENTILE_RANGE = (0.0, 500.0)          # floor relaxed; monotonic ordering is the real check
PERCENTILE_MONOTONIC = True               # Stage 4 must verify p95 > p75 > p50 > p25 > p05
