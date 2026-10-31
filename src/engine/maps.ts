/**
 * Map layouts (port of the static half of `LevelData` plus `MixerLevelGenerator`).
 *
 * Entrances and exits are encoded as in the original: `(wall << 8) | offset`, where wall 1 = east,
 * 2 = north, 3 = west, 4 = south, and offset is the row (east/west) or column (north/south).
 * Obstacles are encoded as `(x << 24) | (y << 16) | (w << 8) | h`.
 */
import { Dir, GRID } from './constants';
import type { LevelImageId, SpriteId } from './data/sprites';
import { MovementGrid } from './movementGrid';
import { JavaRandom } from './random';

export enum MapType {
  Basic = 0,
  Ruins = 1,
  Factory = 2,
  Courtyard = 3,
  VrTraining = 4,
  Roadway = 5,
  SkyTower = 6,
}

export const MAP_COUNT = 7;

export const MAP_NAMES: Record<MapType, string> = {
  [MapType.Basic]: 'Basic Level',
  [MapType.Ruins]: 'The Ruins',
  [MapType.Factory]: 'The Factory',
  [MapType.Courtyard]: 'The Courtyard',
  [MapType.VrTraining]: 'VR Training',
  [MapType.Roadway]: 'The Roadway',
  [MapType.SkyTower]: 'Sky Tower',
};

/** Background art for each map. */
export const MAP_IMAGES: Record<MapType, LevelImageId> = {
  [MapType.Basic]: 'basic_level',
  [MapType.Ruins]: 'cross_level',
  [MapType.Factory]: 'threeway_level',
  [MapType.Courtyard]: 'courtyard_level',
  [MapType.VrTraining]: 'mixer_level',
  [MapType.Roadway]: 'roadway_level',
  [MapType.SkyTower]: 'skytower_level',
};

export interface PathEnds {
  startX: number;
  startY: number;
  /** Direction units face when they enter. */
  startDir: Dir;
  endX: number;
  endY: number;
}

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A sprite drawn at a fixed world position. */
export interface Decoration {
  sprite: SpriteId;
  x: number;
  y: number;
  /** Game ticks per animation frame; omitted for a still sprite (frame 0). */
  frameTicks?: number;
}

/** World-pixel rectangle. */
export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MapLayout {
  type: MapType;
  width: number;
  height: number;
  paths: PathEnds[];
  obstacles: Obstacle[];
  /** Fixed-path maps: enemies may only walk on the generated path (obstacles mark it). */
  fixedPath: boolean;
  image: LevelImageId;
  /** Drawn below units. */
  underlays: Decoration[];
  /** Drawn above units (e.g. archways units walk under). */
  overlays: Decoration[];
  /** Areas (in world pixels) where the animated starfield shows through. */
  starfield: WorldRect[];
  /** Score multiplier in percent. */
  scoreMultiplier: number;
}

const decodeObstacle = (code: number): Obstacle => ({
  x: (code >> 24) & 255,
  y: (code >> 16) & 255,
  w: (code >> 8) & 255,
  h: code & 255,
});

const encodeObstacle = (o: Obstacle) => (o.x << 24) | (o.y << 16) | (o.w << 8) | o.h;

function decodeEnds(start: number, end: number, width: number, height: number): PathEnds {
  const wallX = (code: number) => {
    switch (code >> 8) {
      case 1:
        return width - 1;
      case 3:
        return 0;
      default:
        return code & 255;
    }
  };
  const wallY = (code: number) => {
    switch (code >> 8) {
      case 2:
        return 0;
      case 4:
        return height - 1;
      default:
        return code & 255;
    }
  };
  const dirByWall: Record<number, Dir> = { 2: Dir.Down, 3: Dir.Right, 4: Dir.Up };
  return {
    startX: wallX(start),
    startY: wallY(start),
    startDir: dirByWall[start >> 8] ?? Dir.Left,
    endX: wallX(end),
    endY: wallY(end),
  };
}

const toRect = (code: number): WorldRect => {
  const left = (code >> 24) * GRID;
  const top = ((code >> 16) & 255) * GRID;
  return {
    left,
    top,
    right: left + ((code >> 8) & 255) * GRID,
    bottom: top + (code & 255) * GRID,
  };
};

interface StaticMap {
  width: number;
  height: number;
  starts: number[];
  ends: number[];
  obstacles?: number[];
  image: LevelImageId;
  scoreMultiplier: number;
  underlays?: Decoration[];
  overlays?: Decoration[];
  starfield?: number[];
}

const STATIC_MAPS: Record<Exclude<MapType, MapType.VrTraining>, StaticMap> = {
  [MapType.Basic]: {
    width: 20,
    height: 12,
    starts: [774],
    ends: [262],
    image: 'basic_level',
    scoreMultiplier: 100,
    // Animated water along the bottom and lower-left edges of the background art.
    underlays: [
      { sprite: 'water_bottom_w', x: 0, y: GRID * 11 + 20, frameTicks: 8 },
      { sprite: 'water_bottom_e', x: 670, y: GRID * 11 + 20, frameTicks: 8 },
      { sprite: 'water_side', x: 0, y: 500, frameTicks: 8 },
    ],
  },
  [MapType.Ruins]: {
    width: 20,
    height: 12,
    starts: [774, 522],
    ends: [262, 1034],
    image: 'cross_level',
    scoreMultiplier: 125,
  },
  [MapType.Factory]: {
    width: 20,
    height: 12,
    starts: [771, 774, 777],
    ends: [259, 262, 265],
    image: 'threeway_level',
    scoreMultiplier: 140,
  },
  [MapType.Courtyard]: {
    width: 20,
    height: 12,
    starts: [774, 516, 1034, 527],
    ends: [262, 1028, 522, 1039],
    obstacles: [67371521, 235143681, 67568129, 235340289],
    image: 'courtyard_level',
    scoreMultiplier: 160,
    overlays: [
      { sprite: 'courtyard_ne_overlay', x: GRID * 15 + 1, y: 0 },
      { sprite: 'courtyard_nw_overlay', x: Math.trunc((GRID * 9) / 2) + 1, y: 0 },
      { sprite: 'courtyard_sw_overlay', x: Math.trunc((GRID * 17) / 4) + 3, y: GRID * 11 + 3 },
      { sprite: 'courtyard_se_overlay', x: GRID * 15 + 2, y: GRID * 11 + 3 },
    ],
  },
  [MapType.Roadway]: {
    width: 9,
    height: 26,
    starts: [516],
    ends: [1028],
    obstacles: [
      0x3010101, 0x6010102, 0x2030101, 0x5030101, 0x3040201, 0x2050101, 0x3060201, 0x6060201,
      0x2070101, 0x5070101, 0x1090101, 0x4090101, 0x6090101, 0x20a0101, 0x50a0101, 0x20b0401,
      0x60c0101, 0x20d0401, 0x20e0101, 0x50e0101, 0x10f0101, 0x30f0101, 0x60f0101, 0x2110101,
      0x5110101, 0x3120101, 0x6120201, 0x2130101, 0x4130201, 0x3140101, 0x2150401, 0x6160103,
      0x1170201, 0x2180101,
    ],
    image: 'roadway_level',
    scoreMultiplier: 100,
    starfield: [
      513, 100664065, 65794, 100729090, 134283521, 134545672, 524553, 34275585, 84607233, 34472193,
      84803841, 135528710, 51708161, 1442052, 102170883, 35127554,
    ],
  },
  [MapType.SkyTower]: {
    width: 20,
    height: 12,
    starts: [771, 264],
    ends: [259, 776],
    obstacles: [
      50397953, 234947329, 67240194, 251789570, 67436802, 151323138, 251986178, 67633410, 252182786,
      50987777, 235537153,
    ],
    image: 'skytower_level',
    scoreMultiplier: 125,
  },
};

/**
 * Builds the layout for a map.
 * @param mixerCode VR Training map code (ignored for other maps).
 */
export function createMapLayout(type: MapType, mixerCode = 0): MapLayout {
  if (type === MapType.VrTraining) {
    return createVrTrainingLayout(mixerCode);
  }
  const def = STATIC_MAPS[type] ?? STATIC_MAPS[MapType.Basic];
  return {
    type,
    width: def.width,
    height: def.height,
    paths: def.starts.map((s, i) => decodeEnds(s, def.ends[i], def.width, def.height)),
    obstacles: (def.obstacles ?? []).map(decodeObstacle),
    fixedPath: false,
    image: def.image,
    underlays: def.underlays ?? [],
    overlays: def.overlays ?? [],
    starfield: (def.starfield ?? []).map(toRect),
    scoreMultiplier: def.scoreMultiplier,
  };
}

// ---------------------------------------------------------------------------------------------
// VR Training ("mixer") maps, procedurally generated from a map code.
// ---------------------------------------------------------------------------------------------

const VR_WIDTH = 20;
const VR_HEIGHT = 12;
const MAX_VR_OBSTACLES = 10;
const PATH_MAX_SEGMENT = 5;

const isEastWestWall = (code: number) => (code & 0xff00) === 768 || (code & 0xff00) === 256;

/** Number of paths encoded in a map code, and whether it's a fixed-path ("E") map. */
export function describeVrCode(code: number): { paths: number; fixedPath: boolean } {
  const paths = (Math.abs(code) % 10) + 1;
  return paths === 5 ? { paths: 1, fixedPath: true } : { paths, fixedPath: false };
}

function createVrTrainingLayout(code: number): MapLayout {
  const { paths: pathCount, fixedPath } = describeVrCode(code);
  const rand = new JavaRandom(Math.trunc(code / 10));
  const width = VR_WIDTH;
  const height = VR_HEIGHT;

  // Entrances: random wall positions, never two on the same row/column axis.
  const starts: number[] = [];
  while (starts.length < pathCount) {
    const wallRand = rand.nextInt(65535);
    const wall = ((wallRand >> 8) & 3) + 1;
    const eastWest = isEastWestWall(wall << 8);
    const offset = ((wallRand & 255) % ((eastWest ? height : width) - 2)) + 1;
    const clash = starts.some((s) => isEastWestWall(s) === eastWest && (s & 255) === offset);
    if (!clash) {
      starts.push((wall << 8) | offset);
    }
  }
  // Exits are directly opposite their entrance.
  const opposite: Record<number, number> = { 1: 3, 2: 4, 3: 1, 4: 2 };
  const ends = starts.map((s) => (opposite[s >> 8] << 8) | (s & 255));

  const layout: MapLayout = {
    type: MapType.VrTraining,
    width,
    height,
    paths: starts.map((s, i) => decodeEnds(s, ends[i], width, height)),
    obstacles: [],
    fixedPath: false,
    image: 'mixer_level',
    underlays: [],
    overlays: [],
    starfield: [],
    scoreMultiplier: 180,
  };

  const obstacles = fixedPath ? createFixedPath(layout, rand) : createObstacles(layout, rand);
  layout.obstacles = obstacles;
  layout.fixedPath = fixedPath;
  layout.underlays = createVrUnderlays(layout);
  return layout;
}

function createObstacles(layout: MapLayout, rand: JavaRandom): Obstacle[] {
  // Grids are built while the layout has no obstacles yet, exactly like the original.
  const grids = layout.paths.map((_, i) => new MovementGrid(layout, i));
  const obstacles: Obstacle[] = [];
  const count = rand.nextInt(MAX_VR_OBSTACLES + 1);
  for (let i = 0; i < count; i++) {
    const w = rand.nextInt(2) + 1;
    const h = rand.nextInt(2) + 1;
    const x = rand.nextInt(layout.width - 2 - w) + 1;
    const y = rand.nextInt(layout.height - 2 - h) + 1;
    const candidate = decodeObstacle(encodeObstacle({ x, y, w, h }));
    if (grids.every((g) => g.checkObstacleLayout(obstacles, candidate))) {
      obstacles.push(candidate);
    }
  }
  return obstacles;
}

/** Carves a single winding path; every path cell becomes a 1x1 "obstacle" marker. */
function createFixedPath(layout: MapLayout, rand: JavaRandom): Obstacle[] {
  const { width: gw, height: gh } = layout;
  const path = layout.paths[0];
  let x = path.startX;
  let y = path.startY;
  let endX = -1;
  let endY = -1;
  let dx = 0;
  let dy = 0;
  const grid = new Int8Array(gw * gh).fill(1);

  if (x === 0) {
    dx = 1;
    endX = path.endX - 1;
  } else if (x === gw - 1) {
    dx = -1;
    endX = path.endX + 1;
  } else if (y === 0) {
    dy = 1;
    endY = path.endY - 1;
  } else {
    dy = -1;
    endY = path.endY + 1;
  }

  while (x !== endX && y !== endY) {
    const length = rand.nextInt(PATH_MAX_SEGMENT) + 2;
    for (let i = 0; i < length; i++) {
      x += dx;
      y += dy;
      grid[gw * y + x] = 0;
      const atEdge =
        (dx === 1 && x === gw - 2) ||
        (dx === -1 && x === 1) ||
        (dy === 1 && y === gh - 2) ||
        (dy === -1 && y === 1);
      if (atEdge) {
        break;
      }
    }
    if (dx !== 0) {
      dx = 0;
      if (endY === -1) {
        dy = y === 1 ? 1 : y === gh - 2 ? -1 : rand.nextInt(2) * 2 - 1;
      } else {
        dy = endY === 1 ? -1 : 1;
      }
    } else {
      dy = 0;
      if (endX === -1) {
        dx = x === 1 ? 1 : x === gw - 2 ? -1 : rand.nextInt(2) * 2 - 1;
      } else {
        dx = endX === 1 ? -1 : 1;
      }
    }
  }

  // Finish with a straight run to the exit.
  if (x === endX) {
    const step = y < path.endY ? 1 : -1;
    while (y !== path.endY) {
      y += step;
      grid[gw * y + x] = 0;
    }
  } else {
    const step = x < path.endX ? 1 : -1;
    while (x !== path.endX) {
      x += step;
      grid[gw * y + x] = 0;
    }
  }

  const cells: Obstacle[] = [];
  for (let cx = 1; cx < gw - 1; cx++) {
    for (let cy = 1; cy < gh - 1; cy++) {
      if (grid[gw * cy + cx] === 0) {
        cells.push({ x: cx, y: cy, w: 1, h: 1 });
      }
    }
  }
  return cells;
}

function createVrUnderlays(layout: MapLayout): Decoration[] {
  const side = (x: number, y: number) =>
    x === 0 ? 'w' : y === 0 ? 'n' : x === layout.width - 1 ? 'e' : 's';
  const decorations: Decoration[] = [];
  for (const p of layout.paths) {
    decorations.push({
      sprite: `mixer_entrance_${side(p.startX, p.startY)}` as SpriteId,
      x: GRID * p.startX,
      y: GRID * p.startY,
    });
    decorations.push({
      sprite: `mixer_exit_${side(p.endX, p.endY)}` as SpriteId,
      x: GRID * p.endX,
      y: GRID * p.endY,
    });
  }
  for (const o of layout.obstacles) {
    let sprite: SpriteId;
    if (layout.fixedPath) {
      sprite = 'mixer_path';
    } else if (o.w === 1 && o.h === 1) {
      sprite = 'mixer_1x1';
    } else if (o.w === 1 && o.h === 2) {
      sprite = 'mixer_1x2';
    } else if (o.w === 2 && o.h === 1) {
      sprite = 'mixer_2x1';
    } else {
      sprite = 'mixer_2x2';
    }
    decorations.push({ sprite, x: GRID * o.x, y: GRID * o.y });
  }
  return decorations;
}
