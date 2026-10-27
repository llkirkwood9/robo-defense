/**
 * Web entry point. Skia on web runs on CanvasKit (WebAssembly), which must finish loading before
 * any module that uses Skia is evaluated. Route modules are only evaluated when the router first
 * renders, so the root component is mounted once CanvasKit is ready (the pattern recommended by
 * React Native Skia for Expo Router). Web is a development convenience for this project; iOS and
 * Android are the real targets.
 */
// `@expo/metro-runtime` must be the first import so Fast Refresh works on web.
import '@expo/metro-runtime';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';

const CANVASKIT_VERSION = '0.41.0';

LoadSkiaWeb({
  locateFile: (file: string) =>
    `https://cdn.jsdelivr.net/npm/canvaskit-wasm@${CANVASKIT_VERSION}/bin/full/${file}`,
})
  .then(() => renderRootComponent(App))
  .catch((err) => console.error('Failed to load Skia for web', err));
