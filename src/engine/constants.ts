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
