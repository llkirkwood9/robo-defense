/**
 * Headless balance harness: plays full games with scripted bots against the real engine and prints
 * how far each strategy gets.
 *
 *     npm run balance -- [games per cell] [difficulties] [maps] [reward level]
 *     npm run balance -- 3 0,5,10 0,1,2 0
 */
import { Dir, GRID, RunState } from '../../src/engine/constants';
import { ShotType } from '../../src/engine/data/projectiles';
import { ENEMIES } from '../../src/engine/enemies';
import type { Tower } from '../../src/engine/entities';
import type { GameEvent, GameServices } from '../../src/engine/gameState';
import { GameState } from '../../src/engine/gameState';
import type { MapType } from '../../src/engine/maps';
import { MAP_NAMES } from '../../src/engine/maps';
import type { RewardLevels } from '../../src/engine/rewards';
import { TowerTable, TowerType } from '../../src/engine/towers';
import { generateWaves } from '../../src/engine/waves';

/** Per-level bonus of each levelled reward, in `Reward` order. */
const REWARD_STEP = [1, 10, 10, 10, 10, 10, 10, 1, 5];

/** Rewards as if every levelled upgrade were bought `n` times (and no unlocks). */
const rewardsAt = (n: number): RewardLevels & { towerNote(): null } => ({
  level: (t) => (t < REWARD_STEP.length ? n : 0),
  factor: (t) => (t < REWARD_STEP.length ? n * REWARD_STEP[t] : 0),
  apply: (value, t) => {
    if (t >= REWARD_STEP.length || n === 0) return value;
    const amount = n * REWARD_STEP[t];
    if (t === 0 || t === 7 || t === 8) return value + amount;
    if (t >= 2 && t <= 4) return Math.trunc((value * 100) / (amount + 100));
    return Math.trunc(((amount + 100) * value) / 100);
  },
  towerNote: () => null,
});

/** A strategy: ground upgrade chains built in turn, an anti-air chain, and optional slow towers. */
interface Strategy {
  name: string;
  ground: TowerType[][];
  air: TowerType[];
  slowEvery?: number;
  /** Sends each wave as soon as the last has finished spawning. */
  rush?: boolean;
}

const GUN = [TowerType.Gun1, TowerType.Gun2, TowerType.Gun3];
const FLAME = [TowerType.Gun1, TowerType.Flame1, TowerType.Flame2];
const ROCKET = [TowerType.Rocket1, TowerType.Rocket2, TowerType.Rocket3];
const MORTAR = [TowerType.Rocket1, TowerType.Mortar, TowerType.Artillery];
const AA = [TowerType.Gun1, TowerType.Antiair1, TowerType.Antiair2];
const SAM = [TowerType.Rocket1, TowerType.SurfaceAir1, TowerType.SurfaceAir2];

const STRATEGIES: Strategy[] = [
  { name: 'gun1', ground: [[TowerType.Gun1]], air: AA },
  { name: 'guns', ground: [GUN], air: AA },
  { name: 'flame', ground: [FLAME, GUN], air: AA },
  { name: 'rocket', ground: [ROCKET], air: [] },
  { name: 'arty', ground: [MORTAR, GUN], air: SAM },
  { name: 'mixed', ground: [GUN, ROCKET, FLAME, MORTAR], air: AA, slowEvery: 5 },
  { name: 'rush', ground: [GUN, ROCKET, FLAME, MORTAR], air: AA, slowEvery: 5, rush: true },
];

const chainCost = (table: TowerTable, chain: TowerType[]) =>
  chain.reduce((sum, t) => sum + table.get(t).cost, 0);

interface GridView {
  orientation(x: number, y: number): number;
}

class Bot {
  private cursor = 0;
  private built = 0;
  private airBuilt = 0;
  private flyerHp = 0;
  private readonly chains = new Map<Tower, TowerType[]>();
  private readonly airTowers = new Set<Tower>();
  private readonly grids: GridView[];

  constructor(
    private readonly s: GameState,
    private readonly strategy: Strategy,
    private readonly maze: boolean,
  ) {
    this.grids = (s as unknown as { grids: GridView[] }).grids;
  }

  private cells(): { x: number; y: number }[] {
    const { layout } = this.s;
    const out = [];
    for (let y = 1; y < layout.height - 1; y++) {
      for (let x = 1; x < layout.width - 1; x++) {
        out.push({ x, y });
      }
    }
    return out;
  }

  /** Follows a path's direction field and returns the cells enemies step through. */
  private walk(pathNum: number): { x: number; y: number }[] {
    const g = this.grids[pathNum];
    const p = this.s.layout.paths[pathNum];
    let x = p.startX;
    let y = p.startY;
    const out = [{ x, y }];
    for (let i = 0; i < 400; i++) {
      const d = g.orientation(x, y);
      if (d === Dir.Right) x++;
      else if (d === Dir.Up) y--;
      else if (d === Dir.Left) x--;
      else if (d === Dir.Down) y++;
      else break;
      out.push({ x, y });
      if (x === p.endX && y === p.endY) break;
    }
    return out;
  }

  private walkLength(): number {
    return this.s.layout.paths.reduce((sum, _, i) => sum + this.walk(i).length, 0);
  }

  /** Flyers travel straight from the entrance in their start direction. */
  private flightCells(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const p of this.s.layout.paths) {
      let { startX: x, startY: y } = p;
      for (let i = 0; i < 60 && this.s.inBounds(x, y); i++) {
        out.push({ x, y });
        if (p.startDir === Dir.Right) x++;
        else if (p.startDir === Dir.Left) x--;
        else if (p.startDir === Dir.Up) y--;
        else y++;
      }
    }
    return out;
  }

  private coverage(x: number, y: number, radius: number, cells: { x: number; y: number }[]) {
    let n = 0;
    const r = radius / GRID;
    for (const c of cells) {
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy < r * r) n++;
    }
    return n;
  }

  /** Serpentine walls across the long axis of the map, the way players build mazes. */
  private combCells(): Set<number> {
    const { width, height } = this.s.layout;
    const out = new Set<number>();
    const across = width >= height;
    const long = across ? width : height;
    const short = across ? height : width;
    for (let i = 3, n = 0; i < long - 2; i += 2, n++) {
      for (let j = 1; j < short - 1; j++) {
        if (j === (n % 2 === 0 ? 1 : short - 2)) continue; // The gap in this wall.
        out.add(across ? j * 100 + i : i * 100 + j);
      }
    }
    return out;
  }

  /** The path with the least firepower along it, so multi-lane maps get defended evenly. */
  private weakestLane(): number {
    const s = this.s;
    let best = 0;
    let bestPower = Infinity;
    s.layout.paths.forEach((_, i) => {
      const route = this.walk(i);
      let power = 0;
      for (const t of s.towers) {
        const p = t.props;
        if (p.power === 0 || this.airTowers.has(t)) continue;
        power += this.coverage(t.gridX, t.gridY, p.attackRadius, route) * (p.cost + 5);
      }
      if (power < bestPower) {
        bestPower = power;
        best = i;
      }
    });
    return best;
  }

  /** Builds the first tower of `chain` on the legal cell that covers the most of its lane. */
  private place(chain: TowerType[], air: boolean): boolean {
    const s = this.s;
    const base = chain[0];
    const last = s.towerTable.get(chain[chain.length - 1]);
    const route = air ? this.flightCells() : this.walk(this.weakestLane());
    const walked = new Set(
      s.layout.paths.flatMap((_, i) => this.walk(i)).map((c) => c.y * 100 + c.x),
    );
    const comb = this.maze ? this.combCells() : null;
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;
    for (const { x, y } of this.cells()) {
      const key = y * 100 + x;
      if (comb === null && walked.has(key)) continue; // Hugging the road leaves it clear.
      if (s.towerAt(x, y) || !s.canPlaceTower(x, y, base, true)) continue;
      let score = this.coverage(x, y, last.attackRadius, route);
      if (score === 0) continue;
      if (comb !== null && !air && comb.has(key)) score += 100;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    return best !== null && s.tryPlaceTower(base, best.x, best.y);
  }

  /** Buys the next upgrade of any tower on its chain, if one is affordable. */
  private upgradeSomething(): boolean {
    const s = this.s;
    for (const t of s.towers) {
      const chain = this.chains.get(t);
      if (!chain) continue;
      const next = chain[chain.indexOf(t.type) + 1];
      if (next !== undefined && s.towerTable.get(next).cost <= s.money) {
        s.upgradeTower(t, next);
        return true;
      }
    }
    return false;
  }

  /** Builds a tower and remembers which upgrade chain it follows. */
  private build(chain: TowerType[], air: boolean): boolean {
    if (!this.place(chain, air)) return false;
    this.chains.set(this.s.towers[this.s.towers.length - 1], chain);
    return true;
  }

  /** Anti-air wanted: one chain per 150 flyer hit points seen in a wave, like a player reacting. */
  private airWanted(): number {
    return this.strategy.air.length === 0 ? 0 : Math.ceil(this.flyerHp / 150);
  }

  /** Notes how strong the air threat has become. */
  private watchAir(): void {
    let hp = 0;
    for (const e of this.s.enemies) if (e.props.isFlyer) hp += e.health;
    this.flyerHp = Math.max(this.flyerHp, hp);
  }

  /** Runs once per decision interval. */
  act(): void {
    const s = this.s;
    this.watchAir();
    if (this.strategy.rush && s.health >= 15) s.callNextWave();
    if (this.airBuilt < this.airWanted()) {
      const cost = chainCost(s.towerTable, this.strategy.air);
      if (s.money < cost) return; // Save up for it.
      if (this.build(this.strategy.air, true)) {
        this.airTowers.add(s.towers[s.towers.length - 1]);
        this.airBuilt++;
      }
    }
    for (let i = 0; i < 40; i++) {
      if (this.upgradeSomething()) continue;
      const { ground, slowEvery } = this.strategy;
      const wantSlow = slowEvery !== undefined && this.built % slowEvery === slowEvery - 1;
      const chain = wantSlow ? [TowerType.Slow1] : ground[this.cursor % ground.length];
      if (s.towerTable.get(chain[0]).cost > s.money || !this.build(chain, false)) return;
      this.built++;
      if (!wantSlow) this.cursor++;
    }
  }
}

interface Result {
  /** Lives lost to each robot type. */
  leaks: Map<string, number>;
  won: boolean;
  wave: number;
  health: number;
  towers: number;
  money: number;
  points: number;
}

function play(
  strategy: Strategy,
  map: MapType,
  difficulty: number,
  maze: boolean,
  rewardLevel: number,
): Result {
  let over: Extract<GameEvent, { type: 'gameOver' }> | null = null;
  const leaks = new Map<string, number>();
  const rewards = rewardsAt(rewardLevel);
  const services: GameServices = {
    towerTable: new TowerTable(rewards),
    rewards,
    achievements: {
      increase: () => {},
      totalCount: 0,
      dequeueEarned: () => undefined,
      flush: () => {},
    } as unknown as GameServices['achievements'],
    options: { ffStopsBetweenLevels: false, ffPausesOnLifeLoss: false },
    emit: (e) => {
      if (e.type === 'gameOver') over = e;
    },
  };
  const s = new GameState(
    { mapType: map, difficulty, survival: false, mixerCode: 0, towerMixSeed: 0 },
    services,
  );
  s.start();
  const bot = new Bot(s, strategy, maze);
  let last = { towers: 0, money: 0, health: 0 };
  // The tick cap guards against a stalled game.
  for (let t = 0; t < 2_000_000 && !over; t++) {
    if (t % 15 === 0) bot.act();
    last = { towers: s.towers.length, money: s.money, health: s.health };
    const before = s.health;
    const walking = s.enemies.filter((e) => e.gridX === s.layout.paths[e.pathNum].endX);
    s.update();
    if (s.health < before || over) {
      for (const e of walking) {
        if (e.atExit) leaks.set(e.props.label, (leaks.get(e.props.label) ?? 0) + 1);
      }
    }
    if (s.runState === RunState.Lost) break;
  }
  const o = over as Extract<GameEvent, { type: 'gameOver' }> | null;
  return {
    won: o?.outcome === 'won',
    wave: o?.level ?? s.levelNum,
    points: o?.summary?.total ?? 0,
    leaks,
    ...last,
  };
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pad = (v: string | number, n: number) => String(v).padStart(n);

function towerTable(rewardLevel: number) {
  const t = new TowerTable(rewardsAt(rewardLevel));
  console.log('\n== Tower value: damage per second, and per $ of the whole upgrade chain ==');
  console.log('tower                     $chain  range  dps:arm0  arm6 arm14 | /$ arm0 arm14');
  for (let type = 1; type <= 21; type++) {
    const p = t.get(type);
    if (p.power === 0 || p.shotDelay >= 1000) continue;
    let chain = 0;
    for (let c: number = type; c >= 0; c = t.get(c).downgrade) chain += t.get(c).cost;
    if (p.shotType === ShotType.Slow || p.shotType === ShotType.Mine) continue;
    const fire = p.shotType === ShotType.Fire || p.shotType === ShotType.SlowFire;
    // Fire ignores armor: each shot adds power/10 ticks of burn at 1 damage per tick.
    const dps = (armor: number) =>
      fire
        ? (Math.trunc(p.power / 10) * 30) / p.shotDelay
        : (Math.max(1, p.power - armor) * 30) / p.shotDelay;
    console.log(
      `${p.label.padEnd(25)} ${pad(chain, 6)} ${pad((p.attackRadius / GRID).toFixed(1), 6)} ` +
        `${pad(dps(0).toFixed(1), 9)} ${pad(dps(6).toFixed(1), 5)} ${pad(dps(14).toFixed(1), 5)} | ` +
        `${pad((dps(0) / chain).toFixed(2), 7)} ${pad((dps(14) / chain).toFixed(2), 5)}`,
    );
  }
}

function waveProfile(difficulties: number[]) {
  console.log('\n== Wave schedule: units, income and total hit points ==');
  for (const d of difficulties) {
    const rows: string[] = [];
    const data = generateWaves(12345, d, 1, false);
    let wave = 1;
    let cash = 0;
    let hp = 0;
    let units = 0;
    let total = 0;
    let flyerWaves = 0;
    let flyerNow = false;
    for (const v of data) {
      if (v === 0) {
        total += cash;
        if (flyerNow) flyerWaves++;
        if (wave === 1 || wave === 10 || wave % 25 === 0) {
          rows.push(`w${wave}: ${units}u $${cash} ${hp}hp (total $${total})`);
        }
        wave++;
        cash = hp = units = 0;
        flyerNow = false;
        continue;
      }
      const props = ENEMIES[(v >> 10) & 31];
      const count = (v >> 3) & 127;
      units += count;
      cash += count * props.value;
      hp += count * Math.trunc((props.health * (d * 8 + 9 + wave)) / 10);
      flyerNow = flyerNow || props.isFlyer;
    }
    console.log(`d${d}: ${rows.join(' | ')} | ${flyerWaves} flyer waves`);
  }
}

function main() {
  const games = Number(process.argv[2] ?? 3);
  const difficulties = (process.argv[3] ?? '0,3,6,10').split(',').map(Number);
  const maps = (process.argv[4] ?? '0,1,2,3,5,6').split(',').map(Number) as MapType[];
  const rewardLevel = Number(process.argv[5] ?? 0);
  towerTable(rewardLevel);
  waveProfile(difficulties);
  console.log(
    `\n== Bot games: W<wins of ${games}> w<median wave reached>, rewards lvl ${rewardLevel} ==`,
  );
  for (const d of difficulties) {
    for (const map of maps) {
      for (const maze of [false, true]) {
        const cells = STRATEGIES.map((strategy) => {
          const results = Array.from({ length: games }, () =>
            play(strategy, map, d, maze, rewardLevel),
          );
          const wins = results.filter((r) => r.won).length;
          const points = median(results.map((r) => r.points));
          const leaks = new Map<string, number>();
          for (const r of results) {
            for (const [k, v] of r.leaks) leaks.set(k, (leaks.get(k) ?? 0) + v);
          }
          const worst = [...leaks].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
          return (
            `${strategy.name}:${wins > 0 ? `W${wins}` : ''}w${median(results.map((r) => r.wave))}` +
            ` ${Math.round(points / 1000)}k ${worst}`
          );
        });
        console.log(
          `d${pad(d, 2)} ${MAP_NAMES[map].padEnd(14)} ${maze ? 'maze' : 'hug '} ${cells.join('  ')}`,
        );
      }
    }
  }
}

main();
