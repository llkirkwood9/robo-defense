"""
2D procedural effects: explosions, fire, glows, bullets and sparkles. Everything is drawn in
float RGBA at the output resolution and returned as uint8.
"""
import math

import numpy as np
from PIL import Image, ImageFilter

GLOWS = {
    'red': (1.0, 0.25, 0.18),
    'cyan': (0.45, 0.9, 1.0),
    'green': (0.4, 1.0, 0.45),
    'amber': (1.0, 0.7, 0.25),
    'white': (0.95, 0.95, 1.0),
    'blue': (0.45, 0.65, 1.0),
}


def blank(w, h):
    return np.zeros((h, w, 4))


def grid(w, h):
    y, x = np.mgrid[0:h, 0:w]
    return x + 0.5, y + 0.5


def over(dst, rgb, a):
    """Composites straight-alpha colour `rgb` (h,w,3 or 3) with alpha `a` over `dst` (float)."""
    a = np.clip(a, 0, 1)[..., None]
    da = dst[..., 3:4]
    oa = a + da * (1 - a)
    dst[..., :3] = np.where(oa > 0, (np.asarray(rgb) * a + dst[..., :3] * da * (1 - a)) / np.maximum(oa, 1e-6), 0)
    dst[..., 3:4] = oa
    return dst


def add_light(dst, rgb, a):
    """Additive-looking glow: brightens colour and raises alpha."""
    return over(dst, np.clip(np.asarray(rgb), 0, 1), a)


def radial(w, h, cx, cy, r, power=2.0):
    x, y = grid(w, h)
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r
    return np.clip(1 - d, 0, 1) ** power


def to_u8(img):
    return (np.clip(img, 0, 1) * 255).round().astype(np.uint8)


def noise2(w, h, scale, seed, octaves=4):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp = 1.0
    tot = 0
    for o in range(octaves):
        s = max(2, int(scale * 2 ** o))
        g = rng.random((s + 1, s + 1))
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += np.asarray(img, float) / 255 * amp
        tot += amp
        amp *= 0.5
    return out / tot


def glow_sprite(w, h, color, core=0.12, halo=0.45, strength=1.0):
    """A soft glowing dot (bullets, flare lights)."""
    img = blank(w, h)
    c = GLOWS.get(color, color)
    halo_a = radial(w, h, w / 2, h / 2, w * halo, 1.6) * 0.85 * strength
    img = over(img, c, halo_a)
    core_a = radial(w, h, w / 2, h / 2, w * core, 0.8)
    img = over(img, (1, 1, 1), core_a)
    return to_u8(img)


def add_glow(rgba, color, strength, cx=None, cy=None, radius=None):
    """Adds a halo behind/around an existing sprite (uint8 in, uint8 out)."""
    h, w = rgba.shape[:2]
    cx = w / 2 if cx is None else cx
    cy = h * 0.5 if cy is None else cy
    radius = w * 0.42 if radius is None else radius
    halo = blank(w, h)
    halo = over(halo, GLOWS[color], radial(w, h, cx, cy, radius, 2.2) * strength)
    src = rgba.astype(float) / 255
    out = over(halo, src[..., :3], src[..., 3])
    return to_u8(out)


def explosion(w, h, t, seed=1, tint=(1.0, 0.62, 0.22)):
    """Fireball at time t in [0, 1): flash, expanding billow, then smoke and embers."""
    x, y = grid(w, h)
    cx, cy = w / 2, h / 2
    img = blank(w, h)
    n = noise2(w, h, 5, seed)
    n2 = noise2(w, h, 9, seed + 7)
    r = w * (0.08 + 0.36 * (1 - (1 - t) ** 2.2))
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    edge = r * (0.75 + 0.5 * n)
    body = np.clip((edge - d) / (w * 0.06), 0, 1)
    # Smoke darkens as the fireball cools.
    smoke_col = np.array([0.22, 0.2, 0.2])
    heat = np.clip(1.25 - t * 1.6 + (n2 - 0.5) * 0.8 - d / max(r, 1) * 0.6, 0, 1)
    fire_col = np.stack([np.ones_like(heat), 0.35 + 0.6 * heat, 0.08 + 0.55 * heat ** 2], -1) * np.array(tint) / max(tint)
    col = fire_col * heat[..., None] + smoke_col * (1 - heat[..., None])
    a = body * np.clip(1.15 - t ** 1.5, 0, 1)
    img = over(img, col, a * np.clip(0.55 + heat, 0, 1))
    # Initial flash.
    if t < 0.3:
        f = 1 - t / 0.3
        img = over(img, (1, 0.95, 0.8), radial(w, h, cx, cy, w * (0.25 + 0.25 * t / 0.3), 1.5) * f)
    # Embers flung outward.
    rng = np.random.default_rng(seed)
    for _ in range(14):
        ang = rng.random() * math.tau
        sp = 0.25 + 0.3 * rng.random()
        ex = cx + math.cos(ang) * w * sp * t * 1.3
        ey = cy + math.sin(ang) * w * sp * t * 1.3
        img = over(img, (1, 0.8, 0.4), radial(w, h, ex, ey, w * 0.035, 1.0) * max(0, 1 - t * 1.2))
    return to_u8(img)


def fire(w, h, t, seed=3):
    """A small looping flame tongue, t in [0, 1)."""
    x, y = grid(w, h)
    img = blank(w, h)
    u = (x - w / 2) / (w * 0.5)
    v = (h - y) / h            # 0 at the bottom
    # Noise scrolls upward; two copies a cycle apart are cross-faded so the loop is seamless.
    tall = noise2(w, h * 3, 4, seed, 4)
    o = int(round((1 - t) * h))
    nn = tall[h + o:2 * h + o] * (1 - t) + tall[o:h + o] * t
    nn = (nn - nn.mean()) / max(nn.std(), 1e-6) * 0.18 + 0.5
    sway = math.sin(t * math.tau) * 0.12 * v
    width = (0.62 - 0.6 * v ** 0.9) * (0.7 + 0.6 * nn)
    body = np.clip((width - np.abs(u - sway + (nn - 0.5) * 0.7 * v)) * 7, 0, 1)
    a = body * smoothstep_np(0.0, 0.12, v) * np.clip(1.15 - v, 0, 1) * smoothstep_np(0.15, 0.45, nn + 0.3 - v * 0.3)
    heat = np.clip(1.1 - v * 1.3 - np.abs(u) * 0.6 + (nn - 0.5) * 0.4, 0, 1)
    col = np.stack([np.ones_like(heat), 0.25 + 0.7 * heat, 0.04 + 0.7 * heat ** 3], -1)
    img = over(img, (1.0, 0.45, 0.1), radial(w, h, w / 2, h * 0.75, w * 0.5, 2) * 0.35)
    img = over(img, col, a)
    return to_u8(img)


def smoothstep_np(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def teleport_burst(w, h, t, seed=5):
    """Blue-white implosion ring with sparks, t in [0, 1)."""
    x, y = grid(w, h)
    cx, cy = w / 2, h / 2
    img = blank(w, h)
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    ang = np.arctan2(y - cy, x - cx)
    r = w * 0.42 * (1 - t) ** 0.8
    ring = np.exp(-((d - r) / (w * 0.025 + w * 0.03 * t)) ** 2) * (1 - t * 0.6)
    swirl = 0.6 + 0.4 * np.sin(ang * 5 + t * 12)
    img = over(img, (0.45, 0.7, 1.0), ring * swirl)
    img = over(img, (0.9, 0.95, 1.0), radial(w, h, cx, cy, w * 0.3 * (0.3 + t), 2) * math.sin(math.pi * t))
    rng = np.random.default_rng(seed)
    for _ in range(18):
        a0 = rng.random() * math.tau
        rr = w * (0.1 + 0.35 * rng.random()) * (1 - t)
        a1 = a0 + t * 3
        img = over(img, (0.85, 0.9, 1.0), radial(w, h, cx + math.cos(a1) * rr, cy + math.sin(a1) * rr * 0.8,
                                                  w * 0.025, 1.0) * (1 - t * 0.7))
    return to_u8(img)


def sparkles(w, h, t, seed=11, cy_frac=0.6):
    """Looping orbiting sparkles above a teleport pad, t in [0, 1)."""
    img = blank(w, h)
    cx, cy = w / 2, h * cy_frac
    rng = np.random.default_rng(seed)
    for i in range(14):
        a0 = rng.random() * math.tau
        rr = w * (0.08 + 0.2 * rng.random())
        rise = (rng.random() + t) % 1.0
        a = a0 + t * math.tau * (1 if i % 2 else -1)
        px = cx + math.cos(a) * rr
        py = cy + math.sin(a) * rr * 0.55 - rise * h * 0.35
        fade = math.sin(math.pi * rise)
        img = over(img, (0.75, 0.85, 1.0), radial(w, h, px, py, w * 0.05, 2.0) * fade * 0.8)
        img = over(img, (1, 1, 1), radial(w, h, px, py, w * 0.018, 1.0) * fade)
    return to_u8(img)


def empty(w, h):
    return np.zeros((h, w, 4), np.uint8)


def blur(rgba, r):
    img = Image.fromarray(rgba, 'RGBA').filter(ImageFilter.GaussianBlur(r))
    return np.asarray(img)
