/**
 * Core constants shared by the whole simulation.
 *
 * The original game picked a grid size per device (30/40/70 px). The port always simulates at the
 * HD size (70 world pixels per grid cell) because every bundled asset was authored at that size;
 * the renderer scales the world to the screen instead.
 */

/** World pixels per grid cell. */
export const GRID = 70;
/** Half a grid cell, in world pixels. */
export const GRID_HALF = GRID / 2;
/** Enemy offsets are tracked in sub-pixels: 1 world pixel = 2^SUB_SHIFT sub-pixels. */
export const SUB_SHIFT = 3;
/** One grid cell in sub-pixels. */
export const GRID_SUB = GRID << SUB_SHIFT;
/** Half a grid cell in sub-pixels. */
export const GRID_SUB_HALF = GRID_SUB / 2;

/** Simulation ticks per second (the original ran its state machine every 33 ms). */
export const TICKS_PER_SECOND = 30;
/** Extra ticks run per frame while fast-forwarding (original: 2 extra states per draw). */
export const FAST_FORWARD_EXTRA_TICKS = 2;

/** Movement directions. Also used as movement-grid cell values. */
export enum Dir {
  None = 0,
  Right = 1,
  Up = 2,
  Left = 3,
  Down = 4,
}

/** Special movement-grid cell values (directions 1-4 are the other legal values). */
export enum Cell {
  Open = 0,
  BlockingTower = 5,
  Wall = 6,
  End = 7,
  /** Fixed-path maps: buildable but not walkable. */
  OpenForTower = 8,
}

export const STARTING_HEALTH = 20;
export const STARTING_MONEY = 25;
/** Extra starting cash per path after the first, since towers have to be split between lanes. */
export const EXTRA_LANE_MONEY = 10;

/** Cash paid when a wave is cleared, so a few leaks don't starve the player of towers. */
export function waveClearBonus(level: number): number {
  return 2 + Math.trunc(level / 5);
}

/** Sending the next wave early pays this many times the clear bonus. */
export const CALL_WAVE_BONUS_MULTIPLIER = 2;

/** The first robot of every Nth wave is an Elite. */
export const ELITE_WAVE_INTERVAL = 10;
export const ELITE_HEALTH_MULTIPLIER = 5;
export const ELITE_VALUE_MULTIPLIER = 5;

/**
 * Version of the wave generator's rules. A quick save from another version regenerates a different
 * schedule from its seed, so it resumes from the start of its wave.
 */
export const BALANCE_VERSION = 3;

/** Reach of an Arc Crawler's pulse, in world pixels. */
export const JAM_RADIUS = GRID * 2.5;
/** Ticks a pulse stops a tower from firing. */
export const JAM_TICKS = 60;
/** Ticks after a jam ends during which a tower ignores pulses, so crawlers can't lock it down. */
export const JAM_IMMUNE_TICKS = 60;

/** Hard cap on simultaneously allocated enemies (mothership drops respect it). */
export const ENEMY_LIMIT = 100;

/** Run states of a game session. Values match the original for save compatibility of intent. */
export enum RunState {
  Running = 0,
  Lost = 1,
  Won = 2,
  Paused = 3,
  FastForward = 4,
  NotStarted = 5,
}

/** Number of message slots shown in the top-left message stack. */
export const MESSAGE_FRAMES = 45;
export const MESSAGE_ERROR_FRAMES = 90;
