/**
 * Decodes bundled images into Skia images once and caches them for the app's lifetime.
 */
import type { SkImage, SkTypeface } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';

import type { LevelImageId, SpriteId } from '@/engine/data/sprites';

import { LEVEL_SOURCES, SPRITE_SOURCES } from './assets';

export interface GameImages {
  sprites: Record<SpriteId, SkImage>;
  level: SkImage;
  /** Typeface for text drawn inside the world (kill rewards). */
  font: SkTypeface;
}

/** Bundled so in-world text looks identical on every platform (and works on web). */
const WORLD_FONT = require('@expo-google-fonts/orbitron/700Bold/Orbitron_700Bold.ttf');

const cache = new Map<number, Promise<SkImage>>();

async function loadData(source: number) {
  const asset = Asset.fromModule(source);
  await asset.downloadAsync();
  return { asset, data: await Skia.Data.fromURI(asset.localUri ?? asset.uri) };
}

let fontPromise: Promise<SkTypeface> | null = null;

function loadFont(): Promise<SkTypeface> {
  if (!fontPromise) {
    fontPromise = loadData(WORLD_FONT).then(({ data }) => {
      const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
      if (!typeface) {
        throw new Error('Could not load the game font');
      }
      return typeface;
    });
    fontPromise.catch(() => {
      fontPromise = null;
    });
  }
  return fontPromise;
}

async function decode(source: number): Promise<SkImage> {
  const { asset, data } = await loadData(source);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    throw new Error(`Could not decode image ${asset.name}`);
  }
  return image;
}

function loadImage(source: number): Promise<SkImage> {
  let pending = cache.get(source);
  if (!pending) {
    pending = decode(source);
    pending.catch(() => cache.delete(source));
    cache.set(source, pending);
  }
  return pending;
}

let spritesPromise: Promise<Record<SpriteId, SkImage>> | null = null;

/** Loads every sprite sheet (call early, e.g. from the title screen, to warm the cache). */
export function preloadSprites(): Promise<Record<SpriteId, SkImage>> {
  if (!spritesPromise) {
    const ids = Object.keys(SPRITE_SOURCES) as SpriteId[];
    spritesPromise = Promise.all(ids.map((id) => loadImage(SPRITE_SOURCES[id]))).then(
      (images) =>
        Object.fromEntries(ids.map((id, i) => [id, images[i]])) as Record<SpriteId, SkImage>,
    );
    spritesPromise.catch(() => {
      spritesPromise = null;
    });
  }
  return spritesPromise;
}

/** Loads the sprites plus one map background; null until ready. */
export function useGameImages(level: LevelImageId): {
  images: GameImages | null;
  error: Error | null;
} {
  const [images, setImages] = useState<GameImages | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([preloadSprites(), loadImage(LEVEL_SOURCES[level]), loadFont()])
      .then(([sprites, levelImage, font]) => {
        if (!cancelled) setImages({ sprites, level: levelImage, font });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [level]);
  return { images, error };
}
