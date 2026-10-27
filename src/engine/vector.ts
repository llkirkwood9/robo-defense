/**
 * Integer vector helpers ported from the original `Vector` / `VectorLookup` classes.
 *
 * The simulation is entirely integer based; these helpers keep the original's lookup-table
 * normalisation so projectile paths behave the same as on Android.
 */

export interface Vec {
  x: number;
  y: number;
}

const LOOKUP_SIZE = 16;
const BASE_SPEED_SHIFT = 10;
const unitX = new Int32Array(LOOKUP_SIZE * LOOKUP_SIZE);
const unitY = new Int32Array(LOOKUP_SIZE * LOOKUP_SIZE);

for (let y = 0; y < LOOKUP_SIZE; y++) {
  for (let x = 0; x < LOOKUP_SIZE; x++) {
    const length = Math.sqrt(x * x + y * y);
    // (0,0) yields NaN -> 0 in Java's float-to-int cast; Int32Array stores NaN as 0 too.
    unitX[(y << 4) | x] = Math.trunc((x / length) * 1024);
    unitY[(y << 4) | x] = Math.trunc((y / length) * 1024);
  }
}

/** Rescales `v` in place to (approximately) length `speed`, preserving its direction. */
export function scaleVector(v: Vec, speed: number): void {
  let x = v.x;
  let y = v.y;
  const xDir = x < 0 ? -1 : 1;
  const yDir = y < 0 ? -1 : 1;
  x = Math.abs(x);
  y = Math.abs(y);
  while (x >= LOOKUP_SIZE || y >= LOOKUP_SIZE) {
    x >>= 1;
    y >>= 1;
  }
  const idx = (y << 4) | x;
  v.x = ((unitX[idx] * speed) >> BASE_SPEED_SHIFT) * xDir;
  v.y = ((unitY[idx] * speed) >> BASE_SPEED_SHIFT) * yDir;
}

/**
 * Angle in whole degrees [0, 360) used to pick directional sprite frames.
 * 0 points up, increasing clockwise (matches the sprite sheets).
 */
export function arctan(x: number, y: number): number {
  return (Math.trunc((Math.atan2(x, -y) * 180) / Math.PI) + 180) % 360;
}

/** Angle of a direction vector (the original's `Vector.arctan(Vector)`). */
export function vectorAngle(v: Vec): number {
  return arctan(-v.x, -v.y);
}
