/**
 * Path finding for ground units (port of the original `MovementGrid`).
 *
 * Each enemy path has its own grid. `calcPaths` runs a breadth-first flood from the exit so every
 * open cell stores the direction a unit should walk to get one step closer to the exit. Tower
 * placement is validated with a depth-first search from the entrance on a scratch grid, so the
 * player can never wall off a path completely.
 */
import { Cell, Dir } from './constants';
import type { MapLayout, Obstacle } from './maps';

/** Minimal tower/enemy views needed for path checks. */
export interface GridTower {
  gridX: number;
  gridY: number;
  blocking: boolean;
}
export interface GridEnemy {
  gridX: number;
  gridY: number;
  pathNum: number;
}

export class MovementGrid {
  readonly width: number;
  readonly height: number;
  readonly endX: number;
  readonly endY: number;
  private readonly startX: number;
  private readonly startY: number;
  private readonly grid: Int8Array;
  private readonly trial: Int8Array;
  private pending: number[] = [];
  private cachedX = -1;
  private cachedY = -1;
  private cachedResult = false;

  constructor(
    private readonly layout: MapLayout,
    pathNum: number,
  ) {
    this.width = layout.width;
    this.height = layout.height;
    const path = layout.paths[pathNum];
    this.startX = path.startX;
    this.startY = path.startY;
    this.endX = path.endX;
    this.endY = path.endY;
    this.grid = new Int8Array(this.width * this.height);
    this.trial = new Int8Array(this.width * this.height);
    this.calcPaths([]);
  }

  /** Walking direction (1-4) stored for a cell, or a `Cell` marker. */
  orientation(x: number, y: number): number {
    return this.grid[this.width * y + x];
  }

  /**
   * Checks whether a tower may be placed at (x, y) without blocking this path.
   * When `enemies` is given (the final placement check), every enemy on this path must also
   * still be able to reach the exit.
   */
  checkTowerPlacement(
    towers: readonly GridTower[],
    enemies: readonly GridEnemy[] | null,
    x: number,
    y: number,
    pathNum: number,
    blocking: boolean,
  ): boolean {
    if (x !== this.cachedX || y !== this.cachedY || enemies !== null) {
      this.cachedX = x;
      this.cachedY = y;
      this.cachedResult = this.searchGreedy(towers, x, y, blocking, enemies !== null);
      if (this.cachedResult && enemies !== null) {
        for (const e of enemies) {
          if (e.pathNum === pathNum && this.trial[e.gridY * this.width + e.gridX] === 0) {
            this.cachedResult = false;
            break;
          }
        }
      }
    }
    return this.cachedResult;
  }

  /** Used by the VR Training generator: would adding `candidate` keep this path open? */
  checkObstacleLayout(current: readonly Obstacle[], candidate: Obstacle): boolean {
    this.initGrid(this.trial, []);
    for (const o of current) {
      if (!this.addObstacle(o)) {
        return false;
      }
    }
    return this.addObstacle(candidate) && this.findPathGreedy(false);
  }

  /** Recomputes walking directions for the current set of towers. */
  calcPaths(towers: readonly GridTower[]): void {
    this.cachedX = -1;
    this.cachedY = -1;
    const w = this.width;
    this.initGrid(this.grid, towers);
    this.grid[this.startY * w + this.startX] = Cell.Open;

    if (this.endX === 0) {
      this.startPending(1, this.endY, Dir.Left);
    } else if (this.endX === w - 1) {
      this.startPending(w - 2, this.endY, Dir.Right);
    } else if (this.endY === 0) {
      this.startPending(this.endX, 1, Dir.Up);
    } else if (this.endY === this.height - 1) {
      this.startPending(this.endX, this.height - 2, Dir.Down);
    } else {
      this.startPending(this.endX + 1, this.endY, Dir.Left);
      this.startPending(this.endX - 1, this.endY, Dir.Right);
      this.startPending(this.endX, this.endY - 1, Dir.Down);
      this.startPending(this.endX, this.endY + 1, Dir.Up);
    }

    // Breadth-first flood. `pending` is consumed as a queue.
    for (let i = 0; i < this.pending.length; i++) {
      const node = this.pending[i];
      const x = node >> 16;
      const y = node & 0xffff;
      if (x === this.startX && y === this.startY) {
        // The entrance cell points straight into the map.
        let dir: Dir;
        if (this.startX === 0) {
          dir = Dir.Right;
        } else if (this.startX === w - 1) {
          dir = Dir.Left;
        } else if (this.startY === 0) {
          dir = Dir.Down;
        } else {
          dir = Dir.Up;
        }
        this.grid[w * y + x] = dir;
      } else {
        this.pushPending(x, y);
      }
    }
  }

  private searchGreedy(
    towers: readonly GridTower[],
    x: number,
    y: number,
    blocking: boolean,
    iterateAll: boolean,
  ): boolean {
    this.initGrid(this.trial, towers);
    if (x > -1) {
      const cell = this.trial[this.width * y + x];
      if (cell !== Cell.Open && cell !== Cell.OpenForTower) {
        return false;
      }
      if (towers.some((t) => t.gridX === x && t.gridY === y)) {
        return false;
      }
    }
    if (blocking) {
      this.trial[this.width * y + x] = Cell.BlockingTower;
      return this.findPathGreedy(iterateAll);
    }
    return true;
  }

  private addObstacle(o: Obstacle): boolean {
    for (let y = o.y; y < o.y + o.h; y++) {
      for (let x = o.x; x < o.x + o.w; x++) {
        const idx = this.width * y + x;
        if (this.trial[idx] !== Cell.Open) {
          return false;
        }
        this.trial[idx] = Cell.Wall;
      }
    }
    return true;
  }

  /**
   * Depth-first search from the entrance to the exit on the trial grid, preferring steps towards
   * the exit. Visited cells are marked with 1. With `iterateAll` the whole reachable area is
   * visited so enemy positions can be checked afterwards.
   */
  private findPathGreedy(iterateAll: boolean): boolean {
    const w = this.width;
    const t = this.trial;
    const { endX, endY } = this;
    t[endY * w + endX] = Cell.Open;

    let x: number;
    let y: number;
    if (this.startX === 0) {
      x = 1;
      y = this.startY;
    } else if (this.startX === w - 1) {
      x = this.startX - 1;
      y = this.startY;
    } else if (this.startY === 0) {
      x = this.startX;
      y = 1;
    } else {
      x = this.startX;
      y = this.startY - 1;
    }
    if (t[w * y + x] !== Cell.Open) {
      return false;
    }

    const stack: number[] = [(x << 16) | y];
    let success = false;
    const tryPush = (px: number, py: number) => {
      if (t[w * py + px] === Cell.Open) {
        stack.push((px << 16) | py);
      }
    };

    while (stack.length > 0) {
      const node = stack.pop()!;
      const cx = node >> 16;
      const cy = node & 0xffff;
      t[w * cy + cx] = 1;
      if (cx === endX && cy === endY) {
        success = true;
        if (!iterateAll) {
          break;
        }
      } else if (cx < endX) {
        // Last pushed is explored first, so the step towards the exit goes last.
        tryPush(cx - 1, cy);
        tryPush(cx, cy - 1);
        tryPush(cx, cy + 1);
        tryPush(cx + 1, cy);
      } else if (cx > endX) {
        tryPush(cx + 1, cy);
        tryPush(cx, cy - 1);
        tryPush(cx, cy + 1);
        tryPush(cx - 1, cy);
      } else if (cy < endY) {
        tryPush(cx, cy - 1);
        tryPush(cx - 1, cy);
        tryPush(cx + 1, cy);
        tryPush(cx, cy + 1);
      } else {
        tryPush(cx, cy + 1);
        tryPush(cx - 1, cy);
        tryPush(cx + 1, cy);
        tryPush(cx, cy - 1);
      }
    }
    return success;
  }

  private initGrid(grid: Int8Array, towers: readonly GridTower[]): void {
    const { width: w, height: h, layout } = this;
    grid.fill(layout.fixedPath ? Cell.OpenForTower : Cell.Open);
    this.pending = [];
    for (let x = 0; x < w; x++) {
      grid[x] = Cell.Wall;
      grid[w * (h - 1) + x] = Cell.Wall;
    }
    for (let y = 1; y < h; y++) {
      grid[w * y] = Cell.Wall;
      grid[w * y + w - 1] = Cell.Wall;
    }
    for (const t of towers) {
      if (t.blocking) {
        grid[t.gridY * w + t.gridX] = Cell.BlockingTower;
      }
    }
    // On fixed-path maps the "obstacles" are the walkable path cells.
    const fill = layout.fixedPath ? Cell.Open : Cell.Wall;
    for (const o of layout.obstacles) {
      for (let y = o.y; y < o.y + o.h; y++) {
        for (let x = o.x; x < o.x + o.w; x++) {
          grid[w * y + x] = fill;
        }
      }
    }
    grid[this.endY * w + this.endX] = Cell.End;
  }

  private startPending(x: number, y: number, dir: Dir): void {
    this.grid[this.width * y + x] = dir;
    this.pushPending(x, y);
  }

  /** Marks open neighbours of (x, y) with the direction leading back to it and queues them. */
  private pushPending(x: number, y: number): void {
    const w = this.width;
    const g = this.grid;
    const visit = (nx: number, ny: number, dir: Dir) => {
      if (g[w * ny + nx] === Cell.Open) {
        g[w * ny + nx] = dir;
        this.pending.push((nx << 16) | ny);
      }
    };
    visit(x, y - 1, Dir.Down);
    visit(x, y + 1, Dir.Up);
    visit(x - 1, y, Dir.Right);
    visit(x + 1, y, Dir.Left);
  }
}
