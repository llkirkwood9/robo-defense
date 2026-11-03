"""
Map picker thumbnails (assets/levels/previews/*.jpg): each map with the decorations and lamps the
game draws on top of it, over its backdrop. Run the map art first, then feed in the game's layouts:

    npm run -s map-layouts | python previews.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PPU = 2
W, H = 600, 360         # 5:3, the shape of the 20x12 maps
MIN_ROWS = 16           # tall maps are cropped to about this many rows rather than shrunk to a sliver


def sprite_frame(sid, fw, fh):
    sheet = Image.open(os.path.join(ROOT, 'assets', 'sprites', f'{sid}.png')).convert('RGBA')
    return sheet.crop((0, 0, fw * PPU, fh * PPU))


def backdrop(kind):
    if kind == 'clouds':
        out = Image.new('RGBA', (W, H))
        for sid, tile in (('clouds_far', 620), ('clouds_near', 480)):
            layer = sprite_frame(sid, 512, 512).resize((tile, tile), Image.LANCZOS)
            for x in range(0, W, tile):
                for y in range(0, H, tile):
                    out.alpha_composite(layer, (x, y))
        return out
    rng = np.random.default_rng(7)
    a = np.zeros((H, W, 3), np.float32) + np.array([5, 7, 13], np.float32)
    for _ in range(420):
        a[rng.integers(0, H), rng.integers(0, W)] = rng.uniform(70, 255)
    return Image.fromarray(a.astype(np.uint8)).convert('RGBA')


def add_lights(img, lights, scale, ox, oy):
    """Adds each lamp's soft glow and bright core, like Ambience.drawLights in the game."""
    a = np.asarray(img.convert('RGB'), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for lamp in lights:
        cx, cy = lamp['x'] * scale + ox, lamp['y'] * scale + oy
        r = max(lamp['radius'] * scale * 1.3, 3.5)
        d = np.hypot(xx - cx, yy - cy) / r
        color = np.array(lamp['color'], np.float32)
        glow = np.clip(1 - d, 0, 1) ** 2 * 0.85
        a += glow[..., None] * color
        if lamp['radius'] < 40:
            core = np.clip(1.6 - d * 5, 0, 1)
            a = a * (1 - core[..., None]) + core[..., None] * (color * 0.45 + 140)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8)).convert('RGBA')


def main():
    out_dir = os.path.join(ROOT, 'assets', 'levels', 'previews')
    os.makedirs(out_dir, exist_ok=True)
    for m in json.load(sys.stdin):
        mw, mh = m['width'] * 70, m['height'] * 70
        scale = max(min(W / mw, H / mh), H / (MIN_ROWS * 70))
        ox, oy = (W - mw * scale) / 2, (H - mh * scale) / 2
        path = os.path.join(ROOT, 'assets', 'levels', f"{m['image']}.webp")
        if not os.path.exists(path):
            path = path[:-4] + 'jpg'
        size = (round(mw * scale), round(mh * scale))
        canvas = Image.new('RGBA', (mw * PPU, mh * PPU), (0, 0, 0, 0))
        canvas.alpha_composite(Image.open(path).convert('RGBA'))
        for d in m['decorations']:
            frame = sprite_frame(d['sprite'], d['w'], d['h'])
            canvas.alpha_composite(frame, (round(d['x'] * PPU), round(d['y'] * PPU)))
        img = backdrop(m['backdrop'])
        img.alpha_composite(canvas.resize(size, Image.LANCZOS), (round(ox), round(oy)))
        img = add_lights(img, m['lights'], scale, ox, oy)
        img.convert('RGB').save(os.path.join(out_dir, f"{m['image']}.jpg"), quality=86, optimize=True, progressive=True)
        print('saved', m['image'])


if __name__ == '__main__':
    main()
