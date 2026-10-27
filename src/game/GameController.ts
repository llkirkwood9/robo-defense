/**
 * Runs a game session on screen.
 *
 * Owns the simulation, a fixed-timestep loop (30 ticks per second, like the original), the camera
 * and all player interactions. Rendering produces a Skia picture each frame that is handed to the
 * canvas through a Reanimated shared value, so React never re-renders for world updates. HUD and
 * overlay state is published through small stores the React components subscribe to.
 */
import type { SkPicture } from '@shopify/react-native-skia';
import { createPicture, Skia } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

import type { Achievement } from '@/engine/achievements';
import { FAST_FORWARD_EXTRA_TICKS, GRID, RunState, TICKS_PER_SECOND } from '@/engine/constants';
import type { Tower } from '@/engine/entities';
import type {
  GameEvent,
  GameOutcome,
  SavedGame,
  ScoreSummary,
  SessionConfig,
} from '@/engine/gameState';
import { GameState } from '@/engine/gameState';
import { MAP_NAMES } from '@/engine/maps';
import { TowerTable, TowerType } from '@/engine/towers';
import { createStore } from '@/lib/store';
import { Camera } from '@/render/camera';
import type { ViewPadding } from '@/render/camera';
import type { GameImages } from '@/render/images';
import type { PlacementGhost } from '@/render/renderer';
import { WorldRenderer } from '@/render/renderer';
import { soundBoard } from '@/services/audio';
import { haptics } from '@/services/haptics';
import {
  achievements,
  profileStore,
  readZoom,
  recordGameOver,
  rewards,
  writeQuickSave,
  writeZoom,
} from '@/services/profile';

const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Never simulate more than this many ticks to catch up after a stall. */
const MAX_CATCH_UP_TICKS = 4;

/** Values shown by the HUD. Updated after every simulation tick. */
export interface HudState {
  money: number;
  health: number;
  level: number;
  difficulty: number;
  score: number;
  bonus: number;
  runState: RunState;
  /** Tower whose upgrade panel is open. */
  selected: Tower | null;
  /** Bumped whenever towers change, so the upgrade panel refreshes its options. */
  towerVersion: number;
}

export interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

/** One-shot UI notifications. */
export interface FeedState {
  messages: Toast[];
  achievements: { id: number; index: Achievement }[];
  /** Pending score popups ("+N"), consumed by the HUD. */
  scoreAdds: { id: number; amount: number }[];
  levelBanner: { id: number; level: number } | null;
  gameOver: { summary: ScoreSummary | null; outcome: GameOutcome } | null;
}

let nextId = 1;

export class GameController {
  readonly state: GameState;
  readonly camera: Camera;
  readonly mapName: string;
  /** Created before the simulation, which emits events while it initialises. */
  readonly hud = createStore<HudState>({
    money: 0,
    health: 0,
    level: 1,
    difficulty: 0,
    score: 0,
    bonus: 0,
    runState: RunState.NotStarted,
    selected: null,
    towerVersion: 0,
  });
  readonly feed = createStore<FeedState>({
    messages: [],
    achievements: [],
    scoreAdds: [],
    levelBanner: null,
    gameOver: null,
  });

  private readonly renderer = new WorldRenderer();
  private images: GameImages | null = null;
  private picture: SharedValue<SkPicture> | null = null;
  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private frame = 0;
  private dirty = true;
  private ghost: PlacementGhost | null = null;
  private sized = false;

  constructor(readonly config: SessionConfig) {
    const towerTable = new TowerTable(rewards, config.towerMixSeed);
    this.state = new GameState(config, {
      towerTable,
      rewards,
      achievements,
      get options() {
        const o = profileStore.get().options;
        return {
          ffStopsBetweenLevels: o.ffStopsBetweenLevels,
          ffPausesOnLifeLoss: o.ffPausesOnLifeLoss,
        };
      },
      emit: (event) => this.onGameEvent(event),
    });
    const { layout } = this.state;
    this.mapName = MAP_NAMES[layout.type];
    this.camera = new Camera(layout.width * GRID, layout.height * GRID);
    this.syncHud();
  }

  /** Restores a quick save; the game resumes paused. */
  load(save: SavedGame): void {
    this.state.load(save);
    this.toast('Quick load success');
    this.syncHud();
  }

  // ---- Lifecycle ------------------------------------------------------------------------------

  attach(picture: SharedValue<SkPicture>, images: GameImages): void {
    this.picture = picture;
    this.images = images;
    soundBoard.load();
    this.dirty = true;
    if (this.rafId === null) {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.onFrame);
    }
  }

  detach(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.picture = null;
  }

  /** Called whenever the canvas is laid out. */
  resize(width: number, height: number, padding: ViewPadding): void {
    this.camera.resize(width, height, padding);
    if (!this.sized) {
      this.sized = true;
      const entrance = this.state.layout.paths[0];
      this.camera.frame(entrance.startX * GRID, entrance.startY * GRID, readZoom());
    }
    this.dirty = true;
  }

  // ---- Loop -----------------------------------------------------------------------------------

  private onFrame = (now: number) => {
    this.accumulator += Math.min(now - this.lastTime, 250);
    this.lastTime = now;
    let ticks = 0;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.step();
      if (++ticks >= MAX_CATCH_UP_TICKS) {
        this.accumulator = 0;
        break;
      }
    }
    if (ticks > 0 || this.dirty) {
      this.draw();
    }
    this.rafId = requestAnimationFrame(this.onFrame);
  };

  private step(): void {
    const s = this.state;
    s.update();
    if (s.runState === RunState.FastForward) {
      for (let i = 0; i < FAST_FORWARD_EXTRA_TICKS && s.runState === RunState.FastForward; i++) {
        s.update();
      }
      this.frame += 2;
    }
    if (s.isRunning) {
      this.frame++;
    }
    soundBoard.flush(profileStore.get().options.sound);
    if (this.ghost) {
      this.refreshGhost();
    }
    this.syncHud();
  }

  private draw(): void {
    if (!this.picture || !this.images || !this.sized) {
      return;
    }
    this.dirty = false;
    const { camera } = this;
    const input = {
      state: this.state,
      camera,
      images: this.images,
      frame: this.frame,
      ghost: this.ghost,
      selected: this.hud.get().selected,
      showRange: profileStore.get().options.showRange,
    };
    this.picture.value = createPicture(
      (canvas) => this.renderer.render(canvas, input),
      Skia.XYWHRect(0, 0, camera.screenWidth, camera.screenHeight),
    );
  }

  private hudValues() {
    const s = this.state;
    return {
      money: s.money,
      health: s.health,
      level: s.levelNum,
      difficulty: s.difficulty,
      score: s.score,
      bonus: s.enemyKillBonus,
      runState: s.runState,
    };
  }

  private syncHud(): void {
    this.hud.set(this.hudValues());
  }

  // ---- Engine events --------------------------------------------------------------------------

  private onGameEvent(event: GameEvent): void {
    switch (event.type) {
      case 'shot':
        soundBoard.queueShot(event.shot);
        break;
      case 'lifeLost':
        haptics.warning();
        break;
      case 'towerPlaced':
        haptics.impact();
        break;
      case 'towersChanged':
        this.hud.set((h) => ({ towerVersion: h.towerVersion + 1 }));
        this.dirty = true;
        break;
      case 'scoreAdded':
        this.feed.set((f) => ({
          scoreAdds: [...f.scoreAdds.slice(-4), { id: nextId++, amount: event.amount }],
        }));
        break;
      case 'achievement':
        haptics.success();
        this.feed.set((f) => ({
          achievements: [...f.achievements, { id: nextId++, index: event.index }],
        }));
        break;
      case 'levelStarted':
        this.feed.set({ levelBanner: { id: nextId++, level: event.level } });
        break;
      case 'message':
        this.toast(event.text, event.error);
        break;
      case 'autosave':
        this.saveNow();
        break;
      case 'gameOver': {
        const won = event.outcome === 'won';
        recordGameOver(event.summary, won, this.config);
        if (won) {
          haptics.success();
        } else if (event.outcome === 'lost') {
          haptics.error();
        }
        this.closeUpgradePanel();
        this.feed.set({ gameOver: { summary: event.summary, outcome: event.outcome } });
        break;
      }
    }
  }

  toast(text: string, error = false): void {
    this.feed.set((f) => ({ messages: [...f.messages, { id: nextId++, text, error }] }));
  }

  dismissToast(id: number): void {
    this.feed.set((f) => ({ messages: f.messages.filter((m) => m.id !== id) }));
  }

  dismissAchievement(id: number): void {
    this.feed.set((f) => ({ achievements: f.achievements.filter((a) => a.id !== id) }));
  }

  consumeScoreAdd(id: number): void {
    this.feed.set((f) => ({ scoreAdds: f.scoreAdds.filter((a) => a.id !== id) }));
  }

  // ---- Commands -----------------------------------------------------------------------------

  /** Starts a new game (also used for "play again"). */
  startGame(): void {
    this.feed.set({ gameOver: null });
    this.state.start();
    this.syncHud();
    this.dirty = true;
  }

  togglePause(): void {
    this.state.togglePause();
    haptics.selection();
    this.syncHud();
  }

  setPaused(paused: boolean): void {
    this.state.setPaused(paused);
    this.syncHud();
  }

  toggleFastForward(): void {
    this.state.toggleFastForward();
    haptics.selection();
    this.syncHud();
  }

  /** Writes a quick save if a game is in progress. Returns whether a save was written. */
  saveNow(): boolean {
    // Persist achievement progress too (counters are otherwise only written at checkpoints).
    achievements.flush();
    const save = this.state.save();
    if (save) {
      writeQuickSave(save);
    }
    return save !== null;
  }

  /** Abandons the game, banking its score as the original "New Game" menu option did. */
  abandon(): void {
    this.state.abandon();
    this.syncHud();
  }

  // ---- Camera gestures ------------------------------------------------------------------------

  panBy(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
    this.dirty = true;
  }

  zoomBy(factor: number, focusX: number, focusY: number): void {
    this.camera.zoom(factor, focusX, focusY);
    this.dirty = true;
  }

  /** Persists the zoom level when a pinch ends. */
  commitZoom(): void {
    writeZoom(this.camera.scale);
  }

  /** Tap on the map: opens the upgrade panel for a tower, or closes it. */
  tapAt(sx: number, sy: number): void {
    if (!this.state.isRunning) {
      return;
    }
    const { layout } = this.state;
    const cell = this.camera.cellAt(sx, sy, layout.width, layout.height);
    const tower = cell ? this.state.towerAt(cell.x, cell.y) : undefined;
    if (tower) {
      haptics.selection();
      this.hud.set({ selected: tower });
    } else {
      this.hud.set({ selected: null });
    }
    this.dirty = true;
  }

  closeUpgradePanel(): void {
    this.hud.set({ selected: null });
    this.dirty = true;
  }

  /** Buys an upgrade (or sells, for `TowerType.Sell`) for the selected tower. */
  upgradeSelected(type: TowerType): void {
    const tower = this.hud.get().selected;
    if (!tower) {
      return;
    }
    this.state.upgradeTower(tower, type);
    if (type === TowerType.Sell) {
      haptics.selection();
    } else {
      haptics.impact();
    }
    this.closeUpgradePanel();
    this.syncHud();
  }

  // ---- Tower placement ----------------------------------------------------------------------

  /**
   * Updates the placement preview while a tower is dragged from the dock. The preview sits one
   * cell above the finger so it isn't hidden under it.
   */
  dragTower(type: TowerType, sx: number, sy: number): void {
    if (!this.state.isRunning) {
      this.cancelDrag();
      return;
    }
    const { layout } = this.state;
    const fingerOffset = Math.max(48, GRID * this.camera.scale * 1.1);
    const wx = this.camera.toWorldX(sx);
    const wy = this.camera.toWorldY(sy - fingerOffset);
    const x = Math.min(layout.width - 1, Math.max(0, Math.floor(wx / GRID)));
    const y = Math.min(layout.height - 1, Math.max(0, Math.floor(wy / GRID)));
    if (!this.ghost) {
      haptics.selection();
      this.hud.set({ selected: null });
    }
    if (!this.ghost || this.ghost.x !== x || this.ghost.y !== y || this.ghost.type !== type) {
      this.ghost = { type, x, y, valid: false };
      this.refreshGhost();
      this.dirty = true;
    }
  }

  private refreshGhost(): void {
    const g = this.ghost!;
    const valid =
      this.state.towerTable.get(g.type).cost <= this.state.money &&
      this.state.canPlaceTower(g.x, g.y, g.type, false);
    if (valid !== g.valid) {
      g.valid = valid;
      this.dirty = true;
    }
  }

  dropTower(): void {
    const g = this.ghost;
    if (!g) {
      return;
    }
    if (!this.state.tryPlaceTower(g.type, g.x, g.y)) {
      haptics.error();
    }
    this.cancelDrag();
    this.syncHud();
  }

  cancelDrag(): void {
    if (this.ghost) {
      this.ghost = null;
      this.dirty = true;
    }
  }
}
