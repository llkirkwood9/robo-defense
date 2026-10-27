/**
 * A game session (port of the original `GameState`).
 *
 * Owns every entity, advances the simulation one tick at a time, enforces placement rules,
 * handles scoring/achievements and serialises itself for quick save. Side effects that reach
 * outside the simulation (sound, haptics, persistence, UI) are reported through
 * `GameServices.emit` so the engine stays free of React Native dependencies.
 */
import type { AchievementSink } from './achievements';
import { Achievement } from './achievements';
import { Dir, ENEMY_LIMIT, GRID, RunState, STARTING_HEALTH, STARTING_MONEY } from './constants';
import type { ShotType } from './data/projectiles';
import type { Explosion, KillPopup, Particle } from './effects';
import { KILL_POPUP_TICKS } from './effects';
import type { EnemyState, World } from './entities';
import { Bullet, Enemy, Tower } from './entities';
import { ENEMIES, enemyBaseHealth, enemyDeathFrames, EnemyType } from './enemies';
import type { MapLayout } from './maps';
import { createMapLayout, MapType } from './maps';
import { MovementGrid } from './movementGrid';
import { fastRandomInt } from './random';
import type { RewardLevels } from './rewards';
import { Reward } from './rewards';
import type { TowerTable } from './towers';
import { TowerType } from './towers';
import type { WaveCursor } from './waves';
import { generateWaves, survivalDifficulty, WaveRunner } from './waves';

export interface GameOptions {
  /** Drop out of fast-forward when a wave is cleared. */
  ffStopsBetweenLevels: boolean;
  /** Pause when a life is lost during fast-forward. */
  ffPausesOnLifeLoss: boolean;
}

/** Choices made on the new-game screen. */
export interface SessionConfig {
  mapType: MapType;
  difficulty: number;
  survival: boolean;
  /** VR Training map code. */
  mixerCode: number;
  /** Tower Mix seed, or 0 for standard towers. */
  towerMixSeed: number;
}

/** How a game ended. */
export type GameOutcome = 'won' | 'lost' | 'abandoned';

/** End-of-game reward point breakdown. */
export interface ScoreSummary {
  won: boolean;
  score: number;
  wonBonus: number;
  healthBonus: number;
  perfectBonus: number;
  moneyBonus: number;
  total: number;
}

export type GameEvent =
  | { type: 'message'; text: string; error?: boolean }
  | { type: 'lifeLost'; health: number }
  | { type: 'shot'; shot: ShotType }
  | { type: 'scoreAdded'; amount: number }
  | { type: 'achievement'; index: Achievement }
  | { type: 'towerPlaced' }
  | { type: 'towersChanged' }
  | { type: 'levelStarted'; level: number }
  | { type: 'autosave' }
  | { type: 'gameOver'; summary: ScoreSummary | null; outcome: GameOutcome };

export interface GameServices {
  towerTable: TowerTable;
  rewards: RewardLevels;
  achievements: AchievementSink & { dequeueEarned(): Achievement | undefined; flush(): void };
  options: GameOptions;
  emit(event: GameEvent): void;
}

/** JSON quick-save format. */
export interface SavedGame {
  version: 1;
  config: SessionConfig;
  waveSeed: number;
  cursor: WaveCursor;
  tick: number;
  money: number;
  health: number;
  score: number;
  levelBonus: number;
  flags: AchievementFlags;
  towerCount: number;
  fastForwardCount: number;
  towers: { x: number; y: number; type: TowerType; shotDelay: number }[];
  enemies: EnemyState[];
}

/** "Didn't do X this game" flags for end-of-game achievements. */
interface AchievementFlags {
  noSlowTowers: boolean;
  noGunTowers: boolean;
  noRocketTowers: boolean;
  cheapskate: boolean;
  noSale: boolean;
  onlyOneTower: boolean;
}

const freshFlags = (): AchievementFlags => ({
  noSlowTowers: true,
  noGunTowers: true,
  noRocketTowers: true,
  cheapskate: true,
  noSale: true,
  onlyOneTower: true,
});

const POWERED_UP_TRIGGER = 12;
const WON_BONUS_PCT = 20;
const PERFECT_GAME_PCT = 20;
/** Levels without losing a life needed before the Titan can appear. */
export const PERFECT_LEVELS_FOR_TITAN = 77;

export class GameState implements World {
  runState = RunState.NotStarted;
  tick = 0;
  layout!: MapLayout;
  difficulty: number;
  money = 0;
  health = 0;
  startingHealth = 0;
  score = 0;
  /** Levels cleared in a row without losing a life. */
  levelBonus = 0;

  enemies: Enemy[] = [];
  /** Dead enemies still fading out. */
  graveyard: Enemy[] = [];
  towers: Tower[] = [];
  bullets: Bullet[] = [];
  particles: Particle[] = [];
  explosions: Explosion[] = [];
  killPopups: KillPopup[] = [];

  private readonly waves = new WaveRunner();
  private waveSeed = 0;
  private grids: MovementGrid[] = [];
  /** Enemies that can be targeted this tick (alive, on the map, moved this tick). */
  private targetable: Enemy[] = [];
  private flags = freshFlags();
  private towerCount = 0;
  private fastForwardCount = 0;
  private unitCreatedThisLevel = false;
  /** Incremented whenever the session is reset, so an in-flight tick can bail out. */
  private generation = 0;

  constructor(
    readonly config: SessionConfig,
    private readonly services: GameServices,
  ) {
    this.difficulty = config.difficulty;
    this.initGame();
  }

  // ---- World interface ------------------------------------------------------------------------

  get towerTable(): TowerTable {
    return this.services.towerTable;
  }

  get rewards(): RewardLevels {
    return this.services.rewards;
  }

  get achievements(): AchievementSink {
    return this.services.achievements;
  }

  get effectCount(): number {
    return this.particles.length + this.explosions.length;
  }

  addParticle(p: Particle): void {
    this.particles.push(p);
  }

  addExplosion(e: Explosion): void {
    this.explosions.push(e);
  }

  dropUnit(type: EnemyType, x: number, y: number, dir: Dir, path: number): void {
    if (this.enemies.length + this.graveyard.length < ENEMY_LIMIT) {
      this.spawnEnemy(type, x, y, dir, path);
    }
  }

  towerChanged(): void {
    this.services.emit({ type: 'towersChanged' });
  }

  shotFired(type: ShotType): void {
    this.services.emit({ type: 'shot', shot: type });
  }

  // ---- Queries ------------------------------------------------------------------------------

  get levelNum(): number {
    return this.waves.levelNum;
  }

  get isActive(): boolean {
    return (
      this.runState === RunState.Running ||
      this.runState === RunState.FastForward ||
      this.runState === RunState.Paused
    );
  }

  get isRunning(): boolean {
    return this.runState === RunState.Running || this.runState === RunState.FastForward;
  }

  /** Points added to every kill: the level streak plus one per achievement earned. */
  get enemyKillBonus(): number {
    const bonus = this.levelBonus + this.services.achievements.totalCount;
    return this.rewards.level(Reward.BonusUpgrade) > 0 ? bonus * 2 : bonus;
  }

  towerAt(x: number, y: number): Tower | undefined {
    return this.towers.find((t) => t.gridX === x && t.gridY === y);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.layout.width && y >= 0 && y < this.layout.height;
  }

  // ---- Session control ----------------------------------------------------------------------

  /** Resets to a fresh, not-yet-started game on the same map. */
  private initGame(): void {
    this.generation++;
    this.tick = 0;
    this.score = 0;
    this.levelBonus = 0;
    this.runState = RunState.NotStarted;
    this.enemies = [];
    this.graveyard = [];
    this.towers = [];
    this.bullets = [];
    this.particles = [];
    this.explosions = [];
    this.killPopups = [];
    this.targetable = [];
    this.unitCreatedThisLevel = false;
    this.flags = freshFlags();
    this.towerCount = 0;
    this.fastForwardCount = 0;
    const { mapType, mixerCode } = this.config;
    this.layout = createMapLayout(mapType, mixerCode);
    this.waves.cursor = { index: 0, subIndex: 0, frameIndex: 0, levelNum: 1 };
    this.waveSeed = fastRandomInt();
    this.waves.setSchedule([]);
    this.initGrids();
    this.money = this.rewards.factor(Reward.StartingCashUpgrade) + STARTING_MONEY;
    this.startingHealth = this.rewards.factor(Reward.HealthUpgrade) + STARTING_HEALTH;
    this.health = this.startingHealth;
    if (this.config.survival) {
      this.difficulty = survivalDifficulty(this.levelNum);
    }
    this.services.emit({ type: 'towersChanged' });
  }

  /** Starts (or restarts after game over) play. */
  start(): void {
    if (this.runState === RunState.Lost || this.runState === RunState.Won) {
      this.initGame();
    }
    this.runState = RunState.Running;
    this.generateWaves();
    this.services.emit({ type: 'levelStarted', level: this.levelNum });
  }

  togglePause(): void {
    if (this.isRunning) {
      this.runState = RunState.Paused;
    } else if (this.runState === RunState.Paused) {
      this.runState = RunState.Running;
    }
  }

  setPaused(paused: boolean): void {
    if (paused !== (this.runState === RunState.Paused) && this.isActive) {
      this.togglePause();
    }
  }

  toggleFastForward(): void {
    if (this.runState === RunState.Running) {
      this.runState = RunState.FastForward;
    } else if (this.runState === RunState.FastForward) {
      this.runState = RunState.Running;
    }
  }

  /** Ends the current game, banking its score (used when abandoning a game from the menu). */
  abandon(): void {
    this.endGame(RunState.NotStarted);
  }

  /** Advances the simulation by one tick. */
  update(): void {
    this.dequeueAchievements();
    if (!this.isRunning) {
      return;
    }
    const generation = this.generation;
    this.tick++;
    this.advanceEnemies();
    if (generation !== this.generation) {
      return;
    }
    this.advanceTowers();
    this.advanceBullets();
    this.advanceLevel();
    this.pruneEffects();
  }

  // ---- Towers -------------------------------------------------------------------------------

  /** Whether `type` may be built at (x, y). `finalCheck` also verifies enemies aren't trapped. */
  canPlaceTower(x: number, y: number, type: TowerType, finalCheck: boolean): boolean {
    if (!this.inBounds(x, y)) {
      return false;
    }
    if (this.enemies.some((e) => e.gridX === x && e.gridY === y)) {
      return false;
    }
    const blocking = this.towerTable.get(type).blocking;
    return this.grids.every((g, i) =>
      g.checkTowerPlacement(this.towers, finalCheck ? this.enemies : null, x, y, i, blocking),
    );
  }

  /** Places a new tower if the spot is legal and affordable. Returns whether it was built. */
  tryPlaceTower(type: TowerType, x: number, y: number): boolean {
    const cost = this.towerTable.get(type).cost;
    if (type < 0 || cost > this.money || !this.canPlaceTower(x, y, type, true)) {
      return false;
    }
    this.towers.push(new Tower(x, y, type, this.towerTable, this.tick));
    this.towersChanged();
    this.setMoney(this.money - cost);
    this.towerCount++;
    if (this.towerCount > 1) {
      this.flags.onlyOneTower = false;
    }
    if (type === TowerType.Gun1) this.flags.noGunTowers = false;
    if (type === TowerType.Slow1) this.flags.noSlowTowers = false;
    if (type === TowerType.Rocket1) this.flags.noRocketTowers = false;
    this.services.emit({ type: 'towerPlaced' });
    return true;
  }

  /** Upgrades a tower to `newType`, or sells it when `newType` is `TowerType.Sell`. */
  upgradeTower(tower: Tower, newType: TowerType): void {
    if (newType === TowerType.Sell) {
      this.sellTower(tower);
      this.flags.noSale = false;
      if (this.towerCount <= POWERED_UP_TRIGGER) {
        this.towerCount--;
      }
      return;
    }
    const cost = this.towerTable.get(newType).cost;
    if (cost > this.money) {
      return;
    }
    this.setMoney(this.money - cost);
    const wasBlocking = tower.blocking;
    tower.reset(newType, this.tick);
    if (wasBlocking !== tower.blocking) {
      this.towersChanged();
    } else {
      this.towerChanged();
    }
    this.flags.cheapskate = false;
  }

  private sellTower(tower: Tower): void {
    this.setMoney(this.money + this.towerTable.sellValue(tower.type));
    this.towers = this.towers.filter((t) => t !== tower);
    this.towersChanged();
  }

  /** Recomputes enemy paths after the set of blocking towers changed. */
  private towersChanged(): void {
    this.services.emit({ type: 'towersChanged' });
    for (const g of this.grids) {
      g.calcPaths(this.towers);
    }
    for (const e of this.enemies) {
      e.checkOrientation(this.grids[e.pathNum]);
    }
  }

  // ---- Simulation steps ---------------------------------------------------------------------

  private advanceEnemies(): void {
    this.targetable = [];
    // Iterate over a snapshot: droppers may add enemies mid-loop (they act from next tick).
    for (const e of [...this.enemies]) {
      if (e.update(this, this.grids[e.pathNum])) {
        this.loseLife();
        if (this.runState === RunState.Lost || this.runState === RunState.NotStarted) {
          return;
        }
      } else if (e.health > 0) {
        this.targetable.push(e);
      }
    }

    const alive: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.atExit) {
        continue;
      }
      if (e.health <= 0) {
        e.deathTick = this.tick;
        this.enemyDefeated(e);
        this.graveyard.push(e);
      } else {
        alive.push(e);
      }
    }
    this.enemies = alive;
    this.graveyard = this.graveyard.filter(
      (e) => e.deathTick + enemyDeathFrames(e.type) > this.tick,
    );
  }

  private loseLife(): void {
    if (this.runState === RunState.FastForward && this.services.options.ffPausesOnLifeLoss) {
      this.runState = RunState.Paused;
    }
    this.health--;
    this.services.emit({ type: 'lifeLost', health: this.health });
    if (this.health > 0) {
      this.levelBonus = 0;
    } else {
      this.endGame(RunState.Lost);
    }
  }

  private advanceTowers(): void {
    for (const t of this.towers) {
      const bullet = t.update(this, this.targetable);
      if (bullet !== null) {
        this.bullets.push(bullet);
      }
    }
  }

  private advanceBullets(): void {
    this.bullets = this.bullets.filter((b) => !b.update(this));
  }

  private advanceLevel(): void {
    this.waves.tick();
    if (this.waves.unitType >= 0) {
      this.deployUnit(this.waves.unitType as EnemyType, this.waves.unitPath);
    } else if (this.waves.waveSpawned && this.enemies.length === 0) {
      this.nextLevel();
    }
  }

  private pruneEffects(): void {
    const t = this.tick;
    this.particles = this.particles.filter((p) => t < p.firstTick + p.ticks);
    this.explosions = this.explosions.filter((e) => t < e.firstTick + e.frames);
    this.killPopups = this.killPopups.filter((k) => t - k.tick < KILL_POPUP_TICKS);
  }

  private deployUnit(type: EnemyType, path: number): void {
    let unit = type;
    if (
      !this.unitCreatedThisLevel &&
      this.levelBonus === PERFECT_LEVELS_FOR_TITAN &&
      this.difficulty >= ENEMIES[EnemyType.Titan].minDifficulty
    ) {
      unit = EnemyType.Titan;
    }
    const p = this.layout.paths[path];
    this.spawnEnemy(unit, p.startX, p.startY, p.startDir, path);
    this.unitCreatedThisLevel = true;
  }

  private spawnEnemy(type: EnemyType, x: number, y: number, dir: Dir, path: number): void {
    const health = enemyBaseHealth(type, this.levelNum, this.difficulty);
    this.enemies.unshift(Enemy.spawn(x, y, dir, type, this.tick, health, path));
  }

  private enemyDefeated(e: Enemy): void {
    const a = this.services.achievements;
    this.setMoney(this.money + e.props.value);
    const baseScore = Math.trunc((e.maxHealth * this.layout.scoreMultiplier) / 500);
    const added = baseScore + this.enemyKillBonus;
    this.killPopups.push({ tick: this.tick, enemyType: e.type, x: e.pixelX, y: e.pixelY });
    this.score += added;
    this.services.emit({ type: 'scoreAdded', amount: added });

    if (added >= 500) {
      a.increase(Achievement.BigOne, 1);
      if (added >= 1000) a.increase(Achievement.Whopper, 1);
    }
    if (this.score >= 250000) {
      a.increase(Achievement.GoodGame, 1);
      if (this.score >= 500000) a.increase(Achievement.GreatGame, 1);
      if (this.score >= 1000000) a.increase(Achievement.AmazingGame, 1);
      if (this.score >= 5000000) a.increase(Achievement.UltraGame, 1);
    }
    if (e.type === EnemyType.Titan) {
      a.increase(Achievement.DefeatTitan, 1);
    }
    a.increase(Achievement.BigScore, added);
    a.increase(Achievement.HugeScore, added);
    a.increase(Achievement.TwentyFiveK, 1);
    a.increase(Achievement.SeventyFiveK, 1);
  }

  private nextLevel(): void {
    const a = this.services.achievements;
    if (this.runState === RunState.FastForward) {
      this.fastForwardCount++;
      if (this.fastForwardCount >= 75) {
        a.increase(Achievement.FastLane, 1);
      }
      if (this.services.options.ffStopsBetweenLevels) {
        this.runState = RunState.Running;
      }
    }
    if (this.levelNum > 1) {
      this.levelBonus++;
      if (this.levelBonus === 25) a.increase(Achievement.Perfect25, 1);
      else if (this.levelBonus === 50) a.increase(Achievement.Perfect50, 1);
    }
    if (this.config.survival && this.levelNum % 10 === 0 && this.levelNum <= 90) {
      // Survival milestones 10..90 map to consecutive achievement indices.
      a.increase(Achievement.Survival10 + this.levelNum / 10 - 1, 1);
    }

    if (!this.waves.nextLevel()) {
      this.endGame(RunState.Won);
    } else {
      if (this.levelNum % 10 === 0) {
        this.services.emit({ type: 'autosave' });
      }
      this.services.emit({ type: 'levelStarted', level: this.levelNum });
    }
    if (this.config.survival) {
      this.difficulty = survivalDifficulty(this.levelNum);
    }
    a.increase(Achievement.Experienced, 1);
    a.increase(Achievement.Addict, 1);
    this.unitCreatedThisLevel = false;
  }

  private endGame(newState: RunState): void {
    if (this.isActive) {
      const summary = this.scoreSummary(newState === RunState.Won);
      if (newState === RunState.Won) {
        this.gameWonAchievements();
      }
      // Capture the result before the session resets.
      const won = newState === RunState.Won;
      this.initGame();
      this.runState = newState;
      const outcome: GameOutcome = won ? 'won' : newState === RunState.Lost ? 'lost' : 'abandoned';
      this.services.emit({ type: 'gameOver', summary, outcome });
    }
    this.services.achievements.flush();
  }

  private scoreSummary(won: boolean): ScoreSummary | null {
    if (this.score <= 0) {
      return null;
    }
    const score = this.score;
    const wonBonus = won ? Math.trunc((score * WON_BONUS_PCT) / 100) : 0;
    const healthBonus = won ? Math.trunc((score * this.health) / 100) : 0;
    const perfectBonus =
      won && this.health === this.startingHealth ? Math.trunc((score * PERFECT_GAME_PCT) / 100) : 0;
    const moneyBonus = won ? this.money * this.difficulty * 2 : 0;
    return {
      won,
      score,
      wonBonus,
      healthBonus,
      perfectBonus,
      moneyBonus,
      total: score + wonBonus + healthBonus + perfectBonus + moneyBonus,
    };
  }

  private gameWonAchievements(): void {
    const a = this.services.achievements;
    const d = this.difficulty;
    const inc = (type: Achievement, when = true) => {
      if (when) a.increase(type, 1);
    };
    inc(Achievement.CompleteDifficulty0);
    inc(Achievement.CompleteDifficulty2, d >= 2);
    inc(Achievement.CompleteDifficulty5, d >= 5);
    inc(Achievement.CompleteDifficulty8, d >= 8);
    inc(Achievement.CompleteDifficulty11, d >= 11);
    inc(Achievement.CompleteDifficulty14, d >= 14);
    inc(Achievement.CompleteDifficulty17, d >= 17);
    inc(Achievement.CompleteDifficulty20, d >= 20);
    inc(Achievement.CompleteDifficulty40, d >= 40);
    inc(Achievement.CompleteDifficulty60, d >= 60);
    inc(Achievement.CompleteDifficulty80, d >= 80);
    inc(Achievement.CompleteDifficulty100, d >= 100);
    const perfect = this.health === this.startingHealth;
    inc(Achievement.Perfect100, perfect);
    inc(Achievement.RiskTaker, this.health === 1);
    inc(Achievement.SolidEffort, this.health >= 18);
    inc(Achievement.FastPaced, this.flags.noSlowTowers);
    inc(Achievement.Rocketman, this.flags.noGunTowers);
    inc(Achievement.Gunner, this.flags.noRocketTowers);
    inc(Achievement.Cheapskate, this.flags.cheapskate);
    inc(Achievement.NoSale, this.flags.noSale);
    inc(Achievement.ShowOff, this.flags.onlyOneTower);
    if (this.towerCount <= POWERED_UP_TRIGGER) {
      inc(Achievement.PoweredUp);
      inc(Achievement.SuperPowered, perfect);
    }
    inc(Achievement.ThirtyThirty, d >= 30 && this.health >= 30);

    switch (this.layout.type) {
      case MapType.Basic:
        inc(Achievement.Basic10);
        inc(Achievement.Basic25);
        inc(Achievement.BasicLvl40, d >= 40);
        inc(Achievement.BasicLvl60, d >= 60);
        inc(Achievement.BasicLvl80, d >= 80);
        inc(Achievement.BasicLvl100, d >= 100);
        break;
      case MapType.Ruins:
        inc(Achievement.Ruins10);
        inc(Achievement.Ruins25);
        inc(Achievement.RuinsLvl30, d >= 30);
        inc(Achievement.RuinsLvl50, d >= 50);
        inc(Achievement.RuinsLvl70, d >= 70);
        inc(Achievement.RuinsLvl100, d >= 100);
        break;
      case MapType.Factory:
        inc(Achievement.Factory10);
        inc(Achievement.Factory25);
        inc(Achievement.FactoryLvl20, d >= 20);
        inc(Achievement.FactoryLvl40, d >= 40);
        inc(Achievement.FactoryLvl70, d >= 70);
        inc(Achievement.FactoryLvl100, d >= 100);
        break;
      case MapType.Courtyard:
        inc(Achievement.Courtyard10);
        inc(Achievement.Courtyard25);
        inc(Achievement.CourtyardLvl15, d >= 15);
        inc(Achievement.CourtyardLvl25, d >= 25);
        inc(Achievement.CourtyardLvl50, d >= 50);
        inc(Achievement.CourtyardLvl100, d >= 100);
        break;
      case MapType.VrTraining: {
        const byPaths = [Achievement.MixerA, Achievement.MixerB, Achievement.MixerC];
        inc(
          this.layout.fixedPath
            ? Achievement.MixerE
            : (byPaths[this.layout.paths.length - 1] ?? Achievement.MixerD),
        );
        break;
      }
      case MapType.Roadway:
        inc(Achievement.RoadwayLvl10, d >= 10);
        inc(Achievement.RoadwayLvl50, d >= 50);
        inc(Achievement.RoadwayLvl100, d >= 100);
        break;
    }

    // Big Spender: every tower is fully upgraded.
    inc(
      Achievement.BigSpender,
      this.towers.every((t) => this.towerTable.get(t.type).upgrades[0] < 0),
    );
    const flameTowers = this.towers.filter(
      (t) => t.type === TowerType.Flame1 || t.type === TowerType.Flame2,
    ).length;
    inc(Achievement.Pyro, flameTowers >= 25);
    inc(Achievement.Survival100, this.config.survival);
  }

  private dequeueAchievements(): void {
    for (
      let a = this.services.achievements.dequeueEarned();
      a !== undefined;
      a = this.services.achievements.dequeueEarned()
    ) {
      this.services.emit({ type: 'achievement', index: a });
    }
  }

  private setMoney(amount: number): void {
    this.money = amount;
    const a = this.services.achievements;
    if (amount >= 1000) a.increase(Achievement.RainyDay, 1);
    if (amount >= 2500) a.increase(Achievement.BigSaver, 1);
    if (amount >= 5000) a.increase(Achievement.CrazySaver, 1);
  }

  private initGrids(): void {
    this.grids = this.layout.paths.map((_, i) => new MovementGrid(this.layout, i));
  }

  private generateWaves(): void {
    this.waves.setSchedule(
      generateWaves(
        this.waveSeed,
        this.config.difficulty,
        this.layout.paths.length,
        this.config.survival,
      ),
    );
    if (this.config.survival) {
      this.difficulty = survivalDifficulty(this.levelNum);
    }
  }

  // ---- Persistence ---------------------------------------------------------------------------

  /** Serialises an in-progress game, or returns null when there's nothing worth saving. */
  save(): SavedGame | null {
    if (!this.isActive) {
      return null;
    }
    return {
      version: 1,
      config: { ...this.config },
      waveSeed: this.waveSeed,
      cursor: { ...this.waves.cursor },
      tick: this.tick,
      money: this.money,
      health: this.health,
      score: this.score,
      levelBonus: this.levelBonus,
      flags: { ...this.flags },
      towerCount: this.towerCount,
      fastForwardCount: this.fastForwardCount,
      towers: this.towers.map((t) => ({
        x: t.gridX,
        y: t.gridY,
        type: t.type,
        shotDelay: t.shotDelay,
      })),
      enemies: this.enemies.map((e) => ({
        gridX: e.gridX,
        gridY: e.gridY,
        type: e.type,
        firstState: e.firstState,
        health: e.health,
        maxHealth: e.maxHealth,
        pathNum: e.pathNum,
        slowCounter: e.slowCounter,
        fireCounter: e.fireCounter,
        xOffset: e.xOffset,
        yOffset: e.yOffset,
        orientation: e.orientation,
        atExit: e.atExit,
        exitingGrid: e.exitingGrid,
      })),
    };
  }

  /**
   * Restores a saved game into this session (whose config must match `save.config`).
   * The game resumes paused. Throws if the save is inconsistent.
   */
  load(save: SavedGame): void {
    if (save.version !== 1) {
      throw new Error('Unsupported save version');
    }
    this.initGame();
    const { width, height } = this.layout;
    const inMap = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
    if (save.health <= 0 || save.money < 0 || save.score < 0) {
      throw new Error('Corrupt save: invalid counters');
    }
    this.waveSeed = save.waveSeed;
    this.waves.cursor = { ...save.cursor };
    this.tick = save.tick;
    this.money = save.money;
    this.health = save.health;
    this.score = save.score;
    this.levelBonus = save.levelBonus;
    this.flags = { ...save.flags };
    this.towerCount = save.towerCount;
    this.fastForwardCount = save.fastForwardCount;
    for (const t of save.towers) {
      if (!inMap(t.x, t.y) || t.type < TowerType.Gun1 || t.type > TowerType.Flare) {
        throw new Error('Corrupt save: invalid tower');
      }
      const tower = new Tower(t.x, t.y, t.type, this.towerTable, this.tick);
      tower.shotDelay = t.shotDelay;
      this.towers.push(tower);
    }
    for (const e of save.enemies) {
      if (!inMap(e.gridX, e.gridY) || e.pathNum >= this.layout.paths.length || e.health < 0) {
        throw new Error('Corrupt save: invalid enemy');
      }
      this.enemies.push(Enemy.restore(e));
    }
    this.unitCreatedThisLevel = true;
    this.generateWaves();
    this.towersChanged();
    this.runState = RunState.Paused;
  }
}

/** Pixel position of a tower's centre (used by UI overlays). */
export function towerCenter(t: Tower): { x: number; y: number } {
  return { x: t.gridX * GRID + GRID / 2, y: t.gridY * GRID + GRID / 2 };
}
