/**
 * Reward point upgrades (port of the original `RewardData`).
 *
 * Players earn reward points at the end of each game and spend them on permanent upgrades. Most
 * upgrades are levelled (each level costs 20% more); the rest are one-off unlocks whose price
 * grows with the number of unlocks already bought.
 */

export enum Reward {
  BulletUpgrade = 0,
  ExplosivesUpgrade = 1,
  RocketSpeedUpgrade = 2,
  AntiairSpeedUpgrade = 3,
  ArtillerySpeedUpgrade = 4,
  FlameDurationUpgrade = 5,
  SlowDurationUpgrade = 6,
  HealthUpgrade = 7,
  StartingCashUpgrade = 8,
  TeleportTowerUnlocked = 9,
  MineTowerUnlocked = 10,
  UraniumShells = 11,
  NapalmShells = 12,
  AirSniper = 13,
  CheapFireworks = 14,
  SlowBurn = 15,
  FleaMarket = 16,
  Scrambler = 17,
  Cannonball = 18,
  BonusUpgrade = 19,
  AirBurst = 20,
  Shockwave = 21,
  FlareTowerUnlocked = 22,
}

/** How a reward's level changes the value it is applied to. */
enum Increase {
  /** Adds `level * multiplier`. */
  PowerUp,
  /** Increases by `level * multiplier` percent. */
  PercentPower,
  /** Divides by (100 + `level * multiplier`)%, i.e. "x% faster". */
  PercentSpeed,
  /** Increases a duration by `level * multiplier` percent. */
  PercentTime,
  /** One-off unlock. */
  Unlocked,
}

interface RewardDef {
  key: string;
  name: string;
  /** Description; levelled rewards contain `%d` for the next level's bonus. */
  description: string;
  baseCost: number;
  multiplier: number;
  increase: Increase;
}

const levelled = (
  key: string,
  name: string,
  description: string,
  baseCost: number,
  increase: Increase,
  multiplier: number,
): RewardDef => ({ key, name, description, baseCost, multiplier, increase });

const unlock = (key: string, name: string, description: string): RewardDef => ({
  key,
  name,
  description,
  baseCost: 0,
  multiplier: 1,
  increase: Increase.Unlocked,
});

const REWARD_DEFS: readonly RewardDef[] = [
  levelled(
    'Stronger Bullets',
    'Stronger Bullets',
    'Increase bullet power by %d',
    50000,
    Increase.PowerUp,
    1,
  ),
  levelled(
    'Stronger Explosives',
    'Stronger Explosives',
    'Increase rocket/missile/mortar explosive power by %d%',
    75000,
    Increase.PercentPower,
    10,
  ),
  levelled(
    'Faster Rocket Reload',
    'Faster Rocket Reload',
    'Reload rockets %d% faster',
    40000,
    Increase.PercentSpeed,
    10,
  ),
  levelled(
    'Faster Antiair Reload',
    'Faster Antiair Reload',
    'Reload antiair missiles %d% faster',
    20000,
    Increase.PercentSpeed,
    10,
  ),
  levelled(
    'Faster Artillery Reload',
    'Faster Artillery Reload',
    'Reload mortar/artillery shells %d% faster',
    30000,
    Increase.PercentSpeed,
    10,
  ),
  levelled(
    'Longer Flame Burn',
    'Longer Flame Burn',
    'Increase flame burn duration by %d%',
    15000,
    Increase.PercentTime,
    10,
  ),
  levelled(
    'Longer Slowdown',
    'Longer Slowdown',
    'Increase slow tower effect duration by %d%',
    30000,
    Increase.PercentTime,
    10,
  ),
  levelled(
    'Health Reward',
    'Health Upgrade',
    'Increase base health by %d',
    10000,
    Increase.PowerUp,
    1,
  ),
  levelled(
    'Starting Cash Reward',
    'Starting Cash Upgrade',
    'Increase starting cash by %d',
    25000,
    Increase.PowerUp,
    5,
  ),
  unlock(
    'Unlock Teleport Tower',
    'Unlock Teleport Tower',
    'Teleport Tower teleports enemies back to the start',
  ),
  unlock(
    'Unlock Mine Tower',
    'Unlock Mine Tower',
    'Mines deal a large amount of damage when stepped on',
  ),
  unlock('Uranium Shells', 'Uranium Shells', 'Fully-upgraded machine guns ignore armor'),
  unlock('Napalm Shells', 'Napalm Shells', 'Artillery rounds set units on fire'),
  unlock('Air Sniper', 'Air Sniper', 'Upgraded antiair guns have double the range'),
  unlock('Cheap Fireworks', 'Cheap Fireworks', 'Upgraded antiair missiles cost less'),
  unlock('Slow Burn', 'Slow Burn', 'Upgraded fire towers also slow enemies'),
  unlock('Flea Market', 'Flea Market', 'More money for selling towers'),
  unlock('Scrambler', 'Scrambler', 'Teleported enemies are damaged'),
  unlock('Cannonball', 'Cannonball', 'Increased mortar/artillery splash damage'),
  unlock('Bonus!', 'Bonus!', 'Enemy kill bonus is doubled'),
  unlock('Air Burst', 'Air Burst', 'Mines can also attack air units'),
  unlock('Shockwave', 'Shockwave', 'Mine chains cause slow and fire damage to all enemies'),
  unlock(
    'FLARE_TOWER_UPGRADED',
    'Unlock Flare Tower',
    'Flares deal slow and fire damage to passing enemies',
  ),
];

export const REWARD_COUNT = REWARD_DEFS.length;
const UNLOCK_COST = 500000;
const MAX_REWARD_COST = 2000000000;

/** Read-only view of reward levels used by the simulation. */
export interface RewardLevels {
  level(type: Reward): number;
  /** `level * multiplier`: the magnitude of the bonus. */
  factor(type: Reward): number;
  /** Applies the upgrade `type` to a base value (the original `applyAward`). */
  apply(value: number, type: Reward): number;
}

/** Display information for one row of the rewards shop. */
export interface RewardInfo {
  type: Reward;
  name: string;
  description: string;
  /** Short status such as "Lvl 3" or "Unlocked". */
  status: string;
  cost: number;
  isUnlock: boolean;
  isMaxed: boolean;
  /** Reason the reward can't be bought yet, if any. */
  blockedBy: string | null;
  affordable: boolean;
}

export interface RewardStore {
  levels: number[];
  points: number;
}

export class Rewards implements RewardLevels {
  private readonly levels: number[];
  private pointsBalance: number;

  /**
   * @param initial Saved reward levels and points.
   * @param persist Called with the new state whenever points or levels change.
   */
  constructor(
    initial: RewardStore,
    private readonly persist: (state: RewardStore) => void,
  ) {
    this.levels = REWARD_DEFS.map((_, i) => Math.max(0, initial.levels[i] ?? 0));
    this.pointsBalance = Math.max(0, initial.points);
  }

  static keyOf(type: Reward): string {
    return REWARD_DEFS[type].key;
  }

  get points(): number {
    return this.pointsBalance;
  }

  level(type: Reward): number {
    return this.levels[type];
  }

  factor(type: Reward): number {
    return this.levels[type] * REWARD_DEFS[type].multiplier;
  }

  apply(value: number, type: Reward): number {
    const amount = this.factor(type);
    switch (REWARD_DEFS[type].increase) {
      case Increase.PowerUp:
        return value + amount;
      case Increase.PercentPower:
      case Increase.PercentTime:
        return Math.trunc(((amount + 100) * value) / 100);
      case Increase.PercentSpeed:
        return Math.trunc((value * 100) / (amount + 100));
      case Increase.Unlocked:
        return amount;
    }
  }

  /** Upgrade label shown on tower upgrade buttons, e.g. "power lvl 2 (+20%)". */
  towerNote(type: Reward): string | null {
    const level = this.level(type);
    const factor = this.factor(type);
    if (level === 0) {
      // Nothing bought yet; the original showed "lvl 0 (+0)", which is just noise.
      return null;
    }
    switch (REWARD_DEFS[type].increase) {
      case Increase.PowerUp:
        return `power lvl ${level} (+${factor})`;
      case Increase.PercentPower:
        return `power lvl ${level} (+${factor}%)`;
      case Increase.PercentSpeed:
        return `speed lvl ${level} (+${factor}%)`;
      case Increase.PercentTime:
        return `effect lvl ${level} (+${factor}%)`;
      case Increase.Unlocked:
        return null;
    }
  }

  nextLevelCost(type: Reward): number {
    const def = REWARD_DEFS[type];
    if (def.baseCost === 0) {
      const unlocked = REWARD_DEFS.filter(
        (d, i) => d.increase === Increase.Unlocked && this.levels[i] > 0,
      ).length;
      return UNLOCK_COST * (unlocked + 1);
    }
    let cost = def.baseCost;
    for (let i = 0; i < this.levels[type]; i++) {
      cost = Math.trunc((6 * cost) / 5);
      if (cost > MAX_REWARD_COST) {
        return MAX_REWARD_COST;
      }
    }
    return cost;
  }

  info(type: Reward): RewardInfo {
    const def = REWARD_DEFS[type];
    const isUnlock = def.increase === Increase.Unlocked;
    const isMaxed = isUnlock && this.levels[type] > 0;
    const blockedBy =
      type === Reward.FlareTowerUnlocked &&
      this.levels[Reward.MineTowerUnlocked] === 0 &&
      this.levels[Reward.FlareTowerUnlocked] === 0
        ? 'Requires Mine Tower'
        : null;
    const cost = this.nextLevelCost(type);
    return {
      type,
      name: def.name,
      description: isUnlock
        ? def.description
        : def.description.replace('%d', String((this.levels[type] + 1) * def.multiplier)),
      status: isUnlock ? (isMaxed ? 'Unlocked' : 'Locked') : `Lvl ${this.levels[type] + 1}`,
      cost,
      isUnlock,
      isMaxed,
      blockedBy,
      affordable: !isMaxed && blockedBy === null && cost <= this.pointsBalance,
    };
  }

  allInfo(): RewardInfo[] {
    return REWARD_DEFS.map((_, i) => this.info(i));
  }

  /** Buys the next level of `type` if affordable. Returns whether the purchase happened. */
  tryBuy(type: Reward): boolean {
    if (!this.info(type).affordable) {
      return false;
    }
    this.pointsBalance -= this.nextLevelCost(type);
    this.levels[type]++;
    this.save();
    return true;
  }

  addPoints(points: number): void {
    this.pointsBalance += points;
    this.save();
  }

  /** Developer tool: removes every purchased reward level (points are not refunded). */
  devResetLevels(): void {
    this.levels.fill(0);
    this.save();
  }

  private save(): void {
    this.persist({ levels: [...this.levels], points: this.pointsBalance });
  }
}
