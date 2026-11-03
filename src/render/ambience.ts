/**
 * Purely visual life for the maps: drifting clouds, gusts of dust and glowing lamps. Everything is
 * worked out from the game tick, so it never touches the simulation and freezes with the game.
 */
import type { SkCanvas, SkColor, SkImage, SkPaint, SkShader } from '@shopify/react-native-skia';
import { FilterMode, MipmapMode, BlendMode, Skia, TileMode } from '@shopify/react-native-skia';

import type { SpriteId } from '@/engine/data/sprites';
import { SPRITE_RES, SPRITES } from '@/engine/data/sprites';
import type { MapLight } from '@/engine/maps';

import type { Camera } from './camera';
import { rgba } from './colors';

/** Repeatable pseudo-random value in [0, 1) for a given number. */
export const jitter = (n: number) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

/** Cloud layers, furthest first: tile size in world pixels, drift in world pixels per tick, and how far they follow a pan. */
const CLOUD_LAYERS = [
  { sprite: 'clouds_far', tile: 1400, driftX: 0.12, driftY: 0.03, parallax: 0.35, alpha: 1 },
  { sprite: 'clouds_near', tile: 1100, driftX: 0.32, driftY: -0.05, parallax: 0.6, alpha: 0.9 },
] as const;

/** Ticks between chances of a gust, and how many of those chances actually blow. */
const DUST_SLOT_TICKS = 50;
const DUST_CHANCE = 0.35;
const DUST_LIFE_TICKS = 170;
const DUST_PUFFS = 7;

const lightLevel = (light: MapLight, tick: number) => {
  const t = (tick + light.phase) / light.period;
  switch (light.mode) {
    case 'steady':
      return 1;
    case 'blink':
      return t - Math.floor(t) < 0.5 ? 1 : 0.08;
    case 'pulse':
      return 0.6 + 0.4 * Math.sin(t * 2 * Math.PI);
  }
};

export class Ambience {
  private readonly tilePaint: SkPaint = Skia.Paint();
  private readonly puffPaint: SkPaint = Skia.Paint();
  private readonly glowPaint: SkPaint = Skia.Paint();
  private readonly corePaint: SkPaint = Skia.Paint();
  private readonly glows = new Map<MapLight, { shader: SkShader; core: SkColor }>();

  constructor() {
    this.glowPaint.setBlendMode(BlendMode.Plus);
    this.corePaint.setAntiAlias(true);
    this.puffPaint.setAntiAlias(true);
  }

  /** Fills the screen with sky: clouds sliding past at two depths. */
  drawClouds(
    canvas: SkCanvas,
    camera: Camera,
    sprites: Record<SpriteId, SkImage>,
    tick: number,
  ): void {
    for (const layer of CLOUD_LAYERS) {
      const image = sprites[layer.sprite];
      const source = SPRITES[layer.sprite].frameWidth * SPRITE_RES;
      const size = layer.tile * camera.scale;
      const shiftX = (camera.offsetX * layer.parallax + tick * layer.driftX * camera.scale) % size;
      const shiftY = (camera.offsetY * layer.parallax + tick * layer.driftY * camera.scale) % size;
      this.tilePaint.setAlphaf(layer.alpha);
      for (let x = shiftX - size; x < camera.screenWidth; x += size) {
        for (let y = shiftY - size; y < camera.screenHeight; y += size) {
          // A hair of overlap hides the joins between tiles.
          canvas.drawImageRectOptions(
            image,
            Skia.XYWHRect(0, 0, source, source),
            Skia.XYWHRect(x, y, size + 1, size + 1),
            FilterMode.Linear,
            MipmapMode.None,
            this.tilePaint,
          );
        }
      }
    }
  }

  /** Now and then a gust lifts a little cloud of dust that drifts off and settles. */
  drawDust(
    canvas: SkCanvas,
    sprites: Record<SpriteId, SkImage>,
    tick: number,
    mapWidth: number,
    mapHeight: number,
  ): void {
    const image = sprites.dust_puff;
    const source = SPRITES.dust_puff.frameWidth * SPRITE_RES;
    const src = Skia.XYWHRect(0, 0, source, source);
    const last = Math.floor(tick / DUST_SLOT_TICKS);
    const first = Math.ceil((tick - DUST_LIFE_TICKS) / DUST_SLOT_TICKS);
    for (let slot = Math.max(0, first); slot <= last; slot++) {
      if (jitter(slot + 0.25) > DUST_CHANCE) {
        continue;
      }
      const age = (tick - slot * DUST_SLOT_TICKS) / DUST_LIFE_TICKS;
      const x0 = jitter(slot + 0.5) * mapWidth;
      const y0 = 60 + jitter(slot + 0.75) * (mapHeight - 120);
      const wind = jitter(slot + 0.1) < 0.5 ? -1 : 1;
      for (let i = 0; i < DUST_PUFFS; i++) {
        // Puffs rise one after another, so each has its own shorter life within the gust's.
        const start = (i / DUST_PUFFS) * 0.45;
        const t = (age - start) / (1 - start);
        if (t <= 0 || t >= 1) {
          continue;
        }
        const size = (26 + 44 * t) * (0.7 + 0.6 * jitter(slot + i));
        const x = x0 + wind * (i * 16 + t * 95) + (jitter(slot * 3 + i) - 0.5) * 34;
        const y = y0 + (jitter(slot * 5 + i) - 0.5) * 26 - t * 12;
        this.puffPaint.setAlphaf(0.62 * Math.sin(t * Math.PI));
        canvas.drawImageRectOptions(
          image,
          src,
          Skia.XYWHRect(x - size, y - size * 0.55, size * 2, size * 1.1),
          FilterMode.Linear,
          MipmapMode.None,
          this.puffPaint,
        );
      }
    }
  }

  /** Draws lamps as a soft glow around a bright core, skipping any off screen. */
  drawLights(
    canvas: SkCanvas,
    lights: readonly MapLight[],
    tick: number,
    viewLeft: number,
    viewTop: number,
    viewRight: number,
    viewBottom: number,
  ): void {
    for (const light of lights) {
      const { x, y, radius } = light;
      if (
        x + radius < viewLeft ||
        x - radius > viewRight ||
        y + radius < viewTop ||
        y - radius > viewBottom
      ) {
        continue;
      }
      const { shader, core } = this.glowFor(light);
      const level = lightLevel(light, tick);
      this.glowPaint.setShader(shader);
      this.glowPaint.setAlphaf(level);
      canvas.drawCircle(x, y, radius, this.glowPaint);
      // Small lamps get a visible bulb; a large glow (the lava) is only light.
      if (radius < 40) {
        this.corePaint.setColor(core);
        this.corePaint.setAlphaf(0.25 + 0.75 * level);
        canvas.drawCircle(x, y, radius * 0.28, this.corePaint);
      }
    }
  }

  private glowFor(light: MapLight) {
    let glow = this.glows.get(light);
    if (!glow) {
      const [r, g, b] = light.color;
      glow = {
        shader: Skia.Shader.MakeRadialGradient(
          { x: light.x, y: light.y },
          light.radius,
          [rgba(r, g, b, 0.75), rgba(r, g, b, 0.28), rgba(r, g, b, 0)],
          [0, 0.4, 1],
          TileMode.Clamp,
        ),
        core: rgba(r + (255 - r) * 0.55, g + (255 - g) * 0.55, b + (255 - b) * 0.55),
      };
      this.glows.set(light, glow);
    }
    return glow;
  }
}
