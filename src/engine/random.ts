/**
 * Random number helpers.
 *
 * `JavaRandom` reproduces `java.util.Random` bit-for-bit. Level waves, VR Training maps and tower
 * mixes are all derived from seeds, so matching Java's generator means a map code entered in this
 * port produces the same map as it did in the original Android game, and saved games regenerate
 * identical waves when resumed.
 */

const TWO_24 = 0x1000000;
const MASK_24 = 0xffffff;
// 0x5DEECE66D split into 24-bit halves.
const MULT_HI = 0x5de;
const MULT_LO = 0xece66d;
const ADDEND = 0xb;

export class JavaRandom {
  /** High and low 24 bits of the 48-bit LCG state (kept separate so math stays exact in doubles). */
  private hi = 0;
  private lo = 0;

  constructor(seed: number) {
    this.setSeed(seed);
  }

  /** Seeds from a 32-bit int, sign-extended to a long exactly as Java does for `new Random(int)`. */
  setSeed(seed: number): void {
    const s = seed | 0;
    this.lo = (s & MASK_24) ^ MULT_LO;
    this.hi = ((s >> 24) & MASK_24) ^ MULT_HI;
  }

  /** Advances the generator and returns the top `bits` bits as a signed 32-bit int. */
  private next(bits: number): number {
    const p = this.lo * MULT_LO + ADDEND;
    const carry = Math.floor(p / TWO_24);
    const newLo = p % TWO_24;
    const newHi = (this.hi * MULT_LO + this.lo * MULT_HI + carry) % TWO_24;
    this.hi = newHi;
    this.lo = newLo;
    const state = newHi * TWO_24 + newLo;
    return Math.floor(state / 2 ** (48 - bits)) | 0;
  }

  /** Equivalent of `Random.nextInt()`. */
  nextInt(): number;
  /** Equivalent of `Random.nextInt(bound)`: uniform in `[0, bound)`. */
  nextInt(bound: number): number;
  nextInt(bound?: number): number {
    if (bound === undefined) {
      return this.next(32);
    }
    if (bound <= 0) {
      throw new RangeError('bound must be positive');
    }
    if ((bound & -bound) === bound) {
      // Power of two: Java computes (bound * next(31)) >> 31, i.e. the top log2(bound) bits.
      return this.next(31) >> (31 - Math.log2(bound));
    }
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (((bits - val + (bound - 1)) | 0) < 0);
    return val;
  }
}

/**
 * Port of the original `FastRandom`: a cheap source of signed 32-bit ints used for cosmetic
 * variation (bullet aim jitter, flames, explosion lengths). Results may be negative, and callers
 * rely on Java/JS remainder semantics (`%` keeps the dividend's sign).
 */
export function fastRandomInt(): number {
  return (Math.random() * 0x100000000) | 0;
}

/** Uniform integer in `[0, bound)` from `Math.random`, for non-deterministic choices. */
export function randomBelow(bound: number): number {
  return Math.floor(Math.random() * bound);
}

/** Java-style truncating integer division. */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}
