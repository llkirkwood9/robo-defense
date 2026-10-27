/**
 * Simulation entities: enemies, towers and projectiles (ports of `Enemy`, `GameTower`, `Bullet`).
 *
 * Entities talk to the rest of the game through the narrow `World` interface implemented by
 * `GameState`, which keeps them independent of session bookkeeping.
 */
import { Achievement } from './achievements';
import type { AchievementSink } from './achievements';
import { Dir, GRID, GRID_HALF, GRID_SUB, GRID_SUB_HALF, SUB_SHIFT } from './constants';
import {
  isMissile,
  isShell,
  MINE_RADIUS_SQ,
  PROJECTILES,
  ShotType,
  SPLASH_RADIUS_SQ,
} from './data/projectiles';
import type { Explosion, Particle } from './effects';
import { ExplosionType, explosionSize, makeExplosion } from './effects';
import { ENEMIES, enemyDropDelay, EnemyType } from './enemies';
import type { MapLayout } from './maps';
import type { MovementGrid } from './movementGrid';
import { fastRandomInt } from './random';
import type { RewardLevels } from './rewards';
import { Reward } from './rewards';
import type { TowerTable } from './towers';
import { TowerType } from './towers';
import type { Vec } from './vector';
import { arctan, scaleVector, vectorAngle } from './vector';

/** Services entities need from the running game. */
export interface World {
  readonly tick: number;
  readonly layout: MapLayout;
  readonly enemies: readonly Enemy[];
  readonly towers: readonly Tower[];
  readonly bullets: readonly Bullet[];
  readonly towerTable: TowerTable;
  readonly rewards: RewardLevels;
  readonly achievements: AchievementSink;
  /** Number of live particle/explosion effects (used to throttle smoke). */
  readonly effectCount: number;
  addParticle(p: Particle): void;
  addExplosion(e: Explosion): void;
  dropUnit(type: EnemyType, x: number, y: number, dir: Dir, path: number): void;
  /** Tower state changed without affecting paths (refreshes upgrade UI). */
  towerChanged(): void;
  shotFired(type: ShotType): void;
}

const reverse = (d: Dir): Dir => {
  switch (d) {
    case Dir.Right:
      return Dir.Left;
    case Dir.Up:
      return Dir.Down;
    case Dir.Left:
      return Dir.Right;
    default:
      return Dir.Up;
  }
};

const FLAME_COUNT = 5;

/** One flickering flame drawn on a burning enemy. */
export class Flame {
  frameIndex = 0;
  /** Random offsets (signed ints, reduced modulo the sprite area when drawn). */
  x = 0;
  y = 0;
  /** Animation offset, or -1 to hide this flame for a few ticks. */
  frameOffset = -1;

  tick(): void {
    if (this.frameIndex > 0) {
      this.frameIndex--;
      return;
    }
    this.x = fastRandomInt();
    this.y = fastRandomInt();
    this.frameIndex = (fastRandomInt() % 2) + 2;
    if ((fastRandomInt() & 3) === 0) {
      this.frameOffset = -1;
    } else {
      this.frameOffset = Math.abs(fastRandomInt() % 1000000);
    }
  }
}

export interface EnemyState {
  gridX: number;
  gridY: number;
  type: EnemyType;
  firstState: number;
  health: number;
  maxHealth: number;
  pathNum: number;
  slowCounter: number;
  fireCounter: number;
  xOffset: number;
  yOffset: number;
  orientation: Dir;
  atExit: boolean;
  exitingGrid: boolean;
}

export class Enemy implements EnemyState {
  gridX = 0;
  gridY = 0;
  type: EnemyType = EnemyType.Soldier;
  /** Tick the enemy spawned on; towers prefer the oldest enemy in range. */
  firstState = 0;
  health = 0;
  maxHealth = 0;
  pathNum = 0;
  slowCounter = 0;
  fireCounter = 0;
  /** Sub-pixel offset from the current cell. */
  xOffset = 0;
  yOffset = 0;
  orientation: Dir = Dir.Right;
  atExit = false;
  /** True while walking out of the current cell (direction already decided). */
  exitingGrid = true;
  /** Tick the enemy died on, or -1 while alive. */
  deathTick = -1;
  private dropCounter = 0;
  readonly flames: Flame[] = Array.from({ length: FLAME_COUNT }, () => new Flame());

  static spawn(
    x: number,
    y: number,
    dir: Dir,
    type: EnemyType,
    tick: number,
    health: number,
    path: number,
  ): Enemy {
    const e = new Enemy();
    e.type = type;
    e.firstState = tick;
    e.health = health;
    e.maxHealth = health;
    e.pathNum = path;
    e.dropCounter = enemyDropDelay(type);
    e.teleportTo(x, y, dir);
    return e;
  }

  static restore(s: EnemyState): Enemy {
    const e = Object.assign(new Enemy(), s);
    e.dropCounter = enemyDropDelay(e.type);
    return e;
  }

  get props() {
    return ENEMIES[this.type];
  }

  /** Top-left of the enemy's grid-sized footprint, in world pixels. */
  get pixelX(): number {
    return this.gridX * GRID + (this.xOffset >> SUB_SHIFT);
  }

  get pixelY(): number {
    return this.gridY * GRID + (this.yOffset >> SUB_SHIFT);
  }

  get finished(): boolean {
    return this.health === 0 || this.atExit;
  }

  get burning(): boolean {
    return this.fireCounter > 0;
  }

  teleportTo(x: number, y: number, dir: Dir): void {
    this.gridX = x;
    this.gridY = y;
    this.orientation = dir;
    this.xOffset = 0;
    this.yOffset = 0;
    this.exitingGrid = true;
  }

  /** Moves one tick along the path. Returns true when the enemy reached the exit. */
  update(world: World, grid: MovementGrid): boolean {
    let speed = this.props.speed;
    if (this.slowCounter > 0) {
      speed >>= 1;
      this.slowCounter--;
    }
    if (this.fireCounter > 0 && this.health > 0) {
      this.fireCounter--;
      this.health--;
      for (const f of this.flames) {
        f.tick();
      }
    }
    if (this.health <= 0) {
      return this.atExit;
    }

    switch (this.orientation) {
      case Dir.Right:
        this.xOffset += speed;
        if (this.xOffset >= GRID_SUB_HALF) {
          this.xOffset -= GRID_SUB;
          this.enterCell(this.gridX + 1, this.gridY);
        } else if (!this.exitingGrid && this.xOffset >= 0) {
          this.chooseDirection(grid);
        }
        break;
      case Dir.Up:
        this.yOffset -= speed;
        if (this.yOffset <= -GRID_SUB_HALF) {
          this.yOffset += GRID_SUB;
          this.enterCell(this.gridX, this.gridY - 1);
        } else if (!this.exitingGrid && this.yOffset <= 0) {
          this.chooseDirection(grid);
        }
        break;
      case Dir.Left:
        this.xOffset -= speed;
        if (this.xOffset <= -GRID_SUB_HALF) {
          this.xOffset += GRID_SUB;
          this.enterCell(this.gridX - 1, this.gridY);
        } else if (!this.exitingGrid && this.xOffset <= 0) {
          this.chooseDirection(grid);
        }
        break;
      case Dir.Down:
        this.yOffset += speed;
        if (this.yOffset >= GRID_SUB_HALF) {
          this.yOffset -= GRID_SUB;
          this.enterCell(this.gridX, this.gridY + 1);
        } else if (!this.exitingGrid && this.yOffset >= 0) {
          this.chooseDirection(grid);
        }
        break;
    }

    if (this.props.dropType !== -1) {
      if (this.dropCounter > 0) {
        this.dropCounter--;
      } else if (this.tryDrop(world, grid)) {
        this.dropCounter = enemyDropDelay(this.type);
      }
    }
    return this.atExit;
  }

  private tryDrop(world: World, grid: MovementGrid): boolean {
    const { gridX: x, gridY: y } = this;
    if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
      return false;
    }
    const dir = grid.orientation(x, y);
    if (dir < Dir.Right || dir > Dir.Down) {
      return false;
    }
    world.dropUnit(this.props.dropType as EnemyType, x, y, dir, this.pathNum);
    return true;
  }

  /** Re-checks direction after towers changed, turning around if the path now goes back. */
  checkOrientation(grid: MovementGrid): void {
    if (this.props.isFlyer) {
      return;
    }
    const gridDir = grid.orientation(this.gridX, this.gridY);
    if (this.exitingGrid) {
      if (this.orientation !== gridDir) {
        this.reverse();
      }
    } else if (gridDir === reverse(this.orientation)) {
      this.reverse();
    }
  }

  applyDamage(amount: number, shot: ShotType): void {
    if (shot === ShotType.Slow) {
      this.slowCounter = amount;
      return;
    }
    if (shot === ShotType.Fire || shot === ShotType.SlowFire) {
      this.fireCounter = Math.min(this.fireCounter + 4, amount);
      if (shot === ShotType.SlowFire && this.slowCounter < amount) {
        this.slowCounter = amount;
      }
      return;
    }
    if (shot === ShotType.NapalmShell) {
      this.fireCounter += Math.trunc(amount / 4);
    }
    let damage = amount;
    if (shot !== ShotType.UraniumBullet) {
      damage -= this.props.armor;
    }
    this.health = Math.max(0, this.health - Math.max(1, damage));
  }

  private reverse(): void {
    this.orientation = reverse(this.orientation);
    this.exitingGrid = !this.exitingGrid;
  }

  private enterCell(x: number, y: number): void {
    this.gridX = x;
    this.gridY = y;
    this.exitingGrid = false;
  }

  /** At a cell centre: pick the next direction (ground units) and snap to the lane. */
  private chooseDirection(grid: MovementGrid): void {
    if (!this.props.isFlyer) {
      this.orientation = grid.orientation(this.gridX, this.gridY);
    }
    this.exitingGrid = true;
    if (this.orientation === Dir.Left || this.orientation === Dir.Right) {
      this.yOffset = 0;
    } else {
      this.xOffset = 0;
    }
    this.atExit = this.gridX === grid.endX && this.gridY === grid.endY;
  }
}

/** Mines chained in the current detonation (shared across the recursive chain). */
let mineChainLength = 0;

export class Tower {
  lastDirection = 270;
  shotDelay = 0;
  activeEnemy: Enemy | null = null;
  firstState = 0;

  constructor(
    readonly gridX: number,
    readonly gridY: number,
    public type: TowerType,
    private readonly table: TowerTable,
    tick: number,
  ) {
    this.reset(type, tick);
  }

  get props() {
    return this.table.get(this.type);
  }

  get blocking(): boolean {
    return this.props.blocking;
  }

  /** (Re)initialises the tower after placement or an upgrade. */
  reset(type: TowerType, tick: number): void {
    this.type = type;
    this.firstState = tick;
    this.shotDelay = Math.trunc(this.props.shotDelay / 2);
    this.lastDirection = 270;
  }

  /** Runs one tick. Returns a new projectile when the tower fires one. */
  update(world: World, targets: readonly Enemy[]): Bullet | null {
    const p = this.props;
    this.shotDelay--;
    if (this.shotDelay > 0) {
      return null;
    }
    if (p.shotType === ShotType.None) {
      this.shotDelay = p.shotDelay;
      return null;
    }
    this.chooseTarget(targets, world);
    const target = this.activeEnemy;
    if (target === null) {
      this.shotDelay = 0;
      return null;
    }
    if (p.shotType === ShotType.Teleport) {
      this.teleport(world, target);
      return null;
    }
    if (p.shotType === ShotType.Mine) {
      mineChainLength = 0;
      this.detonate(world);
      if (mineChainLength >= 10) {
        world.achievements.increase(Achievement.ChainSmoker, 1);
      }
      if (mineChainLength >= 2 && world.rewards.level(Reward.Shockwave) > 0) {
        this.shockwave(world, mineChainLength);
      }
      return null;
    }

    this.shotDelay = p.shotDelay;
    const x = this.gridX * GRID + GRID_HALF;
    const y = this.gridY * GRID + GRID_HALF - (p.towerHeight + 7);
    const v: Vec = { x: target.pixelX + GRID_HALF - x, y: target.pixelY + GRID_HALF - y };
    scaleVector(v, p.gunRadius);
    v.y = Math.trunc((v.y * 3) / 4);
    world.shotFired(p.shotType);
    return new Bullet(x + v.x, y + v.y, target, p.shotType, p.power);
  }

  /** Turret angle (degrees), tracking the current target. */
  direction(): number {
    if (this.activeEnemy !== null) {
      this.lastDirection = arctan(
        this.gridX * GRID - this.activeEnemy.pixelX,
        this.gridY * GRID - this.activeEnemy.pixelY,
      );
    }
    return this.lastDirection;
  }

  private chooseTarget(targets: readonly Enemy[], world: World): void {
    if (this.isValidTarget(this.activeEnemy, world)) {
      return;
    }
    this.activeEnemy = null;
    let oldest = Number.MAX_SAFE_INTEGER;
    for (const e of targets) {
      if (this.isValidTarget(e, world) && e.firstState < oldest) {
        this.activeEnemy = e;
        oldest = e.firstState;
      }
    }
  }

  private isValidTarget(e: Enemy | null, world: World): e is Enemy {
    if (e === null || e.finished) {
      return false;
    }
    const flyer = e.props.isFlyer;
    switch (this.props.shotType) {
      case ShotType.Slow:
        if (e.slowCounter > 0) return false;
        break;
      case ShotType.Fire:
      case ShotType.SlowFire:
        // Spread fire: once a target is held, prefer enemies that aren't burning yet.
        if (flyer || (this.activeEnemy !== null && e.burning)) return false;
        break;
      case ShotType.AntiairBullet:
      case ShotType.SurfaceToAir:
        if (!flyer) return false;
        break;
      case ShotType.Mortar:
      case ShotType.Artillery:
      case ShotType.NapalmShell:
        if (flyer) return false;
        break;
      case ShotType.Mine:
        if (flyer && world.rewards.level(Reward.AirBurst) === 0) return false;
        break;
    }
    const dx = this.gridX * GRID - e.pixelX;
    const dy = this.gridY * GRID - e.pixelY;
    return dx * dx + dy * dy < this.props.attackRadiusSq;
  }

  private teleport(world: World, enemy: Enemy): void {
    world.addExplosion(
      makeExplosion(ExplosionType.Teleport, enemy.pixelX, enemy.pixelY, world.tick),
    );
    const path = world.layout.paths[enemy.pathNum];
    enemy.teleportTo(path.startX, path.startY, path.startDir);
    if (world.rewards.level(Reward.Scrambler) > 0) {
      const damage = Math.trunc(enemy.health / 3);
      if (damage > 0) {
        enemy.applyDamage(damage, ShotType.Bullet);
      }
    }
    for (const b of world.bullets) {
      b.forgetTarget(enemy);
    }
    world.addExplosion(
      makeExplosion(ExplosionType.Teleport, enemy.pixelX, enemy.pixelY, world.tick),
    );
    this.type = TowerType.TeleportUnarmed;
    world.towerChanged();
  }

  /** Detonates this mine and, recursively, any armed mines next to it. */
  private detonate(world: World): void {
    mineChainLength++;
    const airBurst = world.rewards.level(Reward.AirBurst) !== 0;
    const p = this.props;
    for (const e of world.enemies) {
      if (e.props.isFlyer && !airBurst) {
        continue;
      }
      const dx = this.gridX * GRID - e.pixelX;
      const dy = this.gridY * GRID - e.pixelY;
      if (dx * dx + dy * dy <= MINE_RADIUS_SQ) {
        e.applyDamage(p.power, p.shotType);
        world.addExplosion(makeExplosion(ExplosionType.Blast, e.pixelX, e.pixelY, world.tick));
      }
    }
    this.type = TowerType.MineUnarmed;
    for (const t of world.towers) {
      if (t !== this && t.type === TowerType.MineArmed) {
        const dx = t.gridX - this.gridX;
        const dy = t.gridY - this.gridY;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
          world.addExplosion(
            makeExplosion(ExplosionType.Blast, t.gridX * GRID, t.gridY * GRID, world.tick),
          );
          t.detonate(world);
        }
      }
    }
    world.towerChanged();
  }

  /** Shockwave reward: chained mines slow and burn every enemy on the map. */
  private shockwave(world: World, chain: number): void {
    const strength = chain - 1;
    const minePower = world.towerTable.get(TowerType.MineArmed).power;
    for (const e of world.enemies) {
      e.applyDamage(strength * 30, ShotType.Slow);
      e.applyDamage(Math.trunc((minePower * strength) / 4), ShotType.Artillery);
      e.fireCounter = Math.trunc((minePower * strength) / 4);
    }
    // Full-map white flash.
    world.addParticle({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      color: -1,
      maxAlpha: 180,
      size: 10000,
      firstTick: world.tick,
      ticks: Math.min(15, strength * 2 + 3),
    });
  }
}

const SMOKE_MAX_ALPHA = 80;
const SMOKE_TICKS = 10;
const SHELL_GRAVITY = -4;
/** Smoke is throttled when this many effects are alive (original "performance monitor" level 0). */
const MAX_SMOKE_EFFECTS = 30;
const MAX_EFFECTS = 400;

export class Bullet {
  x: number;
  y: number;
  /** Height above ground for arcing shells. */
  private z = 0;
  private zVel = 0;
  private speed: number;
  private targetX = 0;
  private targetY = 0;
  private readonly aimX: number;
  private readonly aimY: number;
  private firstFrame = true;
  readonly velocity: Vec = { x: 0, y: 0 };

  constructor(
    x: number,
    y: number,
    private target: Enemy | null,
    readonly type: ShotType,
    private readonly power: number,
  ) {
    this.x = x;
    this.y = y;
    const enemy = target!.props;
    this.aimX = fastRandomInt() % Math.trunc(enemy.visibleWidth / 2);
    this.aimY = fastRandomInt() % Math.trunc(enemy.visibleHeight / 2);
    this.trackTarget();
    this.speed = PROJECTILES[type].speed;
    if (isShell(type)) {
      // Lob the shell so it lands in ~15 ticks.
      const dx = Math.trunc((this.targetX - this.x) / 15);
      const dy = Math.trunc((this.targetY - this.y) / 15);
      this.speed = Math.max(1, Math.trunc(Math.sqrt(dx * dx + dy * dy)));
      this.zVel = 28;
    }
  }

  /** Screen-space y (shells are drawn above the ground by their height). */
  get drawY(): number {
    return this.y - this.z;
  }

  /** Drawn size; flames flicker. */
  size(tick: number): number {
    if (this.type === ShotType.Fire || this.type === ShotType.SlowFire) {
      return tick & 7;
    }
    return PROJECTILES[this.type].size;
  }

  /** Sprite frame for directional projectiles. */
  frame(frames: number): number {
    return frames <= 1 ? 0 : Math.trunc((frames * vectorAngle(this.velocity)) / 360);
  }

  forgetTarget(enemy: Enemy): void {
    if (this.target === enemy) {
      this.target = null;
    }
  }

  private trackTarget(): void {
    const t = this.target!;
    const p = t.props;
    this.targetX = t.pixelX + p.centerX + p.drawShiftX + this.aimX;
    this.targetY = t.pixelY + p.centerY + p.drawShiftY + this.aimY;
  }

  /** Moves one tick. Returns true when the projectile is spent. */
  update(world: World): boolean {
    if (this.target !== null) {
      if (this.target.finished) {
        this.target = null;
      } else {
        this.trackTarget();
      }
    }
    const tick = world.tick;
    let speed = this.speed;
    if (this.firstFrame) {
      // Stagger projectiles fired on the same tick.
      speed = tick % speed;
      this.firstFrame = false;
    }

    if (isMissile(this.type)) {
      const n = world.effectCount;
      if (n < MAX_EFFECTS && (n < MAX_SMOKE_EFFECTS || (tick & 3) === 0)) {
        this.emitSmoke(world, tick);
      }
    } else if (isShell(this.type)) {
      this.z += this.zVel;
      this.zVel += SHELL_GRAVITY;
      if (this.z < 0) {
        this.z = 0;
        this.speed = 100;
      }
      speed = this.speed;
    }

    const v = this.velocity;
    v.x = this.targetX - this.x;
    v.y = this.targetY - this.y;
    scaleVector(v, speed);
    this.x += v.x;
    this.y += v.y;

    const hit =
      (v.x > 0 && this.x >= this.targetX) ||
      (v.x < 0 && this.x <= this.targetX) ||
      (v.y > 0 && this.y >= this.targetY) ||
      (v.y < 0 && this.y <= this.targetY);

    if (hit) {
      if (this.target !== null) {
        this.target.applyDamage(this.power, this.type);
        if (isMissile(this.type)) {
          this.explode(world);
        }
      }
      if (isShell(this.type)) {
        this.explode(world);
        // The Cannonball reward quadruples the splash area. (The original computed this value
        // but never used it; the port applies it so the purchased reward does what it says.)
        const splashSq =
          world.rewards.level(Reward.Cannonball) > 0 ? SPLASH_RADIUS_SQ * 4 : SPLASH_RADIUS_SQ;
        for (const e of world.enemies) {
          const dx = this.x - e.pixelX;
          const dy = this.y - e.pixelY;
          if (dx * dx + dy * dy < splashSq) {
            e.applyDamage(Math.trunc(this.power / 2), this.type);
          }
        }
      }
    }
    return hit || (this.target === null && v.x === 0 && v.y === 0);
  }

  private emitSmoke(world: World, tick: number): void {
    const size = (tick & 3) + 3;
    world.addParticle({
      x: (this.x - size) << SUB_SHIFT,
      y: (this.y - size) << SUB_SHIFT,
      vx: -this.velocity.x * 2,
      vy: -this.velocity.y * 2,
      color: 0,
      maxAlpha: SMOKE_MAX_ALPHA,
      size: size * 2,
      firstTick: tick,
      ticks: SMOKE_TICKS,
    });
  }

  private explode(world: World): void {
    const half = explosionSize(ExplosionType.Blast) >> 1;
    world.addExplosion(
      makeExplosion(ExplosionType.Blast, this.targetX - half, this.targetY - half, world.tick),
    );
  }
}
