"""Projectiles and effect sheets."""
import math

import numpy as np

from palette import M
from r3d import capsule, cyl, heading, rot_z, scaled, sphere, tube

TAU = math.pi * 2


def rocket_model(body, nose, flame_len):
    """Small rocket along +y, centred on the origin."""
    def scene(p):
        parts = [
            (capsule(p, (0, -6, 0), (0, 6, 0), 1.7), M[body]),
            (capsule(p, (0, 6, 0), (0, 10, 0), 1.7, 0.2), M[nose]),
            (capsule(p, (0, -9, 0), (0, -6.5, 0), 1.3), M['black']),
            (capsule(p, (0, -15 - flame_len, 0), (0, -9, 0), 0.3, 1.3), M['molten']),
        ]
        for a in range(4):
            q = rot_z(p, a * TAU / 4 + TAU / 8)
            parts.append((capsule(q, (0, -6, 2.4), (0, -2, 2.0), 0.55), M[nose]))
        return parts
    return scene


def projectile_frames(size, scene, k):
    cam = dict(fw=size, fh=size, ox=size / 2, oy=size / 2, elev=72)
    return [dict(scene=heading(scaled(scene, k), f * TAU / 32), cam=cam) for f in range(32)]


def sheets():
    s = {
        'bullet_small': dict(size=(35, 35), frames=[dict(fx=('glow_sprite', 'amber', 0.1, 0.42))]),
        'bullet_large': dict(size=(70, 70), frames=[dict(fx=('glow_sprite', 'amber', 0.06, 0.32))]),
        'uranium_bullet': dict(size=(70, 70), frames=[dict(fx=('glow_sprite', 'red', 0.06, 0.32))]),
        'shell_small': dict(size=(35, 35), frames=[dict(fx=('glow_sprite', 'green', 0.1, 0.42))]),
        'shell_large': dict(size=(70, 70), frames=[dict(fx=('glow_sprite', 'green', 0.06, 0.32))]),
        'rocket': dict(size=(39, 39), frames=projectile_frames(39, rocket_model('white', 'red', 1), 0.95)),
        'missile': dict(size=(70, 70), frames=projectile_frames(70, rocket_model('white', 'blue', 3), 1.9)),
        'explosion': dict(size=(70, 70), frames=[dict(fx=('explosion', f / 20)) for f in range(20)]),
        'teleport_explosion': dict(size=(70, 70), frames=[dict(fx=('teleport_burst', f / 26)) for f in range(26)]),
        'fire': dict(size=(35, 35), frames=[dict(fx=('fire', f / 25)) for f in range(25)]),
    }
    import levels
    s.update(levels.sprite_sheets())
    return s
