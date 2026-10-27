/**
 * Twinkling screen-space starfield (port of the original `Starfield`), shown through the open
 * sky areas of The Roadway and around the edges of the map.
 */
import type { SkCanvas, SkPaint } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';

import { JavaRandom } from '@/engine/random';

import { grey } from './colors';

const NUM_STARS = 512;
const SEED = 74531;
const INTENSITY_MIN = 10;

interface Star {
  /** Position as a fraction of the screen, so stars survive resizes. */
  fx: number;
  fy: number;
  brightness: number;
  /** Number of twinkle steps (each step dims by 16). */
  range: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class Starfield {
  private readonly stars: Star[] = [];
  private readonly paint: SkPaint = Skia.Paint();

  constructor() {
    const rand = new JavaRandom(SEED);
    for (let i = 0; i < NUM_STARS; i++) {
      const pos = rand.nextInt();
      const look = rand.nextInt();
      const range = ((look >> 8) & 255) % 4;
      let brightness = ((look & 255) % 245) + INTENSITY_MIN;
      if (brightness - range * 16 < INTENSITY_MIN) {
        brightness = range * 16 + INTENSITY_MIN;
      }
      this.stars.push({
        fx: ((pos >> 16) & 0xffff) / 0xffff,
        fy: (pos & 0xffff) / 0xffff,
        brightness,
        range: range + 1,
      });
    }
  }

  /**
   * Draws stars that fall inside any of `rects` (screen coordinates).
   * @param tick Animation tick, drives the twinkle.
   */
  draw(canvas: SkCanvas, rects: ScreenRect[], width: number, height: number, tick: number) {
    const size = Math.max(1, width / 600);
    for (const s of this.stars) {
      const x = s.fx * width;
      const y = s.fy * height;
      if (!rects.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom)) {
        continue;
      }
      const step = Math.trunc(tick + x + y) % s.range;
      this.paint.setColor(grey((s.brightness - step * 16) / 255));
      canvas.drawRect(Skia.XYWHRect(x, y, size, size), this.paint);
    }
  }
}
