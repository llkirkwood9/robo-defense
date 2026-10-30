"""Shared material palette. Models refer to materials by name via `M`."""
from r3d import Mat, emissive

_MATS = {
    'gunmetal': Mat((0.14, 0.15, 0.18), 0.75, 0.55, 40),
    'steel': Mat((0.36, 0.38, 0.43), 0.75, 0.70, 50),
    'silver': Mat((0.76, 0.78, 0.82), 0.85, 0.95, 80, grain=0.05),
    'black': Mat((0.05, 0.05, 0.06), 0.45, 0.40, 30, grain=0.0),
    'glass': Mat((0.10, 0.17, 0.30), 0.95, 1.30, 140, grain=0.0),
    'rubber': Mat((0.07, 0.07, 0.08), 0.1, 0.15, 12, grain=0.15),
    'green': Mat((0.10, 0.52, 0.16), 0.35, 0.75, 60),
    'green_dark': Mat((0.05, 0.26, 0.09), 0.35, 0.6, 50),
    'blue': Mat((0.10, 0.22, 0.70), 0.45, 0.85, 60),
    'navy': Mat((0.06, 0.08, 0.22), 0.55, 0.7, 50),
    'red': Mat((0.72, 0.08, 0.07), 0.35, 0.85, 60),
    'maroon': Mat((0.30, 0.04, 0.05), 0.4, 0.6, 50),
    'yellow': Mat((0.95, 0.78, 0.10), 0.35, 0.85, 60),
    'orange': Mat((0.92, 0.47, 0.06), 0.35, 0.80, 60),
    'purple': Mat((0.40, 0.14, 0.62), 0.4, 0.8, 60),
    'gold': Mat((0.78, 0.56, 0.22), 0.85, 0.9, 70),
    'bronze': Mat((0.50, 0.33, 0.16), 0.8, 0.8, 50),
    'white': Mat((0.86, 0.87, 0.90), 0.2, 0.8, 70, grain=0.03),
    'teal': Mat((0.10, 0.48, 0.58), 0.45, 0.8, 60),
    'ice': Mat((0.62, 0.86, 0.95), 0.6, 1.4, 120, (0.20, 0.42, 0.55), 0.0),
    'olive': Mat((0.30, 0.36, 0.20), 0.3, 0.5, 40),
    'sand': Mat((0.62, 0.55, 0.38), 0.3, 0.5, 40),
    # Lights.
    'l_green': emissive(0.35, 1.0, 0.40),
    'l_blue': emissive(0.35, 0.65, 1.0),
    'l_red': emissive(1.0, 0.22, 0.16),
    'l_amber': emissive(1.0, 0.62, 0.16),
    'l_purple': emissive(0.75, 0.35, 1.0),
    'l_cyan': emissive(0.45, 0.95, 1.0),
    'l_white': emissive(0.95, 0.95, 1.0),
    'molten': emissive(1.0, 0.55, 0.08, 1.4),
}

NAMES = list(_MATS)
MATS = [_MATS[n] for n in NAMES]
M = {n: i for i, n in enumerate(NAMES)}
