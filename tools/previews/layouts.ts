/**
 * Prints what the game draws on each map as JSON, for tools/sprites/previews.py:
 *
 *     npm run -s map-layouts | python tools/sprites/previews.py
 */
import { SPRITES } from '../../src/engine/data/sprites';
import type { MapType } from '../../src/engine/maps';
import { createMapLayout, MAP_COUNT } from '../../src/engine/maps';

/** A VR Training code with three paths and a few blocks, to stand for all of them in its preview. */
const SAMPLE_VR_CODE = 1232;

const maps = Array.from({ length: MAP_COUNT }, (_, i) => {
  const layout = createMapLayout(i as MapType, SAMPLE_VR_CODE);
  return {
    image: layout.image,
    width: layout.width,
    height: layout.height,
    backdrop: layout.backdrop,
    lights: layout.lights,
    decorations: [...layout.underlays, ...layout.overlays].map((d) => ({
      sprite: d.sprite,
      x: d.x,
      y: d.y,
      w: SPRITES[d.sprite].frameWidth,
      h: SPRITES[d.sprite].frameHeight,
    })),
  };
});

console.log(JSON.stringify(maps));
