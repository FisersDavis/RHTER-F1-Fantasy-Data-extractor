"""Stage 3 — Extract constructor colors via k-means clustering.

Sample pixels from violin body centers in raw (non-inverted) crops,
cluster with k-means, match dominant colors to F1 constructor lookup
using Delta-E in Lab color space.

Input:  raw PNGs in data/raw/, per-crop JSONs in data/output/
Output: updated per-crop JSONs with constructors field filled
"""

import json
import re

import numpy as np
from sklearn.cluster import KMeans

from pipeline.config import (
    DATA_RAW,
    DATA_OUTPUT,
    KMEANS_K,
    COLOR_CONFIDENCE_THRESHOLD,
    CONSTRUCTOR_COLORS_RGB,
)

FILENAME_PATTERN = re.compile(r"^row(\d+)_col(\d+)\.png$")


def _srgb_to_linear(c):
    """Convert sRGB component [0,255] to linear RGB [0,1]."""
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _linear_to_xyz(rgb_linear):
    """Convert linear RGB to XYZ (D65). Input shape: (..., 3)."""
    m = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    return rgb_linear @ m.T


def _xyz_to_lab(xyz):
    """Convert XYZ to CIE Lab (D65 illuminant). Input shape: (..., 3)."""
    ref = np.array([0.95047, 1.00000, 1.08883])
    xyz_n = xyz / ref
    epsilon = 0.008856
    kappa = 903.3
    f = np.where(xyz_n > epsilon, np.cbrt(xyz_n), (kappa * xyz_n + 16) / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def rgb_to_lab(rgb):
    """Convert RGB [0,255] array to Lab. Input shape: (..., 3)."""
    rgb = np.asarray(rgb, dtype=np.float64)
    linear = _srgb_to_linear(rgb)
    xyz = _linear_to_xyz(linear)
    return _xyz_to_lab(xyz)


def delta_e(lab1, lab2):
    """CIE76 Delta-E between two Lab colors."""
    return float(np.sqrt(np.sum((np.asarray(lab1) - np.asarray(lab2)) ** 2)))


# Build reference lookup: {team: lab_color}
_CONSTRUCTOR_LABS = {
    team: rgb_to_lab(np.array(rgb))
    for team, rgb in CONSTRUCTOR_COLORS_RGB.items()
}


def extract_colors_crop(raw_path):
    """Extract CN1 and CN2 constructor colors from a raw crop.

    Returns (constructors_dict, flags) where constructors_dict has
    cn1/cn2 keys with color_rgb and team fields.
    """
    from PIL import Image

    flags = []
    img = Image.open(raw_path).convert("RGB")
    pixels = np.array(img)  # shape: (H, W, 3)
    h, w = pixels.shape[:2]

    # Sampling region: middle 40% of height, inset 10% from left/right
    y_start = int(h * 0.30)
    y_end = int(h * 0.70)
    x_start = int(w * 0.10)
    x_end = int(w * 0.90)
    region = pixels[y_start:y_end, x_start:x_end].reshape(-1, 3).astype(np.float64)

    # Filter to isolate violin body pixels from dark background/text.
    # Two categories: saturated pixels (colored bodies like FER, MCL, MER)
    # and bright near-white pixels (HAA white bodies).
    r, g, b = region[:, 0], region[:, 1], region[:, 2]
    cmax = np.maximum(r, np.maximum(g, b))
    cmin = np.minimum(r, np.minimum(g, b))
    sat = np.where(cmax > 0, (cmax - cmin) / cmax, 0)
    is_colored = sat > 0.5
    is_bright_white = (cmax > 200) & (sat < 0.15)
    foreground = region[is_colored | is_bright_white]

    if len(foreground) < 50:
        flags.append(f"insufficient_pixels (only {len(foreground)} foreground pixels)")
        return None, flags

    # k-means clustering
    k = min(KMEANS_K, len(foreground))
    kmeans = KMeans(n_clusters=k, n_init=10, random_state=42)
    kmeans.fit(foreground)
    centroids = kmeans.cluster_centers_
    labels = kmeans.labels_
    counts = np.bincount(labels, minlength=k)

    # Match each centroid to best constructor
    matches = []
    for i in range(k):
        centroid_rgb = centroids[i]
        centroid_lab = rgb_to_lab(centroid_rgb)

        best_team = None
        best_de = float("inf")
        for team, ref_lab in _CONSTRUCTOR_LABS.items():
            de = delta_e(centroid_lab, ref_lab)
            if de < best_de:
                best_de = de
                best_team = team

        matches.append({
            "centroid_rgb": centroid_rgb.round().astype(int).tolist(),
            "team": best_team,
            "delta_e": best_de,
            "pixel_count": int(counts[i]),
        })

    # Sort by Delta-E ascending — best color matches first.
    # Antialiased blend pixels produce clusters with high Delta-E (they
    # don't closely match any real constructor), so sorting by Delta-E
    # naturally prioritizes genuine violin body clusters over blends.
    matches.sort(key=lambda m: m["delta_e"])

    # Pick top 2 distinct teams (best Delta-E first)
    cn1 = None
    cn2 = None
    for m in matches:
        if cn1 is None:
            cn1 = m
        elif m["team"] != cn1["team"] and cn2 is None:
            cn2 = m

    if cn1 is None:
        flags.append("color_ambiguous: could not identify any constructor")
        return None, flags

    if cn2 is None:
        flags.append("color_ambiguous: only one distinct constructor found")
        constructors = {
            "cn1": {
                "color_rgb": cn1["centroid_rgb"],
                "team": cn1["team"],
            },
            "cn2": None,
        }
    else:
        constructors = {
            "cn1": {
                "color_rgb": cn1["centroid_rgb"],
                "team": cn1["team"],
            },
            "cn2": {
                "color_rgb": cn2["centroid_rgb"],
                "team": cn2["team"],
            },
        }

    # Flag low-confidence matches
    if cn1["delta_e"] > COLOR_CONFIDENCE_THRESHOLD:
        flags.append(f"color_ambiguous: cn1 {cn1['team']} delta_e={cn1['delta_e']:.1f}")
    if cn2 is not None and cn2["delta_e"] > COLOR_CONFIDENCE_THRESHOLD:
        flags.append(f"color_ambiguous: cn2 {cn2['team']} delta_e={cn2['delta_e']:.1f}")

    return constructors, flags


def extract_colors_all():
    """Process all raw crops and update their output JSONs with constructor colors.

    Returns (success_count, flagged_count, flagged_list).
    """
    crops = sorted(
        p for p in DATA_RAW.iterdir()
        if p.is_file() and FILENAME_PATTERN.match(p.name)
    )

    if not crops:
        print("WARNING: No raw crops found in", DATA_RAW)
        return 0, 0, []

    success = 0
    flagged_list = []

    for idx, raw_path in enumerate(crops):
        m = FILENAME_PATTERN.match(raw_path.name)
        row, col = int(m.group(1)), int(m.group(2))

        # Check for corresponding JSON from Stage 2
        json_path = DATA_OUTPUT / f"row{row}_col{col:02d}.json"
        if not json_path.exists():
            print(f"  [{idx+1:>2}/{len(crops)}] {raw_path.name} SKIPPED (no JSON from Stage 2)")
            continue

        # Extract colors
        constructors, flags = extract_colors_crop(raw_path)

        # Update existing JSON
        with open(json_path) as f:
            record = json.load(f)

        record["constructors"] = constructors

        # Merge flags (preserve existing Stage 2 flags)
        existing_flags = record.get("flag_reasons", [])
        all_flags = existing_flags + flags
        record["flag_reasons"] = all_flags
        record["flagged"] = len(all_flags) > 0
        record["confidence"] = "low" if record["flagged"] else "high"

        with open(json_path, "w") as f:
            json.dump(record, f, indent=2)

        status = "OK" if not flags else f"FLAGGED: {', '.join(flags)}"
        print(f"  [{idx+1:>2}/{len(crops)}] {raw_path.name} {status}")

        if flags:
            flagged_list.append(raw_path.name)
        else:
            success += 1

    flagged_count = len(flagged_list)
    print(f"Stage 3 complete: {success} success, {flagged_count} flagged")
    return success, flagged_count, flagged_list


if __name__ == "__main__":
    extract_colors_all()
