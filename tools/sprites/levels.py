"""
Map backgrounds (assets/levels/*.jpg) and map decoration sprites (VR Training blocks, Courtyard
archway overlays), rendered from procedural height fields lit from the upper right.

    python levels.py              # every map
    python levels.py basic_level  # one map

Layouts follow the game's map data (src/engine/maps.ts): one tile is T pixels, entrances and
obstacles sit where the engine expects them.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PPU = 2
T = 70 * PPU                 # tile size in output pixels
LIGHT = np.array([0.6, 0.5, 0.62])   # image space: +x right, +y up (north), +z out of the ground
LIGHT = LIGHT / np.linalg.norm(LIGHT)


# ---- Noise ----------------------------------------------------------------------------------

def value_noise(w, h, cell, seed):
    rng = np.random.default_rng(seed)
    gw, gh = int(math.ceil(w / cell)) + 2, int(math.ceil(h / cell)) + 2
    g = rng.random((gh, gw)).astype(np.float32)
    img = Image.fromarray(g, 'F').resize((gw * cell, gh * cell), Image.BICUBIC)
    return np.asarray(img)[:h, :w]


def fbm(w, h, cell, seed, octaves=5, gain=0.5):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = max(1, int(cell / 2 ** o))
        out += value_noise(w, h, c, seed + o * 101) * amp
        tot += amp
        amp *= gain
    return out / tot


def _box1d(a, r, axis):
    """Box filter of radius r along `axis` with edge clamping (cumulative sums)."""
    if r < 1:
        return a
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a, r):
    """Approximate gaussian blur (three box passes) of a 2D or (h, w, c) float array."""
    k = max(1, int(round(r * 0.8)))
    out = a.astype(np.float32)
    for _ in range(3):
        out = _box1d(_box1d(out, k, 0), k, 1)
    return out


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---- Canvas -----------------------------------------------------------------------------------

class Canvas:
    """Height (px), albedo, specular and emissive layers for one map."""

    def __init__(self, tw, th):
        self.w, self.h = tw * T, th * T
        self.H = np.zeros((self.h, self.w), np.float32)
        self.A = np.zeros((self.h, self.w, 3), np.float32)
        self.S = np.zeros((self.h, self.w), np.float32)
        self.E = np.zeros((self.h, self.w, 3), np.float32)
        self.y, self.x = np.mgrid[0:self.h, 0:self.w].astype(np.float32)

    def paint(self, mask, albedo=None, height=None, spec=None, emit=None, mode='set'):
        """Writes the given layers where `mask` (0..1) is set; `mode='add'` adds to the height."""
        m = np.clip(mask, 0, 1)
        if albedo is not None:
            a = np.broadcast_to(np.asarray(albedo, np.float32), self.A.shape) if np.ndim(albedo) <= 1 else albedo
            self.A += (a - self.A) * m[..., None]
        if height is not None:
            if mode == 'add':
                self.H += height * m
            else:
                self.H += (height - self.H) * m
        if spec is not None:
            self.S += (spec - self.S) * m
        if emit is not None:
            e = np.broadcast_to(np.asarray(emit, np.float32), self.E.shape) if np.ndim(emit) <= 1 else emit
            self.E += (e - self.E) * m[..., None]

    # Shapes (pixel coordinates). Each returns a soft 0..1 mask and a bevel profile.
    def rect(self, x0, y0, x1, y1, soft=1.5):
        d = np.maximum(np.maximum(x0 - self.x, self.x - x1), np.maximum(y0 - self.y, self.y - y1))
        return np.clip(0.5 - d / soft, 0, 1), -d

    def rrect(self, x0, y0, x1, y1, r, soft=1.5):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        hx, hy = (x1 - x0) / 2 - r, (y1 - y0) / 2 - r
        qx, qy = np.abs(self.x - cx) - hx, np.abs(self.y - cy) - hy
        d = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r
        return np.clip(0.5 - d / soft, 0, 1), -d

    def disc(self, cx, cy, r, soft=1.5):
        d = np.sqrt((self.x - cx) ** 2 + (self.y - cy) ** 2) - r
        return np.clip(0.5 - d / soft, 0, 1), -d

    def block(self, shape, top, bevel, albedo, spec=0.2, base=None):
        """Raised block: height ramps from the surroundings up to `top` over `bevel` px."""
        m, inside = shape
        prof = np.clip(inside / max(bevel, 1e-3), 0, 1)
        start = self.H if base is None else base
        h = start + (top - start) * np.sqrt(prof)
        self.H = self.H * (1 - m) + h * m
        self.paint(m, albedo=albedo, spec=spec)
        return m

    def shade(self, ambient=0.42, shadow=0.55, ao=0.6, exposure=1.0):
        H = self.H
        gy, gx = np.gradient(H)
        n = np.dstack([-gx, gy, np.ones_like(H)])        # image y points down: flip for "north"
        n /= np.linalg.norm(n, axis=2, keepdims=True)
        ndl = np.clip((n * LIGHT).sum(2), 0, 1)
        # Height-field shadows: step toward the light and see if anything rises above the ray.
        d2 = np.array([LIGHT[0], -LIGHT[1]])
        d2n = d2 / np.linalg.norm(d2)
        rise = LIGHT[2] / np.linalg.norm(LIGHT[:2])
        lit = np.ones_like(H)
        for k in range(1, 64, 2):
            dx, dy = int(round(d2n[0] * k)), int(round(d2n[1] * k))
            sh = np.full_like(H, -1e9)
            ys = slice(max(0, -dy), self.h - max(0, dy))
            xs = slice(max(0, -dx), self.w - max(0, dx))
            ys2 = slice(max(0, dy), self.h - max(0, -dy) if dy < 0 else self.h)
            xs2 = slice(max(0, dx), self.w - max(0, -dx) if dx < 0 else self.w)
            sh[ys, xs] = H[ys2, xs2]
            occ = sh - (H + k * rise)
            lit = np.minimum(lit, np.clip(1 - occ / 3.0, 0, 1))
        lit = blur(lit, 1.2)
        occl = np.clip((blur(H, 10) - H) / 10, 0, 1)
        diffuse = ambient * (1 - ao * occl) + ndl * (1 - shadow * (1 - lit))
        half = LIGHT + np.array([0, 0, 1.0])
        half /= np.linalg.norm(half)
        spec = np.clip((n * half).sum(2), 0, 1) ** 40 * self.S * lit
        rgb = self.A * diffuse[..., None] + spec[..., None] + self.E
        rgb = rgb * exposure
        # Emissive glow bleeds onto nearby surfaces.
        if self.E.max() > 0:
            rgb += blur(self.E, 10) * 0.6
        return (np.clip(rgb, 0, 1) ** (1 / 1.1) * 255).round().astype(np.uint8)


def tile_center(tx, ty):
    return (tx + 0.5) * T, (ty + 0.5) * T


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim:
        t = t[..., None]
    return np.asarray(a, np.float32) * (1 - t) + np.asarray(b, np.float32) * t


def palette_map(v, stops):
    """Maps v (0..1) through colour stops [(pos, (r, g, b)), ...]."""
    out = np.zeros(v.shape + (3,), np.float32)
    pos = [s[0] for s in stops]
    for c in range(3):
        out[..., c] = np.interp(v, pos, [s[1][c] for s in stops])
    return out


def gate_mask(c, ends, depth=0.45):
    """Mask for entrance/exit cells on the map edge (wall-coded like maps.ts)."""
    tw, th = c.w // T, c.h // T
    m = np.zeros((c.h, c.w), np.float32)
    for code in ends:
        wall, off = code >> 8, code & 255
        if wall == 1:
            r = c.rect(c.w - depth * T, off * T + 10, c.w + 5, (off + 1) * T - 10, 6)
        elif wall == 3:
            r = c.rect(-5, off * T + 10, depth * T, (off + 1) * T - 10, 6)
        elif wall == 2:
            r = c.rect(off * T + 10, -5, (off + 1) * T - 10, depth * T, 6)
        else:
            r = c.rect(off * T + 10, c.h - depth * T, (off + 1) * T - 10, c.h + 5, 6)
        m = np.maximum(m, r[0])
    return m


def edge_band(c, width):
    """1 near the map edge, falling to 0 `width` px inside."""
    d = np.minimum(np.minimum(c.x, c.w - c.x), np.minimum(c.y, c.h - c.y))
    return 1 - smoothstep(0, width, d)


# ---- Basic: meadow with a boulder wall, pines, a bulkhead wall east and water to the south ------

# Water areas in world px (x0, y0, x1, y1); maps.ts places the animated overlays on the same rects.
WATER_BOTTOM = (0, 790, 1340, 840)
WATER_SIDE = (0, 500, 56, 790)
EAST_WALL_X = 1340
# (x, y, radius) in world px.
BASIC_PINES = ((24, 75, 23), (60, 55, 18), (20, 135, 26), (48, 108, 15), (30, 195, 20), (54, 170, 14),
               (16, 250, 19), (42, 232, 13), (26, 300, 21), (52, 285, 14), (14, 352, 17), (40, 340, 13),
               (24, 398, 15))


def basic_water_mask(c):
    """Irregular shoreline kept inside the WATER_* rects."""
    wob = fbm(c.w, c.h, 40, 9, 3)
    wob = (wob - wob.min()) / np.ptp(wob)
    x0, y0, x1, y1 = (v * PPU for v in WATER_BOTTOM)
    bottom = smoothstep(0, 3, c.y - (y0 + (4 + wob * 28))) * (c.x < x1)
    sx0, sy0, sx1, sy1 = (v * PPU for v in WATER_SIDE)
    side = smoothstep(0, 3, (sx1 - (4 + wob * 28)) - c.x) * smoothstep(0, 3, c.y - (sy0 + (4 + wob * 28)))
    return np.clip(np.maximum(bottom, side), 0, 1).astype(np.float32)


def basic_level():
    c = Canvas(20, 12)
    n = fbm(c.w, c.h, 180, 1)
    fine = fbm(c.w, c.h, 6, 2, 3)
    blades = value_noise(c.w, c.h, 2, 3)
    grass = palette_map(np.clip(n * 1.3 - 0.15 + (blades - 0.5) * 0.25, 0, 1),
                        [(0, (0.12, 0.26, 0.07)), (0.5, (0.24, 0.48, 0.12)), (1, (0.44, 0.66, 0.2))])
    dirt = palette_map(fine, [(0, (0.22, 0.14, 0.08)), (1, (0.4, 0.28, 0.17))])
    patches = smoothstep(0.64, 0.72, fbm(c.w, c.h, 260, 4) + (fine - 0.5) * 0.15)
    # Bare-earth rim around the meadow (wider along the south shore and west edge).
    edge_d = np.minimum(np.minimum(c.x - 30, (EAST_WALL_X * PPU) - c.x), np.minimum(c.y - 60, c.h - c.y))
    rim = 1 - smoothstep(10, 46 + (fine - 0.5) * 30, edge_d)
    bare = np.maximum(patches * 0.85, rim)
    c.A[:] = mix(grass, dirt, bare)
    c.H[:] = blades * 2.0 * (1 - bare) + n * 6
    c.S[:] = 0.05

    # Boulder wall along the north edge.
    rng = np.random.default_rng(5)
    x = -20.0
    while x < EAST_WALL_X * PPU + 40:
        r = rng.uniform(26, 66)
        cy = rng.uniform(-10, 26)
        rock = c.disc(x + r * 0.8, cy, r, 2)
        tex = fbm(c.w, c.h, 18, int(x) % 997 + 6, 3)
        prof = np.sqrt(np.clip(1 - ((c.x - x - r * 0.8) ** 2 + (c.y - cy) ** 2) / (r * r), 0, 1))
        top = 30 + prof * (r * 0.9) + tex * 6
        m = rock[0]
        c.H = np.where(m > 0, np.maximum(c.H, top * m + c.H * (1 - m)), c.H)
        tone = rng.uniform(-0.08, 0.06)
        col = palette_map(np.clip(tex * 0.75 + prof * 0.25 + tone, 0, 1),
                          [(0, (0.2, 0.2, 0.22)), (0.5, (0.42, 0.42, 0.43)), (1, (0.62, 0.62, 0.6))])
        c.paint(m, albedo=col, spec=0.12)
        x += r * 1.35

    # Pines down the west edge, from the boulders to the gate and between the gate and the water.
    for (tx, ty, r) in BASIC_PINES:
        tx, ty, r = tx * PPU, ty * PPU, r * PPU   # world px -> image px
        d = np.sqrt((c.x - tx) ** 2 + (c.y - ty) ** 2)
        ang = np.arctan2(c.y - ty, c.x - tx)
        frond = r * (0.78 + 0.22 * np.abs(np.sin(ang * 6)))
        m = smoothstep(frond, frond - 3, d)
        cone = (1 - d / r).clip(0, 1) * 70 + 20
        c.H = np.maximum(c.H, cone * m)
        shade = np.clip(1 - d / r, 0, 1)
        c.paint(m, albedo=mix((0.03, 0.12, 0.05), (0.12, 0.32, 0.12), shade), spec=0.04)

    # Water with a wet, darker shore.
    water = basic_water_mask(c)
    shore = np.clip(blur(water, 10) * 2.2, 0, 1) * (1 - water)
    c.paint(shore * 0.75, albedo=(0.12, 0.09, 0.07))
    depth = blur(water, 16)
    ripple = fbm(c.w, c.h, 14, 10, 3)
    c.H = c.H * (1 - water) + (-8 + ripple * 1.5) * water
    c.paint(water, albedo=mix((0.08, 0.24, 0.36), (0.03, 0.11, 0.21), depth), spec=0.9)

    # East bulkhead wall with blue lights, open at the exit (row 6).
    wx = EAST_WALL_X * PPU
    gap = (c.y > 6 * T + 6) & (c.y < 7 * T - 6)
    wall_m, wall_in = c.rect(wx, -10, c.w + 10, c.h + 10, 2)
    c.block((wall_m * ~gap, wall_in), 64, 10, (0.36, 0.38, 0.43), 0.6)
    for k in range(12):
        y0 = k * T + 14
        seg_m, seg_in = c.rrect(wx + 10, y0, c.w - 8, y0 + T - 28, 8)
        c.block((seg_m * ~gap, seg_in), 72, 6, (0.5, 0.53, 0.58), 0.7)
        if not (5 * T < y0 < 8 * T):
            lamp = c.rect(wx + 4, y0 + 24, wx + 14, y0 + 60, 1.5)[0]
            c.paint(lamp, albedo=(0, 0, 0), emit=(0.2, 0.45, 1.0))
    # Base entrance: a large concrete pad in front of a dark, lit tunnel flanked by two gate towers.
    gy0, gy1 = 6 * T, 7 * T
    px0, cw = wx - 2.6 * T, 1.3 * T
    pad = c.rrect(px0, 2.5 * T, wx + 20, 10.5 * T, 8, 2)
    # Slabs laid in a running bond, each with its own tone, plus weathering stains.
    col = np.floor((c.x - px0) / cw)
    row = np.floor((c.y + np.mod(col, 2) * T / 2) / T)
    slab = np.mod(np.sin(col * 12.9898 + row * 78.233) * 43758.5, 1)
    stain = fbm(c.w, c.h, 60, 41, 4)
    grit = fbm(c.w, c.h, 3, 42, 2)
    tone = np.clip(0.45 + (slab - 0.5) * 0.25 + (grit - 0.5) * 0.35 - smoothstep(0.55, 0.75, stain) * 0.2, 0, 1)
    concrete = palette_map(tone, [(0, (0.28, 0.27, 0.25)), (0.5, (0.5, 0.5, 0.48)), (1, (0.66, 0.66, 0.63))])
    c.block(pad, 6, 4, concrete, 0.12)
    rust = smoothstep(0.62, 0.8, fbm(c.w, c.h, 30, 43, 4)) * pad[0]
    c.paint(rust * 0.3, albedo=(0.36, 0.2, 0.1))
    seam_x = np.mod(c.x - px0, cw) < 4
    seam_y = np.mod(c.y + np.mod(col, 2) * T / 2, T) < 4
    seams = (seam_x | seam_y) * (pad[1] > 8)
    c.paint(seams * 0.85, albedo=(0.16, 0.16, 0.15), height=4)
    edge = (pad[1] > 0) & (pad[1] < 8)
    c.paint(edge * 0.9, albedo=(0.62, 0.62, 0.6))
    # Drain grates on either side of the approach.
    for gy in (4.5 * T, 8.5 * T):
        grate_m, grate_in = c.rrect(px0 + 0.15 * T, gy - 34, px0 + 1.15 * T, gy + 34, 6)
        c.paint(grate_m, albedo=(0.22, 0.22, 0.23), height=3, spec=0.4)
        slots = (np.mod(c.x, 12) < 5) * (grate_in > 6)
        c.paint(slots, albedo=(0.04, 0.04, 0.05), height=0)
    tunnel = c.rect(wx + 12, gy0 + 2, c.w + 10, gy1 - 2, 3)[0]
    fade = smoothstep(wx + 10, c.w, c.x)
    c.paint(tunnel, albedo=mix((0.2, 0.21, 0.24), (0.02, 0.02, 0.03), fade), height=4, spec=0.3)
    track = (np.mod(c.x - wx, 22) < 4) * tunnel
    c.paint(track * (1 - fade) * 0.6, albedo=(0.08, 0.08, 0.1))
    for sgn, yy in ((-1, gy0), (1, gy1)):
        cy = yy + sgn * 40
        tower = c.rrect(wx - 56, cy - 38, c.w + 10, cy + 38, 12)
        c.block(tower, 92, 8, (0.42, 0.45, 0.5), 0.7)
        cap = c.rrect(wx - 44, cy - 26, wx + 40, cy + 26, 10)
        c.block(cap, 104, 5, (0.3, 0.32, 0.36), 0.6)
        vent = (np.mod(c.x - wx, 14) < 6) * c.rect(wx + 56, cy - 18, c.w - 12, cy + 18, 1)[0]
        c.paint(vent * 0.8, albedo=(0.2, 0.21, 0.24))
        lamp = c.disc(wx - 2, cy, 11)[0]
        c.paint(lamp, albedo=(0, 0, 0), emit=(0.25, 0.55, 1.0))
    # Door slot in the tunnel mouth and a lit strip overhead.
    c.paint(c.rect(wx + 12, gy0 + 2, wx + 18, gy1 - 2, 1)[0], albedo=(0.55, 0.45, 0.12))
    c.paint(c.rect(wx + 30, gy0 + 20, wx + 36, gy1 - 20, 1)[0], albedo=(0, 0, 0), emit=(0.25, 0.55, 1.0))

    # West gate: a gravel path mouth with marker lamps.
    for yy in (6 * T + 18, 7 * T - 18):
        lamp = c.disc(16, yy, 6)[0]
        c.paint(lamp, albedo=(0, 0, 0), emit=(0.35, 1.0, 0.45))
    c.water_mask = water
    return c


def water_frame(c, water, t):
    """Moving glints and lapping foam over the water, as an RGBA overlay; t in [0, 1)."""
    x, y = c.x, c.y
    k = math.tau
    w1 = np.sin(x / 31.0 + y / 9.0 - k * t * 2) * np.sin(x / 17.0 - y / 23.0 + k * t)
    w2 = np.sin(x / 13.0 - y / 7.0 + k * t * 3) * np.sin(y / 11.0 + k * t * 2)
    w3 = np.sin(x / 7.0 + y / 5.0 - k * t * 4)
    # Sparse, irregular sun glints: interference peaks broken up by static noise.
    grain = fbm(c.w, c.h, 10, 78, 3)
    glint = smoothstep(0.84, 0.98, 0.5 + 0.3 * w1 + 0.25 * w2 + 0.12 * w3 + (grain - 0.5) * 0.5) * water * 0.35
    edge = np.clip(water - blur(water, 6), 0, 1) * 3       # just inside the shoreline
    lap = 0.5 + 0.5 * np.sin(k * t + x / 40.0 + y / 40.0)
    foam = np.clip(edge, 0, 1) * (0.35 + 0.65 * lap) * smoothstep(0.2, 0.6, fbm(c.w, c.h, 8, 77, 2) + lap * 0.3)
    a = np.clip(glint * 0.7 + foam * 0.35, 0, 1)
    rgb = np.ones(a.shape + (3,), np.float32) * np.array([0.85, 0.93, 1.0], np.float32)
    return np.dstack([rgb * 255, a * 255]).round().clip(0, 255).astype(np.uint8)


# ---- Ruins: sandstone pavers and dry grass, crumbled walls with four gates --------------------------

def paver_field(c, seed, cell, base_cols, gap_col, jitter=0.25):
    """Irregular stone slabs (tiles of `cell` px with random offsets and tilt)."""
    rng = np.random.default_rng(seed)
    gx = (c.x // cell).astype(int)
    gy = (c.y // cell).astype(int)
    fx = c.x / cell - gx
    fy = c.y / cell - gy
    ncell = (gx.max() + 2) * (gy.max() + 2)
    shade = rng.random(ncell).astype(np.float32)
    tilt_x = (rng.random(ncell).astype(np.float32) - 0.5) * 6
    tilt_y = (rng.random(ncell).astype(np.float32) - 0.5) * 6
    idx = gy * (gx.max() + 2) + gx
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy)) * cell
    slab = smoothstep(1, 4, edge)
    col = mix(base_cols[0], base_cols[1], shade[idx])
    c.A[:] = mix(gap_col, col, slab)
    c.H[:] = slab * (5 + tilt_x[idx] * (fx - 0.5) + tilt_y[idx] * (fy - 0.5))
    c.S[:] = 0.1
    return slab


def cross_level():
    c = Canvas(20, 12)
    paver_field(c, 11, T // 2, ((0.48, 0.36, 0.22), (0.66, 0.5, 0.31)), (0.32, 0.24, 0.15))
    grit = fbm(c.w, c.h, 8, 12, 3)
    c.A *= (0.85 + grit * 0.3)[..., None]
    # Cracks.
    cr = np.abs(fbm(c.w, c.h, 90, 13, 4) - 0.5)
    crack = 1 - smoothstep(0.004, 0.012, cr)
    c.paint(crack * 0.8, albedo=(0.15, 0.1, 0.06))
    c.H -= crack * 3
    # Dry grass drifts.
    drift = smoothstep(0.55, 0.68, fbm(c.w, c.h, 220, 14))
    straw = value_noise(c.w, c.h, 2, 15)
    tuft = drift * smoothstep(0.35, 0.8, straw + fbm(c.w, c.h, 14, 16, 2) * 0.4)
    c.paint(tuft, albedo=palette_map(straw, [(0, (0.55, 0.45, 0.12)), (1, (0.92, 0.8, 0.32))]))
    c.H += tuft * 4
    # Crumbled walls along the north and south edges, open at the gates.
    gates = gate_mask(c, [774, 262, 522, 1034], 0.6)
    for y0, y1 in ((0, T * 0.34), (c.h - T * 0.34, c.h)):
        wall = c.rect(-10, y0, c.w + 10, y1, 3)
        rough = fbm(c.w, c.h, 30, 17, 3)
        m = wall[0] * (1 - gates) * smoothstep(0.2, 0.5, rough + 0.2)
        c.H = np.maximum(c.H, m * (30 + rough * 18))
        c.paint(m, albedo=palette_map(rough, [(0, (0.42, 0.33, 0.22)), (1, (0.7, 0.58, 0.4))]), spec=0.1)
    # Broken columns at the corners and beside the gates.
    for tx, ty in ((0.5, 0.5), (19.5, 0.5), (0.5, 11.5), (19.5, 11.5), (9.2, 0.3), (10.8, 0.3), (9.2, 11.7), (10.8, 11.7)):
        col = c.disc(tx * T, ty * T, T * 0.22, 2)
        c.block(col, 46, 8, (0.62, 0.52, 0.36), 0.15)
        ring = c.disc(tx * T, ty * T, T * 0.15, 2)
        c.paint(ring[0], albedo=(0.5, 0.41, 0.28))
    return c


# ---- Factory: steel deck with hazard borders and three gates each side ---------------------------

def deck_plates(c, seed, cell=T, base=(0.36, 0.38, 0.42)):
    rng = np.random.default_rng(seed)
    gx = (c.x // cell).astype(int)
    gy = (c.y // cell).astype(int)
    fx = c.x / cell - gx
    fy = c.y / cell - gy
    idx = gy * 64 + gx
    shade = (rng.random(64 * 64) * 0.2 + 0.9).astype(np.float32)[idx]
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy)) * cell
    seam = smoothstep(1.5, 4, edge)
    brushed = value_noise(c.w, c.h, 1, seed + 1) * 0.08 + fbm(c.w, c.h, 60, seed + 2, 3) * 0.12
    c.A[:] = np.asarray(base, np.float32) * (shade + brushed - 0.06)[..., None]
    c.A *= (0.45 + 0.55 * seam)[..., None]
    c.H[:] = seam * 3
    c.S[:] = 0.45
    # Rivets near each plate corner.
    for ox in (0.1, 0.9):
        for oy in (0.1, 0.9):
            r = np.sqrt(((fx - ox) * cell) ** 2 + ((fy - oy) * cell) ** 2)
            m = smoothstep(4, 2.5, r)
            c.H += m * 2
            c.paint(m * 0.6, albedo=(0.6, 0.62, 0.66))
    return fx, fy


def hazard(c, mask, scale=24):
    stripe = (np.floor((c.x + c.y) / scale) % 2).astype(np.float32)
    col = mix((0.08, 0.08, 0.08), (0.9, 0.7, 0.08), stripe)
    c.paint(mask, albedo=col, spec=0.3)


def threeway_level():
    c = Canvas(20, 12)
    deck_plates(c, 21)
    # Floor grates in a few interior plates.
    rng = np.random.default_rng(22)
    for _ in range(14):
        tx, ty = rng.integers(2, 18), rng.integers(1, 11)
        if ty in (3, 6, 9) and rng.random() < 0.7:
            continue
        g = c.rect(tx * T + 18, ty * T + 18, (tx + 1) * T - 18, (ty + 1) * T - 18, 1.5)[0]
        bars = (np.mod(c.x, 10) < 5).astype(np.float32)
        c.paint(g, albedo=mix((0.04, 0.04, 0.05), (0.3, 0.31, 0.34), bars))
        c.H -= g * (6 - bars * 3)
    # Raised walkways (lanes) at the three gate rows, with guide lights.
    for row in (3, 6, 9):
        lane = c.rect(0, row * T + 8, c.w, (row + 1) * T - 8, 1.5)
        c.H += lane[0] * 2
        c.paint(lane[0] * 0.5, albedo=(0.28, 0.3, 0.34))
        for tx in range(20):
            for yy in (row * T + 14, (row + 1) * T - 14):
                l = c.disc(tx * T + T / 2, yy, 3.5)[0]
                c.paint(l, albedo=(0, 0, 0), emit=(0.3, 0.6, 1.0))
    # Machinery walls on the north and south edges.
    for y0, y1 in ((0, T * 0.3), (c.h - T * 0.3, c.h)):
        wall = c.rect(-10, y0, c.w + 10, y1, 2)
        c.block(wall, 34, 6, (0.22, 0.23, 0.26), 0.5)
        for tx in range(20):
            box_ = c.rrect(tx * T + 16, y0 + 8, (tx + 1) * T - 16, y1 - 8, 6)
            c.block(box_, 40, 4, (0.3, 0.32, 0.36), 0.6)
            lamp = c.disc(tx * T + T / 2, (y0 + y1) / 2, 5)[0]
            c.paint(lamp, albedo=(0, 0, 0), emit=((0.3, 1.0, 0.4) if tx % 3 else (1.0, 0.3, 0.2)))
    hz = np.maximum(c.rect(0, T * 0.3, c.w, T * 0.42, 1)[0], c.rect(0, c.h - T * 0.42, c.w, c.h - T * 0.3, 1)[0])
    hazard(c, hz)
    # Gate frames on the side walls.
    for code in (771, 774, 777, 259, 262, 265):
        side, row = code >> 8, code & 255
        x0 = 0 if side == 3 else c.w - 22
        for yy in (row * T + 4, (row + 1) * T - 18):
            post = c.rect(x0, yy, x0 + 22, yy + 14, 1.5)
            c.block(post, 30, 3, (0.2, 0.21, 0.24), 0.5)
        hazard(c, c.rect(x0, row * T + 18, x0 + 22, (row + 1) * T - 18, 1)[0])
    return c


# ---- Courtyard: tiled plaza around a lawn, gatehouses with archways -------------------------------

COURTYARD_ARCHES = [  # (sprite id, x, y, w, h) in world px, from maps.ts
    ('courtyard_ne_overlay', 70 * 15 + 1, 0, 32, 63),
    ('courtyard_nw_overlay', (70 * 9) // 2 + 1, 0, 32, 63),
    ('courtyard_sw_overlay', (70 * 17) // 4 + 3, 70 * 11 + 3, 45, 65),
    ('courtyard_se_overlay', 70 * 15 + 2, 70 * 11 + 3, 45, 65),
]


def courtyard_level():
    c = Canvas(20, 12)
    # Plaza flagstones (two tiles per map tile), cool grey-blue.
    rng = np.random.default_rng(31)
    cell = T // 2
    gx, gy = (c.x // cell).astype(int), (c.y // cell).astype(int)
    fx, fy = c.x / cell - gx, c.y / cell - gy
    shade = rng.random(4096).astype(np.float32)[gy * 64 + gx]
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy)) * cell
    seam = smoothstep(1.5, 4.5, edge)
    marble = fbm(c.w, c.h, 50, 32, 4)
    c.A[:] = mix((0.42, 0.47, 0.55), (0.62, 0.67, 0.74), shade * 0.5 + marble * 0.5) * (0.4 + 0.6 * seam)[..., None]
    c.H[:] = seam * 3
    c.S[:] = 0.35
    # Central lawn with a stone kerb.
    kerb = c.rect(6 * T - 10, 4 * T - 10, 14 * T + 10, 8 * T + 10, 2)
    c.block(kerb, 7, 3, (0.7, 0.72, 0.75), 0.3)
    lawn = c.rect(6 * T, 4 * T, 14 * T, 8 * T, 2)[0]
    blades = value_noise(c.w, c.h, 2, 33)
    c.paint(lawn, albedo=palette_map(np.clip(fbm(c.w, c.h, 60, 34) + (blades - 0.5) * 0.4, 0, 1),
                                     [(0, (0.08, 0.22, 0.08)), (1, (0.25, 0.5, 0.18))]), spec=0.03)
    c.H = np.where(lawn > 0.5, 6 + blades * 2, c.H)
    # Planters (the four obstacles), each 2x1 tiles: hedge boxes.
    for ox, oy in ((4, 4), (14, 4), (4, 7), (14, 7)):
        box_ = c.rrect(ox * T + 6, oy * T + 8, (ox + 2) * T - 6, (oy + 1) * T - 8, 10)
        c.block(box_, 26, 5, (0.46, 0.48, 0.5), 0.3)
        hedge = c.rrect(ox * T + 16, oy * T + 18, (ox + 2) * T - 16, (oy + 1) * T - 18, 14)
        leaf = fbm(c.w, c.h, 6, 35 + ox + oy, 3)
        c.block(hedge, 40, 14, palette_map(leaf, [(0, (0.06, 0.2, 0.06)), (1, (0.2, 0.45, 0.14))]), 0.05)
        c.H += hedge[0] * leaf * 5
    # Perimeter colonnade wall (north & south), gatehouses at the four gate columns.
    for y0, y1 in ((0, T * 0.36), (c.h - T * 0.36, c.h)):
        wall = c.rect(-10, y0, c.w + 10, y1, 2)
        c.block(wall, 38, 5, (0.5, 0.54, 0.6), 0.3)
        for tx in range(20):
            pil = c.disc(tx * T + T / 2, (y0 + y1) / 2, 15)
            c.block(pil, 48, 4, (0.66, 0.7, 0.76), 0.5)
            lamp = c.disc(tx * T + T / 2, (y0 + y1) / 2, 5)[0]
            c.paint(lamp, albedo=(0, 0, 0), emit=(1.0, 0.85, 0.5))
    # Open the gates (N4, N10, N15; S4, S10, S15) and the side gates (W6, E6).
    for col in (4, 10, 15):
        for y0, y1 in ((0, T * 0.36), (c.h - T * 0.36, c.h)):
            g = c.rect(col * T + 8, y0 - 2, (col + 1) * T - 8, y1 + 2, 2)[0]
            c.H = c.H * (1 - g) + 3 * g
            c.paint(g, albedo=(0.36, 0.4, 0.46))
    for x0, x1 in ((0, T * 0.36), (c.w - T * 0.36, c.w)):
        wall = c.rect(x0, T * 0.36, x1, c.h - T * 0.36, 2)
        c.block(wall, 30, 5, (0.5, 0.54, 0.6), 0.3)
        g = c.rect(x0 - 2, 6 * T + 8, x1 + 2, 7 * T - 8, 2)[0]
        c.H = c.H * (1 - g) + 3 * g
        c.paint(g, albedo=(0.36, 0.4, 0.46))
    # Archway lintels over the four corner-side gates (also exported as overlay sprites).
    arch = np.zeros((c.h, c.w), np.float32)
    for sid, x, y, w, h in COURTYARD_ARCHES:
        x0, y0, x1, y1 = x * PPU, y * PPU, (x + w) * PPU, (y + h) * PPU
        span = c.rrect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, 8)
        c.block(span, 70, 6, (0.72, 0.75, 0.8), 0.5)
        stripe = c.rect(x0 + 8, y0 + 8, x1 - 8, y1 - 8, 1.5)[0] * ((np.mod(c.y, 24) < 4).astype(np.float32))
        c.paint(stripe * 0.7, albedo=(0.45, 0.48, 0.55))
        gem = c.disc((x0 + x1) / 2, (y0 + y1) / 2, 6)[0]
        c.paint(gem, albedo=(0, 0, 0), emit=(0.3, 0.7, 1.0))
        arch = np.maximum(arch, span[0])
    c.overlay_mask = arch
    return c


# ---- VR Training: dark floor, cyan grid, violet frame ---------------------------------------------

VR_FLOOR = (0.04, 0.05, 0.1)


def vr_floor(c, grid=True):
    v = fbm(c.w, c.h, 400, 41, 3)
    c.A[:] = np.asarray(VR_FLOOR, np.float32) * (0.8 + v * 0.5)[..., None]
    c.S[:] = 0.6
    if grid:
        fx = np.mod(c.x, T)
        fy = np.mod(c.y, T)
        d = np.minimum(np.minimum(fx, T - fx), np.minimum(fy, T - fy))
        line = smoothstep(2.5, 0.8, d)
        halo = smoothstep(14, 0, d) * 0.25
        c.paint(line, albedo=(0.05, 0.2, 0.25), emit=(0.15, 0.7, 0.85))
        c.E += halo[..., None] * np.array([0.02, 0.12, 0.16], np.float32)


def mixer_level():
    c = Canvas(20, 12)
    vr_floor(c)
    # Centre glow.
    g = np.exp(-(((c.x - c.w / 2) / (c.w * 0.5)) ** 2 + ((c.y - c.h / 2) / (c.h * 0.5)) ** 2))
    c.E += g[..., None] * np.array([0.03, 0.04, 0.09], np.float32)
    # Frame: bevelled violet segments around the outer half tile.
    frame = edge_band(c, T * 0.32)
    m = (frame > 0.5).astype(np.float32)
    c.block((m, (frame - 0.5) * 40), 14, 6, (0.18, 0.08, 0.28), 0.6)
    seg = (np.mod(c.x, T) < 6) | (np.mod(c.y, T) < 6)
    c.paint(m * seg, albedo=(0, 0, 0), emit=(0.7, 0.3, 1.0))
    inner = smoothstep(0.45, 0.5, frame) * (1 - smoothstep(0.5, 0.56, frame))
    c.paint(inner, emit=(0.8, 0.4, 1.0))
    return c


def vr_tile(kind, tw=1, th=1, side=None):
    """Opaque VR decoration tile (obstacle blocks, path, entrance/exit)."""
    c = Canvas(tw, th)
    vr_floor(c)
    colors = {
        '1x1': (0.25, 1.0, 0.45), '1x2': (1.0, 0.55, 0.15), '2x1': (1.0, 0.55, 0.15),
        '2x2': (0.85, 0.3, 1.0), 'path': (0.3, 0.75, 1.0),
    }
    if kind in colors:
        col = np.asarray(colors[kind], np.float32)
        if kind == 'path':
            pad = c.rect(6, 6, c.w - 6, c.h - 6, 2)
            c.paint(pad[0], albedo=col * 0.12, emit=col * 0.08)
            rim = pad[0] * (1 - c.rect(12, 12, c.w - 12, c.h - 12, 2)[0])
            c.paint(rim, emit=col * 0.9)
            arrow = c.disc(c.w / 2, c.h / 2, 10)[0]
            c.paint(arrow, emit=col * 0.6)
        else:
            outer = c.rrect(8, 8, c.w - 8, c.h - 8, 6)
            c.block(outer, 30, 18, col * 0.18, 0.9)
            face = c.rrect(26, 26, c.w - 26, c.h - 26, 4)[0]
            c.paint(face, albedo=col * 0.25, emit=col * 0.12)
            edge = outer[0] * (1 - c.rrect(12, 12, c.w - 12, c.h - 12, 6)[0])
            bevel_edge = c.rrect(24, 24, c.w - 24, c.h - 24, 4)[0] * (1 - c.rrect(28, 28, c.w - 28, c.h - 28, 4)[0])
            c.paint(np.maximum(edge, bevel_edge), emit=col)
            # Diagonal bevel highlights.
            for (ax, ay) in ((0, 0), (c.w, 0), (0, c.h), (c.w, c.h)):
                d = np.abs((c.x - ax) * (1 if ax == 0 else -1) - (c.y - ay) * (1 if ay == 0 else -1))
                near = (np.abs(c.x - ax) < 28) & (np.abs(c.y - ay) < 28)
                c.paint(smoothstep(2.0, 0.5, d) * near * outer[0], emit=col * 0.8)
    else:
        green = kind == 'entrance'
        col = np.asarray((0.25, 1.0, 0.45) if green else (1.0, 0.2, 0.3), np.float32)
        # Glow pouring in from the map edge on `side`.
        dist = {'w': c.x, 'e': c.w - c.x, 'n': c.y, 's': c.h - c.y}[side]
        along = {'w': c.y, 'e': c.y, 'n': c.x, 's': c.x}[side]
        g = np.exp(-(dist / (T * 0.28)) ** 2) * np.exp(-((along - T / 2) / (T * 0.38)) ** 2)
        c.E += g[..., None] * col
        bar = (dist < 6) * (np.abs(along - T / 2) < T * 0.36)
        c.paint(bar.astype(np.float32), emit=col)
        # Chevrons pointing into the map (entrance) or out (exit).
        for k in range(2):
            t = (0.25 + 0.22 * k) * T
            # Entrance chevrons point away from the edge (apex inward); exit chevrons toward it.
            slope = np.abs(along - T / 2) * 0.6
            chev = np.abs(dist - t + (slope if green else -slope)) < 3
            chev &= np.abs(along - T / 2) < T * 0.22
            c.paint(chev.astype(np.float32) * 0.9, emit=col * (0.9 - 0.3 * k))
    return c


# ---- Roadway: tall platform of steel decks over open space ---------------------------------------

ROAD_OBSTACLES = [(3, 1, 1, 1), (6, 1, 1, 2), (2, 3, 1, 1), (5, 3, 1, 1), (3, 4, 2, 1), (2, 5, 1, 1), (3, 6, 2, 1),
                  (6, 6, 2, 1), (2, 7, 1, 1), (5, 7, 1, 1), (1, 9, 1, 1), (4, 9, 1, 1), (6, 9, 1, 1), (2, 10, 1, 1),
                  (5, 10, 1, 1), (2, 11, 4, 1), (6, 12, 1, 1), (2, 13, 4, 1), (2, 14, 1, 1), (5, 14, 1, 1),
                  (1, 15, 1, 1), (3, 15, 1, 1), (6, 15, 1, 1), (2, 17, 1, 1), (5, 17, 1, 1), (3, 18, 1, 1),
                  (6, 18, 2, 1), (2, 19, 1, 1), (4, 19, 2, 1), (3, 20, 1, 1), (2, 21, 4, 1), (6, 22, 1, 3),
                  (1, 23, 2, 1), (2, 24, 1, 1)]
ROAD_STARS = [(0, 0, 2, 1), (6, 0, 3, 1), (0, 1, 1, 2), (6, 1, 1, 2), (8, 1, 1, 1), (8, 5, 1, 8), (0, 8, 1, 9),
              (2, 11, 1, 1), (5, 11, 1, 1), (2, 14, 1, 1), (5, 14, 1, 1), (8, 20, 1, 6), (3, 21, 1, 1),
              (0, 22, 1, 4), (6, 23, 1, 3), (2, 24, 1, 2)]


def roadway_level():
    c = Canvas(9, 26)
    deck_plates(c, 51, base=(0.34, 0.36, 0.4))
    c.H += 20
    # Holes to open space (the game draws stars there); give them dark recessed rims.
    void = np.zeros((c.h, c.w), np.float32)
    for x, y, w, h in ROAD_STARS:
        void = np.maximum(void, c.rect(x * T, y * T, (x + w) * T, (y + h) * T, 1.5)[0])
    rim = blur(void, 6)
    c.paint(np.clip(rim * 1.6, 0, 1), albedo=(0.12, 0.13, 0.15))
    c.H -= void * 20
    c.paint(void, albedo=(0.01, 0.01, 0.03))
    # Obstacles: machinery housings with glowing reactor cores and vents.
    rng = np.random.default_rng(52)
    for x, y, w, h in ROAD_OBSTACLES:
        box_ = c.rrect(x * T + 6, y * T + 6, (x + w) * T - 6, (y + h) * T - 6, 10)
        top = 20 + 30
        c.block(box_, top, 8, (0.24, 0.25, 0.29), 0.5)
        lid = c.rrect(x * T + 22, y * T + 22, (x + w) * T - 22, (y + h) * T - 22, 8)
        c.block(lid, top + 6, 4, (0.36, 0.38, 0.43), 0.6)
        for i in range(w):
            for j in range(h):
                cx, cy = (x + i + 0.5) * T, (y + j + 0.5) * T
                kind = rng.integers(0, 3)
                if kind == 0:
                    core = c.disc(cx, cy, 18)
                    c.block(core, top + 10, 6, (0.1, 0.1, 0.12), 0.8)
                    c.paint(c.disc(cx, cy, 11)[0], emit=(1.0, 0.6, 0.15))
                elif kind == 1:
                    core = c.disc(cx, cy, 20)
                    c.block(core, top + 14, 10, (0.55, 0.6, 0.7), 0.8)
                    c.paint(c.disc(cx, cy, 6)[0], emit=(0.35, 0.65, 1.0))
                else:
                    vent = c.rect(cx - 28, cy - 18, cx + 28, cy + 18, 1)[0]
                    slats = (np.mod(c.y, 9) < 4).astype(np.float32)
                    c.paint(vent, albedo=mix((0.05, 0.05, 0.06), (0.3, 0.31, 0.35), slats))
                    c.H -= vent * slats * 3
    # Gate markers north and south (column 4).
    for y0 in (0, c.h - 16):
        hazard(c, c.rect(4 * T + 6, y0, 5 * T - 6, y0 + 16, 1)[0], 16)
    return c


# ---- Sky Tower: stone citadel above the clouds, glowing core -------------------------------------

SKY_OBSTACLES = [(3, 1, 3, 1), (14, 1, 3, 1), (4, 2, 1, 2), (15, 2, 1, 2), (4, 5, 1, 2), (9, 5, 2, 2),
                 (15, 5, 1, 2), (4, 8, 1, 2), (15, 8, 1, 2), (3, 10, 3, 1), (14, 10, 3, 1)]


def skytower_level():
    c = Canvas(20, 12)
    # Clouds below everything.
    cl = fbm(c.w, c.h, 220, 61, 5)
    c.A[:] = palette_map(cl, [(0, (0.45, 0.55, 0.7)), (0.6, (0.78, 0.84, 0.92)), (1, (0.97, 0.98, 1.0))])
    c.H[:] = cl * 10
    c.S[:] = 0.0
    # The deck: rounded slab inset from the map edge, with gates cut to the edges.
    deck = c.rrect(T * 0.18, T * 0.18, c.w - T * 0.18, c.h - T * 0.18, T * 0.6, 3)
    stone = fbm(c.w, c.h, 30, 62, 4)
    moss = smoothstep(0.55, 0.7, fbm(c.w, c.h, 120, 63))
    rng = np.random.default_rng(64)
    cell = T // 2
    gx, gy = (c.x // cell).astype(int), (c.y // cell).astype(int)
    fx, fy = c.x / cell - gx, c.y / cell - gy
    shade = rng.random(4096).astype(np.float32)[gy * 64 + gx]
    edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy)) * cell
    seam = smoothstep(1.5, 5, edge)
    slab_col = palette_map(stone * 0.6 + shade * 0.4, [(0, (0.4, 0.42, 0.4)), (1, (0.7, 0.72, 0.68))])
    slab_col = mix(slab_col, (0.3, 0.4, 0.22), moss * 0.6) * (0.45 + 0.55 * seam)[..., None]
    c.block(deck, 60, 10, slab_col, 0.15)
    c.H += deck[0] * (seam * 3 + stone * 2)
    for code in (771, 264, 259, 776):
        side, row = code >> 8, code & 255
        x0, x1 = (0, T * 0.8) if side == 3 else (c.w - T * 0.8, c.w)
        bridge = c.rect(x0, row * T + 10, x1, (row + 1) * T - 10, 2)
        c.block(bridge, 60, 4, slab_col, 0.15)
    # Battlements and the core.
    for x, y, w, h in SKY_OBSTACLES:
        if (x, y) == (9, 5):
            ring = c.disc(10 * T, 6 * T, T * 0.92)
            c.block(ring, 82, 8, (0.5, 0.52, 0.5), 0.3)
            pit = c.disc(10 * T, 6 * T, T * 0.68)
            c.H = np.where(pit[0] > 0.5, 64, c.H)
            lava = fbm(c.w, c.h, 18, 65, 4)
            c.paint(pit[0], albedo=(0.1, 0.03, 0.0),
                    emit=palette_map(lava, [(0, (0.6, 0.08, 0.0)), (0.6, (1.0, 0.45, 0.05)), (1, (1.0, 0.9, 0.4))]))
            continue
        b = c.rrect(x * T + 8, y * T + 8, (x + w) * T - 8, (y + h) * T - 8, 12)
        c.block(b, 92, 10, palette_map(stone, [(0, (0.45, 0.47, 0.45)), (1, (0.75, 0.77, 0.73))]), 0.2)
        crenel = (np.mod(c.x + c.y, 46) < 23).astype(np.float32)
        top = c.rrect(x * T + 18, y * T + 18, (x + w) * T - 18, (y + h) * T - 18, 8)[0]
        c.H += top * crenel * 8
    return c


# ---- Export -----------------------------------------------------------------------------------

LEVELS = {
    'basic_level': basic_level,
    'cross_level': cross_level,
    'threeway_level': threeway_level,
    'courtyard_level': courtyard_level,
    'mixer_level': mixer_level,
    'roadway_level': roadway_level,
    'skytower_level': skytower_level,
}


class _Draw:
    """Picklable sprite job for build.py: renders a VR tile or courtyard overlay."""

    def __init__(self, kind, *args):
        self.kind, self.args = kind, args

    def __call__(self, w, h):
        if self.kind == 'vr':
            c = vr_tile(*self.args)
            rgb = c.shade()
            return np.dstack([rgb, np.full(rgb.shape[:2], 255, np.uint8)])
        if self.kind == 'water':
            (x0, y0, x1, y1), t = self.args
            frames = water_source()
            img = frames[int(round(t * len(frames)))]
            return img[y0 * PPU:y1 * PPU, x0 * PPU:x1 * PPU]
        sid, x, y, ow, oh = self.args
        rgb, mask = courtyard_overlay_source()
        x0, y0 = x * PPU, y * PPU
        crop = rgb[y0:y0 + oh * PPU, x0:x0 + ow * PPU]
        a = (mask[y0:y0 + oh * PPU, x0:x0 + ow * PPU] * 255).round().astype(np.uint8)
        return np.dstack([crop, a])


_COURT = None


def courtyard_overlay_source():
    global _COURT
    if _COURT is None:
        c = courtyard_level()
        _COURT = (c.shade(), c.overlay_mask)
    return _COURT


_WATER = None
WATER_FRAMES = 12


def water_source():
    """All water overlay frames for the Basic map (full map size, computed once per process)."""
    global _WATER
    if _WATER is None:
        c = Canvas(20, 12)
        water = basic_water_mask(c)
        _WATER = [water_frame(c, water, f / WATER_FRAMES) for f in range(WATER_FRAMES)]
    return _WATER


def sprite_sheets():
    s = {
        'mixer_1x1': dict(size=(70, 70), frames=[dict(draw=_Draw('vr', '1x1'))]),
        'mixer_1x2': dict(size=(70, 140), frames=[dict(draw=_Draw('vr', '1x2', 1, 2))]),
        'mixer_2x1': dict(size=(140, 70), frames=[dict(draw=_Draw('vr', '2x1', 2, 1))]),
        'mixer_2x2': dict(size=(140, 140), frames=[dict(draw=_Draw('vr', '2x2', 2, 2))]),
        'mixer_path': dict(size=(70, 70), frames=[dict(draw=_Draw('vr', 'path'))]),
    }
    for side in 'nsew':
        s[f'mixer_entrance_{side}'] = dict(size=(70, 70), frames=[dict(draw=_Draw('vr', 'entrance', 1, 1, side))])
        s[f'mixer_exit_{side}'] = dict(size=(70, 70), frames=[dict(draw=_Draw('vr', 'exit', 1, 1, side))])
    # The south strip is split in two so no sheet is wider than 2048 px.
    bx0, by0, bx1, by1 = WATER_BOTTOM
    half = (bx1 - bx0) // 2
    for sid, x0 in (('water_bottom_w', bx0), ('water_bottom_e', bx0 + half)):
        s[sid] = dict(size=(half, by1 - by0), frames=[
            dict(draw=_Draw('water', (x0, by0, x0 + half, by1), f / WATER_FRAMES)) for f in range(WATER_FRAMES)])
    sx0, sy0, sx1, sy1 = WATER_SIDE
    s['water_side'] = dict(size=(sx1 - sx0, sy1 - sy0), frames=[
        dict(draw=_Draw('water', WATER_SIDE, f / WATER_FRAMES)) for f in range(WATER_FRAMES)])
    for sid, x, y, w, h in COURTYARD_ARCHES:
        s[sid] = dict(size=(w, h), frames=[dict(draw=_Draw('court', sid, x, y, w, h))])
    return s


def main():
    ids = sys.argv[1:] or list(LEVELS)
    out = os.path.join(ROOT, 'assets', 'levels')
    for lid in ids:
        rgb = LEVELS[lid]().shade()
        Image.fromarray(rgb).save(os.path.join(out, f'{lid}.jpg'), quality=88, optimize=True, progressive=True)
        print('saved', lid, rgb.shape)


if __name__ == '__main__':
    main()
