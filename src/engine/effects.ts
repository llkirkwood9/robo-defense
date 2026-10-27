/**
 * Short-lived visual effects produced by the simulation.
 *
 * The original stored these as pooled `GameEvent`s with integer var slots; here they are plain
 * typed records that the renderer draws and the simulation prunes when they expire.
 */
import type { EnemyType } from './enemies';
import type { SpriteId } from './data/sprites';
import { SPRITES } from './data/sprites';
import { fastRandomInt } from './random';

export enum ExplosionType {
  Blast = 0,
  Teleport = 1,
}

export const EXPLOSION_SPRITES: Record<ExplosionType, SpriteId> = {
  [ExplosionType.Blast]: 'explosion',
  [ExplosionType.Teleport]: 'teleport_explosion',
};

/** Size (world pixels) of an explosion frame. */
export const explosionSize = (type: ExplosionType) => SPRITES[EXPLOSION_SPRITES[type]].frameWidth;

/** A square that drifts and fades out (rocket smoke, shockwave flash). */
export interface Particle {
  /** Position and velocity in sub-pixels (world px << 3). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** ARGB colour; alpha is replaced by the fade. */
  color: number;
  maxAlpha: number;
  size: number;
  firstTick: number;
  ticks: number;
}

export interface Explosion {
  type: ExplosionType;
  /** Top-left corner in world pixels. */
  x: number;
  y: number;
  firstTick: number;
  frames: number;
}

/** "$N" text that floats up from a destroyed enemy. */
export interface KillPopup {
  tick: number;
  enemyType: EnemyType;
  x: number;
  y: number;
}

/** How many ticks a kill popup stays visible. */
export const KILL_POPUP_TICKS = 10;

export function makeExplosion(type: ExplosionType, x: number, y: number, tick: number): Explosion {
  const maxFrames = SPRITES[EXPLOSION_SPRITES[type]].frames;
  // Random length; Java remainder semantics mean half of these are short (2-frame) puffs.
  const frames = Math.max(2, fastRandomInt() % (maxFrames + 1));
  return { type, x, y, firstTick: tick, frames };
}
