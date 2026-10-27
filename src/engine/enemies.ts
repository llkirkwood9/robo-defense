/**
 * Enemy unit definitions (port of the original `EnemyData`).
 */
import { GRID } from './constants';
import type { SpriteId } from './data/sprites';
import { SPRITES } from './data/sprites';
import { randomBelow } from './random';

export enum EnemyType {
  Soldier = 0,
  HeavySoldier = 1,
  Runner = 2,
  Truck = 3,
  LightTank = 4,
  HeavyTank = 5,
  Helicopter = 6,
  Jet = 7,
  Bomber = 8,
  Titan = 9,
  /** The mothership, which drops soldiers as it flies. */
  Dropper = 10,
}

export const ENEMY_TYPE_COUNT = 11;

export interface EnemyProps {
  name: string;
  /** Short code from the original game. */
  label: string;
  sprite: SpriteId;
  health: number;
  armor: number;
  isFlyer: boolean;
  /** Speed in sub-pixels per tick. */
  speed: number;
  /** Cash awarded for a kill. */
  value: number;
  /** Unit type dropped while flying, or -1. */
  dropType: EnemyType | -1;
  dropDelay: number;
  /** First level (wave number) this enemy can appear in. */
  firstLevel: number;
  minDifficulty: number;
  /** Animation advances every `frameSkip + 1` ticks. */
  frameSkip: number;
  /** Offset of the health bar from the sprite's left edge. */
  energyBarOffset: number;
  // Derived sprite geometry, in world pixels.
  frameWidth: number;
  frameHeight: number;
  framesPerDirection: number;
  drawShiftX: number;
  drawShiftY: number;
  /** Visual centre and visible size, used to aim projectiles at the body rather than the frame. */
  centerX: number;
  centerY: number;
  visibleWidth: number;
  visibleHeight: number;
}

interface EnemyDef {
  name: string;
  label: string;
  sprite: SpriteId;
  health: number;
  armor: number;
  isFlyer: boolean;
  speed: number;
  value: number;
  firstLevel: number;
  minDifficulty?: number;
  dropType?: EnemyType;
  dropDelay?: number;
  frameSkip?: number;
  energyBarOffset: number;
  /** [centreX, centreY, visibleWidth, visibleHeight] as ratios of the frame size. */
  shape?: [number, number, number, number];
}

const DEFS: Record<EnemyType, EnemyDef> = {
  [EnemyType.Soldier]: {
    name: 'Soldier',
    label: 'SLDR',
    sprite: 'soldier',
    health: 7,
    armor: 0,
    isFlyer: false,
    speed: 20,
    value: 1,
    firstLevel: 1,
    energyBarOffset: 3,
  },
  [EnemyType.HeavySoldier]: {
    name: 'Heavy Soldier',
    label: 'HSLD',
    sprite: 'heavy_soldier',
    health: 15,
    armor: 1,
    isFlyer: false,
    speed: 15,
    value: 2,
    firstLevel: 4,
    energyBarOffset: 3,
  },
  [EnemyType.Runner]: {
    name: 'Runner',
    label: 'RUNR',
    sprite: 'runner',
    health: 7,
    armor: 0,
    isFlyer: false,
    speed: 28,
    value: 2,
    firstLevel: 10,
    energyBarOffset: 3,
  },
  [EnemyType.Truck]: {
    name: 'Truck',
    label: 'TRUK',
    sprite: 'truck',
    health: 30,
    armor: 2,
    isFlyer: false,
    speed: 35,
    value: 3,
    firstLevel: 25,
    energyBarOffset: 3,
  },
  [EnemyType.LightTank]: {
    name: 'Light Tank',
    label: 'LTNK',
    sprite: 'light_tank',
    health: 60,
    armor: 6,
    isFlyer: false,
    speed: 10,
    value: 5,
    firstLevel: 15,
    energyBarOffset: 3,
  },
  [EnemyType.HeavyTank]: {
    name: 'Heavy Tank',
    label: 'HTNK',
    sprite: 'heavy_tank',
    health: 150,
    armor: 14,
    isFlyer: false,
    speed: 8,
    value: 10,
    firstLevel: 35,
    frameSkip: 1,
    energyBarOffset: 3,
  },
  [EnemyType.Helicopter]: {
    name: 'Helicopter',
    label: 'HELI',
    sprite: 'helicopter',
    health: 60,
    armor: 2,
    isFlyer: true,
    speed: 20,
    value: 8,
    firstLevel: 15,
    energyBarOffset: 10,
    shape: [0.5, 0.32, 0.666, 0.4],
  },
  [EnemyType.Jet]: {
    name: 'Jet',
    label: 'JET',
    sprite: 'jet',
    health: 70,
    armor: 0,
    isFlyer: true,
    speed: 32,
    value: 10,
    firstLevel: 30,
    energyBarOffset: 12,
    shape: [0.48, 0.27, 0.666, 0.5],
  },
  [EnemyType.Bomber]: {
    name: 'Bomber',
    label: 'BOMB',
    sprite: 'bomber',
    health: 200,
    armor: 4,
    isFlyer: true,
    speed: 15,
    value: 20,
    firstLevel: 40,
    energyBarOffset: 38,
    shape: [0.575, 0.348, 0.625, 0.348],
  },
  [EnemyType.Titan]: {
    name: 'Titan',
    label: 'TITN',
    sprite: 'titan',
    health: 3000,
    armor: 14,
    isFlyer: false,
    speed: 6,
    value: 250,
    firstLevel: 200,
    minDifficulty: 25,
    frameSkip: 1,
    energyBarOffset: 3,
  },
  [EnemyType.Dropper]: {
    name: 'Mothership',
    label: 'DRPR',
    sprite: 'mothership',
    health: 350,
    armor: 6,
    isFlyer: true,
    speed: 10,
    value: 30,
    firstLevel: 20,
    minDifficulty: 10,
    dropType: EnemyType.Soldier,
    dropDelay: 100,
    energyBarOffset: 19,
    shape: [0.5, 0.26, 1.0, 0.5],
  },
};

function build(def: EnemyDef): EnemyProps {
  const sheet = SPRITES[def.sprite];
  const [cx, cy, vw, vh] = def.shape ?? [0.5, 0.5, 1, 1];
  const w = sheet.frameWidth;
  const h = sheet.frameHeight;
  return {
    name: def.name,
    label: def.label,
    sprite: def.sprite,
    health: def.health,
    armor: def.armor,
    isFlyer: def.isFlyer,
    speed: Math.trunc((def.speed * GRID) / 40),
    value: def.value,
    dropType: def.dropType ?? -1,
    dropDelay: def.dropDelay ?? 0,
    firstLevel: def.firstLevel,
    minDifficulty: def.minDifficulty ?? 0,
    frameSkip: def.frameSkip ?? 0,
    energyBarOffset: def.energyBarOffset,
    frameWidth: w,
    frameHeight: h,
    framesPerDirection: Math.trunc(sheet.frames / 4),
    drawShiftX: Math.trunc((GRID - w) / 2),
    drawShiftY: GRID - h,
    centerX: Math.trunc(cx * w),
    centerY: Math.trunc(cy * h),
    visibleWidth: Math.trunc(vw * w),
    visibleHeight: Math.trunc(vh * h),
  };
}

export const ENEMIES: readonly EnemyProps[] = Array.from({ length: ENEMY_TYPE_COUNT }, (_, i) =>
  build(DEFS[i as EnemyType]),
);

/** Hit points for an enemy at a given wave and difficulty. */
export function enemyBaseHealth(type: EnemyType, level: number, difficulty: number): number {
  return Math.trunc((ENEMIES[type].health * (difficulty * 8 + 9 + level)) / 10);
}

/** Ticks a dying enemy keeps fading out. */
export function enemyDeathFrames(type: EnemyType): number {
  return (ENEMIES[type].value << 1) + 10;
}

/** Randomised delay before a dropper releases its next unit. */
export function enemyDropDelay(type: EnemyType): number {
  const p = ENEMIES[type];
  return p.dropType === -1 ? 0 : p.dropDelay + randomBelow(p.dropDelay);
}

/** Sprite frame index for an enemy facing `orientation` (1-4) on animation tick `frame`. */
export function enemyFrame(type: EnemyType, orientation: number, frame: number): number {
  const p = ENEMIES[type];
  if (p.framesPerDirection === 0) {
    return 0;
  }
  return (
    (orientation - 1) * p.framesPerDirection +
    (Math.trunc(frame / (p.frameSkip + 1)) % p.framesPerDirection)
  );
}
