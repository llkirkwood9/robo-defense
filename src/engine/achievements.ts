/**
 * Achievement tracking (port of the original `AchievementData`).
 *
 * Each achievement has a progress level and a target. Every earned achievement permanently adds
 * one point to the in-game enemy kill bonus.
 */
import { ACHIEVEMENT_DEFS } from './data/achievements';

/** Achievement indices referenced by game logic. */
export enum Achievement {
  CompleteDifficulty0 = 0,
  CompleteDifficulty2 = 1,
  CompleteDifficulty5 = 2,
  CompleteDifficulty8 = 3,
  CompleteDifficulty11 = 4,
  CompleteDifficulty14 = 5,
  CompleteDifficulty17 = 6,
  CompleteDifficulty20 = 7,
  Perfect25 = 8,
  Perfect50 = 9,
  Perfect100 = 10,
  FastPaced = 11,
  Rocketman = 12,
  Gunner = 13,
  Cheapskate = 14,
  BigSpender = 15,
  TwentyFiveK = 16,
  BigScore = 17,
  HugeScore = 18,
  Experienced = 19,
  PoweredUp = 20,
  NoSale = 21,
  FastLane = 22,
  Addict = 23,
  SeventyFiveK = 24,
  RiskTaker = 25,
  SolidEffort = 26,
  RainyDay = 27,
  BigSaver = 28,
  CrazySaver = 29,
  BigOne = 30,
  Whopper = 31,
  GoodGame = 32,
  GreatGame = 33,
  AmazingGame = 34,
  Basic10 = 35,
  Basic25 = 36,
  BasicLvl40 = 37,
  BasicLvl60 = 38,
  Ruins10 = 39,
  Ruins25 = 40,
  RuinsLvl30 = 41,
  RuinsLvl50 = 42,
  Factory10 = 43,
  Factory25 = 44,
  FactoryLvl20 = 45,
  FactoryLvl40 = 46,
  ThirtyThirty = 47,
  Courtyard10 = 48,
  Courtyard25 = 49,
  CourtyardLvl15 = 50,
  CourtyardLvl25 = 51,
  MixerA = 52,
  MixerB = 53,
  MixerC = 54,
  MixerD = 55,
  DefeatTitan = 56,
  ChainSmoker = 57,
  Pyro = 58,
  CompleteDifficulty40 = 59,
  CompleteDifficulty60 = 60,
  CompleteDifficulty80 = 61,
  CompleteDifficulty100 = 62,
  SuperPowered = 63,
  BasicLvl80 = 64,
  BasicLvl100 = 65,
  RuinsLvl70 = 66,
  RuinsLvl100 = 67,
  FactoryLvl70 = 68,
  FactoryLvl100 = 69,
  CourtyardLvl50 = 70,
  CourtyardLvl100 = 71,
  UltraGame = 72,
  Survival10 = 73,
  Survival20 = 74,
  Survival30 = 75,
  Survival40 = 76,
  Survival50 = 77,
  Survival60 = 78,
  Survival70 = 79,
  Survival80 = 80,
  Survival90 = 81,
  Survival100 = 82,
  RoadwayLvl10 = 83,
  RoadwayLvl50 = 84,
  RoadwayLvl100 = 85,
  MixerE = 86,
  ShowOff = 87,
}

export const ACHIEVEMENT_COUNT = ACHIEVEMENT_DEFS.length;

export interface AchievementInfo {
  index: number;
  name: string;
  description: string;
  /** Progress text such as "1,200 / 5,000", for multi-step achievements. */
  progress: string | null;
  achieved: boolean;
}

/** The subset of achievement behaviour the simulation needs. */
export interface AchievementSink {
  increase(type: Achievement, amount: number): void;
  isAchieved(type: Achievement): boolean;
  readonly totalCount: number;
}

const formatNumber = (n: number) => n.toLocaleString('en-US');

export class Achievements implements AchievementSink {
  private readonly levels: number[];
  private readonly savedLevels: number[];
  private readonly earnedQueue: Achievement[] = [];
  private earnedCount = 0;

  /**
   * @param initial Saved progress, indexed like `ACHIEVEMENT_DEFS`.
   * @param persist Writes changed progress `(key, level)` pairs to storage.
   */
  constructor(
    initial: number[],
    private readonly persist: (changes: [key: string, level: number][]) => void,
  ) {
    this.levels = ACHIEVEMENT_DEFS.map((_, i) => Math.max(0, initial[i] ?? 0));
    this.savedLevels = [...this.levels];
    this.earnedCount = this.levels.filter((lvl, i) => lvl >= ACHIEVEMENT_DEFS[i].target).length;
  }

  static keyOf(index: number): string {
    return ACHIEVEMENT_DEFS[index].key;
  }

  get totalCount(): number {
    return this.earnedCount;
  }

  isAchieved(type: Achievement): boolean {
    return this.levels[type] >= ACHIEVEMENT_DEFS[type].target;
  }

  /** Adds progress. Newly earned achievements are queued for display and saved immediately. */
  increase(type: Achievement, amount: number): void {
    const target = ACHIEVEMENT_DEFS[type].target;
    if (this.levels[type] >= target || amount <= 0) {
      return;
    }
    this.levels[type] += amount;
    if (this.levels[type] >= target) {
      this.levels[type] = target;
      this.earnedCount++;
      this.earnedQueue.push(type);
      this.flush();
    }
  }

  /** Pops the next newly-earned achievement, if any. */
  dequeueEarned(): Achievement | undefined {
    return this.earnedQueue.shift();
  }

  /** Writes any unsaved progress (counters are only flushed at checkpoints, like the original). */
  flush(): void {
    const changes: [string, number][] = [];
    this.levels.forEach((level, i) => {
      if (level !== this.savedLevels[i]) {
        changes.push([ACHIEVEMENT_DEFS[i].key, level]);
        this.savedLevels[i] = level;
      }
    });
    if (changes.length > 0) {
      this.persist(changes);
    }
  }

  info(index: number): AchievementInfo {
    const def = ACHIEVEMENT_DEFS[index];
    return {
      index,
      name: def.name,
      description: def.description,
      progress:
        def.target > 1 ? `${formatNumber(this.levels[index])} / ${formatNumber(def.target)}` : null,
      achieved: this.levels[index] >= def.target,
    };
  }

  allInfo(): AchievementInfo[] {
    return ACHIEVEMENT_DEFS.map((_, i) => this.info(i));
  }

  /** Developer tool: marks every achievement earned, or clears all progress. */
  devSetAll(earned: boolean): void {
    ACHIEVEMENT_DEFS.forEach((def, i) => {
      this.levels[i] = earned ? def.target : 0;
    });
    this.earnedCount = earned ? ACHIEVEMENT_COUNT : 0;
    this.earnedQueue.length = 0;
    this.flush();
  }
}
