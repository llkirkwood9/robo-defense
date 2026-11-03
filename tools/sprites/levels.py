"""
Map backgrounds (assets/levels/*.jpg, or *.webp where the sky shows through) and map decoration
sprites (VR Training blocks, Courtyard arches, lava, the fountain, clouds, dust), rendered from procedural height fields lit from the upper right.

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

from palette import M
from r3d import cyl, ellipsoid, sphere, torus_z

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PPU = 2
T = 70 * PPU                 # tile size in output pixels
LIGHT = np.array([0.6, 0.5, 0.62])   # image space: +x right, +y up (north), +z out of the ground
LIGHT = LIGHT / np.linalg.norm(LIGHT)
# Screen lift per unit of height, matching the 55-degree camera the sprites are rendered with.
OBLIQUE = math.cos(math.radians(55))


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
        self.ground = 0.0       # height of the playing surface (unlifted in the oblique view)

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


    def project(self, rgb, ground=0.0):
        """Re-draws a shaded top-down image in the sprites' oblique view: heights above `ground`
        lift surfaces up the screen and the south-facing sides that rise become visible."""
        rel = (self.H - ground) * OBLIQUE
        h, w = rel.shape
        best = np.full((h, w), np.iinfo(np.int32).min, np.int32)
        for k in range(int(math.floor(min(rel.min(), 0))), int(math.ceil(max(rel.max(), 0))) + 1):
            # Source row Y + k reaches screen row Y when its lifted top is at or above Y.
            src = np.full((h, w), -np.inf, np.float32)
            lo, hi = max(0, -k), min(h, h - k)
            if lo < hi:
                src[lo:hi] = rel[lo + k:hi + k]
            best = np.where(src >= k, k, best)
        rows = np.arange(h)[:, None]
        best = np.where(best == np.iinfo(np.int32).min, 0, best)
        sy = rows + best
        sx = np.broadcast_to(np.arange(w)[None, :], (h, w))
        self.src = (sy, sx)
        sy1 = np.minimum(sy + 1, h - 1)
        # Screen rows of this source row's top and the next one's: the span between them is
        # either a gentle slope (a pixel or so) or the front of something tall.
        t0 = sy - rel[sy, sx]
        t1 = sy1 + (sy1 == sy) - rel[sy1, sx]
        gap = np.maximum(t1 - t0, 1e-3)
        f = np.clip((rows + 0.5 - t0) / gap, 0, 1)
        f = f * smoothstep(1.2, 2.0, gap)            # flat ground keeps its own pixels
        top = rgb[sy, sx].astype(np.float32) * (1 - f[..., None]) + rgb[sy1, sx] * f[..., None]
        face = smoothstep(1.5, 4.0, gap)[..., None]
        # Fronts are lit from their outline's real direction (smoothed slope of the height
        # field), with the colour from just inside the edge and a screen-space grain, so
        # nothing is smeared down from the top row.
        hb = blur(self.H, 3)
        gy, gx = np.gradient(hb)
        nx, ny = -gx[sy, sx], gy[sy, sx]                 # outward, +y north
        nl = np.sqrt(nx * nx + ny * ny) + 1e-6
        nx, ny = nx / nl, ny / nl
        sun = np.clip(nx * LIGHT[0] + ny * LIGHT[1], 0, 1)
        fill = np.clip(-ny, 0, 1) * 0.25                 # light from the camera side
        foot = (sy1 + 3) - rows - rel[np.minimum(sy + 4, h - 1), sx]   # px above the foot
        ao = 1 - 0.4 * np.exp(-np.clip(foot, 0, None) / 14)
        grain = 0.88 + 0.24 * fbm(w, h, 5, 97, 3)
        alb = blur(self.A, 3)[np.maximum(sy - 5, 0), sx]
        lum = (0.36 + 0.55 * sun + fill) * ao * grain
        side = np.clip(alb * lum[..., None], 0, 1) ** (1 / 1.1) * 255
        out = top * (1 - face) + side * face
        return out.round().clip(0, 255).astype(np.uint8)

    def remap(self, a):
        """Moves a per-pixel map (mask or overlay) into the view made by the last `project`."""
        return a[self.src]

    def render(self):
        return self.project(self.shade(), self.ground)


def north_lift(height):
    """Extra depth for a wall on the north edge so its top is not lifted off the map."""
    return round(height * OBLIQUE)


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

    # East bulkhead wall with blue lights, open at the exit (row 6). Everything stays inside the
    # unbuildable border column; pieces south of the opening start lower so that, once their tops
    # are lifted by the oblique view, the opening still lines up with row 6.
    wx = EAST_WALL_X * PPU
    border = 19 * T
    gap = (c.y > 6 * T + 6) & (c.y < 7 * T - 6 + round(72 * OBLIQUE))
    wall_m, wall_in = c.rect(wx, -10, c.w + 10, c.h + 10, 2)
    c.block((wall_m * ~gap, wall_in), 64, 10, (0.36, 0.38, 0.43), 0.6)
    for k in range(12):
        y0 = k * T + 14
        seg_m, seg_in = c.rrect(wx + 26, y0, c.w - 8, y0 + T - 28, 8)
        c.block((seg_m * ~gap, seg_in), 72, 6, (0.5, 0.53, 0.58), 0.7)
        if not (5 * T < y0 < 8 * T):
            # Light bar on the flat ledge in front of each panel, in a dark housing.
            housing = c.rrect(wx + 11, y0 + 18, wx + 23, y0 + T - 46, 4)
            c.block(housing, 67, 2, (0.12, 0.13, 0.16), 0.5)
            lamp = c.rrect(wx + 14, y0 + 22, wx + 20, y0 + T - 50, 3)[0]
            c.paint(lamp, albedo=(0, 0, 0), emit=(0.25, 0.55, 1.0))
    # Base entrance: a large concrete pad in front of a dark, lit tunnel flanked by two gate towers.
    gy0, gy1 = 6 * T, 7 * T
    px0, cw = wx - 2.6 * T, 1.3 * T
    pad = c.rrect(px0, 2.5 * T, wx - 2, 10.5 * T, 8, 2)
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
        cy = yy + sgn * 40 + (round(100 * OBLIQUE) if sgn > 0 else 0)
        tower = c.rrect(border + 2, cy - 38, c.w + 10, cy + 38, 12)
        c.block(tower, 92, 8, (0.42, 0.45, 0.5), 0.7)
        cap = c.rrect(border + 10, cy - 26, wx + 40, cy + 26, 10)
        c.block(cap, 104, 5, (0.3, 0.32, 0.36), 0.6)
        vent = (np.mod(c.x - wx, 14) < 6) * c.rect(wx + 56, cy - 18, c.w - 12, cy + 18, 1)[0]
        c.paint(vent * 0.8, albedo=(0.2, 0.21, 0.24))
        lamp = c.disc(border + 24, cy, 10)[0]
        c.paint(lamp, albedo=(0, 0, 0), emit=(0.25, 0.55, 1.0))
    # Door slot in the tunnel mouth and a lit strip overhead.
    c.paint(c.rect(wx + 12, gy0 + 2, wx + 18, gy1 - 2, 1)[0], albedo=(0.55, 0.45, 0.12))
    c.paint(c.rect(wx + 30, gy0 + 20, wx + 36, gy1 - 20, 1)[0], albedo=(0, 0, 0), emit=(0.25, 0.55, 1.0))

    # West gate: a gravel path mouth with marker lamps.
    for yy in (6 * T + 18, 7 * T - 18):
        lamp = c.disc(16, yy, 6)[0]
        c.paint(lamp, albedo=(0, 0, 0), emit=(0.35, 1.0, 0.45))
    c.water_mask = water
    c.ground = 3  # height of the playing surface
    return c


def water_frame(c, water, t):
    """Moving glints and lapping foam over the water, as an RGBA overlay; t in [0, 1)."""
    x, y = c.x, c.y
    k = math.tau
    # One or two cycles per loop, so each frame moves little and the game's crossfade stays smooth.
    w1 = np.sin(x / 31.0 + y / 9.0 - k * t) * np.sin(x / 17.0 - y / 23.0 + k * t)
    w2 = np.sin(x / 13.0 - y / 7.0 + k * t) * np.sin(y / 11.0 + k * t * 2)
    w3 = np.sin(x / 7.0 + y / 5.0 - k * t * 2)
    # Sparse, irregular sun glints: interference peaks broken up by static noise.
    grain = fbm(c.w, c.h, 10, 78, 3)
    glint = smoothstep(0.84, 0.98, 0.5 + 0.3 * w1 + 0.25 * w2 + 0.12 * w3 + (grain - 0.5) * 0.5) * water * 0.35
    edge = np.clip(water - blur(water, 6), 0, 1) * 3       # just inside the shoreline
    lap = 0.5 + 0.5 * np.sin(k * t + x / 40.0 + y / 40.0)
    foam = np.clip(edge, 0, 1) * (0.35 + 0.65 * lap) * smoothstep(0.2, 0.6, fbm(c.w, c.h, 8, 77, 2) + lap * 0.3)
    a = np.clip(glint * 0.7 + foam * 0.35, 0, 1)
    rgb = np.ones(a.shape + (3,), np.float32) * np.array([0.85, 0.93, 1.0], np.float32)
    return np.dstack([rgb * 255, a * 255]).round().clip(0, 255).astype(np.uint8)


# ---- Ruins: sand and old paved roads inside a stone curtain wall with four gate towers ------------

def ashlar(c, w, h, seed):
    """Running-bond masonry: returns (seam mask 0 at the joints, per-block tone 0..1)."""
    row = np.floor(c.y / h)
    xo = c.x + np.mod(row, 2) * w / 2
    col = np.floor(xo / w)
    fx, fy = np.mod(xo, w), np.mod(c.y, h)
    edge = np.minimum(np.minimum(fx, w - fx), np.minimum(fy, h - fy))
    tone = np.mod(np.sin(col * 12.9898 + row * 78.233 + seed) * 43758.5, 1).astype(np.float32)
    return smoothstep(0.8, 3.5, edge), tone


ENTRANCE_GLOW = (0.3, 1.0, 0.45)
EXIT_GLOW = (1.0, 0.28, 0.2)


def gate_arrows(c, code, entrance, reach=0.9, opacity=0.8):
    """Chevrons on the floor at a gate (wall-coded like maps.ts): pointing in at an entrance and
    out at an exit, in the matching colour."""
    wall, off = code >> 8, code & 255
    dist = {1: c.w - c.x, 2: c.y, 3: c.x, 4: c.h - c.y}[wall]
    along = np.abs((c.y if wall in (1, 3) else c.x) - (off + 0.5) * T)
    color = ENTRANCE_GLOW if entrance else EXIT_GLOW
    half = T * 0.3
    for k in range(3):
        d0 = T * (reach + 0.34 * k)
        bend = (half - along) * 0.7
        line = np.abs(dist - d0 - (bend if entrance else -bend))
        m = smoothstep(9, 6, line) * smoothstep(half + 1, half - 1, along) * opacity * (1 - 0.22 * k)
        c.paint(m, albedo=np.asarray(color) * 0.8, emit=np.asarray(color) * 0.3)


RUINS_ENTRANCES = (774, 522)
RUINS_EXITS = (262, 1034)
RUINS_WALL = 48          # height of the curtain wall
RUINS_PIER = 86          # gate tower footprint, px
RUINS_PIER_TOP = 78
RUINS_GROUND = 5


def ruins_stone(c, seed, lo=(0.36, 0.3, 0.22), mid=(0.56, 0.48, 0.35), hi=(0.74, 0.65, 0.49)):
    """Dressed sandstone for the walls and towers."""
    seam, tone = ashlar(c, 64, 32, seed)
    rough = fbm(c.w, c.h, 22, seed + 1, 3)
    return palette_map(np.clip(tone * 0.45 + rough * 0.55, 0, 1), [(0, lo), (0.5, mid), (1, hi)]) * (0.5 + 0.5 * seam)[..., None]


def cross_level():
    c = Canvas(20, 12)
    # Wind-blown sand, in the same soft macro shapes as the Basic map's meadow.
    macro = fbm(c.w, c.h, 300, 11, 4)
    fine = fbm(c.w, c.h, 7, 12, 3)
    grain = value_noise(c.w, c.h, 2, 13)
    c.A[:] = palette_map(np.clip(macro * 1.3 - 0.15 + (fine - 0.5) * 0.3 + (grain - 0.5) * 0.08, 0, 1),
                         [(0, (0.42, 0.31, 0.18)), (0.5, (0.6, 0.46, 0.27)), (1, (0.76, 0.61, 0.38))])
    c.H[:] = macro * 8 + grain * 1.2
    c.S[:] = 0.03
    # The old paved roads between the gates, breaking up into the sand at their edges.
    wob = (fbm(c.w, c.h, 46, 14, 3) - 0.5) * T * 0.9
    road = np.maximum(smoothstep(T * 0.95, T * 0.7, np.abs(c.y - 6.5 * T) + wob),
                      smoothstep(T * 0.95, T * 0.7, np.abs(c.x - 10.5 * T) + wob))
    plaza = smoothstep(T * 2.5, T * 2.2, np.hypot(c.x - 10.5 * T, c.y - 6.5 * T) + wob)
    ruin = smoothstep(0.66, 0.7, fbm(c.w, c.h, 170, 15, 4))
    paved = np.clip(np.maximum(np.maximum(road, plaza), ruin), 0, 1)
    seam, tone = ashlar(c, T * 0.75, T * 0.5, 16)
    rough = fbm(c.w, c.h, 16, 17, 3)
    slab = palette_map(np.clip(tone * 0.4 + rough * 0.45 + 0.1, 0, 1),
                       [(0, (0.46, 0.38, 0.27)), (1, (0.72, 0.62, 0.45))])
    c.paint(paved, albedo=slab * (0.62 + 0.38 * seam)[..., None], spec=0.08)
    c.H += paved * (1 + seam * 1.5)
    # A few cracks in the paving, and sand silting up its joints.
    cr = np.abs(fbm(c.w, c.h, 110, 18, 4) - 0.5)
    crack = (1 - smoothstep(0.003, 0.009, cr)) * paved * smoothstep(0.5, 0.62, fbm(c.w, c.h, 200, 19, 2))
    c.paint(crack * 0.7, albedo=(0.2, 0.15, 0.1))
    c.H -= crack * 2
    silt = smoothstep(0.52, 0.68, fbm(c.w, c.h, 70, 20, 4)) * paved
    c.paint(silt * 0.75, albedo=mix((0.56, 0.43, 0.25), (0.72, 0.58, 0.36), fine))
    # Sparse dry grass away from the roads.
    clump = smoothstep(0.6, 0.72, fbm(c.w, c.h, 90, 21, 4)) * (1 - paved)
    straw = value_noise(c.w, c.h, 2, 22)
    tuft = clump * smoothstep(0.45, 0.8, straw)
    c.paint(tuft * 0.8, albedo=palette_map(fine, [(0, (0.36, 0.33, 0.12)), (1, (0.6, 0.54, 0.22))]))
    c.H += tuft * 3
    # Scattered rubble, kept clear of the gates.
    rng = np.random.default_rng(23)
    for _ in range(46):
        tx, ty = rng.uniform(1.2, 18.8), rng.uniform(1.4, 10.8)
        if abs(ty - 6.5) < 1.2 and (tx < 3 or tx > 17) or abs(tx - 10.5) < 1.2 and (ty < 3 or ty > 9):
            continue
        bw, bh = rng.uniform(7, 20), rng.uniform(6, 13)
        chunk = c.rrect(tx * T - bw, ty * T - bh, tx * T + bw, ty * T + bh, 3, 2)
        c.block(chunk, rng.uniform(8, 14), 3, np.asarray((0.58, 0.5, 0.37)) * rng.uniform(0.8, 1.1), 0.08)

    # The curtain wall on all four sides, open only at the gates. Pieces just south of an opening
    # start lower, so that once lifted by the oblique view the opening still lines up with its row.
    band = round(T * 0.42)
    lift = round((RUINS_WALL - RUINS_GROUND) * OBLIQUE)
    north_y = band + lift
    stone = ruins_stone(c, 24)
    sides = (
        (c.rect(-10, -10, c.w + 10, north_y, 2), (c.x > 10 * T + 1) & (c.x < 11 * T - 1)),
        (c.rect(-10, c.h - band, c.w + 10, c.h + 10, 2), (c.x > 10 * T + 1) & (c.x < 11 * T - 1)),
        (c.rect(-10, north_y - 4, band, c.h - band + 4, 2), (c.y > 6 * T + 1) & (c.y < 7 * T - 1 + lift)),
        (c.rect(c.w - band, north_y - 4, c.w + 10, c.h - band + 4, 2), (c.y > 6 * T + 1) & (c.y < 7 * T - 1 + lift)),
    )
    for (m, inside), gap in sides:
        c.block((m * ~gap, inside), RUINS_WALL, 5, stone, 0.08)
    # Battlements: raised merlons along the outer half of the wall.
    for (m, inside), gap in sides:
        horizontal = np.mod(c.x, 70) < 38
        vertical = np.mod(c.y, 70) < 38
        is_ns = m[int(north_y / 2), c.w // 2] > 0.5 or m[c.h - 4, c.w // 2] > 0.5
        crest = (m > 0.5) * (inside > 5) * (inside < 30) * ~gap * (horizontal if is_ns else vertical)
        c.H = np.where(crest, RUINS_WALL + 10, c.H)
        c.paint(crest * 0.5, albedo=(0.74, 0.65, 0.5))

    # Gate towers either side of each opening, plus a bastion in each corner.
    P = RUINS_PIER
    pier_lift = round((RUINS_PIER_TOP - RUINS_GROUND) * OBLIQUE)
    towers = [
        (0, 6 * T - P, P, 6 * T), (0, 7 * T + pier_lift, P, 7 * T + pier_lift + P),
        (c.w - P, 6 * T - P, c.w, 6 * T), (c.w - P, 7 * T + pier_lift, c.w, 7 * T + pier_lift + P),
        (10 * T - P, pier_lift, 10 * T, pier_lift + P), (11 * T, pier_lift, 11 * T + P, pier_lift + P),
        (10 * T - P, c.h - 2 - P, 10 * T, c.h - 2), (11 * T, c.h - 2 - P, 11 * T + P, c.h - 2),
    ]
    corners = [(0, pier_lift, P + 8, pier_lift + P + 8), (c.w - P - 8, pier_lift, c.w, pier_lift + P + 8),
               (0, c.h - 10 - P, P + 8, c.h - 2), (c.w - P - 8, c.h - 10 - P, c.w, c.h - 2)]
    tower_stone = ruins_stone(c, 26, (0.42, 0.35, 0.25), (0.62, 0.53, 0.38), (0.8, 0.71, 0.54))
    for x0, y0, x1, y1 in towers + corners:
        c.block(c.rrect(x0, y0, x1, y1, 5, 2), RUINS_PIER_TOP, 5, tower_stone, 0.1)
        cap = c.rrect(x0 + 10, y0 + 10, x1 - 10, y1 - 10, 4, 2)
        c.block(cap, RUINS_PIER_TOP + 5, 3, (0.5, 0.42, 0.3), 0.1)
    # Brazier bowls on the gate towers; the game lights them green (entrance) or red (exit).
    for x0, y0, x1, y1 in towers:
        bowl = c.disc((x0 + x1) / 2, (y0 + y1) / 2, 20, 2)
        c.block(bowl, RUINS_PIER_TOP + 9, 3, (0.1, 0.09, 0.08), 0.3)

    # Clear each gateway: packed road, a stone sill and shadow falling away at the map edge.
    for code in RUINS_ENTRANCES + RUINS_EXITS:
        wall, off = code >> 8, code & 255
        dist = {1: c.w - c.x, 2: c.y, 3: c.x, 4: c.h - c.y}[wall]
        along = np.abs((c.y if wall in (1, 3) else c.x) - (off + 0.5) * T)
        mouth = smoothstep(T * 0.48, T * 0.45, along) * smoothstep(T * 0.72, T * 0.6, dist)
        c.paint(mouth * smoothstep(T * 0.42, T * 0.02, dist) * 0.92, albedo=(0.04, 0.03, 0.03))
        sill = smoothstep(T * 0.5, T * 0.47, along) * smoothstep(9, 6, np.abs(dist - T * 0.56))
        c.paint(sill, albedo=(0.74, 0.66, 0.5), height=9)
        gate_arrows(c, code, code in RUINS_ENTRANCES)
    c.ground = RUINS_GROUND
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
    for y0, y1 in ((0, T * 0.3 + north_lift(40)), (c.h - T * 0.3, c.h)):
        wall = c.rect(-10, y0, c.w + 10, y1, 2)
        c.block(wall, 34, 6, (0.22, 0.23, 0.26), 0.5)
        for tx in range(20):
            box_ = c.rrect(tx * T + 16, y0 + 8, (tx + 1) * T - 16, y1 - 8, 6)
            c.block(box_, 40, 4, (0.3, 0.32, 0.36), 0.6)
            lamp = c.disc(tx * T + T / 2, (y0 + y1) / 2, 5)[0]
            c.paint(lamp, albedo=(0, 0, 0), emit=((0.3, 1.0, 0.4) if tx % 3 else (1.0, 0.3, 0.2)))
    hz = np.maximum(c.rect(0, T * 0.3 + north_lift(40), c.w, T * 0.42 + north_lift(40), 1)[0], c.rect(0, c.h - T * 0.42, c.w, c.h - T * 0.3, 1)[0])
    hazard(c, hz)
    # Gate frames on the side walls.
    for code in (771, 774, 777, 259, 262, 265):
        side, row = code >> 8, code & 255
        x0 = 0 if side == 3 else c.w - 22
        for yy in (row * T + 4, (row + 1) * T - 18):
            post = c.rect(x0, yy, x0 + 22, yy + 14, 1.5)
            c.block(post, 30, 3, (0.2, 0.21, 0.24), 0.5)
        hazard(c, c.rect(x0, row * T + 18, x0 + 22, (row + 1) * T - 18, 1)[0])
    c.ground = 3  # height of the playing surface
    return c


# ---- Courtyard: tiled plaza around a garden with a fountain, gatehouses with archways -------------

COURT_NORTH = T * 0.36 + round(48 * OBLIQUE)
COURT_ENTRANCES = (774, 516, 1034, 527)
COURT_EXITS = (262, 1028, 522, 1039)
ARCH_TOP = 72            # height of the lintels (lifts their tops about 19 world px)
ARCH_LIFT = round((ARCH_TOP - 3) * OBLIQUE / PPU)
# Lintels over the gates, drawn above units: (sprite id, column, is north, emissive gem). The sprite
# box is (70 * col - 6, top, 82, ARCH_H) in world px; maps.ts places the overlays at the same spot.
ARCH_NORTH_Y, ARCH_SOUTH_Y, ARCH_H = 0, 70 * 11 - 20, 66
COURTYARD_ARCHES = (
    ('courtyard_nw_overlay', 4, True, ENTRANCE_GLOW),
    ('courtyard_n_overlay', 10, True, EXIT_GLOW),
    ('courtyard_ne_overlay', 15, True, ENTRANCE_GLOW),
    ('courtyard_sw_overlay', 4, False, EXIT_GLOW),
    ('courtyard_s_overlay', 10, False, ENTRANCE_GLOW),
    ('courtyard_se_overlay', 15, False, EXIT_GLOW),
)


def courtyard_level():
    c = Canvas(20, 12)
    # Plaza flagstones, cool grey-blue with soft joints.
    fx, fy = np.mod(c.x, T), np.mod(c.y, T)
    seam = smoothstep(1, 4, np.minimum(np.minimum(fx, T - fx), np.minimum(fy, T - fy)))
    tone = np.mod(np.sin(np.floor(c.x / T) * 12.9898 + np.floor(c.y / T) * 78.233) * 43758.5, 1).astype(np.float32)
    marble = fbm(c.w, c.h, 60, 32, 4)
    c.A[:] = mix((0.42, 0.46, 0.54), (0.62, 0.66, 0.72), np.clip(tone * 0.25 + marble * 0.75, 0, 1)) * (0.74 + 0.26 * seam)[..., None]
    c.H[:] = seam * 2.5
    c.S[:] = 0.3
    # Pale banding around the garden, leading out to the gates along row 6 and columns 4, 10 and 15.
    lanes = np.zeros((c.h, c.w), np.float32)
    lanes = np.maximum(lanes, smoothstep(T * 0.5, T * 0.47, np.abs(c.y - 6.5 * T)))
    for col in (4, 10, 15):
        lanes = np.maximum(lanes, smoothstep(T * 0.5, T * 0.47, np.abs(c.x - (col + 0.5) * T)))
    c.paint(lanes * 0.12, albedo=(0.74, 0.77, 0.82))
    # The garden: four lawns around a paved circle with the fountain in the middle.
    gx0, gy0, gx1, gy1 = 6 * T, 4 * T, 14 * T, 8 * T
    cx, cy = 10 * T, 6 * T
    c.block(c.rrect(gx0 - 12, gy0 - 12, gx1 + 12, gy1 + 12, 14), 7, 3, (0.72, 0.74, 0.78), 0.3)
    lawn_m = c.rrect(gx0, gy0, gx1, gy1, 8)[0]
    blades = value_noise(c.w, c.h, 2, 33)
    grass = palette_map(np.clip(fbm(c.w, c.h, 90, 34) * 1.2 - 0.1 + (blades - 0.5) * 0.3, 0, 1),
                        [(0, (0.1, 0.25, 0.07)), (0.5, (0.2, 0.42, 0.12)), (1, (0.36, 0.6, 0.18))])
    c.paint(lawn_m, albedo=grass, spec=0.03)
    c.H = np.where(lawn_m > 0.5, 6 + blades * 2, c.H)
    r = np.hypot(c.x - cx, c.y - cy)
    paths = np.maximum(smoothstep(T * 0.3, T * 0.27, np.abs(c.y - cy)), smoothstep(T * 0.3, T * 0.27, np.abs(c.x - cx)))
    gravel = palette_map(fbm(c.w, c.h, 5, 36, 2), [(0, (0.54, 0.5, 0.43)), (1, (0.76, 0.72, 0.63))])
    c.paint(paths * lawn_m, albedo=gravel, spec=0.05)
    c.H = np.where(paths * lawn_m > 0.5, 6.5, c.H)
    pad = smoothstep(T * 1.5, T * 1.47, r)
    rings = 0.84 + 0.16 * smoothstep(2, 5, np.abs(np.mod(r, T * 0.32) - T * 0.16))
    c.paint(pad, albedo=mix((0.56, 0.58, 0.62), (0.76, 0.78, 0.82), marble) * rings[..., None], spec=0.3)
    c.H = np.where(pad > 0.5, 7, c.H)
    c.paint(smoothstep(T * 1.5, T * 1.47, r) * smoothstep(T * 1.4, T * 1.43, r), albedo=(0.82, 0.84, 0.88), height=9)
    # Flower beds tucked into the lawn corners.
    rng = np.random.default_rng(37)
    for bx, by in ((6.55, 4.55), (13.45, 4.55), (6.55, 7.45), (13.45, 7.45)):
        bed = c.disc(bx * T, by * T, T * 0.36, 3)
        c.block(bed, 11, 4, (0.13, 0.28, 0.09), 0.02)
        hue = np.asarray(((0.95, 0.3, 0.42), (0.98, 0.78, 0.25), (0.62, 0.35, 0.95), (0.98, 0.98, 0.95))[rng.integers(0, 4)])
        for _ in range(26):
            a, d = rng.uniform(0, math.tau), T * 0.3 * math.sqrt(rng.random())
            c.paint(c.disc(bx * T + math.cos(a) * d, by * T + math.sin(a) * d, 4.5, 1.5)[0], albedo=hue, height=14)
    # Planters (the four obstacles), each 2x1 tiles: clipped hedges in stone boxes.
    for ox, oy in ((4, 4), (14, 4), (4, 7), (14, 7)):
        c.block(c.rrect(ox * T + 6, oy * T + 8, (ox + 2) * T - 6, (oy + 1) * T - 8, 10), 26, 5, (0.58, 0.6, 0.64), 0.3)
        hedge = c.rrect(ox * T + 16, oy * T + 18, (ox + 2) * T - 16, (oy + 1) * T - 18, 14)
        leaf = fbm(c.w, c.h, 6, 35 + ox + oy, 3)
        c.block(hedge, 40, 14, palette_map(leaf, [(0, (0.06, 0.2, 0.06)), (1, (0.22, 0.48, 0.14))]), 0.05)
        c.H += hedge[0] * leaf * 5
    # Perimeter wall with evenly spaced lit pillars, open at every gate.
    wall_stone = ruins_stone(c, 38, (0.36, 0.39, 0.46), (0.52, 0.56, 0.63), (0.66, 0.7, 0.76))
    side_lift = round(27 * OBLIQUE)
    gate_cols = (4, 10, 15)
    open_ns = np.zeros((c.h, c.w), bool)
    for col in gate_cols:
        open_ns |= (c.x > col * T + 2) & (c.x < (col + 1) * T - 2)
    south_y = c.h - T * 0.36
    for y0, y1 in ((-10, COURT_NORTH), (south_y, c.h + 10)):
        m, inside = c.rect(-10, y0, c.w + 10, y1, 2)
        c.block((m * ~open_ns, inside), 38, 5, wall_stone, 0.25)
    open_side = (c.y > 6 * T + 2) & (c.y < 7 * T - 2 + side_lift)
    for x0, x1 in ((-10, T * 0.36), (c.w - T * 0.36, c.w + 10)):
        m, inside = c.rect(x0, COURT_NORTH - 4, x1, south_y + 4, 2)
        c.block((m * ~open_side, inside), 30, 5, wall_stone, 0.25)
    for tx in range(20):
        if tx in gate_cols or tx in (3, 5, 9, 11, 14, 16):
            continue
        for yy in (COURT_NORTH * 0.56, c.h - T * 0.18):
            c.block(c.disc(tx * T + T / 2, yy, 15), 48, 4, (0.7, 0.73, 0.78), 0.5)
            c.paint(c.disc(tx * T + T / 2, yy, 5)[0], albedo=(0, 0, 0), emit=(1.0, 0.85, 0.5))
    # Gatehouse piers beside the gates.
    pier_lift = round((54 - 3) * OBLIQUE)
    for col in gate_cols:
        for x0, x1 in ((col * T - 24, col * T + 4), ((col + 1) * T - 4, (col + 1) * T + 24)):
            c.block(c.rrect(x0, pier_lift, x1, COURT_NORTH + 8, 4), 54, 4, (0.64, 0.67, 0.73), 0.4)
            c.block(c.rrect(x0, south_y - 8, x1, c.h - 2, 4), 54, 4, (0.64, 0.67, 0.73), 0.4)
    for x0, x1 in ((0, T * 0.42), (c.w - T * 0.42, c.w)):
        c.block(c.rrect(x0, 6 * T - 30, x1, 6 * T, 4), 54, 4, (0.64, 0.67, 0.73), 0.4)
        c.block(c.rrect(x0, 7 * T + pier_lift, x1, 7 * T + pier_lift + 30, 4), 54, 4, (0.64, 0.67, 0.73), 0.4)
    # Gate floors with arrows showing which way robots come and go.
    for col in gate_cols:
        for y0, y1 in ((-2, COURT_NORTH + 2), (south_y - 2, c.h + 2)):
            g = c.rect(col * T + 3, y0, (col + 1) * T - 3, y1, 2)[0]
            c.H = c.H * (1 - g) + 3 * g
            c.paint(g, albedo=(0.3, 0.33, 0.39))
    for x0, x1 in ((-2, T * 0.42), (c.w - T * 0.42, c.w + 2)):
        g = c.rect(x0, 6 * T + 3, x1, 7 * T - 3, 2)[0]
        c.H = c.H * (1 - g) + 3 * g
        c.paint(g, albedo=(0.3, 0.33, 0.39))
    for code in COURT_ENTRANCES + COURT_EXITS:
        gate_arrows(c, code, code in COURT_ENTRANCES, reach=1.42 if code >> 8 == 4 else 0.72, opacity=0.65)
    # Lintels across the column gates (also exported as overlay sprites, so robots pass beneath).
    arch = np.zeros((c.h, c.w), np.float32)
    lift_px = ARCH_LIFT * PPU
    for _, col, north, gem in COURTYARD_ARCHES:
        x0, x1 = col * T - 10, (col + 1) * T + 10
        y0 = lift_px if north else 70 * PPU * 11 + 8
        y1 = y0 + 46
        span = c.rrect(x0, y0, x1, y1, 6)
        c.block(span, ARCH_TOP, 5, (0.72, 0.75, 0.8), 0.5)
        band = c.rect(x0 + 10, y0 + 12, x1 - 10, y1 - 12, 1.5)[0]
        c.paint(band, albedo=(0.5, 0.53, 0.6))
        c.paint(c.disc((x0 + x1) / 2, (y0 + y1) / 2, 8)[0], albedo=(0, 0, 0), emit=gem)
        arch = np.maximum(arch, span[0])
    c.overlay_mask = arch
    c.ground = 3  # height of the playing surface
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
    c.ground = 0  # height of the playing surface
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
            lift = round(30 * OBLIQUE)
            c.y = 8 + (c.y - 8 - lift) * (c.h - 16) / (c.h - 16 - lift)
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
# Cut-outs where the sky shows through the image; ROAD_SKY in maps.ts lists the same cells.
ROAD_SKY = [(0, 0, 2, 1), (6, 0, 3, 1), (0, 1, 1, 2), (8, 1, 1, 1), (8, 5, 1, 8), (0, 8, 1, 9), (8, 20, 1, 6),
            (0, 22, 1, 4), (1, 25, 2, 1), (6, 25, 2, 1)]
ROAD_GROUND = 23
ROAD_TOP = 50            # machinery housings; lamp sockets sit on their lids at ROAD_TOP + 10


def road_has_lamp(x, y):
    """Which machinery cells carry a lamp (the rest are vents). maps.ts uses the same rule."""
    return (x * 5 + y * 3) % 4 != 0


def roadway_level():
    c = Canvas(9, 26)
    deck_plates(c, 51, base=(0.34, 0.36, 0.4))
    # Scuffed tyre lanes and paint wear so the deck is not one flat grey.
    wear = fbm(c.w, c.h, 90, 55, 4)
    c.A *= (0.82 + wear * 0.36)[..., None]
    lane = smoothstep(T * 0.48, T * 0.44, np.abs(c.x - 4.5 * T))
    stripe = smoothstep(4, 2.5, np.abs(np.abs(c.x - 4.5 * T) - T * 0.46)) * (np.mod(c.y, T * 0.5) < T * 0.28)
    c.paint(lane * 0.16, albedo=(0.14, 0.15, 0.18))
    c.paint(stripe * 0.55, albedo=(0.7, 0.72, 0.76), spec=0.2)
    c.H += 20
    sky = np.zeros((c.h, c.w), np.float32)
    for x, y, w, h in ROAD_SKY:
        sky[y * T:(y + h) * T, x * T:(x + w) * T] = 1
    sky = np.where(sky > 0.5, 1.0, np.minimum(sky, blur(sky, 1))).astype(np.float32)
    # A raised steel lip wherever the deck meets open sky or the edge of the map.
    near = np.clip(blur(sky, 7) * 3, 0, 1) * (1 - sky)
    edge = 1 - smoothstep(0, 13, np.minimum(np.minimum(c.x, c.w - c.x), np.minimum(c.y, c.h - c.y)))
    lip = np.maximum(smoothstep(0.1, 0.32, near), edge) * (1 - sky)
    c.paint(lip, albedo=(0.5, 0.52, 0.57), spec=0.6, height=26)
    # The deck has real thickness: its south faces drop away towards the sky.
    c.H = c.H * (1 - sky) - 50 * sky
    c.paint(sky, albedo=(0.03, 0.03, 0.05))
    c.open_mask = sky
    # Obstacles: machinery housings with lamp sockets and vents.
    for x, y, w, h in ROAD_OBSTACLES:
        c.block(c.rrect(x * T + 6, y * T + 6, (x + w) * T - 6, (y + h) * T - 6, 10), ROAD_TOP, 8, (0.22, 0.23, 0.27), 0.5)
        c.block(c.rrect(x * T + 20, y * T + 20, (x + w) * T - 20, (y + h) * T - 20, 8), ROAD_TOP + 6, 4, (0.38, 0.4, 0.45), 0.6)
        for i in range(w):
            for j in range(h):
                cx, cy = (x + i + 0.5) * T, (y + j + 0.5) * T
                if road_has_lamp(x + i, y + j):
                    # The game draws and blinks the light itself (see roadwayLights in maps.ts).
                    c.block(c.disc(cx, cy, 19), ROAD_TOP + 10, 5, (0.08, 0.08, 0.1), 0.8)
                    c.paint(c.disc(cx, cy, 11)[0], albedo=(0.02, 0.02, 0.03))
                else:
                    vent = c.rect(cx - 28, cy - 18, cx + 28, cy + 18, 1)[0]
                    slats = (np.mod(c.y, 9) < 4).astype(np.float32)
                    c.paint(vent, albedo=mix((0.05, 0.05, 0.06), (0.3, 0.31, 0.35), slats))
                    c.H -= vent * slats * 3
    # Gates in column 4: hazard sills, pylons and a pool of colour showing which way traffic runs.
    py_lift = round((60 - ROAD_GROUND) * OBLIQUE)
    for y0, code, entrance in ((py_lift + 1, 516, True), (c.h - 40, 1028, False)):
        for x0 in (4 * T - 26, 5 * T - 4):
            c.block(c.rrect(x0, y0, x0 + 30, y0 + 38, 5), 60, 4, (0.3, 0.32, 0.37), 0.6)
            c.paint(c.disc(x0 + 15, y0 + 19, 9)[0], albedo=(0.02, 0.02, 0.03))
        gate_arrows(c, code, entrance, reach=0.3, opacity=0.8)
    for y0 in (0, c.h - 16):
        hazard(c, c.rect(4 * T + 2, y0, 5 * T - 2, y0 + 16, 1)[0], 16)
        c.H = np.where(c.rect(4 * T + 2, y0, 5 * T - 2, y0 + 16, 1)[0] > 0.5, ROAD_GROUND, c.H)
    c.ground = ROAD_GROUND
    return c


# ---- Sky Tower: stone citadel floating above the clouds, lava core --------------------------------

SKY_SHAPES = (      # battlements, as the union of each one's obstacle rects from maps.ts
    ((3, 1, 3, 1), (4, 2, 1, 2)), ((14, 1, 3, 1), (15, 2, 1, 2)),
    ((4, 5, 1, 2),), ((15, 5, 1, 2),),
    ((4, 8, 1, 2), (3, 10, 3, 1)), ((15, 8, 1, 2), (14, 10, 3, 1)),
)
SKY_ENTRANCES = (771, 264)
SKY_EXITS = (259, 776)
SKY_GROUND = 63
SKY_PIT_R = T * 0.68


def along_outline(c, inside):
    """Position along the nearest straight edge of a shape, from its inside-distance field."""
    gy, gx = np.gradient(inside)
    return np.where(np.abs(gx) > np.abs(gy), c.y, c.x)


def skytower_level():
    c = Canvas(20, 12)
    # Everything off the deck is see-through; the game draws drifting clouds underneath.
    c.A[:] = (0.2, 0.2, 0.22)
    c.H[:] = -60
    x0, y0, x1, y1 = T * 0.5, T * 0.42, c.w - T * 0.5, c.h - T * 0.8
    deck = c.rrect(x0, y0, x1, y1, T * 0.5, 2)
    bridges = np.zeros((c.h, c.w), np.float32)
    for code in SKY_ENTRANCES + SKY_EXITS:
        side, row = code >> 8, code & 255
        bx0, bx1 = (-10, x0 + 30) if side == 3 else (x1 - 30, c.w + 10)
        bridges = np.maximum(bridges, c.rect(bx0, row * T + 12, bx1, (row + 1) * T - 12, 2)[0])
    solid = np.maximum(deck[0], bridges)
    c.open_mask = 1 - solid
    # Big dressed slabs, one per tile, with soft joints and a little moss near the rim.
    fx, fy = np.mod(c.x, T), np.mod(c.y, T)
    edge = np.minimum(np.minimum(fx, T - fx), np.minimum(fy, T - fy))
    seam = smoothstep(1, 4, edge)
    col, row = np.floor(c.x / T), np.floor(c.y / T)
    tone = np.mod(np.sin(col * 12.9898 + row * 78.233) * 43758.5, 1).astype(np.float32)
    stone = fbm(c.w, c.h, 40, 62, 4)
    slab = palette_map(np.clip(stone * 0.6 + tone * 0.25 + 0.08, 0, 1), [(0, (0.5, 0.51, 0.5)), (1, (0.68, 0.69, 0.67))])
    rim_d = deck[1]
    moss = smoothstep(0.52, 0.66, fbm(c.w, c.h, 130, 63)) * smoothstep(T * 1.8, T * 0.5, rim_d)
    slab = mix(slab, (0.3, 0.4, 0.22), moss * 0.55) * (0.72 + 0.28 * seam)[..., None]
    c.paint(solid, albedo=slab, spec=0.15)
    c.H = np.where(solid > 0.5, 60 + seam * 2.5 + stone * 1.5, c.H)
    # Inlaid roads between the bridges, and a gold-lined ring around the core.
    road = np.zeros((c.h, c.w), np.float32)
    for r in (3, 8):
        road = np.maximum(road, smoothstep(T * 0.5, T * 0.46, np.abs(c.y - (r + 0.5) * T)))
    c.paint(road * solid * 0.3, albedo=(0.24, 0.25, 0.28))
    cx, cy = 10 * T, 6 * T
    r = np.hypot(c.x - cx, c.y - cy)
    c.paint(smoothstep(T * 1.7, T * 1.66, r) * 0.55, albedo=(0.28, 0.29, 0.33))
    for rad in (T * 1.68, T * 1.38):
        c.paint(smoothstep(4.5, 2.5, np.abs(r - rad)), albedo=(0.82, 0.62, 0.26), spec=0.7)
    # A low parapet around the deck with merlons, open at the bridges.
    parapet = (rim_d > 0) * (rim_d < 15) * (bridges < 0.5)
    c.H = np.where(parapet, 72, c.H)
    c.paint(parapet.astype(np.float32), albedo=(0.66, 0.67, 0.66), spec=0.2)
    merlon = parapet * (np.mod(along_outline(c, rim_d), 52) < 26)
    c.H = np.where(merlon, 78, c.H)
    # Gate pillars on the deck edge; the game lights them green (entrance) or red (exit).
    pil_lift = round((100 - SKY_GROUND) * OBLIQUE)
    for code in SKY_ENTRANCES + SKY_EXITS:
        side, row = code >> 8, code & 255
        px = x0 + 22 if side == 3 else x1 - 22
        for py in (row * T + 2, (row + 1) * T - 2 + pil_lift):
            c.block(c.rrect(px - 17, py - 17, px + 17, py + 17, 4), 100, 4, (0.56, 0.57, 0.57), 0.3)
            c.paint(c.disc(px, py, 8)[0], albedo=(0.04, 0.04, 0.05))
        gate_arrows(c, code, code in SKY_ENTRANCES, reach=0.72, opacity=0.75)
    # Battlements: one clean block per shape, with merlons around a recessed walkway.
    wall = palette_map(stone, [(0, (0.5, 0.51, 0.5)), (1, (0.76, 0.77, 0.74))])
    for shape in SKY_SHAPES:
        inside = None
        for x, y, w, h in shape:
            d = c.rrect(x * T + 8, y * T + 8, (x + w) * T - 8, (y + h) * T - 8, 8)[1]
            inside = d if inside is None else np.maximum(inside, d)
        m = np.clip(0.5 + inside / 1.5, 0, 1)
        c.block((m, inside), 92, 6, wall, 0.2)
        walk = (inside > 18) * 1.0
        c.H = np.where(walk > 0, 88, c.H)
        c.paint(walk * 0.8, albedo=(0.34, 0.35, 0.36))
        crest = (inside > 4) * (inside < 16) * (np.mod(along_outline(c, inside), 44) < 24)
        c.H = np.where(crest, 99, c.H)
        c.paint(crest * 0.4, albedo=(0.84, 0.85, 0.82))
    # Crystal sockets on the battlements; the game makes them pulse.
    for tx, ty in ((4.5, 1.5), (15.5, 1.5), (4.5, 6), (15.5, 6), (4.5, 10.5), (15.5, 10.5)):
        c.block(c.disc(tx * T, ty * T, 13), 100, 3, (0.12, 0.13, 0.16), 0.7)
    # The core: a stone ring around a pit of lava (animated on top by the lava_pit sprite).
    c.block(c.disc(cx, cy, T * 0.92), 82, 8, (0.54, 0.55, 0.54), 0.3)
    for a in range(12):
        ang = a * math.tau / 12
        c.block(c.disc(cx + math.cos(ang) * T * 0.8, cy + math.sin(ang) * T * 0.8, 9), 86, 2, (0.82, 0.62, 0.26), 0.7)
    pit = c.disc(cx, cy, SKY_PIT_R)
    c.H = np.where(pit[0] > 0.5, SKY_GROUND, c.H)
    c.paint(pit[0], albedo=(0.1, 0.03, 0.0), emit=lava_colors(lava_field(c.x, c.y, 0.0)))
    c.solid_shadow = True
    c.ground = SKY_GROUND
    return c


# ---- Animated pieces --------------------------------------------------------------------------

def periodic_noise(size, beta, seed):
    """Seamlessly tiling noise in 0..1, from random phases with a 1/f^beta spectrum."""
    rng = np.random.default_rng(seed)
    f = np.fft.fftfreq(size)
    r = np.hypot(*np.meshgrid(f, f))
    r[0, 0] = 1
    spec = np.exp(1j * rng.uniform(0, math.tau, (size, size))) / r ** beta
    spec[0, 0] = 0
    n = np.fft.ifft2(spec).real
    return ((n - n.min()) / np.ptp(n)).astype(np.float32)


LAVA_TILE = 256
_LAVA_NOISE = None


def lava_field(x, y, t):
    """Two crust layers sliding past each other; shifts of a whole tile make it loop over t in [0, 1)."""
    global _LAVA_NOISE
    if _LAVA_NOISE is None:
        _LAVA_NOISE = periodic_noise(LAVA_TILE, 1.8, 65), periodic_noise(LAVA_TILE, 1.9, 66)
    a, b = _LAVA_NOISE
    xi, yi = x.astype(int), y.astype(int)
    s = int(round(t * LAVA_TILE))
    va = a[(yi + s) % LAVA_TILE, (xi + s // 2 * 2) % LAVA_TILE]
    vb = b[(yi - s) % LAVA_TILE, (xi + s) % LAVA_TILE]
    # Thin bright ridges where the crust cracks, over a slow swell of heat.
    cracks = np.clip(1 - np.abs(va - 0.5) * 7, 0, 1) ** 1.5
    return np.clip(vb * 0.75 - 0.08 + cracks * 0.62, 0, 1)


def lava_colors(v):
    return palette_map(v, [(0, (0.22, 0.02, 0.0)), (0.3, (0.5, 0.07, 0.0)), (0.5, (0.95, 0.3, 0.02)),
                           (0.7, (1.0, 0.62, 0.1)), (1, (1.0, 0.92, 0.5))])


def water_ripples(x, y, t):
    r = np.hypot(x, y)
    return np.sin(r / 2.6 - math.tau * 2 * t) * np.sin(np.arctan2(y, x) * 5 + r / 9)


FOUNTAIN_CAM = dict(fw=140, fh=160, ox=70, oy=90)
FOUNTAIN_FRAMES = 16


def fountain_scene(p):
    """The fountain's stonework (world px, ground at z=0). The moving water is `fountain_water`."""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    parts = [
        (cyl(p, 0, 0, 66, 0, 4, 1), M['steel']),
        (np.maximum(cyl(p, 0, 0, 62, 0, 14, 2), -cyl(p, 0, 0, 53, 5, 30, 1)), M['marble']),
        (cyl(p, 0, 0, 54, 0, 8, 0), M['pool']),
        (cyl(p, 0, 0, 9, 0, 34, 1), M['marble']),
        (cyl(p, 0, 0, 13, 7, 11, 1), M['marble']),
        (np.maximum(ellipsoid(p, (0, 0, 37), (27, 27, 12)), z - 37), M['marble']),
        (torus_z(p, 0, 0, 37, 25.5, 2.2), M['marble']),
        (cyl(p, 0, 0, 24.5, 33, 36.2, 0), M['pool']),
        (cyl(p, 0, 0, 4.5, 34, 54, 0.8), M['marble']),
        (np.maximum(ellipsoid(p, (0, 0, 56), (13, 13, 6)), z - 56), M['marble']),
        (torus_z(p, 0, 0, 56, 12, 1.3), M['marble']),
        (cyl(p, 0, 0, 11, 53, 55.2, 0), M['pool']),
        (sphere(p, (0, 0, 57), 2.4), M['gold']),
    ]
    for a in range(8):
        ang = a * math.tau / 8
        parts.append((sphere(p, (math.cos(ang) * 58, math.sin(ang) * 58, 15), 3.2), M['gold']))
    return parts


def fountain_water(w, h, t):
    """One frame of the fountain's jets and ripples as RGBA; loops over t in [0, 1)."""
    cam = FOUNTAIN_CAM
    e = math.radians(55)
    se, ce = math.sin(e), math.cos(e)
    ppu = w / cam['fw']
    rng = np.random.default_rng(71)
    density = np.zeros((h, w), np.float32)

    def splat(X, Y, Z, weight=1.0):
        sx = ((cam['ox'] + X) * ppu).astype(int)
        sy = ((cam['oy'] - (Y * se + Z * ce)) * ppu).astype(int)
        ok = (sx >= 0) & (sx < w) & (sy >= 0) & (sy < h)
        np.add.at(density, (sy[ok], sx[ok]), weight)

    def stream(n, cycles, r0, r1, z0, peak, z1, spokes=0):
        """`n` drops on parabolas from radius r0, height z0 up to `peak` and down to (r1, z1)."""
        phase = rng.random(n)
        ang = rng.uniform(0, math.tau, n) if spokes == 0 else rng.integers(0, spokes, n) * math.tau / spokes
        ang = ang + rng.normal(0, 0.03, n)
        u = np.mod(cycles * t + phase, 1)
        r = r0 + (r1 - r0) * u
        # Quadratic through (0, z0), the peak and (1, z1).
        a = 2 * z0 + 2 * z1 - 4 * peak
        b = 4 * peak - 3 * z0 - z1
        z = a * u * u + b * u + z0
        splat(np.cos(ang) * r, np.sin(ang) * r, z)

    stream(700, 3, 0.5, 9, 58, 102, 56)             # central jet
    stream(420, 3, 11.5, 15, 56, 57, 38)            # overflow from the top bowl
    stream(1100, 3, 25.5, 31, 37, 38, 9)            # overflow from the middle bowl
    stream(720, 2, 57, 34, 16, 32, 9, spokes=8)     # spouts on the rim, arcing inwards
    glow = blur(density, 1.1)
    water = np.clip(glow * 4.5, 0, 0.95)
    # Ripples spreading over the basin and the middle bowl, hidden behind the bowl above.
    py, px = np.mgrid[0:h, 0:w].astype(np.float32)
    X = px / ppu - cam['ox']
    for z, r_in, r_out, cycles_gain, top in ((8, 30, 53, 0.34, False), (36, 8, 24, 0.26, True)):
        Y = (cam['oy'] - py / ppu - z * ce) / se
        r = np.hypot(X, Y)
        ring = smoothstep(r_out, r_out - 2, r) * smoothstep(r_in - 2, r_in + 2, r)
        if not top:
            ring = ring * (1 - smoothstep(30, 27, np.hypot(X, (py / ppu - (cam['oy'] - 36 * ce)) / se)))
        glint = smoothstep(0.35, 0.9, water_ripples(X, Y, t))
        water = np.maximum(water, glint * ring * cycles_gain)
    rgb = np.ones((h, w, 3), np.float32) * np.array([0.86, 0.95, 1.0], np.float32)
    return np.dstack([rgb * 255, water * 255]).round().clip(0, 255).astype(np.uint8)


def cloud_tile(w, h, layer):
    """Seamless clouds: an opaque blue sky ('far') or scattered white banks with alpha ('near')."""
    n = periodic_noise(h, 1.45 if layer == 'far' else 1.3, 81 if layer == 'far' else 82)
    if layer == 'far':
        col = palette_map(n, [(0, (0.3, 0.5, 0.78)), (0.45, (0.47, 0.67, 0.9)), (0.62, (0.76, 0.86, 0.96)),
                              (0.8, (0.95, 0.97, 1.0)), (1, (1.0, 1.0, 1.0))])
        return np.dstack([col * 255, np.full((h, w), 255.0)]).round().astype(np.uint8)
    a = smoothstep(0.52, 0.72, n) * 0.92
    shade = palette_map(np.clip((n - 0.52) / 0.3, 0, 1), [(0, (0.8, 0.85, 0.93)), (1, (1.0, 1.0, 1.0))])
    return np.dstack([shade * 255, a * 255]).round().clip(0, 255).astype(np.uint8)


def dust_puff(w, h):
    """A soft, lumpy puff of sand, drawn stretched and faded by the game."""
    n = periodic_noise(h, 1.2, 91)
    py, px = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.hypot((px - w / 2) / (w / 2), (py - h / 2) / (h / 2))
    a = np.clip(1 - r, 0, 1) ** 1.5 * (0.45 + 0.9 * n)
    col = np.array([0.95, 0.88, 0.72], np.float32)
    return np.dstack([np.ones((h, w, 3), np.float32) * col * 255, np.clip(a, 0, 1) * 255]).round().astype(np.uint8)


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
    """Picklable sprite job for build.py: renders a VR tile, overlay or animation frame."""

    def __init__(self, kind, *args):
        self.kind, self.args = kind, args

    def __call__(self, w, h):
        if self.kind == 'vr':
            c = vr_tile(*self.args)
            rgb = c.render()
            return np.dstack([rgb, np.full(rgb.shape[:2], 255, np.uint8)])
        if self.kind == 'water':
            (x0, y0, x1, y1), t = self.args
            frames = water_source()
            img = frames[int(round(t * len(frames)))]
            return img[y0 * PPU:y1 * PPU, x0 * PPU:x1 * PPU]
        if self.kind == 'lava':
            return lava_frame(w, h, *self.args)
        if self.kind == 'fountain_water':
            return fountain_water(w, h, *self.args)
        if self.kind == 'clouds':
            return cloud_tile(w, h, *self.args)
        if self.kind == 'dust':
            return dust_puff(w, h)
        x, y, ow, oh = self.args
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
        _COURT = (c.render(), c.remap(c.overlay_mask))
    return _COURT


_WATER = None
WATER_FRAMES = 16


def water_source():
    """All water overlay frames for the Basic map (full map size, computed once per process)."""
    global _WATER
    if _WATER is None:
        c = basic_level()
        c.project(np.zeros((c.h, c.w, 3), np.uint8), c.ground)    # just the view mapping
        water = basic_water_mask(c)
        _WATER = [c.remap(water_frame(c, water, f / WATER_FRAMES)) for f in range(WATER_FRAMES)]
    return _WATER


LAVA_FRAMES = 16
LAVA_BOX = (648, 368, 104, 104)     # world px; maps.ts places the sprite at the same spot


def lava_frame(w, h, t):
    """One frame of the Sky Tower's lava, masked to the part of the pit the ring leaves in view."""
    x0, y0 = LAVA_BOX[0] * PPU, LAVA_BOX[1] * PPU
    py, px = np.mgrid[y0:y0 + h, x0:x0 + w].astype(np.float32)
    rgb = lava_colors(lava_field(px, py, t))
    cx, cy = 10 * T, 6 * T
    lift = (82 - SKY_GROUND) * OBLIQUE
    r = np.maximum(np.hypot(px - cx, py - cy), np.hypot(px - cx, py - cy + lift))
    a = smoothstep(SKY_PIT_R, SKY_PIT_R - 3, r)
    return np.dstack([np.clip(rgb, 0, 1) ** (1 / 1.1) * 255, a * 255]).round().clip(0, 255).astype(np.uint8)


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
    for sid, col, north, _ in COURTYARD_ARCHES:
        x, y = 70 * col - 6, ARCH_NORTH_Y if north else ARCH_SOUTH_Y
        s[sid] = dict(size=(82, ARCH_H), frames=[dict(draw=_Draw('court', x, y, 82, ARCH_H))])
    s['lava_pit'] = dict(size=LAVA_BOX[2:], frames=[dict(draw=_Draw('lava', f / LAVA_FRAMES)) for f in range(LAVA_FRAMES)])
    s['fountain'] = dict(size=(FOUNTAIN_CAM['fw'], FOUNTAIN_CAM['fh']), frames=[
        dict(scene=fountain_scene, cam=dict(FOUNTAIN_CAM), ground_shadow=0.3, shadow_radius=85)])
    s['fountain_water'] = dict(size=(FOUNTAIN_CAM['fw'], FOUNTAIN_CAM['fh']), frames=[
        dict(draw=_Draw('fountain_water', f / FOUNTAIN_FRAMES)) for f in range(FOUNTAIN_FRAMES)])
    s['clouds_far'] = dict(size=(512, 512), frames=[dict(draw=_Draw('clouds', 'far'))])
    s['clouds_near'] = dict(size=(512, 512), frames=[dict(draw=_Draw('clouds', 'near'))])
    s['dust_puff'] = dict(size=(48, 48), frames=[dict(draw=_Draw('dust'))])
    return s


def level_image(c):
    """The finished map as RGB, or RGBA when parts of it are see-through (`c.open_mask`)."""
    rgb = c.render()
    if not hasattr(c, 'open_mask'):
        return rgb
    a = 1 - c.remap(c.open_mask)
    if getattr(c, 'solid_shadow', False):
        # The deck's soft shadow on the clouds, and bridges dissolving into them at the map edge.
        fade = smoothstep(0, 50, np.minimum(c.x, c.w - c.x))
        cast = blur(np.roll(np.roll(a, 34, 0), -22, 1), 18) * 0.42
        rgb = (rgb * a[..., None]).round().astype(np.uint8)
        a = np.maximum(a * fade, cast * (1 - a))
    return np.dstack([rgb, (a * 255).round().clip(0, 255).astype(np.uint8)])


def main():
    ids = sys.argv[1:] or list(LEVELS)
    out = os.path.join(ROOT, 'assets', 'levels')
    for lid in ids:
        img = level_image(LEVELS[lid]())
        if img.shape[2] == 4:
            Image.fromarray(img).save(os.path.join(out, f'{lid}.webp'), quality=90, alpha_quality=100, method=6)
        else:
            Image.fromarray(img).save(os.path.join(out, f'{lid}.jpg'), quality=88, optimize=True, progressive=True)
        print('saved', lid, img.shape)


if __name__ == '__main__':
    main()
