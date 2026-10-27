/**
 * Fast Skia colour construction. Skia colours are `Float32Array`s of [r, g, b, a] in 0..1, so
 * building them directly avoids string parsing in the per-frame render path.
 */
import type { SkColor } from '@shopify/react-native-skia';

/** Colour from 0-255 channels and a 0-1 alpha. */
export function rgba(r: number, g: number, b: number, a = 1): SkColor {
  return Float32Array.of(r / 255, g / 255, b / 255, a);
}

/** Colour from a (possibly signed) 32-bit ARGB integer, as used by the original Android code. */
export function argb(value: number, alphaOverride?: number): SkColor {
  const v = value >>> 0;
  const a = alphaOverride ?? ((v >>> 24) & 255) / 255;
  return Float32Array.of(((v >>> 16) & 255) / 255, ((v >>> 8) & 255) / 255, (v & 255) / 255, a);
}

/** Grey level 0-1 at full opacity. */
export function grey(v: number): SkColor {
  return Float32Array.of(v, v, v, 1);
}
