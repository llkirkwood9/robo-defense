/**
 * Enemy waves (port of `LevelDataGenerator` and the wave half of `LevelData`).
 *
 * A game has 100 levels ("waves"). Each wave is a list of groups, packed as
 * `(innerDelay << 24) | (initialDelay << 15) | (type << 10) | (count << 3) | path`, followed by a
 * 0 terminator. The whole schedule is generated from a seed so saved games can regenerate it.
 */
import { ENEMIES, ENEMY_TYPE_COUNT, enemyBaseHealth, EnemyType } from './enemies';
import { JavaRandom } from './random';

export const NUM_LEVELS = 100;
const HEALTH_ACCEL = 130;
const HEALTH_SWING_PCT = 10;
const INTRA_LEVEL_DELAY = 120;
const MAX_UNIT_COUNT = 20;
const GROUPS_MASK = 3;
const TYPE_MASK = 96;

/** Difficulty used for a given wave in survival mode (it ramps up every wave). */
export function survivalDifficulty(level: number): number {
  return Math.trunc(Math.pow(level, 1.5));
}

/** Generates the packed wave schedule. */
export function generateWaves(
  seed: number,
  difficulty: number,
  pathCount: number,
  survival: boolean,
): number[] {
  const random = new JavaRandom(seed);
  const data: number[] = [];
  let idx = 0;
  let maxUnitCount = MAX_UNIT_COUNT;
  let level = 1;
  let diff = difficulty;
  let startingHealth = 0;

  const append = (v: number) => {
    data[idx++] = v;
  };

  const unitCount = (health: number, type: EnemyType) => {
    const base = enemyBaseHealth(type, level, diff);
    return Math.trunc(((base >> 1) + health) / base);
  };

  const unitTypeValid = (type: EnemyType, health: number, flying: boolean, ground: boolean) => {
    const p = ENEMIES[type];
    if (level < p.firstLevel || diff < p.minDifficulty) {
      return false;
    }
    const count = unitCount(health, type);
    if (count === 0 || count > maxUnitCount) {
      return false;
    }
    if (!flying && p.isFlyer) {
      return false;
    }
    return ground || p.isFlyer;
  };

  const addGroup = (type: EnemyType, health: number, firstGroup: boolean) => {
    let initialDelay = firstGroup ? INTRA_LEVEL_DELAY : random.nextInt(20) + 10;
    if (idx === 0) {
      initialDelay = 240;
    }
    const innerDelay = random.nextInt(20) + 10;
    const count = unitCount(health, type);
    const path = pathCount > 1 ? random.nextInt(pathCount) : 0;
    append((innerDelay << 24) | (initialDelay << 15) | (type << 10) | (count << 3) | path);
  };

  const tryAddGroup = (health: number, flying: boolean, ground: boolean, first: boolean) => {
    // Skip a random number of valid unit types to pick one.
    let skip = random.nextInt(ENEMY_TYPE_COUNT);
    let typeNum = 0;
    for (; typeNum < ENEMY_TYPE_COUNT * ENEMY_TYPE_COUNT; typeNum++) {
      if (unitTypeValid(typeNum % ENEMY_TYPE_COUNT, health, flying, ground)) {
        if (skip <= 0) {
          break;
        }
        skip--;
      }
    }
    if (typeNum >= ENEMY_TYPE_COUNT * ENEMY_TYPE_COUNT) {
      return false;
    }
    addGroup(typeNum % ENEMY_TYPE_COUNT, health, first);
    return true;
  };

  const tryCreateLevel = (health: number, features: number) => {
    const groups = (features & GROUPS_MASK) + 1;
    const healthPerGroup = Math.trunc(health / groups);
    // Ground units are always allowed; some feature masks also allow flyers.
    const typeBits = features & TYPE_MASK;
    const flying = typeBits === 0 || typeBits === TYPE_MASK;
    let ok = healthPerGroup >= startingHealth;
    for (let g = 0; ok && g < groups; g++) {
      ok = tryAddGroup(healthPerGroup, flying, true, g === 0);
    }
    if (ok) {
      append(0);
    }
    return ok;
  };

  const adjustHealth = (health: number) => {
    const n = random.nextInt(16777215);
    const increase = (n & 1) === 1;
    const swing = Math.trunc((health * HEALTH_SWING_PCT) / 100) + 1;
    return increase ? health + ((n >> 1) % swing) : health - ((n >> 1) % swing);
  };

  for (; level <= NUM_LEVELS; level++) {
    if (survival) {
      diff = survivalDifficulty(level);
    }
    startingHealth = Math.trunc((enemyBaseHealth(EnemyType.Soldier, 1, diff) * 5) / 4);
    const accel = diff * 20 + HEALTH_ACCEL;
    const l = level - 1;
    let health = adjustHealth(
      startingHealth + startingHealth * l + Math.trunc((l * l * Math.trunc(accel / 100)) / 2),
    );

    const saveIdx = idx;
    let features = random.nextInt(128);
    while (!tryCreateLevel(health, features)) {
      features++;
      idx = saveIdx;
      if (features > 254) {
        health = Math.max(startingHealth, Math.trunc((health * 9) / 10));
        maxUnitCount++;
      }
    }
  }
  return data.slice(0, idx);
}

/** Serializable progress through the wave schedule. */
export interface WaveCursor {
  index: number;
  subIndex: number;
  frameIndex: number;
  levelNum: number;
}

/** Steps through a generated wave schedule, releasing enemies over time. */
export class WaveRunner {
  cursor: WaveCursor = { index: 0, subIndex: 0, frameIndex: 0, levelNum: 1 };
  /** Unit released this tick, or -1. */
  unitType: EnemyType | -1 = -1;
  unitPath = -1;
  private data: number[] = [];

  setSchedule(data: number[]): void {
    this.data = data;
  }

  get levelNum(): number {
    return this.cursor.levelNum;
  }

  /** Advances one tick; sets `unitType`/`unitPath` when a unit should spawn. */
  tick(): void {
    this.unitType = -1;
    this.unitPath = -1;
    const c = this.cursor;
    const val = this.data[c.index] ?? 0;
    if (val === 0) {
      return;
    }
    c.frameIndex++;
    const type = (val >> 10) & 31;
    const count = (val >> 3) & 127;
    const path = val & 7;
    const delay = c.subIndex === 0 ? (val >> 15) & 511 : (val >> 24) & 127;
    if (c.frameIndex >= delay) {
      c.frameIndex = 0;
      this.unitType = type;
      this.unitPath = path;
      c.subIndex++;
      if (c.subIndex >= count) {
        c.subIndex = 0;
        c.index++;
      }
    }
  }

  /** True once every group of the current wave has spawned. */
  get waveSpawned(): boolean {
    return (this.data[this.cursor.index] ?? 0) === 0;
  }

  /** Developer tool: drops the current wave's remaining spawns. */
  skipSpawns(): void {
    const c = this.cursor;
    while ((this.data[c.index] ?? 0) !== 0) {
      c.index++;
    }
    c.subIndex = 0;
    c.frameIndex = 0;
  }

  /** Moves to the next wave. Returns false when the last wave has been completed. */
  nextLevel(): boolean {
    const c = this.cursor;
    if (c.index >= this.data.length - 1 || this.data[c.index] !== 0) {
      return false;
    }
    c.index++;
    c.levelNum++;
    return true;
  }
}
