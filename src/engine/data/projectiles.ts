/**
 * Projectile ("shot") types and their static properties (port of the original `BulletData`).
 */
import { GRID } from '../constants';
import type { SpriteId } from './sprites';
import { SPRITES } from './sprites';

export enum ShotType {
  None = 0,
  Teleport = 1,
  Bullet = 2,
  BigBullet = 3,
  Slow = 4,
  Rocket = 5,
  Fire = 6,
  AntiairBullet = 7,
  SurfaceToAir = 8,
  Mortar = 9,
  Artillery = 10,
  Mine = 11,
  UraniumBullet = 12,
  NapalmShell = 13,
  SlowFire = 14,
}

export interface ProjectileProps {
  /** World pixels travelled per tick. */
  speed: number;
  /** Sprite, or null for projectiles drawn as coloured squares. */
  sprite: SpriteId | null;
  /** Drawn size in world pixels (sprite height, or square size). */
  size: number;
  /** ARGB colour (signed 32-bit, as in the original) for square projectiles. */
  color: number;
}

const speedFromGridPercent = (pct: number) => Math.trunc((GRID * pct) / 100);

const sprite = (pct: number, id: SpriteId): ProjectileProps => ({
  speed: speedFromGridPercent(pct),
  sprite: id,
  size: SPRITES[id].frameHeight,
  color: 0,
});

const square = (pct: number, size: number, color: number): ProjectileProps => ({
  speed: speedFromGridPercent(pct),
  sprite: null,
  size,
  color,
});

const NONE: ProjectileProps = { speed: 0, sprite: null, size: 0, color: 0 };

export const PROJECTILES: Readonly<Record<ShotType, ProjectileProps>> = {
  [ShotType.None]: NONE,
  [ShotType.Teleport]: NONE,
  [ShotType.Bullet]: sprite(50, 'bullet_small'),
  [ShotType.BigBullet]: sprite(50, 'bullet_large'),
  [ShotType.Slow]: square(25, 6, -2139029632),
  [ShotType.Rocket]: sprite(15, 'rocket'),
  [ShotType.Fire]: square(40, 10, -2130739200),
  [ShotType.AntiairBullet]: sprite(50, 'bullet_large'),
  [ShotType.SurfaceToAir]: sprite(20, 'missile'),
  [ShotType.Mortar]: sprite(30, 'shell_small'),
  [ShotType.Artillery]: sprite(45, 'shell_large'),
  [ShotType.Mine]: NONE,
  [ShotType.UraniumBullet]: sprite(50, 'uranium_bullet'),
  [ShotType.NapalmShell]: sprite(45, 'shell_large'),
  [ShotType.SlowFire]: square(40, 15, -2130706688),
};

/** Squared radius of mortar/artillery splash damage. */
export const SPLASH_RADIUS_SQ = (GRID * GRID) / 4;
/** Squared radius of a mine blast. */
export const MINE_RADIUS_SQ = GRID * 2 * GRID;

/** Shots that arc through the air and splash on impact. */
export const isShell = (t: ShotType) =>
  t === ShotType.Mortar || t === ShotType.Artillery || t === ShotType.NapalmShell;

/** Shots that leave a smoke trail and explode on impact. */
export const isMissile = (t: ShotType) => t === ShotType.Rocket || t === ShotType.SurfaceToAir;

/** Sound effect groups (the original's `SoundManager` mapping). */
export enum SoundEffect {
  Gun = 0,
  Ice = 1,
  Rocket = 2,
  Fire = 3,
  Mortar = 4,
}

export function soundForShot(t: ShotType): SoundEffect {
  switch (t) {
    case ShotType.Slow:
      return SoundEffect.Ice;
    case ShotType.Rocket:
    case ShotType.SurfaceToAir:
      return SoundEffect.Rocket;
    case ShotType.Fire:
    case ShotType.SlowFire:
      return SoundEffect.Fire;
    case ShotType.Mortar:
    case ShotType.Artillery:
    case ShotType.NapalmShell:
      return SoundEffect.Mortar;
    default:
      return SoundEffect.Gun;
  }
}
