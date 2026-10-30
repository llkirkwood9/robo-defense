"""
Home-screen robot portraits (assets/title/titleN_nobg.png) and the app icons, rendered from the
same models as the game sprites but larger and from a lower three-quarter angle.

    python titles.py
"""
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import enemies  # noqa: E402
import towers  # noqa: E402
from palette import MATS  # noqa: E402
from r3d import Camera, heading, render, scaled, translate  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TAU = math.pi * 2
SIZE = 512

# (model, frame size in world units, ground origin row, model scale)
PORTRAITS = [
    (enemies.heavy_soldier(0.15), 52, 44, 1.0),
    (enemies.soldier(0.2), 52, 46, 1.0),
    (enemies.light_tank(0), 64, 40, 1.0),
    (enemies.runner(0.3), 52, 38, 1.0),
    (enemies.titan(0.2), 130, 118, 1.0),
    (enemies.truck(0), 64, 40, 1.0),
    (translate(enemies.helicopter(0.1), 0, 0, 0), 84, 44, 1.0),
    (enemies.jet(), 76, 40, 1.0),
    (enemies.bomber(), 84, 42, 1.0),
]


def portrait(model, fw, oy, k, ss=3):
    """Renders large, then crops to the silhouette (with a margin) and fits it to SIZE."""
    big = SIZE * 1.6
    cam = Camera(fw=fw, fh=fw, ox=fw / 2, oy=oy, elev=24, ppu=big / fw, ss=ss)
    scene = heading(scaled(model, k) if k != 1 else model, TAU * 0.62)
    img = render(scene, MATS, cam, bloom=0.5)
    ys, xs = np.nonzero(img[..., 3] > 8)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 * 1.08
    box_ = tuple(int(round(v)) for v in (cx - half, cy - half, cx + half, cy + half))
    return np.asarray(Image.fromarray(img, 'RGBA').crop(box_).resize((SIZE, SIZE), Image.LANCZOS))


def tower_hero():
    base = towers.gun_base(3)
    turret = translate(scaled(towers.gun_turret(3), 1.3), 0, 0, towers.DECK)

    def scene(p):
        return base(p) + turret(p)
    return heading(scene, TAU * 0.58)


def icon(size, bg, inset):
    fw = 100 / inset
    cam = Camera(fw=fw, fh=fw, ox=fw / 2, oy=fw / 2 + 22, elev=34, ppu=size / fw, ss=2)
    img = render(tower_hero(), MATS, cam, bloom=0.6)
    if not bg:
        return img
    y, x = np.mgrid[0:size, 0:size] / size
    g = np.exp(-((x - 0.5) ** 2 + (y - 0.42) ** 2) / 0.18)
    back = np.dstack([0.02 + 0.10 * g, 0.03 + 0.16 * g, 0.06 + 0.26 * g]) * 255
    a = img[..., 3:4] / 255
    rgb = img[..., :3] * a + back * (1 - a)
    return np.dstack([rgb, np.full((size, size), 255)]).round().clip(0, 255).astype(np.uint8)


def _job(i):
    if i < len(PORTRAITS):
        model, fw, oy, k = PORTRAITS[i]
        return i, portrait(model, fw, oy, k, ss=2)
    return i, icon(1024, i == len(PORTRAITS), 0.78 if i == len(PORTRAITS) else 0.56)


def main(out_root=ROOT):
    from concurrent.futures import ProcessPoolExecutor
    title_dir = os.path.join(out_root, 'assets', 'title')
    ui = os.path.join(out_root, 'assets', 'ui')
    os.makedirs(title_dir, exist_ok=True)
    os.makedirs(ui, exist_ok=True)
    with ProcessPoolExecutor() as ex:
        for i, img in ex.map(_job, range(len(PORTRAITS) + 2)):
            if i < len(PORTRAITS):
                Image.fromarray(img, 'RGBA').save(os.path.join(title_dir, f'title{i + 1}_nobg.png'), optimize=True)
            elif i == len(PORTRAITS):
                Image.fromarray(img, 'RGBA').save(os.path.join(ui, 'icon.png'), optimize=True)
                Image.fromarray(img, 'RGBA').resize((48, 48), Image.LANCZOS).save(os.path.join(ui, 'favicon.png'))
            else:
                # Android adaptive foreground and splash: transparent, inside the central safe zone.
                Image.fromarray(img, 'RGBA').save(os.path.join(ui, 'splash-icon.png'), optimize=True)
            print('done', i, flush=True)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT)
