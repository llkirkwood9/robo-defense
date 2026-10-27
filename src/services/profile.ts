/**
 * The player's persistent profile: options, reward upgrades, achievements, new-game choices and
 * the quick save. Loaded synchronously at start-up and shared by every screen.
 */
import { Achievement, ACHIEVEMENT_COUNT, Achievements } from '@/engine/achievements';
import { ENEMY_TYPE_COUNT } from '@/engine/enemies';
import type { EnemyType } from '@/engine/enemies';
import type { SavedGame, ScoreSummary, SessionConfig } from '@/engine/gameState';
import { MAP_COUNT, MapType } from '@/engine/maps';
import type { RewardStore } from '@/engine/rewards';
import { Rewards } from '@/engine/rewards';
import { TOWER_TYPE_COUNT, TowerType } from '@/engine/towers';
import { createStore } from '@/lib/store';

import { Keys, readJSON, remove, writeJSON } from './storage';

export interface Options {
  sound: boolean;
  haptics: boolean;
  /** Leave fast-forward when a wave is cleared. */
  ffStopsBetweenLevels: boolean;
  /** Pause when a life is lost during fast-forward. */
  ffPausesOnLifeLoss: boolean;
  /** Keep the screen awake while playing. */
  keepAwake: boolean;
  /** Show tower range while placing or upgrading. */
  showRange: boolean;
}

const DEFAULT_OPTIONS: Options = {
  sound: true,
  haptics: true,
  ffStopsBetweenLevels: true,
  ffPausesOnLifeLoss: true,
  keepAwake: true,
  showRange: true,
};

/** Choices remembered between visits to the new-game screen. */
export interface NewGameSettings {
  mapType: MapType;
  difficulty: number;
  survival: boolean;
  /** VR Training map code (5 digits; the last digit selects A-E). */
  mapCode: number;
  towerMixEnabled: boolean;
  towerMixCode: number;
}

const DEFAULT_NEW_GAME: NewGameSettings = {
  mapType: MapType.Basic,
  difficulty: 0,
  survival: false,
  mapCode: Math.floor(Math.random() * 100000),
  towerMixEnabled: false,
  towerMixCode: 0,
};

/** Field-guide progress: enemy types met in a game and tower types bought. */
export interface Discovered {
  enemies: EnemyType[];
  towers: TowerType[];
}

/** Lifetime records shown on the Guide's Records tab. */
export interface CareerStats {
  /** Finished games, including abandoned ones. */
  gamesPlayed: number;
  gamesWon: number;
  /** Furthest wave reached in any game. */
  highestWave: number;
  /** Towers placed (upgrades not included). */
  towersBuilt: number;
  /** Robots destroyed, indexed by enemy type. */
  kills: number[];
}

/** Reactive summary used by menus. */
interface ProfileState {
  options: Options;
  newGame: NewGameSettings;
  rewardPoints: number;
  achievementCount: number;
  maxLevelWon: number;
  hasQuickSave: boolean;
  discovered: Discovered;
  /** Most upgrade points earned in a single game. */
  bestScore: number;
  stats: CareerStats;
  /** Bumped whenever rewards change (forces reward list refreshes). */
  rewardsVersion: number;
}

const achievementLevels = readJSON<Record<string, number>>(Keys.achievements, {});

export const achievements = new Achievements(
  Array.from(
    { length: ACHIEVEMENT_COUNT },
    (_, i) => achievementLevels[Achievements.keyOf(i)] ?? 0,
  ),
  (changes) => {
    for (const [key, level] of changes) {
      achievementLevels[key] = level;
    }
    writeJSON(Keys.achievements, achievementLevels);
    profileStore.set({ achievementCount: achievements.totalCount });
  },
);

export const rewards = new Rewards(
  readJSON<RewardStore>(Keys.rewards, { levels: [], points: 0 }),
  (state) => {
    writeJSON(Keys.rewards, state);
    profileStore.set((s) => ({
      rewardPoints: state.points,
      rewardsVersion: s.rewardsVersion + 1,
    }));
  },
);

export const profileStore = createStore<ProfileState>({
  options: { ...DEFAULT_OPTIONS, ...readJSON<Partial<Options>>(Keys.options, {}) },
  newGame: { ...DEFAULT_NEW_GAME, ...readJSON<Partial<NewGameSettings>>(Keys.newGame, {}) },
  rewardPoints: rewards.points,
  achievementCount: achievements.totalCount,
  maxLevelWon: readJSON(Keys.maxLevelWon, 0),
  hasQuickSave: readJSON<SavedGame | null>(Keys.quickSave, null) !== null,
  discovered: { enemies: [], towers: [], ...readJSON<Partial<Discovered>>(Keys.discovered, {}) },
  bestScore: readJSON(Keys.bestScore, 0),
  stats: {
    gamesPlayed: 0,
    gamesWon: 0,
    highestWave: 0,
    towersBuilt: 0,
    kills: [],
    ...readJSON<Partial<CareerStats>>(Keys.stats, {}),
  },
  rewardsVersion: 0,
});

export function setOption<K extends keyof Options>(key: K, value: Options[K]): void {
  const options = { ...profileStore.get().options, [key]: value };
  writeJSON(Keys.options, options);
  profileStore.set({ options });
}

export function updateNewGame(patch: Partial<NewGameSettings>): void {
  const newGame = { ...profileStore.get().newGame, ...patch };
  newGame.mapType = ((newGame.mapType % MAP_COUNT) + MAP_COUNT) % MAP_COUNT;
  writeJSON(Keys.newGame, newGame);
  profileStore.set({ newGame });
}

/** Highest selectable difficulty: win a level to unlock the next ten. */
export function maxDifficulty(): number {
  return Math.trunc(profileStore.get().maxLevelWon / 10) * 10 + 10;
}

/** Whether Tower Mix mode has been unlocked (by winning survival mode). */
export function towerMixUnlocked(): boolean {
  return achievements.isAchieved(Achievement.Survival100);
}

/** Builds the session configuration for a new game from the saved new-game choices. */
export function sessionConfigFromSettings(): SessionConfig {
  const { newGame } = profileStore.get();
  return {
    mapType: newGame.mapType,
    difficulty: Math.min(newGame.difficulty, maxDifficulty()),
    survival: newGame.survival,
    mixerCode: newGame.mapCode,
    towerMixSeed: newGame.towerMixEnabled && towerMixUnlocked() ? newGame.towerMixCode : 0,
  };
}

/**
 * Banks a finished game's upgrade points, updates the career records and unlocks the next
 * difficulty on a win. Returns whether the game beat a previous best score (the first game played
 * sets the best without beating one).
 */
export function recordGameOver(
  summary: ScoreSummary | null,
  won: boolean,
  config: SessionConfig,
  level: number,
): boolean {
  updateStats((s) => {
    s.gamesPlayed++;
    if (won) s.gamesWon++;
  });
  recordWaveReached(level);
  flushStats();
  let newBest = false;
  if (summary) {
    rewards.addPoints(summary.total);
    const { bestScore } = profileStore.get();
    if (summary.total > bestScore) {
      newBest = bestScore > 0;
      writeJSON(Keys.bestScore, summary.total);
      profileStore.set({ bestScore: summary.total });
    }
  }
  if (won) {
    const maxLevelWon = Math.max(profileStore.get().maxLevelWon, config.difficulty);
    writeJSON(Keys.maxLevelWon, maxLevelWon);
    profileStore.set({ maxLevelWon });
    updateNewGame({ difficulty: config.difficulty + 1 });
  }
  clearQuickSave();
  return newBest;
}

/** Developer tool: sets the highest difficulty won, which controls the difficulty limit. */
export function devSetMaxLevelWon(level: number): void {
  const maxLevelWon = Math.max(0, level);
  writeJSON(Keys.maxLevelWon, maxLevelWon);
  profileStore.set({ maxLevelWon });
}

// ---- Field guide -------------------------------------------------------------------------------

function setDiscovered(discovered: Discovered): void {
  writeJSON(Keys.discovered, discovered);
  profileStore.set({ discovered });
}

/**
 * Records that an enemy type has appeared in a game, unlocking it in the field guide. Returns
 * whether this was the first sighting.
 */
export function markEnemySeen(type: EnemyType): boolean {
  const { discovered } = profileStore.get();
  if (discovered.enemies.includes(type)) {
    return false;
  }
  setDiscovered({ ...discovered, enemies: [...discovered.enemies, type] });
  return true;
}

/** Records that a tower type has been built or upgraded to, unlocking it in the tower guide. */
export function markTowerBought(type: TowerType): void {
  const { discovered } = profileStore.get();
  if (!discovered.towers.includes(type)) {
    setDiscovered({ ...discovered, towers: [...discovered.towers, type] });
  }
}

/** Developer tool: unlocks every guide entry, or locks them all again. */
export function devSetAllDiscovered(unlocked: boolean): void {
  const all = (count: number) => Array.from({ length: count }, (_, i) => i);
  setDiscovered(
    unlocked
      ? {
          enemies: all(ENEMY_TYPE_COUNT),
          towers: all(TOWER_TYPE_COUNT).filter((t) => t !== TowerType.Sell),
        }
      : { enemies: [], towers: [] },
  );
}

// ---- Career records ---------------------------------------------------------------------------
// Counters change many times a second during play, so they're kept in memory and only written (and
// published to the store) by `flushStats`, at save points and when a game ends.

const copyStats = (s: CareerStats): CareerStats => ({ ...s, kills: [...s.kills] });

const liveStats = copyStats(profileStore.get().stats);
let statsDirty = false;

function updateStats(change: (s: CareerStats) => void): void {
  change(liveStats);
  statsDirty = true;
}

export function recordKill(type: EnemyType): void {
  updateStats((s) => {
    s.kills[type] = (s.kills[type] ?? 0) + 1;
  });
}

export function recordTowerBuilt(): void {
  updateStats((s) => {
    s.towersBuilt++;
  });
}

export function recordWaveReached(level: number): void {
  if (level > liveStats.highestWave) {
    updateStats((s) => {
      s.highestWave = level;
    });
  }
}

/** Saves pending career record changes. */
export function flushStats(): void {
  if (!statsDirty) {
    return;
  }
  statsDirty = false;
  const stats = copyStats(liveStats);
  writeJSON(Keys.stats, stats);
  profileStore.set({ stats });
}

// ---- Quick save --------------------------------------------------------------------------------

export function loadQuickSave(): SavedGame | null {
  return readJSON<SavedGame | null>(Keys.quickSave, null);
}

export function writeQuickSave(save: SavedGame): void {
  writeJSON(Keys.quickSave, save);
  profileStore.set({ hasQuickSave: true });
}

export function clearQuickSave(): void {
  remove(Keys.quickSave);
  profileStore.set({ hasQuickSave: false });
}

// ---- Misc preferences ----------------------------------------------------------------------------

export const readZoom = () => readJSON<number | null>(Keys.zoom, null);
export const writeZoom = (scale: number) => writeJSON(Keys.zoom, scale);

/** Returns true exactly once: the first time survival mode has been beaten. */
export function takeSurvivorAnnouncement(): boolean {
  if (!towerMixUnlocked() || readJSON(Keys.survivorShown, false)) {
    return false;
  }
  writeJSON(Keys.survivorShown, true);
  return true;
}
