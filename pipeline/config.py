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
BACKGROUND_RGB = (24, 24, 36)       # RHTER dark background (to be calibrated)
UPSCALE_FACTOR = 3
CONTRAST_FACTOR = 1.5               # ImageEnhance.Contrast multiplier

# ---------------------------------------------------------------------------
# Stage 2 — Gemini extraction
# ---------------------------------------------------------------------------
GEMINI_MODEL = "gemini-2.5-flash"
EXPECTED_LINES = 14
API_DELAY_SECONDS = 1.0             # delay between API calls

# ---------------------------------------------------------------------------
# Stage 3 — Color extraction
# ---------------------------------------------------------------------------
KMEANS_K = 3
COLOR_CONFIDENCE_THRESHOLD = 15.0   # max Delta-E for a confident match
CONSTRUCTOR_COLORS_RGB = {
    "MCL": (255, 135, 0),           # orange
    "MER": (0, 210, 210),           # cyan
    "RED": (30, 30, 100),           # navy
    "FER": (220, 0, 0),             # red
    "WIL": (0, 55, 190),            # blue
    "VRB": (80, 180, 230),          # light blue
    "AST": (0, 100, 60),            # dark green
    "HAA": (230, 230, 230),         # white
    "AUD": (110, 20, 40),           # maroon
    "ALP": (230, 130, 170),         # pink
    "CAD": (150, 150, 150),         # grey
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
    "VER", "LAW",
    # Ferrari
    "HAM", "LEC",
    # Williams
    "SAI", "ALB",
    # RB / VCARB
    "TSU", "HAD",
    # Aston Martin
    "ALO", "STR",
    # Haas
    "OCO", "BEA",
    # Audi / Kick Sauber
    "HUL", "BOR",
    # Alpine
    "GAS", "DOO",
    # Cadillac
    "DUR", "MAL",
}

BUDGET_REQUIRED_RANGE = (90.0, 115.0)
AVG_XPTS_RANGE = (100.0, 400.0)
AVG_XPTS_DOLLAR_IMPACT_RANGE = (100.0, 400.0)
AVG_BUDGET_UPLIFT_RANGE = (-10.0, 20.0)
PERCENTILE_RANGE = (50.0, 500.0)
