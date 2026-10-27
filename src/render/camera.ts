/**
 * Map viewport: converts between screen points and world pixels, and keeps the view in bounds.
 *
 * `screen = world * scale + offset`. Pinch-to-zoom replaces the original's zoom slider.
 */
import { GRID } from '@/engine/constants';

/** Screen-space margins the map may scroll under (HUD at the top, build dock bottom-right). */
export interface ViewPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Largest zoom: one grid cell this many points wide. */
const MAX_CELL_POINTS = 84;
/** Default zoom for a new game: comfortable touch targets. */
const DEFAULT_CELL_POINTS = 46;

export class Camera {
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  screenWidth = 1;
  screenHeight = 1;
  padding: ViewPadding = { top: 0, bottom: 0, left: 0, right: 0 };

  constructor(
    private readonly mapWidth: number,
    private readonly mapHeight: number,
  ) {}

  get minScale(): number {
    const fit = Math.min(this.screenWidth / this.mapWidth, this.screenHeight / this.mapHeight);
    return Math.min(fit, this.maxScale);
  }

  get maxScale(): number {
    return MAX_CELL_POINTS / GRID;
  }

  /** Sets the viewport size, keeping the current zoom where possible. */
  resize(width: number, height: number, padding: ViewPadding): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.padding = padding;
    this.scale = this.clampScale(this.scale);
    this.clamp();
  }

  /** Initial view: default (or saved) zoom, centred on a map entrance. */
  frame(focusX: number, focusY: number, savedScale: number | null): void {
    this.scale = this.clampScale(savedScale ?? DEFAULT_CELL_POINTS / GRID);
    this.offsetX = this.screenWidth / 2 - (focusX + GRID / 2) * this.scale;
    this.offsetY = this.screenHeight / 2 - (focusY + GRID / 2) * this.scale;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
    this.clamp();
  }

  /** Zooms by `factor` keeping the world point under (focusX, focusY) fixed. */
  zoom(factor: number, focusX: number, focusY: number): void {
    const next = this.clampScale(this.scale * factor);
    const wx = this.toWorldX(focusX);
    const wy = this.toWorldY(focusY);
    this.scale = next;
    this.offsetX = focusX - wx * next;
    this.offsetY = focusY - wy * next;
    this.clamp();
  }

  toWorldX(sx: number): number {
    return (sx - this.offsetX) / this.scale;
  }

  toWorldY(sy: number): number {
    return (sy - this.offsetY) / this.scale;
  }

  toScreenX(wx: number): number {
    return wx * this.scale + this.offsetX;
  }

  toScreenY(wy: number): number {
    return wy * this.scale + this.offsetY;
  }

  /** Grid cell under a screen point, or null when outside the map. */
  cellAt(sx: number, sy: number, cols: number, rows: number): { x: number; y: number } | null {
    const x = Math.floor(this.toWorldX(sx) / GRID);
    const y = Math.floor(this.toWorldY(sy) / GRID);
    return x >= 0 && x < cols && y >= 0 && y < rows ? { x, y } : null;
  }

  private clampScale(scale: number): number {
    return Math.min(this.maxScale, Math.max(this.minScale, scale));
  }

  /** Keeps the map on screen: centred when smaller than the view, otherwise edge-to-edge. */
  private clamp(): void {
    const { padding: p } = this;
    const w = this.mapWidth * this.scale;
    const h = this.mapHeight * this.scale;
    const clampAxis = (offset: number, size: number, screen: number, lo: number, hi: number) => {
      if (size <= screen) {
        return (screen - size) / 2;
      }
      return Math.min(lo, Math.max(screen - size - hi, offset));
    };
    this.offsetX = clampAxis(this.offsetX, w, this.screenWidth, p.left, p.right);
    this.offsetY = clampAxis(this.offsetY, h, this.screenHeight, p.top, p.bottom);
  }
}
