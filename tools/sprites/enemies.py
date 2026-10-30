"""
Enemy models. Each sheet has four equal groups of frames (facing right, up, left, down), each
group an animation cycle. Models face north (+y) and are turned with `heading`.
"""
import math

import numpy as np

import fx
from palette import M
from r3d import (
    box, box2d, capsule, cyl, drop_shadow, ellipsoid, extrude, heading, length, rot_x, rot_y,
    rot_z, sphere, torus_z, translate, tube,
)

TAU = math.pi * 2
# Facing right, up (north), left, down.
HEADINGS = [TAU / 4, 0.0, 3 * TAU / 4, TAU / 2]
UNIT_ELEV = 50.0


def P(p):
    return p[:, 0], p[:, 1], p[:, 2]


def limb(a, ang_hip, ang_knee, l1, l2, down=True):
    """Two-bone limb in the y-z plane from joint `a`; angles in radians from straight down."""
    a = np.asarray(a, float)
    k = a + np.array([0, math.sin(ang_hip), -math.cos(ang_hip)]) * l1
    f = k + np.array([0, math.sin(ang_hip - ang_knee), -math.cos(ang_hip - ang_knee)]) * l2
    return a, k, f


# ---- Soldier: slim biped with a rifle (gunmetal / silver, cyan visor) ------------------------

def soldier(phase):
    s = math.sin(phase * TAU)
    c = math.cos(phase * TAU)
    bob = abs(c) * 0.9

    def scene(p):
        hip_z = 17 + bob
        parts = []
        for side, sgn in ((-1, 1), (1, -1)):
            swing = 0.55 * s * sgn
            knee = 0.2 + 0.6 * max(0.0, math.sin(phase * TAU + (0 if sgn > 0 else math.pi) + 1.2))
            a, k, f = limb((side * 3.6, 0, hip_z), swing, -knee, 8.5, 8.5)
            parts.append((capsule(p, a, k, 2.1), M['gunmetal']))
            parts.append((capsule(p, k, f, 1.8), M['silver']))
            parts.append((box(p, f + [0, 1.6, 0.6], (1.9, 3.2, 1.2), 0.8), M['gunmetal']))
            parts.append((sphere(p, k, 2.3), M['steel']))
        # Torso, chest plate, head with visor.
        parts.append((ellipsoid(p, (0, 0, hip_z + 7), (5.4, 3.6, 7)), M['silver']))
        parts.append((box(p, (0, 1.6, hip_z + 8.5), (4, 2.2, 3.5), 1.5), M['blue']))
        parts.append((sphere(p, (0, 0, hip_z + 16.5), 3.4), M['silver']))
        parts.append((box(p, (0, 2.6, hip_z + 16.8), (2.6, 1.0, 0.9), 0.5), M['l_cyan']))
        parts.append((box(p, (0, -3.6, hip_z + 8), (3.2, 1.6, 4), 1), M['gunmetal']))  # backpack
        # Arms holding the rifle forward.
        sh_z = hip_z + 12
        for side in (-1, 1):
            sh = np.array([side * 6.2, 0, sh_z])
            el = sh + [side * 0.5, 3.0, -5.5]
            hand = np.array([side * 2.2, 6.5, sh_z - 5])
            parts.append((sphere(p, sh, 2.4), M['gunmetal']))
            parts.append((capsule(p, sh, el, 1.6), M['silver']))
            parts.append((capsule(p, el, hand, 1.4), M['gunmetal']))
        gun_a = np.array([1.5, 2.0, sh_z - 4.5])
        parts.append((tube(p, gun_a, gun_a + [0, 14, 0.5], 1.2), M['black']))
        parts.append((box(p, gun_a + [0, 4, -1.5], (1.2, 3.5, 2.2), 0.5), M['gunmetal']))
        return parts
    return scene


def heavy_soldier(phase):
    """Stocky dome-bodied robot with a shoulder cannon (white / red / gunmetal)."""
    s = math.sin(phase * TAU)
    bob = abs(math.cos(phase * TAU)) * 0.8

    def scene(p):
        hip_z = 12 + bob
        parts = []
        for side, sgn in ((-1, 1), (1, -1)):
            swing = 0.45 * s * sgn
            knee = 0.15 + 0.5 * max(0.0, math.sin(phase * TAU + (0 if sgn > 0 else math.pi) + 1.2))
            a, k, f = limb((side * 6, 0, hip_z), swing, -knee, 6.5, 6.5)
            parts.append((capsule(p, a, k, 2.8), M['gunmetal']))
            parts.append((capsule(p, k, f, 2.5), M['red']))
            parts.append((box(p, f + [0, 1.5, 0.8], (3.2, 4.2, 1.6), 1.0), M['steel']))
        body = sphere(p, (0, 0, hip_z + 10), 11)
        parts.append((body, M['white']))
        parts.append((torus_z(p, 0, 0, hip_z + 8.5, 10.6, 1.6), M['gunmetal']))
        parts.append((box(p, (0, 8.6, hip_z + 13), (4.5, 2.6, 2.2), 1.5), M['gunmetal']))
        parts.append((box(p, (0, 10.2, hip_z + 13), (3.2, 1.2, 0.9), 0.5), M['l_red']))
        # Shoulder cannon on the right, fist on the left.
        sz = hip_z + 14
        parts.append((sphere(p, (10.5, 0, sz), 4), M['red']))
        parts.append((tube(p, (12, -8, sz + 5), (12, 13, sz + 5), 3.4), M['gunmetal']))
        parts.append((tube(p, (12, 11, sz + 5), (12, 14, sz + 5), 4.0), M['black']))
        parts.append((sphere(p, (-10.5, 0, sz), 4), M['red']))
        parts.append((capsule(p, (-11, 0, sz), (-12, 3 - s * 3, sz - 9), 2.4), M['gunmetal']))
        parts.append((sphere(p, (-12, 3 - s * 3, sz - 10.5), 3.4), M['steel']))
        return parts
    return scene


def runner(phase):
    """Quadruped scout (yellow / black) with a bounding gait."""
    def scene(p):
        t = phase * TAU
        body_z = 13 + math.sin(t * 2) * 1.2
        pitch = math.sin(t) * 0.12
        parts = []
        q = rot_x(p - [0, 0, body_z], pitch)
        parts.append((ellipsoid(q, (0, 0, 0), (5, 11, 4.5)), M['yellow']))
        parts.append((box(q, (0, -1, 3.6), (3.2, 7, 1.2), 1.0), M['black']))
        parts.append((ellipsoid(q, (0, 12, 3), (3.4, 5, 3.2)), M['steel']))
        parts.append((box(q, (0, 15.8, 3.6), (2.0, 1.0, 0.8), 0.4), M['l_red']))
        parts.append((capsule(q, (0, -10, 1), (0, -17, 4), 1.0, 0.4), M['black']))
        for (lx, ly, ph) in ((-4.5, 7, 0.0), (4.5, 7, 0.5), (-4.5, -7, 0.35), (4.5, -7, 0.85)):
            sw = math.sin(t + ph * TAU) * 0.7
            a = np.array([lx * 1.1, ly, body_z - 1])
            _, k, f = limb(a, sw, (-0.9 if ly > 0 else 0.9) - 0.2 * math.cos(t + ph * TAU), 7, 7.5)
            f[2] = max(f[2], 0.8)
            parts.append((capsule(p, a, k, 1.9), M['gunmetal']))
            parts.append((capsule(p, k, f, 1.4), M['yellow']))
            parts.append((sphere(p, k, 1.8), M['black']))
        return parts
    return scene


# ---- Vehicles -----------------------------------------------------------------------------------

def light_tank(phase):
    def scene(p):
        x, y, z = P(p)
        parts = []
        for sx in (-1, 1):
            parts.append((extrude(box2d(y, z - 4.5, 13, 0.01) - 4.5, x - sx * 9, -3, 3, 1.0), M['rubber']))
            # Moving tread marks on top of the belt.
            mark = np.abs(np.mod(y + phase * 3.0, 3.0) - 1.5) - 0.5
            belt = extrude(box2d(y, z - 4.5, 13, 0.01) - 4.7, x - sx * 9, -3.2, 3.2, 1.0)
            parts.append((np.maximum(belt, mark), M['steel']))
            parts.append((extrude(box2d(y, z - 7.5, 13, 1.5), x - sx * 9.5, -3.6, 3.6, 1.0), M['sand']))
        parts.append((box(p, (0, 0, 9), (7.5, 14, 4), 2), M['sand']))
        parts.append((box(p, (0, 10, 11), (6, 3, 2), 1.5), M['olive']))
        parts.append((cyl(p, 0, -2, 6.5, 11, 17, 2), M['sand']))
        parts.append((box(p, (0, -2, 17.2), (2.5, 2.5, 0.8), 0.5), M['gunmetal']))
        parts.append((tube(p, (0, 3, 14), (0, 22, 14), 1.4), M['gunmetal']))
        parts.append((tube(p, (0, 19, 14), (0, 23, 14), 2.0), M['black']))
        parts.append((capsule(p, (-4, -6, 17), (-4, -12, 30), 0.4), M['black']))
        parts.append((sphere(p, (3.5, -7, 13.5), 1.1), M['l_red']))
        return parts
    return scene


def heavy_tank(phase):
    def scene(p):
        x, y, z = P(p)
        parts = []
        for sx in (-1, 1):
            parts.append((extrude(box2d(y, z - 5.5, 15, 0.01) - 5.5, x - sx * 12.5, -4, 4, 1.0), M['rubber']))
            mark = np.abs(np.mod(y + phase * 3.0, 3.0) - 1.5) - 0.5
            belt = extrude(box2d(y, z - 5.5, 15, 0.01) - 5.7, x - sx * 12.5, -4.2, 4.2, 1.0)
            parts.append((np.maximum(belt, mark), M['steel']))
            parts.append((extrude(box2d(y, z - 9, 15.5, 1.8), x - sx * 13, -4.6, 4.6, 1.0), M['gunmetal']))
        parts.append((box(p, (0, 0, 11), (10, 16, 4.5), 2.5), M['gunmetal']))
        parts.append((box(p, (0, 12, 13), (8, 3, 2), 1.5), M['steel']))
        parts.append((box(p, (0, -3, 17), (8.5, 9, 3.5), 2.5), M['steel']))
        parts.append((box(p, (0, -6, 21), (4, 3, 1.2), 0.8), M['gunmetal']))
        parts.append((box(p, (0, -1.5, 20.6), (6, 1, 0.6), 0.3), M['l_red']))
        for bx in (-2.6, 2.6):
            parts.append((tube(p, (bx, 4, 17), (bx, 28, 17), 1.4), M['silver']))
            parts.append((tube(p, (bx, 25, 17), (bx, 29, 17), 2.0), M['black']))
        for sx in (-1, 1):
            parts.append((box(p, (sx * 9.5, -9, 18), (1.6, 4, 2.2), 0.8), M['bronze']))
        return parts
    return scene


def truck(phase):
    """Six-wheeled armoured carrier (olive / tan) with a front ram."""
    def scene(p):
        x, y, z = P(p)
        parts = []
        for wy in (-10, 0, 10):
            for sx in (-1, 1):
                w = extrude(np.sqrt((y - wy) ** 2 + (z - 4.5) ** 2) - 4.5, x - sx * 9.5, -2.2, 2.2, 0.8)
                ang = np.arctan2(z - 4.5, y - wy) + phase * TAU / 3
                spokes = np.abs(np.sin(ang * 3)) * 3 - 1.5
                hub = np.maximum(extrude(np.sqrt((y - wy) ** 2 + (z - 4.5) ** 2) - 3.0, x - sx * 9.5, -2.4, 2.4, 0.5), spokes)
                parts.append((w, M['rubber']))
                parts.append((hub, M['steel']))
        parts.append((box(p, (0, -1, 11), (8.5, 16, 5), 2), M['olive']))
        parts.append((box(p, (0, -5, 17.5), (7.5, 11, 2.5), 2), M['olive']))
        parts.append((box(p, (0, 9, 15), (7, 4, 2.5), 2), M['sand']))
        parts.append((box(p, (0, 11.5, 15.5), (5.5, 1.2, 1.2), 0.6), M['glass']))
        for i in range(5):
            parts.append((box(p, ((i - 2) * 3.2, 17.5, 7), (1.1, 1.5, 4), 0.6), M['sand']))
        parts.append((box(p, (0, -5, 20.5), (3, 3, 1.5), 1), M['gunmetal']))
        parts.append((tube(p, (0, -4, 21.5), (0, 6, 21.5), 0.9), M['black']))
        parts.append((sphere(p, (6, 15.5, 11), 1.0), M['l_amber']))
        parts.append((sphere(p, (-6, 15.5, 11), 1.0), M['l_amber']))
        return parts
    return scene


# ---- Aircraft -----------------------------------------------------------------------------------

def helicopter(phase):
    def scene(p):
        x, y, z = P(p)
        parts = []
        parts.append((ellipsoid(p, (0, 3, 0), (6, 13, 6)), M['gunmetal']))
        parts.append((ellipsoid(p, (0, 10, 1.5), (4.5, 6, 4)), M['glass']))
        parts.append((capsule(p, (0, -8, 1), (0, -28, 3), 2.6, 1.2), M['gunmetal']))
        parts.append((box(p, (0, -28, 6), (0.6, 3, 4), 0.4), M['sand']))
        parts.append((box(p, (0, 0, -3), (9, 3, 0.8), 0.6), M['sand']))  # stub wings
        for sx in (-1, 1):
            parts.append((tube(p, (sx * 9, -2, -4.5), (sx * 9, 6, -4.5), 1.3), M['steel']))
            parts.append((capsule(p, (sx * 4.5, -8, -7), (sx * 4.5, 10, -7), 0.6), M['black']))  # skids
        parts.append((cyl(p, 0, 0, 1.4, 5, 9, 0.3), M['black']))
        # Rotor: crisp blades plus a translucent-looking disc via thin plate.
        rot = phase * TAU / 3
        for b in range(3):
            q = rot_z(p, rot + b * TAU / 3)
            parts.append((box(q, (0, 15, 9), (2.2, 15, 0.35), 0.3), M['steel']))
        parts.append((cyl(p, 0, 0, 2.2, 8.5, 10, 0.5), M['steel']))
        parts.append((sphere(p, (0, -29, 1), 0.9), M['l_red']))
        return parts
    return scene


def jet(phase):
    """Swept-wing fighter; afterburner flickers, nav lights blink and it banks gently."""
    burn = 0.75 + 0.25 * math.sin(phase * TAU * 3) + 0.1 * math.sin(phase * TAU * 7)
    blink = phase < 0.5
    roll = math.sin(phase * TAU) * 0.07

    def scene(p):
        p = rot_y(p, roll)
        x, y, z = P(p)
        parts = []
        parts.append((capsule(p, (0, -18, 0), (0, 16, 0), 3.4, 1.0), M['silver']))
        parts.append((capsule(p, (0, 16, 0), (0, 24, 0), 1.0, 0.2), M['steel']))
        parts.append((ellipsoid(p, (0, 9, 2.4), (2.0, 5, 2)), M['glass']))
        wing = extrude(np.maximum(np.abs(x) - 17, (y + 4) + np.abs(x) * 0.65 - 6), z, -0.8, 0.8, 0.5)
        wing = np.maximum(wing, -(y + 12))
        parts.append((wing, M['silver']))
        parts.append((np.maximum(wing - 0.05, 12 - np.abs(x)), M['blue']))  # wingtips
        tail = extrude(np.maximum(np.abs(x) - 7, (y + 15) + np.abs(x) * 0.6 - 3), z, -0.6, 0.6, 0.4)
        parts.append((np.maximum(tail, -(y + 20)), M['silver']))
        for sx in (-1, 1):
            fin = extrude(box2d(y + 15, z - 4, 3, 3.5), x - sx * 2.5, -0.5, 0.5, 0.3)
            parts.append((fin, M['blue']))
        parts.append((sphere(p, (-16.5, -10, 0), 0.9), M['l_red'] if blink else M['maroon']))
        parts.append((sphere(p, (16.5, -10, 0), 0.9), M['l_green'] if blink else M['green_dark']))
        parts.append((tube(p, (0, -18, 0), (0, -20, 0), 2.6), M['black']))
        parts.append((capsule(p, (0, -20, 0), (0, -20 - 6 * burn, 0), 2.0, 0.4), M['molten']))
        return parts
    return scene


def bomber(phase):
    """Heavy bomber with a wide, straight wing, four propeller engines and blinking lights."""
    prop = phase * TAU / 3          # three-bladed props: a third of a turn loops
    blink = phase < 0.25

    def scene(p):
        x, y, z = P(p)
        parts = []
        parts.append((capsule(p, (0, -17, 0), (0, 15, 0), 4.6, 2.6), M['gunmetal']))
        parts.append((ellipsoid(p, (0, 12, 2.6), (2.6, 4.5, 2.2)), M['glass']))
        # Long, slightly tapered wing spanning nearly the whole frame.
        chord = 5.2 - np.abs(x) * 0.06
        wing = extrude(np.maximum(np.abs(x) - 37, np.abs(y - 1 + np.abs(x) * 0.08) - chord), z, -1.1, 1.1, 0.6)
        parts.append((wing, M['purple']))
        parts.append((np.maximum(wing - 0.05, np.abs(np.abs(x) - 20) - 1.0), M['gunmetal']))   # wing bands
        parts.append((extrude(np.maximum(np.abs(x) - 12, np.abs(y + 17 + np.abs(x) * 0.12) - 2.6), z - 0.6, -0.7, 0.7, 0.4), M['purple']))
        parts.append((extrude(box2d(y + 16, z - 4.5, 3, 4.5), x, -0.6, 0.6, 0.3), M['purple']))
        for sx in (-1, 1):
            for ex in (11.0, 25.0):
                ey = 1 - ex * 0.08
                c = np.array([sx * ex, ey, -1.2])
                parts.append((capsule(p, c + [0, -6, 0], c + [0, 6, 0], 2.3), M['steel']))
                parts.append((sphere(p, c + [0, 7.2, 0], 1.3), M['black']))
                q = rot_y(p - (c + [0, 7.6, 0]), prop * sx)
                for b in range(3):
                    qb = rot_y(q, b * TAU / 3)
                    parts.append((box(qb, (0, 0, 2.6), (0.9, 0.3, 2.4), 0.3), M['steel']))
            parts.append((sphere(p, (sx * 37.5, -2, 0), 1.3), M['l_red'] if blink else M['maroon']))
        parts.append((sphere(p, (0, -1, 4.2), 1.0), M['l_white'] if not blink else M['steel']))
        return parts
    return scene


def mothership(phase):
    """Armoured saucer carrier: the hull turns slowly, rim lights chase and the core pulses."""
    spin = phase * TAU / 12          # 12-fold symmetric hull: a twelfth of a turn loops
    pulse = 0.5 + 0.5 * math.cos(phase * TAU)

    def scene(p):
        p = rot_z(p, spin)
        x, y, z = P(p)
        parts = []
        hull = ellipsoid(p, (0, 0, 0), (36, 36, 7.5))
        ang = np.arctan2(y, x)
        grooves = np.abs(np.sin(ang * 6)) * 3 - 0.35
        parts.append((hull, M['gunmetal']))
        parts.append((np.maximum(hull - 0.25, -grooves), M['steel']))
        parts.append((ellipsoid(p, (0, 0, 4), (20, 20, 9)), M['steel']))
        parts.append((torus_z(p, 0, 0, 5, 19.5, 1.4), M['l_blue'] if pulse > 0.35 else M['blue']))
        parts.append((ellipsoid(p, (0, 0, 10), (9, 9, 5.5)), M['glass']))
        parts.append((torus_z(p, 0, 0, 0, 34, 2.6), M['black']))
        lit = int(phase * 12) % 3
        for a in range(12):
            q = rot_z(p, a * TAU / 12)
            parts.append((sphere(q, (0, -34.5, 1.8), 1.7), M['l_cyan'] if a % 3 == lit else M['steel']))
        for a in range(4):
            q = rot_z(p, a * TAU / 4 + TAU / 8)
            parts.append((box(q, (0, -27, 4), (5, 4, 3), 1.5), M['gunmetal']))
            parts.append((box(q, (0, -30.6, 4.2), (3.4, 0.6, 1.2), 0.4), M['l_blue']))
        return parts
    return scene


# ---- Titan: towering bronze mech ----------------------------------------------------------------

def titan(phase):
    s = math.sin(phase * TAU)
    bob = abs(math.cos(phase * TAU)) * 1.5

    def scene(p):
        hip_z = 40 + bob
        parts = []
        for side, sgn in ((-1, 1), (1, -1)):
            swing = 0.35 * s * sgn
            knee = 0.15 + 0.45 * max(0.0, math.sin(phase * TAU + (0 if sgn > 0 else math.pi) + 1.2))
            a, k, f = limb((side * 9, 0, hip_z), swing, -knee, 20, 20)
            parts.append((capsule(p, a, k, 5.0), M['gunmetal']))
            parts.append((capsule(p, k, f, 4.0), M['bronze']))
            parts.append((sphere(p, k, 5.5), M['gold']))
            parts.append((box(p, f + [0, 2.5, 1.0], (5, 8, 2), 1.5), M['gunmetal']))
        parts.append((box(p, (0, 0, hip_z + 3), (11, 6, 4), 2.5), M['gunmetal']))
        parts.append((ellipsoid(p, (0, 0, hip_z + 22), (15, 10, 17)), M['gold']))
        parts.append((box(p, (0, 7, hip_z + 22), (8, 4, 8), 3), M['bronze']))
        parts.append((sphere(p, (0, 10.5, hip_z + 24), 2.6), M['l_amber']))
        parts.append((sphere(p, (0, 2, hip_z + 41), 7.5), M['gold']))
        parts.append((box(p, (0, 8, hip_z + 41.5), (4.5, 1.4, 1.4), 0.7), M['l_red']))
        parts.append((box(p, (0, -10, hip_z + 26), (7, 4, 9), 2), M['gunmetal']))
        sz = hip_z + 33
        for side in (-1, 1):
            sh = np.array([side * 18, 0, sz])
            el = sh + [side * 2, 2 - s * side * 6, -15]
            hand = el + [0, 6 - s * side * 4, -13]
            parts.append((sphere(p, sh, 7), M['bronze']))
            parts.append((capsule(p, sh, el, 4.2), M['steel']))
            parts.append((capsule(p, el, hand, 4.0), M['gunmetal']))
            parts.append((tube(p, hand + [0, -4, 0], hand + [0, 9, 0], 3.2), M['steel']))
            parts.append((tube(p, hand + [0, 8, 0], hand + [0, 10, 0], 3.8), M['black']))
        return parts
    return scene


# ---- Sheets ------------------------------------------------------------------------------------

def unit_sheet(size, model, frames_per_dir, cam, shadow=0.35, radius=24, post=None, scale=1.0):
    from r3d import scaled
    frames = []
    for h in HEADINGS:
        for f in range(frames_per_dir):
            m = model(f / frames_per_dir)
            if scale != 1:
                m = scaled(m, scale)
            job = dict(scene=heading(m, h), cam=cam,
                       ground_shadow=shadow, shadow_radius=radius)
            if post:
                job['post'] = post
            frames.append(job)
    return dict(size=size, frames=frames)


def flyer_sheet(size, model, frames_per_dir, cam, shadow_dy, scale=1.0):
    from r3d import scaled
    frames = []
    for h in HEADINGS:
        for f in range(frames_per_dir):
            m = model(f / frames_per_dir)
            if scale != 1:
                m = scaled(m, scale)
            frames.append(dict(scene=heading(m, h), cam=cam,
                               post=_shadow_post(shadow_dy)))
    return dict(size=size, frames=frames)


class _shadow_post:
    """Picklable post-process that adds the ground shadow below a flyer."""

    def __init__(self, dy):
        self.dy = dy

    def __call__(self, img):
        from build import PPU
        return drop_shadow(img, int(4 * PPU), int(self.dy * PPU), opacity=0.42, blur=2.2 * PPU)


def sheets():
    ground = dict(fw=70, fh=70, ox=35, oy=46, elev=UNIT_ELEV)
    s = {
        'soldier': unit_sheet((70, 70), soldier, 12, ground, radius=26, scale=1.35),
        'heavy_soldier': unit_sheet((70, 70), heavy_soldier, 16, ground, radius=28, scale=1.25),
        'runner': unit_sheet((70, 70), runner, 12, ground, radius=28, scale=1.35),
        'truck': unit_sheet((70, 70), truck, 3, ground, radius=32, scale=1.25),
        'light_tank': unit_sheet((70, 70), light_tank, 3, ground, radius=32, scale=1.25),
        'heavy_tank': unit_sheet((70, 70), heavy_tank, 10, ground, radius=34, scale=1.1),
        'titan': unit_sheet((70, 140), titan, 10, dict(fw=70, fh=140, ox=35, oy=116, elev=UNIT_ELEV), radius=40),
        # Flyers: drawn high in a tall frame with their shadow dropped onto the ground below.
        'helicopter': flyer_sheet((105, 175), helicopter, 6, dict(fw=105, fh=175, ox=52.5, oy=52, elev=UNIT_ELEV), 88, 1.25),
        'jet': flyer_sheet((105, 175), jet, 6, dict(fw=105, fh=175, ox=52.5, oy=52, elev=UNIT_ELEV), 88, 1.35),
        'bomber': flyer_sheet((105, 175), bomber, 8, dict(fw=105, fh=175, ox=52.5, oy=52, elev=UNIT_ELEV), 88, 1.32),
        'mothership': flyer_sheet((105, 151), mothership, 8, dict(fw=105, fh=151, ox=52.5, oy=40, elev=UNIT_ELEV), 70, 1.15),
    }
    return s
