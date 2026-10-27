/**
 * Draws the game world into a Skia canvas (port of the world-drawing half of `Display`).
 *
 * The HUD, menus and dialogs are React Native views layered above the canvas; this file only
 * paints the map, units, towers, projectiles and effects.
 */
import type { SkCanvas, SkFont, SkImage, SkPaint } from '@shopify/react-native-skia';
import { BlendMode, PaintStyle, Skia } from '@shopify/react-native-skia';

import { GRID, GRID_HALF, SUB_SHIFT } from '@/engine/constants';
import { PROJECTILES } from '@/engine/data/projectiles';
import type { SpriteId } from '@/engine/data/sprites';
import { SPRITES } from '@/engine/data/sprites';
import { EXPLOSION_SPRITES } from '@/engine/effects';
import { ENEMIES, enemyDeathFrames, enemyFrame } from '@/engine/enemies';
import type { Enemy, Tower } from '@/engine/entities';
import type { GameState } from '@/engine/gameState';
import type { TowerType } from '@/engine/towers';

import type { Camera } from './camera';
import { argb, rgba } from './colors';
import type { GameImages } from './images';
import type { ScreenRect } from './starfield';
import { Starfield } from './starfield';

/** A tower being dragged onto the map. */
export interface PlacementGhost {
  type: TowerType;
  x: number;
  y: number;
  valid: boolean;
}

export interface RenderInput {
  state: GameState;
  camera: Camera;
  images: GameImages;
  /** Display frame counter (drives tower animation, like the original's frame index). */
  frame: number;
  ghost: PlacementGhost | null;
  selected: Tower | null;
  showRange: boolean;
}

const BACKDROP = rgba(5, 7, 13);
const VALID_FILL = rgba(80, 220, 255, 0.28);
const VALID_STROKE = rgba(120, 230, 255, 0.9);
const INVALID_FILL = rgba(255, 70, 80, 0.35);
const INVALID_STROKE = rgba(255, 110, 120, 0.95);
const RANGE_FILL = rgba(80, 220, 255, 0.12);
const RANGE_STROKE = rgba(120, 230, 255, 0.55);
const HEALTH_BACK = rgba(0, 0, 0, 0.55);
const HEALTH_FILL = rgba(255, 48, 48);
const MONEY_COLOR = rgba(255, 230, 0);
const SHADOW = rgba(0, 0, 0);

/** Turret direction shown on placement previews (pointing down-screen). */
const PREVIEW_ANGLE = 270;

/** Flame sprite geometry inside an enemy's footprint (from the original draw maths). */
const EFFECT_WIDTH = GRID - 2;

export class WorldRenderer {
  private readonly paint: SkPaint = Skia.Paint();
  private readonly spritePaint: SkPaint = Skia.Paint();
  private readonly slowPaint: SkPaint;
  private readonly firePaint: SkPaint;
  private readonly fireSlowPaint: SkPaint;
  private readonly fadePaint: SkPaint = Skia.Paint();
  private readonly strokePaint: SkPaint = Skia.Paint();
  private font: SkFont | null = null;
  private readonly starfield = new Starfield();
  /** World-space bounds of the screen for the frame being drawn; sprites outside are skipped. */
  private viewLeft = 0;
  private viewTop = 0;
  private viewRight = 0;
  private viewBottom = 0;

  constructor() {
    // Status tints use the same multiply colours as the original.
    this.slowPaint = this.tintPaint(-4128800);
    this.firePaint = this.tintPaint(-128);
    this.fireSlowPaint = this.tintPaint(-4128896);
    this.strokePaint.setStyle(PaintStyle.Stroke);
    this.strokePaint.setStrokeWidth(3);
    this.strokePaint.setAntiAlias(true);
    this.paint.setAntiAlias(true);
  }

  private tintPaint(color: number): SkPaint {
    const p = Skia.Paint();
    p.setColorFilter(Skia.ColorFilter.MakeBlend(argb(color), BlendMode.Modulate));
    return p;
  }

  render(canvas: SkCanvas, input: RenderInput): void {
    const { state, camera, images } = input;
    const { layout, tick } = state;
    const mapW = layout.width * GRID;
    const mapH = layout.height * GRID;
    const sw = camera.screenWidth;
    const sh = camera.screenHeight;
    this.viewLeft = camera.toWorldX(0);
    this.viewTop = camera.toWorldY(0);
    this.viewRight = camera.toWorldX(sw);
    this.viewBottom = camera.toWorldY(sh);

    // Space backdrop with stars around the map edges.
    this.paint.setColor(BACKDROP);
    canvas.drawRect(Skia.XYWHRect(0, 0, sw, sh), this.paint);
    const mapLeft = camera.toScreenX(0);
    const mapTop = camera.toScreenY(0);
    const mapRight = camera.toScreenX(mapW);
    const mapBottom = camera.toScreenY(mapH);
    const margins: ScreenRect[] = [
      { left: 0, top: 0, right: mapLeft, bottom: sh },
      { left: mapRight, top: 0, right: sw, bottom: sh },
      { left: 0, top: 0, right: sw, bottom: mapTop },
      { left: 0, top: mapBottom, right: sw, bottom: sh },
    ];
    this.starfield.draw(canvas, margins, sw, sh, tick);

    canvas.save();
    canvas.translate(camera.offsetX, camera.offsetY);
    canvas.scale(camera.scale, camera.scale);

    // Map background (authored at the simulation's grid size, so drawn 1:1).
    const bg = images.level;
    canvas.drawImageRect(
      bg,
      Skia.XYWHRect(0, 0, bg.width(), bg.height()),
      Skia.XYWHRect(0, 0, bg.width(), bg.height()),
      this.spritePaint,
    );
    canvas.restore();

    // Roadway: stars show through the open sky.
    if (layout.starfield.length > 0) {
      const skies = layout.starfield.map((r) => ({
        left: camera.toScreenX(r.left),
        top: camera.toScreenY(r.top),
        right: camera.toScreenX(r.right),
        bottom: camera.toScreenY(r.bottom),
      }));
      this.starfield.draw(canvas, skies, sw, sh, tick);
    }

    canvas.save();
    canvas.translate(camera.offsetX, camera.offsetY);
    canvas.scale(camera.scale, camera.scale);

    for (const d of layout.underlays) {
      this.drawSprite(canvas, images.sprites, d.sprite, 0, d.x, d.y, this.spritePaint);
    }
    for (const t of state.towers) {
      const sprite = t.props.sprite;
      if (sprite) {
        this.drawSprite(
          canvas,
          images.sprites,
          sprite,
          0,
          t.gridX * GRID,
          t.gridY * GRID,
          this.spritePaint,
        );
      }
    }

    this.drawUnitsAndTurrets(canvas, input);

    for (const d of layout.overlays) {
      this.drawSprite(canvas, images.sprites, d.sprite, 0, d.x, d.y, this.spritePaint);
    }

    this.drawParticles(canvas, state);
    this.drawExplosions(canvas, state, images);
    this.drawBullets(canvas, state, images);
    this.drawKillPopups(canvas, state, images);
    this.drawSelection(canvas, input);

    canvas.restore();
  }

  private drawSprite(
    canvas: SkCanvas,
    sprites: Record<SpriteId, SkImage>,
    id: SpriteId,
    frame: number,
    x: number,
    y: number,
    paint: SkPaint,
  ): void {
    const sheet = SPRITES[id];
    // Skip sprites entirely off screen (common when zoomed in) to keep each frame's recording small.
    if (
      x > this.viewRight ||
      y > this.viewBottom ||
      x + sheet.frameWidth < this.viewLeft ||
      y + sheet.frameHeight < this.viewTop
    ) {
      return;
    }
    canvas.drawImageRect(
      sprites[id],
      Skia.XYWHRect(frame * sheet.frameWidth, 0, sheet.frameWidth, sheet.frameHeight),
      Skia.XYWHRect(x, y, sheet.frameWidth, sheet.frameHeight),
      paint,
    );
  }

  /** Towers' turrets and enemies, sorted so lower objects overlap higher ones. */
  private drawUnitsAndTurrets(canvas: SkCanvas, input: RenderInput): void {
    const { state } = input;
    type Drawable = { y: number; tower?: Tower; enemy?: Enemy };
    const items: Drawable[] = [];
    for (const t of state.towers) {
      items.push({ y: t.gridY * GRID - 15 + t.props.towerHeight, tower: t });
    }
    for (const list of [state.enemies, state.graveyard]) {
      for (const e of list) {
        items.push({ y: e.props.isFlyer ? e.pixelY + 100000 : e.pixelY, enemy: e });
      }
    }
    items.sort((a, b) => a.y - b.y);
    for (const item of items) {
      if (item.tower) {
        this.drawTurret(canvas, input, item.tower);
      } else if (item.enemy) {
        this.drawEnemy(canvas, input, item.enemy);
      }
    }
  }

  private drawTurret(canvas: SkCanvas, input: RenderInput, t: Tower): void {
    const p = t.props;
    if (!p.sprite) {
      return;
    }
    const frame = input.state.towerTable.turretFrame(t.type, t.direction(), input.frame >> 1);
    if (frame >= 0) {
      const x = t.gridX * GRID;
      const y = t.gridY * GRID - p.towerHeight;
      this.drawSprite(canvas, input.images.sprites, p.sprite, frame, x, y, this.spritePaint);
    }
  }

  private drawEnemy(canvas: SkCanvas, input: RenderInput, e: Enemy): void {
    const { images, state } = input;
    const p = ENEMIES[e.type];
    const tick = state.tick;
    const left = e.pixelX + p.drawShiftX;
    const top = e.pixelY + p.drawShiftY;

    if (e.deathTick !== -1) {
      const fade = 1 - (tick - e.deathTick) / enemyDeathFrames(e.type);
      this.fadePaint.setAlphaf(Math.max(0, fade));
      const frame = enemyFrame(e.type, e.orientation, e.firstState + e.deathTick);
      this.drawSprite(canvas, images.sprites, p.sprite, frame, left, top, this.fadePaint);
      return;
    }

    let animFrame = e.firstState + tick;
    const burning = e.burning;
    let paint = burning ? this.firePaint : this.spritePaint;
    if (e.slowCounter > 0) {
      animFrame >>= 1;
      paint = burning ? this.fireSlowPaint : this.slowPaint;
    }
    this.drawSprite(
      canvas,
      images.sprites,
      p.sprite,
      enemyFrame(e.type, e.orientation, animFrame),
      left,
      top,
      paint,
    );

    if (burning) {
      this.drawFlames(canvas, images, e, left, top, tick);
    }

    // Health bar.
    const barWidth = GRID - 6;
    const barX = left + p.energyBarOffset;
    const barY = top + 1;
    this.paint.setColor(HEALTH_BACK);
    canvas.drawRect(Skia.XYWHRect(barX - 1, barY - 1, barWidth + 2, 4), this.paint);
    this.paint.setColor(HEALTH_FILL);
    canvas.drawRect(Skia.XYWHRect(barX, barY, (barWidth * e.health) / e.maxHealth, 2), this.paint);
  }

  private drawFlames(
    canvas: SkCanvas,
    images: GameImages,
    e: Enemy,
    left: number,
    top: number,
    tick: number,
  ): void {
    const fire = SPRITES.fire;
    const rectLeft = left + 1;
    const rectTop = top + 1;
    const width = EFFECT_WIDTH + left - rectLeft;
    const border = width >> 3;
    for (const f of e.flames) {
      if (f.frameOffset < 0) {
        continue;
      }
      const fx = rectLeft + border + (f.x % (width - fire.frameWidth - border * 2));
      const fy = rectTop + border * 2 + (f.y % (width - fire.frameHeight - border));
      const frame = Math.abs(tick + f.frameOffset) % fire.frames;
      this.drawSprite(canvas, images.sprites, 'fire', frame, fx, fy, this.spritePaint);
    }
  }

  private drawParticles(canvas: SkCanvas, state: GameState): void {
    for (const p of state.particles) {
      const age = state.tick - p.firstTick;
      if (age < 0 || age >= p.ticks) {
        continue;
      }
      const alpha = (p.maxAlpha * (p.ticks - age)) / p.ticks / 255;
      this.paint.setColor(argb(p.color, alpha));
      canvas.drawRect(
        Skia.XYWHRect(
          (p.x + p.vx * age) >> SUB_SHIFT,
          (p.y + p.vy * age) >> SUB_SHIFT,
          p.size,
          p.size,
        ),
        this.paint,
      );
    }
  }

  private drawExplosions(canvas: SkCanvas, state: GameState, images: GameImages): void {
    for (const ex of state.explosions) {
      const frame = state.tick - ex.firstTick;
      if (frame >= 0 && frame < ex.frames) {
        this.drawSprite(
          canvas,
          images.sprites,
          EXPLOSION_SPRITES[ex.type],
          frame,
          ex.x,
          ex.y,
          this.spritePaint,
        );
      }
    }
  }

  private drawBullets(canvas: SkCanvas, state: GameState, images: GameImages): void {
    for (const b of state.bullets) {
      const props = PROJECTILES[b.type];
      const size = b.size(state.tick);
      const x = b.x - (size >> 1);
      const y = b.drawY - (size >> 1);
      if (props.sprite) {
        const frame = b.frame(SPRITES[props.sprite].frames);
        this.drawSprite(canvas, images.sprites, props.sprite, frame, x, y, this.spritePaint);
      } else {
        this.paint.setColor(argb(props.color));
        canvas.drawRect(Skia.XYWHRect(x, y, size, size), this.paint);
      }
    }
  }

  private drawKillPopups(canvas: SkCanvas, state: GameState, images: GameImages): void {
    if (!this.font) {
      this.font = Skia.Font(images.font, Math.trunc((GRID * 7) / 20));
    }
    const font = this.font;
    for (const k of state.killPopups) {
      const age = state.tick - k.tick;
      const value = ENEMIES[k.enemyType].value;
      const text = value > 100 ? '>$100' : `$${value}`;
      const x = k.x + 5;
      const y = k.y + GRID_HALF - age;
      this.paint.setColor(SHADOW);
      canvas.drawText(text, x + 1.5, y + 1.5, this.paint, font);
      this.paint.setColor(MONEY_COLOR);
      canvas.drawText(text, x, y, this.paint, font);
    }
  }

  /** Placement preview or the selected tower's highlight and range. */
  private drawSelection(canvas: SkCanvas, input: RenderInput): void {
    const { ghost, selected, state, showRange, images } = input;
    let cellX: number;
    let cellY: number;
    let type: TowerType;
    let valid = true;
    if (ghost) {
      ({ x: cellX, y: cellY, type, valid } = ghost);
    } else if (selected) {
      cellX = selected.gridX;
      cellY = selected.gridY;
      type = selected.type;
    } else {
      return;
    }
    const props = state.towerTable.get(type);
    const x = cellX * GRID;
    const y = cellY * GRID;

    if (valid && showRange) {
      const r = props.attackRadius;
      this.paint.setColor(RANGE_FILL);
      canvas.drawCircle(x + GRID_HALF, y + GRID_HALF, r, this.paint);
      this.strokePaint.setColor(RANGE_STROKE);
      canvas.drawCircle(x + GRID_HALF, y + GRID_HALF, r, this.strokePaint);
    }

    const cell = Skia.RRectXY(Skia.XYWHRect(x + 2, y + 2, GRID - 4, GRID - 4), 10, 10);
    this.paint.setColor(valid ? VALID_FILL : INVALID_FILL);
    canvas.drawRRect(cell, this.paint);
    this.strokePaint.setColor(valid ? VALID_STROKE : INVALID_STROKE);
    canvas.drawRRect(cell, this.strokePaint);

    if (ghost && props.sprite) {
      this.drawSprite(canvas, images.sprites, props.sprite, 0, x, y, this.spritePaint);
      const turret = state.towerTable.turretFrame(type, PREVIEW_ANGLE);
      if (turret >= 0) {
        this.drawSprite(
          canvas,
          images.sprites,
          props.sprite,
          turret,
          x,
          y - props.towerHeight,
          this.spritePaint,
        );
      }
    }
  }
}
