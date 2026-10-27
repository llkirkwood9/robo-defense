/**
 * Tower definitions (port of the original `TowerData`).
 *
 * A `TowerTable` is built for each game session because tower stats depend on the player's reward
 * upgrades and, optionally, on a seeded "Tower Mix" that rebalances tower families.
 */
import { GRID } from './constants';
import { ShotType } from './data/projectiles';
import type { SpriteId } from './data/sprites';
import { SPRITES } from './data/sprites';
import { JavaRandom } from './random';
import type { RewardLevels } from './rewards';
import { Reward } from './rewards';

export enum TowerType {
  Sell = 0,
  Gun1 = 1,
  Gun2 = 2,
  Gun3 = 3,
  Slow1 = 4,
  Slow2 = 5,
  Slow3 = 6,
  Rocket1 = 7,
  Rocket2 = 8,
  Rocket3 = 9,
  Flame1 = 10,
  Flame2 = 11,
  Antiair1 = 12,
  Antiair2 = 13,
  SurfaceAir1 = 14,
  SurfaceAir2 = 15,
  Mortar = 16,
  Artillery = 17,
  TeleportUnarmed = 18,
  TeleportArmed = 19,
  MineUnarmed = 20,
  MineArmed = 21,
  Flare = 22,
}

export const TOWER_TYPE_COUNT = 23;
/** Towers that can be dragged out of the build dock, in dock order. */
export const BUILDABLE_TOWERS = [TowerType.Gun1, TowerType.Rocket1, TowerType.Slow1] as const;

export interface TowerProps {
  label: string;
  sprite: SpriteId | null;
  /** Number of turret direction (or animation) frames after the base frame. */
  directions: number;
  /** Animated towers cycle their frames instead of turning towards targets. */
  animated: boolean;
  /** Blocking towers obstruct enemy paths. */
  blocking: boolean;
  cost: number;
  /** World-pixel attack radius, and its square. */
  attackRadius: number;
  attackRadiusSq: number;
  /** Ticks between shots. */
  shotDelay: number;
  power: number;
  shotType: ShotType;
  /** Distance from the tower centre at which shots spawn. */
  gunRadius: number;
  /** How far the turret sprite is drawn above the base. */
  towerHeight: number;
  /** Tower this was upgraded from, or -1. */
  downgrade: TowerType | -1;
  /** Up to three upgrade options (-1 = empty slot). */
  upgrades: [TowerType | -1, TowerType | -1, TowerType | -1];
  /** Reward-level notes shown on upgrade buttons. */
  notes: (string | null)[];
}

/** Attack radius from tenths of a grid cell. */
const radius = (deciGrids: number) => Math.trunc((GRID * deciGrids) / 10);

function baseProps(label: string, sprite: SpriteId | null): TowerProps {
  return {
    label,
    sprite,
    directions: sprite ? SPRITES[sprite].frames - 1 : 0,
    animated: false,
    blocking: true,
    cost: 0,
    attackRadius: radius(3),
    attackRadiusSq: radius(3) ** 2,
    shotDelay: 1000,
    power: 0,
    shotType: ShotType.None,
    gunRadius: 25,
    towerHeight: Math.trunc((GRID * 3) / 8),
    downgrade: -1,
    upgrades: [-1, -1, -1],
    notes: [null, null],
  };
}

function setRadius(p: TowerProps, deciGrids: number) {
  p.attackRadius = radius(deciGrids);
  p.attackRadiusSq = p.attackRadius * p.attackRadius;
}

/** Builds every tower's stats for the given reward levels (initProps + applyTowerAwards). */
function createTowerProps(r: RewardLevels & { towerNote(t: Reward): string | null }): TowerProps[] {
  const t: TowerProps[] = [];
  const has = (reward: Reward) => r.level(reward) > 0;
  const define = (
    type: TowerType,
    label: string,
    sprite: SpriteId | null,
    stats: Partial<TowerProps> & { radius?: number },
  ) => {
    const p = baseProps(label, sprite);
    const { radius: deci, ...rest } = stats;
    Object.assign(p, rest);
    if (deci !== undefined) {
      setRadius(p, deci);
    }
    t[type] = p;
  };

  const bulletNote = r.towerNote(Reward.BulletUpgrade);
  const flameNote = r.towerNote(Reward.FlameDurationUpgrade);
  const slowNote = r.towerNote(Reward.SlowDurationUpgrade);
  const explosiveNote = r.towerNote(Reward.ExplosivesUpgrade);
  const rocketNotes = [r.towerNote(Reward.RocketSpeedUpgrade), explosiveNote];
  const antiairNotes = [r.towerNote(Reward.AntiairSpeedUpgrade), explosiveNote];
  const artilleryNotes = [r.towerNote(Reward.ArtillerySpeedUpgrade), explosiveNote];

  define(TowerType.Sell, 'Sell For Cash', null, {});

  // Machine guns.
  define(TowerType.Gun1, 'Basic Gun', 'gun_tower', {
    shotType: ShotType.Bullet,
    upgrades: [TowerType.Gun2, TowerType.Flame1, TowerType.Antiair1],
    cost: 5,
    shotDelay: 6,
    radius: 18,
    power: r.apply(1, Reward.BulletUpgrade),
    notes: [bulletNote, null],
  });
  define(TowerType.Gun2, 'Medium Gun', 'gun_tower2', {
    shotType: ShotType.Bullet,
    downgrade: TowerType.Gun1,
    upgrades: [TowerType.Gun3, -1, -1],
    cost: 4,
    shotDelay: 6,
    radius: 18,
    power: r.apply(2, Reward.BulletUpgrade),
    notes: [bulletNote, null],
  });
  define(TowerType.Gun3, 'Heavy Gun', 'gun_tower3', {
    shotType: has(Reward.UraniumShells) ? ShotType.UraniumBullet : ShotType.BigBullet,
    downgrade: TowerType.Gun2,
    cost: 6,
    shotDelay: 6,
    radius: 18,
    power: r.apply(3, Reward.BulletUpgrade),
    notes: [bulletNote, null],
  });

  // Antiair guns.
  define(TowerType.Antiair1, 'Antiair Cannon', 'aa_tower', {
    shotType: ShotType.AntiairBullet,
    gunRadius: 5,
    downgrade: TowerType.Gun1,
    upgrades: [TowerType.Antiair2, -1, -1],
    cost: 20,
    shotDelay: 6,
    radius: 18,
    power: r.apply(9, Reward.BulletUpgrade),
    notes: [bulletNote, null],
  });
  define(TowerType.Antiair2, 'Heavy Antiair Cannon', 'aa_tower2', {
    shotType: ShotType.AntiairBullet,
    gunRadius: 5,
    downgrade: TowerType.Antiair1,
    cost: 40,
    shotDelay: 6,
    radius: has(Reward.AirSniper) ? 26 : 18,
    power: r.apply(20, Reward.BulletUpgrade),
    notes: [bulletNote, null],
  });

  // Flame towers.
  define(TowerType.Flame1, 'Flame Tower', 'flame_tower', {
    shotType: ShotType.Fire,
    downgrade: TowerType.Gun1,
    upgrades: [TowerType.Flame2, -1, -1],
    cost: 70,
    shotDelay: 3,
    radius: 18,
    power: r.apply(40, Reward.FlameDurationUpgrade),
    notes: [flameNote, null],
  });
  define(TowerType.Flame2, 'Inferno Tower', 'flame_tower2', {
    shotType: has(Reward.SlowBurn) ? ShotType.SlowFire : ShotType.Fire,
    downgrade: TowerType.Flame1,
    cost: 50,
    shotDelay: 3,
    radius: 18,
    power: r.apply(70, Reward.FlameDurationUpgrade),
    notes: [flameNote, null],
  });

  // Slow towers.
  const slowBase = { shotType: ShotType.Slow, gunRadius: 1, animated: true, cost: 10, radius: 18 };
  define(TowerType.Slow1, 'Basic Slow Tower', 'ice_tower', {
    ...slowBase,
    upgrades: [
      TowerType.Slow2,
      has(Reward.TeleportTowerUnlocked) ? TowerType.TeleportUnarmed : -1,
      has(Reward.MineTowerUnlocked) ? TowerType.MineUnarmed : -1,
    ],
    shotDelay: 30,
    power: r.apply(30, Reward.SlowDurationUpgrade),
    notes: [slowNote, null],
  });
  define(TowerType.Slow2, 'Upgraded Slow Tower', 'ice_tower2', {
    ...slowBase,
    downgrade: TowerType.Slow1,
    upgrades: [TowerType.Slow3, -1, -1],
    shotDelay: 20,
    power: r.apply(45, Reward.SlowDurationUpgrade),
    notes: [slowNote, null],
  });
  define(TowerType.Slow3, 'Advanced Slow Tower', 'ice_tower3', {
    ...slowBase,
    downgrade: TowerType.Slow2,
    shotDelay: 15,
    power: r.apply(60, Reward.SlowDurationUpgrade),
    notes: [slowNote, null],
  });

  // Rocket launchers.
  define(TowerType.Rocket1, 'Light Rocket Launcher', 'rocket_tower', {
    shotType: ShotType.Rocket,
    upgrades: [TowerType.Rocket2, TowerType.Mortar, TowerType.SurfaceAir1],
    cost: 20,
    shotDelay: r.apply(70, Reward.RocketSpeedUpgrade),
    radius: 35,
    power: r.apply(17, Reward.ExplosivesUpgrade),
    notes: rocketNotes,
  });
  define(TowerType.Rocket2, 'Medium Rocket Launcher', 'rocket_tower2', {
    shotType: ShotType.Rocket,
    downgrade: TowerType.Rocket1,
    upgrades: [TowerType.Rocket3, -1, -1],
    cost: 30,
    shotDelay: r.apply(55, Reward.RocketSpeedUpgrade),
    radius: 35,
    power: r.apply(32, Reward.ExplosivesUpgrade),
    notes: rocketNotes,
  });
  define(TowerType.Rocket3, 'Heavy Rocket Launcher', 'rocket_tower3', {
    shotType: ShotType.Rocket,
    downgrade: TowerType.Rocket2,
    cost: 50,
    shotDelay: r.apply(50, Reward.RocketSpeedUpgrade),
    radius: 35,
    power: r.apply(50, Reward.ExplosivesUpgrade),
    notes: rocketNotes,
  });

  // Surface-to-air missiles.
  define(TowerType.SurfaceAir1, 'Surface to Air Missile', 'sam_tower', {
    shotType: ShotType.SurfaceToAir,
    downgrade: TowerType.Rocket1,
    upgrades: [TowerType.SurfaceAir2, -1, -1],
    cost: 70,
    shotDelay: r.apply(50, Reward.AntiairSpeedUpgrade),
    radius: 45,
    power: r.apply(65, Reward.ExplosivesUpgrade),
    notes: antiairNotes,
  });
  define(TowerType.SurfaceAir2, 'Advanced Air Missile', 'sam_tower2', {
    shotType: ShotType.SurfaceToAir,
    downgrade: TowerType.SurfaceAir1,
    cost: has(Reward.CheapFireworks) ? 50 : 90,
    shotDelay: r.apply(50, Reward.AntiairSpeedUpgrade),
    radius: 45,
    power: r.apply(110, Reward.ExplosivesUpgrade),
    notes: antiairNotes,
  });

  // Artillery.
  define(TowerType.Mortar, 'Mortar', 'mortar', {
    shotType: ShotType.Mortar,
    gunRadius: 1,
    downgrade: TowerType.Rocket1,
    upgrades: [TowerType.Artillery, -1, -1],
    cost: 50,
    shotDelay: r.apply(90, Reward.ArtillerySpeedUpgrade),
    radius: 45,
    power: r.apply(35, Reward.ExplosivesUpgrade),
    notes: artilleryNotes,
  });
  define(TowerType.Artillery, 'Artillery', 'artillery', {
    shotType: has(Reward.NapalmShells) ? ShotType.NapalmShell : ShotType.Artillery,
    gunRadius: 1,
    downgrade: TowerType.Mortar,
    cost: 90,
    shotDelay: r.apply(90, Reward.ArtillerySpeedUpgrade),
    radius: 55,
    power: r.apply(70, Reward.ExplosivesUpgrade),
    notes: artilleryNotes,
  });

  // Non-blocking specials unlocked through rewards.
  const flat = { blocking: false, gunRadius: 1, towerHeight: 0 };
  define(TowerType.TeleportUnarmed, 'Unarmed Teleport Tower', 'teleport_tower_unarmed', {
    ...flat,
    cost: 20,
    downgrade: TowerType.Slow1,
    upgrades: [TowerType.TeleportArmed, -1, -1],
  });
  define(TowerType.TeleportArmed, 'Armed Teleport Tower', 'teleport_tower_armed', {
    ...flat,
    radius: 1,
    shotDelay: 1,
    shotType: ShotType.Teleport,
    cost: 3,
    animated: true,
    downgrade: TowerType.TeleportUnarmed,
  });
  define(TowerType.MineUnarmed, 'Unarmed Mine', 'mine_unarmed', {
    ...flat,
    cost: 20,
    downgrade: TowerType.Slow1,
    upgrades: [TowerType.MineArmed, has(Reward.FlareTowerUnlocked) ? TowerType.Flare : -1, -1],
  });
  define(TowerType.MineArmed, 'Armed Mine', 'mine_armed', {
    ...flat,
    radius: 1,
    shotDelay: 1,
    shotType: ShotType.Mine,
    cost: 5,
    animated: true,
    downgrade: TowerType.MineUnarmed,
    power: r.apply(400, Reward.ExplosivesUpgrade),
  });
  define(TowerType.Flare, 'Flare', 'flare', {
    blocking: false,
    towerHeight: 0,
    shotType: ShotType.SlowFire,
    cost: 10,
    downgrade: TowerType.MineUnarmed,
    shotDelay: 3,
    radius: 5,
    power: r.apply(40, Reward.FlameDurationUpgrade),
  });

  return t;
}

// ---------------------------------------------------------------------------------------------
// Tower Mix: a seeded rebalance unlocked by beating survival mode.
// ---------------------------------------------------------------------------------------------

/** Tower families that are always rebalanced together. */
const MIX_FAMILIES: TowerType[][] = [
  [TowerType.Gun3, TowerType.Gun2, TowerType.Gun1],
  [TowerType.Slow3, TowerType.Slow2, TowerType.Slow1],
  [TowerType.Rocket3, TowerType.Rocket2, TowerType.Rocket1],
  [TowerType.Flame2, TowerType.Flame1],
  [TowerType.Antiair2, TowerType.Antiair1],
  [TowerType.SurfaceAir2, TowerType.SurfaceAir1],
  [TowerType.Artillery, TowerType.Mortar],
];

enum MixChange {
  ShotDelay = 0,
  ShotPower = 1,
  AttackRadius = 2,
  Cost = 3,
}

const MIX_MAX_COST = 200;
const MIX_MAX_SHOT_DELAY = 90;

function positiveMixOk(t: TowerProps[], family: TowerType[], change: MixChange): boolean {
  return family.every((id) => {
    const p = t[id];
    switch (change) {
      case MixChange.ShotDelay:
        return Math.trunc((p.shotDelay * 2) / 3) >= 2;
      case MixChange.ShotPower:
        return true;
      case MixChange.AttackRadius:
        return Math.trunc((p.attackRadius * 3) / 2) <= radius(100);
      case MixChange.Cost:
        return Math.trunc((p.cost * 100) / 125) >= 1;
    }
  });
}

function negativeMixOk(t: TowerProps[], family: TowerType[], change: MixChange): boolean {
  return family.every((id) => {
    const p = t[id];
    switch (change) {
      case MixChange.ShotDelay:
        return Math.trunc((p.shotDelay * 3) / 2) <= MIX_MAX_SHOT_DELAY;
      case MixChange.ShotPower:
        return Math.trunc((p.power * 2) / 3) >= 1;
      case MixChange.AttackRadius:
        return Math.trunc((p.attackRadius * 2) / 3) >= radius(10);
      case MixChange.Cost:
        return Math.trunc((p.cost * 125) / 100) <= MIX_MAX_COST;
    }
  });
}

function applyMix(t: TowerProps[], family: TowerType[], change: MixChange, positive: boolean) {
  for (const id of family) {
    const p = t[id];
    switch (change) {
      case MixChange.ShotDelay:
        p.shotDelay = Math.trunc(positive ? (p.shotDelay * 2) / 3 : (p.shotDelay * 3) / 2);
        break;
      case MixChange.ShotPower:
        p.power = Math.trunc(positive ? (p.power * 3) / 2 : (p.power * 2) / 3);
        break;
      case MixChange.AttackRadius:
        p.attackRadius = Math.trunc(positive ? (p.attackRadius * 3) / 2 : (p.attackRadius * 2) / 3);
        p.attackRadiusSq = p.attackRadius * p.attackRadius;
        break;
      case MixChange.Cost:
        p.cost = Math.trunc(positive ? (p.cost * 100) / 125 : (p.cost * 125) / 100);
        break;
    }
  }
}

/** Applies a Tower Mix with the same random sequence as the original. */
function applyTowerMix(t: TowerProps[], seed: number) {
  const rand = new JavaRandom(seed);
  const changeCount = rand.nextInt(40) + 10;
  for (let i = 0; i < changeCount; i++) {
    const family = MIX_FAMILIES[rand.nextInt(MIX_FAMILIES.length)];
    const positive = rand.nextInt(4) as MixChange;
    if (!positiveMixOk(t, family, positive)) {
      continue;
    }
    if (rand.nextInt(100) <= 4) {
      applyMix(t, family, positive, true);
    } else {
      const negative = rand.nextInt(4) as MixChange;
      if (positive !== negative && negativeMixOk(t, family, negative)) {
        applyMix(t, family, positive, true);
        applyMix(t, family, negative, false);
      }
    }
  }
}

/** Per-session tower statistics. */
export class TowerTable {
  private readonly props: TowerProps[];

  /**
   * @param rewards Reward levels that buff towers.
   * @param towerMixSeed Seed for the Tower Mix mode, or 0 for standard towers.
   */
  constructor(
    private readonly rewards: RewardLevels & { towerNote(t: Reward): string | null },
    towerMixSeed = 0,
  ) {
    this.props = createTowerProps(rewards);
    if (towerMixSeed > 0) {
      applyTowerMix(this.props, towerMixSeed);
    }
  }

  get(type: TowerType): TowerProps {
    return this.props[type];
  }

  /** Cash returned when selling: half of every purchase in the upgrade chain. */
  sellValue(type: TowerType): number {
    let value = 0;
    for (let t: TowerType | -1 = type; t >= 0; t = this.props[t].downgrade) {
      value += Math.trunc(this.props[t].cost / 2);
    }
    return this.rewards.level(Reward.FleaMarket) > 0 ? value + Math.trunc(value / 2) : value;
  }

  /** Sprite frame for a tower's turret, or -1 when the tower has no turret layer. */
  turretFrame(type: TowerType, angle: number, animFrame = 0): number {
    const p = this.props[type];
    if (p.animated) {
      return (animFrame % p.directions) + 1;
    }
    if (p.directions === 0) {
      return -1;
    }
    return Math.trunc((p.directions * angle) / 360) + 1;
  }
}
