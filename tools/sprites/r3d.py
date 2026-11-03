"""
Tiny numpy SDF ray-marcher used to pre-render every 3D sprite in the game.

World space: x right, y away from the camera ("north"), z up, in world pixels (one map tile is 70
units). The camera is orthographic, looking north and down at `elev` degrees. A frame covers
`fw` x `fh` world units, rendered at `ppu` pixels per unit with `ss` x `ss` supersampling.

A scene is a function `scene(p) -> list[(distance, material)]` where `p` is an (n, 3) array.
Materials are `Mat` tuples looked up by index in the palette passed to `render`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageFilter


@dataclass(frozen=True)
class Mat:
    albedo: tuple[float, float, float]
    metal: float = 0.5
    spec: float = 0.6
    power: float = 40.0
    emit: tuple[float, float, float] = (0.0, 0.0, 0.0)
    # Strength of the procedural grime/brushed noise on the albedo.
    grain: float = 0.08


def emissive(r: float, g: float, b: float, k: float = 1.25) -> Mat:
    return Mat((r, g, b), 0.0, 0.2, 10, (r * k, g * k, b * k), 0.0)


@dataclass
class Camera:
    fw: float = 70           # frame width in world units
    fh: float = 70           # frame height in world units
    ox: float = 35           # ground origin column (world units from the left)
    oy: float = 42           # ground origin row (world units from the top)
    elev: float = 55.0       # degrees above the ground plane
    ppu: int = 2             # output pixels per world unit
    ss: int = 3              # supersampling per axis
    light: tuple[float, float, float] = (0.55, 0.45, 0.85)
    D: np.ndarray = field(init=False)
    U: np.ndarray = field(init=False)
    R: np.ndarray = field(init=False)
    L: np.ndarray = field(init=False)

    def __post_init__(self):
        e = math.radians(self.elev)
        self.D = np.array([0.0, math.cos(e), -math.sin(e)])
        self.U = np.array([0.0, math.sin(e), math.cos(e)])
        self.R = np.array([1.0, 0.0, 0.0])
        lv = np.array(self.light, float)
        self.L = lv / np.linalg.norm(lv)


# ---- SDF primitives -------------------------------------------------------------------------

def length(v):
    return np.sqrt((v * v).sum(-1))


def extrude(d2, z, z0, z1, rnd=0.0):
    """Extrudes a 2D distance field between heights z0 and z1 with rounded edges."""
    hh = (z1 - z0) / 2
    dz = np.abs(z - (z0 + z1) / 2) - hh + rnd
    d2 = d2 + rnd
    outside = np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(dz, 0) ** 2)
    return outside + np.minimum(np.maximum(d2, dz), 0) - rnd


def box2d(x, y, hx, hy):
    qx, qy = np.abs(x) - hx, np.abs(y) - hy
    return np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0)


def circle2d(x, y, r):
    return np.sqrt(x * x + y * y) - r


def ngon2d(x, y, r, n):
    """Regular polygon with apothem r, flat side facing -y."""
    a = np.arctan2(x, -y)
    seg = 2 * math.pi / n
    a = np.mod(a + seg / 2, seg) - seg / 2
    rr = np.sqrt(x * x + y * y)
    return rr * np.cos(a) - r


def box(p, c, h, rnd=0.0):
    q = np.abs(p - np.asarray(c, float)) - (np.asarray(h, float) - rnd)
    return length(np.maximum(q, 0)) + np.minimum(q.max(-1), 0) - rnd


def cyl(p, cx, cy, r, z0, z1, rnd=0.0):
    d2 = np.sqrt((p[:, 0] - cx) ** 2 + (p[:, 1] - cy) ** 2) - r
    return extrude(d2, p[:, 2], z0, z1, rnd)


def sphere(p, c, r):
    return length(p - np.asarray(c, float)) - r


def ellipsoid(p, c, r):
    r = np.asarray(r, float)
    q = (p - np.asarray(c, float))
    k0 = length(q / r)
    k1 = length(q / (r * r))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def capsule(p, a, b, r, r2=None):
    """Capsule (or cone-capsule when r2 is given) from a to b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    pa, ba = p - a, b - a
    h = np.clip((pa @ ba) / max(ba @ ba, 1e-9), 0, 1)
    rad = r if r2 is None else r + (r2 - r) * h
    return length(pa - h[:, None] * ba) - rad


def torus_z(p, cx, cy, cz, big, small):
    q = np.sqrt((p[:, 0] - cx) ** 2 + (p[:, 1] - cy) ** 2) - big
    return np.sqrt(q * q + (p[:, 2] - cz) ** 2) - small


def tube(p, a, b, r, rnd=0.3):
    """Flat-ended cylinder from a to b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    L = math.sqrt(ba @ ba)
    u = ba / L
    pa = p - a
    t = pa @ u
    radial = length(pa - t[:, None] * u) - r
    axial = np.abs(t - L / 2) - L / 2
    return _cap(radial, axial, rnd)


def _cap(d2, dz, rnd):
    d2 = d2 + rnd
    dz = dz + rnd
    outside = np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(dz, 0) ** 2)
    return outside + np.minimum(np.maximum(d2, dz), 0) - rnd


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


# ---- Transforms -----------------------------------------------------------------------------

def rot_z(p, ang):
    """Rotates points by -ang about z (so a model is rotated by +ang, clockwise seen from above)."""
    c, s = math.cos(ang), math.sin(ang)
    q = p.copy()
    q[:, 0] = p[:, 0] * c - p[:, 1] * s
    q[:, 1] = p[:, 0] * s + p[:, 1] * c
    return q


def rot_x(p, ang):
    c, s = math.cos(ang), math.sin(ang)
    q = p.copy()
    q[:, 1] = p[:, 1] * c + p[:, 2] * s
    q[:, 2] = -p[:, 1] * s + p[:, 2] * c
    return q


def rot_y(p, ang):
    c, s = math.cos(ang), math.sin(ang)
    q = p.copy()
    q[:, 0] = p[:, 0] * c - p[:, 2] * s
    q[:, 2] = p[:, 0] * s + p[:, 2] * c
    return q


def heading(scene, ang):
    """Turns a north-facing model clockwise (seen from above) by `ang` radians."""
    def f(p):
        return scene(rot_z(p, ang))
    return f


def translate(scene, dx, dy, dz):
    off = np.array([dx, dy, dz], float)

    def f(p):
        return scene(p - off)
    return f


def scaled(scene, k):
    def f(p):
        return [(d * k, m) for d, m in scene(p / k)]
    return f


# ---- Rendering ------------------------------------------------------------------------------

def _dist(scene, p):
    parts = scene(p)
    d = parts[0][0]
    for dd, _ in parts[1:]:
        d = np.minimum(d, dd)
    return d


def _dist_mat(scene, p):
    parts = scene(p)
    ds = np.stack([np.broadcast_to(d, (len(p),)) for d, _ in parts])
    i = np.argmin(ds, 0)
    mats = np.array([m for _, m in parts])
    return ds[i, np.arange(len(p))], mats[i]


def _normals(scene, p):
    e = 0.04
    n = np.zeros_like(p)
    for k in range(3):
        o = np.zeros(3)
        o[k] = e
        n[:, k] = _dist(scene, p + o) - _dist(scene, p - o)
    return n / np.maximum(length(n)[:, None], 1e-9)


def _march(scene, o, d, tmax, steps=180):
    t = np.zeros(len(o))
    hit = np.zeros(len(o), bool)
    alive = np.ones(len(o), bool)
    for _ in range(steps):
        idx = np.nonzero(alive)[0]
        if len(idx) == 0:
            break
        p = o[idx] + d * t[idx, None]
        dd = _dist(scene, p)
        t[idx] += dd * 0.9
        h = dd < 0.015
        hit[idx[h]] = True
        alive[idx[h]] = False
        alive[idx[t[idx] > tmax]] = False
    return t, hit


def _soft_shadow(scene, p, L, k=10.0, n=40):
    res = np.ones(len(p))
    t = np.full(len(p), 0.35)
    alive = np.ones(len(p), bool)
    for _ in range(n):
        idx = np.nonzero(alive)[0]
        if len(idx) == 0:
            break
        h = _dist(scene, p[idx] + L * t[idx, None])
        res[idx] = np.minimum(res[idx], np.clip(k * h / t[idx], 0, 1))
        t[idx] += np.clip(h, 0.2, 3.0)
        alive[idx[(res[idx] < 0.01) | (t[idx] > 120)]] = False
    return np.clip(res, 0, 1)


def _ao(scene, p, n):
    occ = np.zeros(len(p))
    sca = 1.0
    for i in range(5):
        hr = 0.5 + 2.0 * i
        dd = _dist(scene, p + n * hr)
        occ += (hr - dd) * sca
        sca *= 0.72
    return np.clip(1 - 0.065 * occ, 0, 1)


def _hash_noise(p):
    """Cheap smooth-ish value noise in [-1, 1] for surface grain."""
    q = p * 0.9
    v = np.sin(q[:, 0] * 1.7 + np.sin(q[:, 1] * 2.3)) * np.sin(q[:, 1] * 1.9 + np.sin(q[:, 2] * 2.9)) \
        * np.sin(q[:, 2] * 2.1 + np.sin(q[:, 0] * 1.3))
    f = np.sin(p[:, 0] * 12.9898 + p[:, 1] * 78.233 + p[:, 2] * 37.719) * 43758.5453
    return 0.6 * v + 0.4 * (2 * (f - np.floor(f)) - 1)


def _env(r, L):
    up = np.clip((r[:, 2] + 0.15) / 0.9, 0, 1)[:, None]
    sky = np.array([0.60, 0.67, 0.78])
    ground = np.array([0.06, 0.065, 0.075])
    col = ground * (1 - up) + sky * up
    soft = np.clip(r @ L, 0, 1) ** 20 * 1.3
    return col + soft[:, None]


def render(scene, mats, cam: Camera, ground_shadow=0.0, shadow_radius=40.0, bloom=0.55,
           exposure=1.0):
    """Renders `scene` and returns an RGBA uint8 array (fh*ppu, fw*ppu, 4)."""
    W = int(round(cam.fw * cam.ppu))
    H = int(round(cam.fh * cam.ppu))
    S = cam.ss
    py, px = np.mgrid[0:H * S, 0:W * S]
    sx = (px.ravel() + 0.5) / (cam.ppu * S) - cam.ox
    sy = cam.oy - (py.ravel() + 0.5) / (cam.ppu * S)
    back = 400.0
    o = sx[:, None] * cam.R + sy[:, None] * cam.U - cam.D * back
    D, L = cam.D, cam.L
    V = -D
    Hh = (L + V) / np.linalg.norm(L + V)

    t, hit = _march(scene, o, D, tmax=back * 2)
    n_px = len(o)
    rgb = np.zeros((n_px, 3))
    alpha = np.zeros(n_px)
    glow = np.zeros((n_px, 3))

    hi = np.nonzero(hit)[0]
    if len(hi):
        p = o[hi] + D * t[hi, None]
        _, mat = _dist_mat(scene, p)
        n = _normals(scene, p)
        sh = _soft_shadow(scene, p + n * 0.25, L)
        ao = _ao(scene, p, n)
        alb = np.array([m.albedo for m in mats], float)[mat]
        grain = np.array([m.grain for m in mats], float)[mat]
        alb = alb * (1 + grain[:, None] * _hash_noise(p)[:, None])
        metal = np.array([m.metal for m in mats], float)[mat][:, None]
        ks = np.array([m.spec for m in mats], float)[mat][:, None]
        sp = np.array([m.power for m in mats], float)[mat]
        emi = np.array([m.emit for m in mats], float)[mat]
        ndl = np.clip(n @ L, 0, 1)[:, None] * sh[:, None]
        amb = (0.24 + 0.16 * n[:, 2:3]) * ao[:, None]
        refl = D - 2 * (n @ D)[:, None] * n
        spec = (np.clip(n @ Hh, 0, 1) ** sp)[:, None] * ks * (0.25 + 0.75 * sh[:, None])
        # Rim light from behind-left keeps silhouettes readable on dark maps.
        rim = (1 - np.clip(n @ V, 0, 1)) ** 3 * 0.18
        col = alb * (amb + ndl * (1.0 - 0.55 * metal)) \
            + metal * (0.3 + 0.7 * alb) * _env(refl, L) * (0.5 + 0.5 * ao[:, None]) \
            + spec * np.array([1.0, 0.97, 0.92]) + emi + rim[:, None] * (0.5 + alb)
        rgb[hi] = col * exposure
        alpha[hi] = 1
        glow[hi] = emi

    if ground_shadow > 0:
        mi = np.nonzero(~hit)[0]
        tg = (0 - o[mi, 2]) / D[2]
        g = o[mi] + D * tg[:, None]
        near = length(g[:, :2]) < shadow_radius
        gi = mi[near]
        g = g[near]
        if len(gi):
            occl = 1 - _soft_shadow(scene, g + np.array([0, 0, 0.05]), L, k=6.0)
            rgb[gi] = 0
            alpha[gi] = occl * ground_shadow

    rgb = rgb.reshape(H * S, W * S, 3)
    alpha = alpha.reshape(H * S, W * S)
    glow = glow.reshape(H * S, W * S, 3)
    pm = (rgb * alpha[..., None]).reshape(H, S, W, S, 3).mean((1, 3))
    a = alpha.reshape(H, S, W, S).mean((1, 3))
    gl = glow.reshape(H, S, W, S, 3).mean((1, 3))
    col = np.where(a[..., None] > 0, pm / np.maximum(a[..., None], 1e-6), 0)

    if bloom > 0 and gl.max() > 0:
        gl_img = Image.fromarray(np.clip(gl / 1.3 * 255, 0, 255).astype(np.uint8))
        b = np.asarray(gl_img.filter(ImageFilter.GaussianBlur(1.6 * cam.ppu)), float) / 255 * bloom
        col = col + b * (a[..., None] > 0.5)

    col = np.clip(col, 0, 1) ** (1 / 1.12)
    return np.dstack([col * 255, a * 255]).round().clip(0, 255).astype(np.uint8)


def drop_shadow(rgba, dx, dy, opacity=0.45, blur=2.0):
    """Adds a soft shadow of the sprite's silhouette offset by (dx, dy) pixels (for flyers)."""
    a = rgba[..., 3].astype(float) / 255
    sh = np.zeros_like(a)
    h, w = a.shape
    ys, xs = slice(max(dy, 0), h), slice(max(dx, 0), w)
    ys0, xs0 = slice(0, h - max(dy, 0)), slice(0, w - max(dx, 0))
    sh[ys, xs] = a[ys0, xs0]
    img = Image.fromarray((sh * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    sh = np.asarray(img, float) / 255 * opacity
    out_a = a + sh * (1 - a)
    rgb = rgba[..., :3].astype(float) * (a / np.maximum(out_a, 1e-6))[..., None]
    return np.dstack([rgb, out_a * 255]).round().clip(0, 255).astype(np.uint8)
