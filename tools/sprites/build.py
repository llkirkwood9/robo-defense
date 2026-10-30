"""
Renders every sprite sheet into assets/sprites.

    python build.py                 # everything, in parallel
    python build.py gun_tower jet   # just these sheets
    python build.py --preview gun_tower --frames 0,1,9,17,25 --ss 2   # contact sheet only
    python build.py --skip-existing --out DIR   # resume an interrupted build into DIR

Sheets are packed as grids (row-major) so no texture is wider than MAX_SHEET_PX; the game derives
the same column count from the frame size (see `src/engine/data/sprites.ts`).
"""
import argparse
import math
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import fx  # noqa: E402
from palette import MATS  # noqa: E402
from r3d import Camera, render  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'sprites')
PPU = 2                 # output pixels per world pixel (keep in sync with SPRITE_RES in sprites.ts)
MAX_SHEET_PX = 2048


def registry():
    """sheet id -> dict(size=(fw, fh), frames=[job, ...])."""
    import enemies
    import effects
    import towers
    reg = {}
    for sid, frames in towers.sheets().items():
        reg[sid] = dict(size=(70, 70), frames=frames)
    reg.update(enemies.sheets())
    reg.update(effects.sheets())
    return reg


_REG = None


def _reg():
    global _REG
    if _REG is None:
        _REG = registry()
    return _REG


def render_job(sid, i, ss):
    sheet = _reg()[sid]
    fw, fh = sheet['size']
    job = sheet['frames'][i]
    w, h = fw * PPU, fh * PPU
    if 'fx' in job:
        kind, *args = job['fx']
        if kind == 'empty':
            img = fx.empty(w, h)
        else:
            img = getattr(fx, kind)(w, h, *args)
    elif 'draw' in job:
        img = job['draw'](w, h)
    else:
        cam = Camera(**job['cam'], ppu=PPU, ss=ss)
        img = render(job['scene'], MATS, cam,
                     ground_shadow=job.get('ground_shadow', 0.0),
                     shadow_radius=job.get('shadow_radius', 40.0))
    if 'glow' in job:
        color, strength = job['glow'][:2]
        kw = job['glow'][2] if len(job['glow']) > 2 else {}
        img = fx.add_glow(img, color, strength, **{k: v * PPU for k, v in kw.items()})
    if 'post' in job:
        img = job['post'](img)
    assert img.shape == (h, w, 4), (sid, i, img.shape)
    return img


def columns(fw, frames):
    return max(1, min(frames, MAX_SHEET_PX // (fw * PPU)))


def pack(sid, imgs):
    fw, fh = _reg()[sid]['size']
    cols = columns(fw, len(imgs))
    rows = math.ceil(len(imgs) / cols)
    w, h = fw * PPU, fh * PPU
    sheet = np.zeros((rows * h, cols * w, 4), np.uint8)
    for i, img in enumerate(imgs):
        r, c = divmod(i, cols)
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = img
    return sheet


def _task(args):
    sid, i, ss = args
    return sid, i, render_job(sid, i, ss)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--ss', type=int, default=3)
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--frames', default='')
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--skip-existing', action='store_true', help='skip sheets already in --out')
    ap.add_argument('--workers', type=int, default=max(1, (os.cpu_count() or 2) - 2))
    a = ap.parse_args()

    reg = _reg()
    ids = a.ids or list(reg)
    unknown = [i for i in ids if i not in reg]
    if unknown:
        sys.exit(f'unknown sheets: {unknown}')
    pick = [int(f) for f in a.frames.split(',')] if a.frames else None
    tasks = []
    for sid in ids:
        n = len(reg[sid]['frames'])
        for i in (pick if pick is not None else range(n)):
            if i < n:
                tasks.append((sid, i, a.ss))
    if a.skip_existing and not a.preview:
        tasks = [t for t in tasks if not os.path.exists(os.path.join(a.out, f'{t[0]}.png'))]
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    results = {}
    remaining = {}
    for sid, _, _ in tasks:
        remaining[sid] = remaining.get(sid, 0) + 1
    with ProcessPoolExecutor(a.workers) as ex:
        futures = [ex.submit(_task, t) for t in tasks]
        for k, fut in enumerate(as_completed(futures)):
            sid, i, img = fut.result()
            results[(sid, i)] = img
            remaining[sid] -= 1
            # Save each sheet as soon as all of its frames are done.
            if not a.preview and remaining[sid] == 0:
                imgs = [results.pop((sid, j)) for j in range(len(reg[sid]['frames']))]
                Image.fromarray(pack(sid, imgs), 'RGBA').save(os.path.join(a.out, f'{sid}.png'), optimize=True)
                print(f'saved {sid}', flush=True)
            if (k + 1) % 25 == 0 or k + 1 == len(tasks):
                print(f'{k + 1}/{len(tasks)} frames  {time.time() - t0:.0f}s', flush=True)

    if a.preview:
        rows = []
        for sid in ids:
            imgs = [results[(s, i)] for (s, i, _) in tasks if s == sid]
            rows.append(np.concatenate(imgs, 1))
        W = max(r.shape[1] for r in rows)
        canvas = np.zeros((sum(r.shape[0] for r in rows), W, 4), np.uint8)
        y = 0
        for r in rows:
            canvas[y:y + r.shape[0], :r.shape[1]] = r
            y += r.shape[0]
        bg = Image.new('RGBA', (W, canvas.shape[0]), (58, 84, 58, 255))
        bg.alpha_composite(Image.fromarray(canvas, 'RGBA'))
        path = os.path.join(a.out, 'preview.png')
        bg.save(path)
        print('preview', path)
        return

    print('done', len(remaining), 'sheets', f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
