"""
Tower models. Each tower sheet is frame 0 = base, then either 32 turret headings (clockwise from
north, 11.25 degrees apart) or animation frames. Turrets are modelled facing north (+y) with their
origin on the base's deck; the game draws them `towerHeight` (26) world units above the base.
"""
import math

import numpy as np

from palette import M
from r3d import (
    Camera, scaled, translate, box, box2d, capsule, circle2d, cyl, ellipsoid, extrude, heading, length, ngon2d,
    rot_x, rot_z, sphere, torus_z, tube,
)

DECK = 45.0     # height of the turret deck on every base (26 world px on screen at 55 degrees)
TAU = math.pi * 2


def P(p):
    return p[:, 0], p[:, 1], p[:, 2]


def diag_feet(p, mat, reach=27.0, w=4.0, l=7.0, z1=22.0, rnd=1.2):
    """Four armour buttresses on the diagonals."""
    x, y, z = P(p)
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * reach * 0.707, sy * reach * 0.707
            rx = ((x - cx) + sx * sy * (y - cy)) / math.sqrt(2)
            ry = (-(x - cx) * sx * sy + (y - cy)) / math.sqrt(2)
            out.append((extrude(box2d(rx, ry, w, l), z, 0, z1, rnd), mat))
    return out


def cut(d, *holes):
    for h in holes:
        d = np.maximum(d, -h)
    return d


# ---- Gun towers (green) ---------------------------------------------------------------------

def gun_base(level):
    def scene(p):
        x, y, z = P(p)
        parts = [
            (extrude(box2d(x, y, 26, 26), z, 0, 8, 2.5), M['gunmetal']),
            (extrude(ngon2d(x, y, 22 - np.clip(z - 8, 0, 34) * 0.12, 8), z, 7, 40, 1.5), M['steel']),
            (extrude(ngon2d(x, y, 22.6, 8), z, 27, 29.5, 0.4), M['black']),
            (cyl(p, 0, 0, 18.5, 39, DECK, 0.8), M['gunmetal']),
            (torus_z(p, 0, 0, DECK - 0.6, 18.2, 0.9), M['green_dark']),
        ]
        parts += diag_feet(p, M['green'], reach=28, z1=24 + level * 3)
        # Running lights on the front faces, one more per level.
        for i in range(level):
            ox = (i - (level - 1) / 2) * 6
            parts.append((sphere(p, (ox, -26.2, 4.2), 1.5), M['l_green']))
        for a in range(4):
            q = rot_z(p, a * TAU / 4)
            parts.append((box(q, (0, -21.5, 18), (5.5, 1.2, 1.4), 0.5), M['l_green']))
        return parts
    return scene


def gun_turret(level):
    barrels = {1: [0.0], 2: [-4.2, 4.2], 3: [-5.5, 0.0, 5.5]}[level]
    hw = 9 + level * 1.5

    def scene(p):
        x, y, z = P(p)
        parts = [
            (cyl(p, 0, 0, 13, 0, 4, 0.8), M['black']),
            (box(p, (0, -2, 9), (hw, 11, 5.5), 3.0), M['silver']),
            (box(p, (0, -4, 14.2), (hw - 2.5, 7, 1.2), 1.0), M['green']),
            (box(p, (0, -13, 9), (hw - 1, 2.5, 4.5), 1.2), M['gunmetal']),   # rear counterweight
            (sphere(p, (hw - 3, 5, 13.5), 1.1), M['l_green']),
            # Sight block and hatch on the roof, vents on the back.
            (box(p, (-hw * 0.45, 3, 16.2), (2.6, 3.2, 1.6), 0.8), M['gunmetal']),
            (box(p, (-hw * 0.45, 6.3, 16.4), (1.8, 0.3, 0.9), 0.2), M['glass']),
            (cyl(p, hw * 0.35, -6, 3.2, 15, 16.4, 0.5), M['steel']),
        ]
        for i in range(3):
            parts.append((box(p, ((i - 1) * 3.2, -15.6, 9), (1.0, 0.4, 3), 0.2), M['black']))
        for sx in (-1, 1):
            parts.append((box(p, (sx * (hw + 0.8), -1, 8.5), (1.2, 8, 4), 0.8), M['green']))
        for bx in barrels:
            length_ = 27 - (level == 3) * 2
            parts.append((tube(p, (bx, 6, 9), (bx, length_, 9), 2.1 if level < 3 else 1.8), M['steel']))
            parts.append((tube(p, (bx, length_ - 4, 9), (bx, length_ + 1, 9), 2.8), M['black']))
            parts.append((tube(p, (bx, 6, 9), (bx, 12, 9), 3.0), M['gunmetal']))
        if level == 3:
            parts.append((tube(p, (0, 13, 9), (0, 15, 9), 8.0, 0.6), M['green']))   # barrel clamp
        return parts
    return scene


# ---- Antiair (navy / blue) -------------------------------------------------------------------

def aa_base(level):
    def scene(p):
        x, y, z = P(p)
        parts = [
            (extrude(box2d(x, y, 27, 27), z, 0, 6, 2.0), M['black']),
            (extrude(box2d(x, y, 23 - np.clip(z - 6, 0, 34) * 0.1, 23 - np.clip(z - 6, 0, 34) * 0.1),
                     z, 5, 40, 2.5), M['navy']),
            (cyl(p, 0, 0, 18, 39, DECK, 0.8), M['gunmetal']),
            (torus_z(p, 0, 0, DECK - 0.6, 17.6, 0.9), M['l_blue']),
        ]
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts.append((box(p, (sx * 22, sy * 22, 10), (5, 5, 10), 1.5), M['steel']))
                parts.append((box(p, (sx * 22, sy * 26.6, 14), (2.5, 0.8, 4.5), 0.4), M['l_blue']))
        for a in range(4):
            q = rot_z(p, a * TAU / 4)
            parts.append((box(q, (0, -21, 24), (7, 1.4, 6 + level * 2), 0.6), M['blue']))
        return parts
    return scene


def aa_turret(level):
    tilt = math.radians(38)
    cols = [-6.0, 6.0]
    rows = [0.0] if level == 1 else [-3.4, 3.4]

    def scene(p):
        x, y, z = P(p)
        parts = [
            (cyl(p, 0, 0, 13.5, 0, 5, 0.8), M['black']),
            (box(p, (0, -1, 10), (11, 10, 6), 3.0), M['steel']),
            (box(p, (0, -1, 16.5), (8, 7, 1.0), 0.8), M['blue']),
        ]
        d = np.array([0, math.cos(tilt), math.sin(tilt)])
        for cx in cols:
            parts.append((box(p, (cx * 1.55, 1, 11), (2.6, 7, 4.5), 1.2), M['gunmetal']))
            for r in rows:
                a = np.array([cx, 4.0, 12.0 + r])
                parts.append((tube(p, a, a + d * 21, 1.6), M['silver']))
                parts.append((tube(p, a + d * 17, a + d * 22, 2.3), M['black']))
        parts.append((sphere(p, (0, -10, 13), 1.3), M['l_blue']))
        return parts
    return scene


# ---- Flame (red) -----------------------------------------------------------------------------

def flame_base(level):
    def scene(p):
        x, y, z = P(p)
        parts = [
            (cyl(p, 0, 0, 27, 0, 6, 1.5), M['black']),
            (cyl(p, 0, 0, 24 - np.clip(z - 6, 0, 30) * 0.08, 5, 38, 4), M['red']),
            (cyl(p, 0, 0, 19, 37, DECK, 1.0), M['gunmetal']),
            (torus_z(p, 0, 0, 22, 23.4, 1.1), M['maroon']),
        ]
        for a in range(4):
            q = rot_z(p, a * TAU / 4 + TAU / 8)
            parts.append((box(q, (0, -23, 18), (3, 3.2, 17), 1.0), M['silver']))
            parts.append((box(q, (0, -27, 3), (3.5, 5, 3.5), 1.0), M['steel']))
        if level == 2:
            for a in range(4):
                q = rot_z(p, a * TAU / 4)
                parts.append((box(q, (0, -22.5, 28), (8, 2.4, 7), 1.2), M['gunmetal']))
                parts.append((sphere(q, (0, -25, 28), 1.4), M['l_amber']))
        return parts
    return scene


def flame_turret(level):
    r = 12 + level * 1.5

    def scene(p):
        x, y, z = P(p)
        shell = ellipsoid(p, (0, -1, 9), (r, r * 0.95, 8.5))
        window = ellipsoid(p, (0, -1, 13), (r - 3, r - 3.5, 4.5))
        parts = [
            (cyl(p, 0, 0, 12, 0, 4, 0.8), M['black']),
            (np.maximum(shell, -(z - 15.5)), M['red']),
            (np.maximum(window, z - 15.3), M['molten']),
            (torus_z(p, 0, -1, 15.3, r - 2.5, 1.2), M['silver']),
            (torus_z(p, 0, -1, 7, r - 0.2, 1.0), M['maroon']),
        ]
        noz = [0.0] if level == 1 else [-4.5, 4.5]
        for nx in noz:
            parts.append((tube(p, (nx, r - 4, 8), (nx, r + 10, 8), 2.6), M['steel']))
            parts.append((tube(p, (nx, r + 8, 8), (nx, r + 11, 8), 3.4), M['black']))
            parts.append((sphere(p, (nx, r + 11.2, 8), 1.6), M['l_amber']))
        parts.append((tube(p, (0, -r - 2, 8), (0, -r + 2, 8), 4.5), M['gunmetal']))  # fuel cap
        return parts
    return scene


# ---- Rocket (grey/red base, yellow pods) -----------------------------------------------------

def rocket_base(level):
    def scene(p):
        x, y, z = P(p)
        parts = [
            (extrude(box2d(x, y, 12, 28), z, 0, 14, 2), M['steel']),
            (extrude(box2d(x, y, 28, 12), z, 0, 14, 2), M['steel']),
            (extrude(ngon2d(x, y, 19 - np.clip(z - 10, 0, 30) * 0.08, 8), z, 10, 40, 2), M['steel']),
            (extrude(ngon2d(x, y, 19.4, 8), z, 26, 28.5, 0.4), M['black']),
            (cyl(p, 0, 0, 17, 39, DECK, 0.8), M['gunmetal']),
            (torus_z(p, 0, 0, DECK - 0.6, 16.6, 0.9), M['red']),
        ]
        for a in range(4):
            q = rot_z(p, a * TAU / 4)
            parts.append((box(q, (0, -26, 9), (9, 3, 9), 1.5), M['red']))
        for i in range(level):
            ox = (i - (level - 1) / 2) * 6
            parts.append((sphere(p, (ox, -29, 9), 1.6), M['l_red']))
        return parts
    return scene


def rocket_turret(level):
    pods = {1: [0.0], 2: [-6.5, 6.5], 3: [-11.5, 0.0, 11.5]}[level]
    tilt = math.radians(14)

    def pod(p, cx):
        q = rot_x(p - np.array([cx, 0, 12]), -tilt)
        body = box(q, (0, 2, 0), (5.4, 11, 5.4), 1.4)
        holes = []
        for hx in (-2.4, 2.4):
            for hz in (-2.4, 2.4):
                holes.append(np.maximum(length(np.stack([q[:, 0] - hx, q[:, 2] - hz], -1)) - 1.6,
                                        -(q[:, 1] - 10.5)))
        stripe = box(q, (0, -4, 0), (5.6, 1.2, 5.6), 0.4)
        tips = [(sphere(q, (hx, 11.6, hz), 1.2), M['red']) for hx in (-2.4, 2.4) for hz in (-2.4, 2.4)]
        return [(cut(body, *holes), M['yellow']), (stripe, M['black'])] + tips

    def scene(p):
        parts = [
            (cyl(p, 0, 0, 12, 0, 5, 0.8), M['black']),
            (box(p, (0, -2, 7), (3 + len(pods) * 4, 6, 3), 1.2), M['steel']),
        ]
        for cx in pods:
            parts += pod(p, cx)
        return parts
    return scene


# ---- Surface-to-air (blue / white) ------------------------------------------------------------

def sam_base(level):
    def scene(p):
        x, y, z = P(p)
        parts = [
            (cyl(p, 0, 0, 27, 0, 7, 2), M['navy']),
            (torus_z(p, 0, 0, 14, 21, 7), M['silver']),
            (cyl(p, 0, 0, 16, 7, 40, 2), M['blue']),
            (cyl(p, 0, 0, 17.5, 39, DECK, 0.8), M['gunmetal']),
            (torus_z(p, 0, 0, 21.5, 24.5, 1.2), M['gold']),
        ]
        for a in range(8):
            q = rot_z(p, a * TAU / 8)
            parts.append((box(q, (0, -27.5, 13), (2.4, 1, 3), 0.4),
                          M['l_blue'] if a % 2 == 0 or level == 2 else M['black']))
        return parts
    return scene


def missile(p, base, d, length_=24.0, r=2.6):
    tip = base + d * length_
    out = [
        (capsule(p, base, tip - d * 4, r), M['white']),
        (capsule(p, tip - d * 4.5, tip, r, 0.3), M['blue']),
        (tube(p, base + d * 6, base + d * 7.5, r + 0.2, 0.2), M['gold']),
    ]
    side = np.cross(d, [0, 0, 1.0])
    side /= np.linalg.norm(side)
    up = np.cross(side, d)
    for v in (side, -side, up, -up):
        a = base + d * 1.0 + v * (r + 1.2)
        out.append((capsule(p, a - d * 1.5, a + d * 2.0, 0.55), M['blue']))
    return out


def sam_turret(level):
    tilt = math.radians(28)
    d = np.array([0, math.cos(tilt), math.sin(tilt)])
    xs = [-6.5, 6.5] if level == 1 else [-10.5, -4.0, 4.0, 10.5]

    def scene(p):
        parts = [
            (cyl(p, 0, 0, 10, 0, 6, 1), M['black']),
            (box(p, (0, -3, 9), (5, 5, 4), 1.5), M['steel']),
            (box(p, (0, -3, 13.5), (4, 3, 1), 0.5), M['l_blue']),
        ]
        for i, mx in enumerate(xs):
            dz = 0 if level == 1 else (i % 2) * 2.5
            base = np.array([mx, -10.0, 9.0 + dz])
            parts.append((tube(p, base - d * 1 + [0, 0, -2.6], base + d * 18 + [0, 0, -2.6], 1.0), M['gunmetal']))
            parts += missile(p, base, d)
        parts.append((tube(p, (xs[0], -4, 7), (xs[-1], -4, 7), 1.6), M['silver']))
        return parts
    return scene


# ---- Mortar and artillery (purple / gold) -----------------------------------------------------

def heavy_base(kind):
    def scene(p):
        x, y, z = P(p)
        parts = [
            (extrude(ngon2d(x, y, 26, 6), z, 0, 8, 2), M['black']),
            (extrude(ngon2d(x, y, 20 - np.clip(z - 8, 0, 30) * 0.12, 6), z, 7, 38, 2), M['gunmetal']),
            (torus_z(p, 0, 0, 30, 18.4, 1.2), M['l_purple']),
            (torus_z(p, 0, 0, 18, 20.2, 1.2), M['l_purple']),
            (cyl(p, 0, 0, 15, 37, DECK, 1), M['purple']),
        ]
        for a in range(3):
            q = rot_z(p, a * TAU / 3 + (TAU / 6 if kind == 'artillery' else 0))
            fin = extrude(box2d(q[:, 0], q[:, 1] + 21, 2.4, 7), z, 0, 36 + (kind == 'artillery') * 8, 1)
            fin = np.maximum(fin, (q[:, 2] - 36 - (kind == 'artillery') * 8) + (-(q[:, 1]) - 14) * 1.2)
            parts.append((fin, M['gold']))
        return parts
    return scene


def mortar_turret():
    def scene(p):
        x, y, z = P(p)
        tilt = math.radians(70)
        d = np.array([0, math.cos(tilt), math.sin(tilt)])
        a = np.array([0, -2.0, 6.0])
        return [
            (cyl(p, 0, 0, 12, 0, 6, 1), M['black']),
            (sphere(p, (0, 0, 7), 9), M['gunmetal']),
            (tube(p, a, a + d * 20, 6.2, 1.0), M['steel']),
            (tube(p, a + d * 17, a + d * 21, 7.2, 0.8), M['gold']),
            (tube(p, a + d * 8, a + d * 10, 6.8, 0.4), M['l_purple']),
            (tube(p, a + d * 20.5, a + d * 21.2, 4.6, 0.1), M['black']),
        ]
    return scene


def artillery_turret():
    def scene(p):
        tilt = math.radians(48)
        d = np.array([0, math.cos(tilt), math.sin(tilt)])
        a = np.array([0, -3.0, 9.0])
        return [
            (cyl(p, 0, 0, 13, 0, 7, 1), M['black']),
            (box(p, (0, -2, 10), (10, 10, 6), 3), M['gunmetal']),
            (box(p, (0, -2, 16.5), (7, 7, 1), 0.6), M['purple']),
            (tube(p, a, a + d * 34, 4.2, 0.6), M['steel']),
            (tube(p, a, a + d * 12, 6.0, 1.0), M['gold']),
            (tube(p, a + d * 22, a + d * 23.5, 5.0, 0.4), M['l_purple']),
            (tube(p, a + d * 31, a + d * 35, 5.2, 0.8), M['black']),
            (tube(p, a + d * 35, a + d * 35.4, 3.0, 0.1), M['l_green']),
        ]
    return scene


# ---- Slow (ice) towers ------------------------------------------------------------------------

def ice_base(level):
    def scene(p):
        x, y, z = P(p)
        parts = [
            (cyl(p, 0, 0, 25, 0, 6, 2), M['steel']),
            (cyl(p, 0, 0, 17, 5, 24, 2), M['teal']),
            (torus_z(p, 0, 0, 23, 15.5, 2.0), M['silver']),
            (cyl(p, 0, 0, 12, 23, 30, 1), M['gunmetal']),
            (torus_z(p, 0, 0, 30, 10.5, 1.0), M['l_cyan']),
        ]
        for a in range(4):
            q = rot_z(p, a * TAU / 4 + TAU / 8)
            petal = extrude(box2d(q[:, 0], q[:, 1] + 22, 6.5 - (q[:, 1] + 22) * -0.15, 8), z, 0, 9, 2)
            parts.append((petal, M['white']))
        for i in range(level):
            ang = TAU * i / max(level, 1) + TAU / 8
            parts.append((sphere(p, (25 * math.sin(ang), -25 * math.cos(ang), 7), 1.6), M['l_cyan']))
        return parts
    return scene


def ice_crystal(level, phase):
    """Animated crystal hovering over the base; `phase` in [0, 1)."""
    spin = phase * TAU / (4 if level == 1 else 3)
    bob = math.sin(phase * TAU) * 1.2

    def octa(p, c, r, h):
        q = np.abs(p - np.asarray(c, float))
        return (q[:, 0] / r + q[:, 1] / r + q[:, 2] / h - 1) * min(r, h) * 0.55

    def scene(p):
        q = rot_z(p, spin)
        parts = []
        # Claws that cradle the crystal.
        for a in range(3):
            c = rot_z(p, a * TAU / 3)
            parts.append((capsule(c, (0, -11, 0), (0, -12.5, 12), 1.5), M['gunmetal']))
            parts.append((capsule(c, (0, -12.5, 12), (0, -9, 20), 1.2), M['steel']))
        zc = 18 + bob
        if level == 1:
            parts.append((octa(q, (0, 0, zc), 6.5, 13), M['ice']))
        elif level == 2:
            parts.append((octa(q, (0, 0, zc), 7, 14), M['ice']))
            for a in range(3):
                c = rot_z(q, a * TAU / 3)
                parts.append((octa(rot_x(c - [0, -6, zc - 4], 0.45), (0, 0, 0), 3.5, 7.5), M['ice']))
        else:
            parts.append((octa(q, (0, 0, zc), 7.5, 15), M['ice']))
            for a in range(6):
                c = rot_z(q, a * TAU / 6)
                parts.append((octa(rot_x(c - [0, -7, zc], 1.2), (0, 0, 0), 3.0, 9.0), M['ice']))
        return parts
    return scene


# ---- Teleport, mine, flare (flat towers) ------------------------------------------------------

def teleport_base(armed):
    accent = M['l_red'] if armed else M['l_blue']

    def scene(p):
        x, y, z = P(p)
        pad = extrude(box2d(x, y, 22, 22) - 4, z, 0, 6, 2.5)
        parts = [
            (pad, M['steel']),
            (extrude(box2d(x, y, 22, 22) - 4, z, 5.5, 6.5, 0.3) + 0.0, M['gunmetal']),
            (cyl(p, 0, 0, 16, 5, 8, 1.2), M['gunmetal']),
            (cyl(p, 0, 0, 12.5, 7.5, 8.6, 0.5), M['glass'] if not armed else M['l_white']),
            (torus_z(p, 0, 0, 8.4, 14.2, 0.8), M['l_blue'] if not armed else M['l_red']),
            (torus_z(p, 0, 0, 8, 16, 1.1), M['silver']),
        ]
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts.append((sphere(p, (sx * 22, sy * 22, 4), 5), M['navy']))
                parts.append((sphere(p, (sx * 24.5, sy * 24.5, 5), 2.0), accent))
        return parts
    return scene


def mine_scene(glow):
    """Spiked dome mine; `glow` 0..1 lights the core."""
    core = M['l_red'] if glow > 0 else M['maroon']

    def scene(p):
        x, y, z = P(p)
        parts = [
            (cyl(p, 0, 0, 17, 0, 4, 1.5), M['gunmetal']),
            (np.maximum(sphere(p, (0, 0, 2), 12), -z), core),
            (torus_z(p, 0, 0, 3.5, 13, 2.0), M['steel']),
        ]
        for a in range(8):
            q = rot_z(p, a * TAU / 8)
            parts.append((capsule(q, (0, -13, 3), (0, -21, 1.5), 1.8, 0.2), M['silver']))
        for a in range(4):
            q = rot_z(p, a * TAU / 4 + TAU / 16)
            parts.append((capsule(q, (0, -7, 11), (0, -9, 15), 1.0, 0.2), M['silver']))
        return parts
    return scene


def flare_scene():
    def scene(p):
        return [
            (cyl(p, 0, 0, 7, 0, 3, 1), M['gunmetal']),
            (cyl(p, 0, 0, 4, 2, 10, 1), M['red']),
            (sphere(p, (0, 0, 11), 3.2), M['l_red']),
        ]
    return scene


# ---- Command tower (radar dish; spins as its animation) ---------------------------------------

def command_base():
    def scene(p):
        x, y, z = P(p)
        oct_ = lambda r: ngon2d(x, y, r, 8)
        parts = [
            (extrude(oct_(31), z, 0, 9, 1.2), M['gunmetal']),
            (extrude(oct_(28.5), z, 8, 12, 0.8), M['black']),
        ]
        taper = 26 - np.clip(z - 11, 0, 31) * (4.5 / 31)
        parts.append((extrude(oct_(taper) * 0.97, z, 11, 42, 1.4), M['steel']))
        parts.append((extrude(oct_(taper + 0.6) * 0.97, z, 31, 33.5, 0.4), M['black']))
        parts.append((cyl(p, 0, 0, 21, 41, 45, 0.8), M['gunmetal']))
        parts.append((torus_z(p, 0, 0, 44.7, 20.5, 1.0), M['l_amber']))
        parts.append((cyl(p, 0, 0, 15.5, 44.4, 45.3, 0.3), M['black']))
        parts += diag_feet(p, M['orange'], reach=30.4, w=3.6, l=6.0, z1=30)
        for a in range(4):
            q = rot_z(p, a * TAU / 4)
            for ox in (-6.0, 6.0):
                parts.append((box(q, (ox, -24.0, 21), (1.7, 1.2, 7), 0.3), M['l_amber']))
        for ox in (-12, 0, 12):
            parts.append((sphere(p, (ox, -30.5, 5), 1.7), M['l_amber']))
        return parts
    return scene


def command_turret():
    k = 1.35

    def local(p):
        x, y, z = P(p)
        parts = [
            (cyl(p, 0, 0, 15, 0, 5, 0.8), M['black']),
            (cyl(p, 0, 0, 13.5, 4, 15, 1.2), M['steel']),
            (torus_z(p, 0, 0, 10.5, 13.6, 1.1), M['orange']),
        ]
        for sx in (-1, 1):
            parts.append((box(p, (sx * 12.8, 1, 9), (2.2, 4.5, 4), 0.8), M['steel']))
            parts.append((sphere(p, (sx * 13.2, 5.6, 10.5), 1.0), M['l_amber']))
        parts.append((box(p, (0, -13.2, 8), (4.5, 1.6, 3), 0.5), M['black']))
        parts.append((np.maximum(sphere(p, (0, 1.5, 14), 10.5), 14 - z), M['glass']))
        parts.append((capsule(p, (-4.5, 10.2, 18.5), (4.5, 10.2, 18.5), 1.5), M['l_amber']))
        parts.append((cyl(p, 0, -8, 1.8, 13, 29, 0.4), M['silver']))
        mount = np.array([0.0, -8.0, 30.0])
        tilt = math.radians(30)
        w = np.array([0.0, math.cos(tilt), math.sin(tilt)])
        rc, rim, th = 15.0, 10.0, 0.9
        depth = rc - math.sqrt(rc * rc - rim * rim)
        shell = np.abs(length(p - (mount + w * rc)) - rc) - th
        parts.append((np.maximum(shell, (p - mount) @ w - depth), M['silver']))
        parts.append((capsule(p, mount, mount + w * 8.5, 0.6), M['black']))
        parts.append((sphere(p, mount + w * 9.0, 1.4), M['l_amber']))
        parts.append((capsule(p, (-9, -3, 13), (-9, -3, 33), 0.65), M['black']))
        parts.append((sphere(p, (-9, -3, 34), 1.6), M['l_red']))
        parts.append((capsule(p, (9, -3, 13), (9, -3, 27), 0.65), M['black']))
        parts.append((sphere(p, (9, -3, 28), 1.5), M['l_amber']))
        return parts

    def scene(p):
        return [(d * k, m) for d, m in local(p / k)]
    return scene


# ---- Sheet definitions -------------------------------------------------------------------------

BASE_CAM = dict(fw=70, fh=70, ox=35, oy=42)


def turret_frames(scene, oy=42, shadow=0.25, k=1.3):
    """32 headings, clockwise from north. `k` enlarges the model about its deck origin."""
    if k != 1:
        scene = scaled(scene, k)
    return [dict(scene=heading(scene, f * TAU / 32), cam=dict(BASE_CAM, oy=oy),
                 ground_shadow=shadow, shadow_radius=26) for f in range(32)]


def base_frame(scene, shadow=0.2, radius=38):
    return dict(scene=scene, cam=dict(BASE_CAM), ground_shadow=shadow, shadow_radius=radius)


def sheets():
    """sheet id -> list of frame jobs."""
    s = {}
    for lvl, sid in ((1, 'gun_tower'), (2, 'gun_tower2'), (3, 'gun_tower3')):
        s[sid] = [base_frame(gun_base(lvl))] + turret_frames(gun_turret(lvl))
    for lvl, sid in ((1, 'aa_tower'), (2, 'aa_tower2')):
        s[sid] = [base_frame(aa_base(lvl))] + turret_frames(aa_turret(lvl))
    for lvl, sid in ((1, 'flame_tower'), (2, 'flame_tower2')):
        s[sid] = [base_frame(flame_base(lvl))] + turret_frames(flame_turret(lvl))
    for lvl, sid in ((1, 'rocket_tower'), (2, 'rocket_tower2'), (3, 'rocket_tower3')):
        s[sid] = [base_frame(rocket_base(lvl))] + turret_frames(rocket_turret(lvl))
    for lvl, sid in ((1, 'sam_tower'), (2, 'sam_tower2')):
        s[sid] = [base_frame(sam_base(lvl))] + turret_frames(sam_turret(lvl))
    s['mortar'] = [base_frame(heavy_base('mortar')),
                   dict(scene=scaled(mortar_turret(), 1.45), cam=dict(BASE_CAM), ground_shadow=0.25, shadow_radius=24)]
    s['artillery'] = [base_frame(heavy_base('artillery')),
                      dict(scene=scaled(artillery_turret(), 1.2), cam=dict(BASE_CAM), ground_shadow=0.25, shadow_radius=26)]
    for lvl, sid in ((1, 'ice_tower'), (2, 'ice_tower2'), (3, 'ice_tower3')):
        s[sid] = [base_frame(ice_base(lvl))] + [
            dict(scene=translate(scaled(ice_crystal(lvl, f / 8), 1.25), 0, 0, -15), cam=dict(BASE_CAM), ground_shadow=0.0, glow=('cyan', 0.35 + 0.15 * math.sin(f / 8 * TAU)))
            for f in range(8)]
    s['command_tower'] = [base_frame(command_base(), 0.18, 36)] + turret_frames(command_turret(), oy=47, k=1)
    flat = dict(BASE_CAM)
    s['teleport_tower_unarmed'] = [dict(scene=teleport_base(False), cam=flat, ground_shadow=0.25, shadow_radius=34)]
    s['teleport_tower_armed'] = [dict(scene=teleport_base(True), cam=flat, ground_shadow=0.25, shadow_radius=34)] + [
        dict(fx=('sparkles', f / 16)) for f in range(16)]
    s['mine_unarmed'] = [dict(scene=mine_scene(0), cam=flat, ground_shadow=0.3, shadow_radius=26)]
    s['mine_armed'] = [dict(scene=mine_scene(0), cam=flat, ground_shadow=0.3, shadow_radius=26)] + [
        dict(scene=mine_scene(g), cam=flat, ground_shadow=0.3, shadow_radius=26, glow=('red', 0.55 * g))
        if g > 0 else dict(fx=('empty',))
        for g in (1.0, 0.0, 0.45, 0.7, 0.9, 1.0)]
    s['flare'] = [dict(scene=scaled(flare_scene(), 1.4), cam=flat, ground_shadow=0.3, shadow_radius=14, glow=('red', 0.9))]
    return s
