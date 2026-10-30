# Sprite and map generator

All game art (sprite sheets, map backgrounds, title-screen portraits, app icons) is rendered
by these scripts from procedural models: nothing is traced or upscaled from other games.

Requires Python 3 with `numpy` and `Pillow`.

```bash
python build.py            # every sprite sheet -> assets/sprites (parallel; ~30 min)
python build.py gun_tower  # just one sheet
python build.py --preview --ss 2 --frames 0,1,9,17 gun_tower jet   # contact sheet only
python levels.py           # map backgrounds -> assets/levels
python titles.py           # title portraits + app icons -> assets/title, assets/ui
```

| File | Contents |
| --- | --- |
| `r3d.py` | Signed-distance-field ray-marcher (orthographic camera, soft shadows, AO, bloom) |
| `palette.py` | Shared materials |
| `towers.py`, `enemies.py`, `effects.py` | Models and frame lists for each sheet |
| `fx.py` | 2D effects: explosions, fire, glows, sparkles |
| `levels.py` | Height-field map backgrounds, VR Training tiles, Courtyard archway overlays |
| `titles.py` | Title-screen portraits and icons |

Sheets are rendered at `PPU` (2) image pixels per world pixel and packed into grids no wider
than 2048 px. `SPRITE_RES` and `MAX_SHEET_PX` in `src/engine/data/sprites.ts` must match.
Frame counts, sizes and orders follow `SPRITES` in that file: tower sheets are base + 32
turret headings clockwise from north (or animation frames), enemy sheets are four equal
groups facing right, up, left and down.
