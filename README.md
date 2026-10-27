# Robo Defense (Expo)

A React Native port of the Android tower defense game **Robo Defense**, built with Expo SDK 58.
It reuses the original artwork and sound effects and reimplements the original game rules from
the decompiled source in `../original`, with a modern, Liquid Glass-styled interface.

- Full port: all 7 maps (including procedurally generated VR Training maps), 23 tower types,
  11 enemy types, 100 waves, upgrades, reward shop, 88 achievements, survival mode, Tower Mix mode
  and quick save / resume.
- Runs in **Expo Go**. No custom native code.
- Landscape only, iOS and Android.

## Running

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. Liquid Glass needs iOS 26 or later; older iOS versions get a blur
material and Android gets translucent panels.

| Script                 | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm start`            | Start the dev server                               |
| `npm run typecheck`    | TypeScript (`tsc --noEmit`)                        |
| `npm run lint`         | ESLint (Expo config + `eslint-config-prettier`)    |
| `npm run format`       | Format everything with Prettier                    |
| `npm run format:check` | Check formatting (for CI)                          |
| `npm run web`          | Web build, used only as a development/test harness |

## Project layout

```
src/
  app/            Expo Router screens (title, new game, codes, game, rewards, achievements, options, credits)
  engine/         The game simulation: pure TypeScript, no React Native imports
    data/         Static tables: sprite sheet layout, projectiles, generated achievement list
    gameState.ts  A game session: ticks, scoring, placement rules, save/load
    entities.ts   Enemy, Tower and Bullet behaviour
    movementGrid.ts  Path finding and "don't block the path" checks
    maps.ts       Map layouts and the VR Training map generator
    waves.ts      Seeded wave generation
    towers.ts / enemies.ts / rewards.ts / achievements.ts
    random.ts     Bit-exact java.util.Random port (see below)
  render/         Skia renderer for the game world, camera, image loading, starfield
  game/           Game screen pieces: controller (loop + input), canvas, HUD, build dock,
                  upgrade panel and overlays
  services/       Persistence (SQLite key-value store), player profile, audio, haptics
  ui/             Design system: glass surfaces, buttons, icons, text, backdrop
assets/           The original game's images and sounds
index.ts          Native entry point
index.web.ts      Web entry point (loads Skia's CanvasKit before the app)
```

## How it works

**Simulation.** The engine is a faithful port of the original Java: integer maths, the same
30 ticks per second, the same wave generator, path finding, targeting and damage rules. It has no
React Native dependencies and reports side effects (sounds, haptics, UI messages, saves) through
an `emit` callback, so it can be run headlessly.

**Deterministic randomness.** `JavaRandom` reproduces `java.util.Random` exactly. Waves, VR
Training maps and Tower Mix rebalances are all derived from seeds, so a VR Training code produces
the same map it did in the Android game, and a quick save only needs to store the seed to
regenerate the remaining waves.

**Rendering.** `GameController` runs a fixed-timestep loop on the JS thread and, after each tick,
records the world into a Skia picture (`WorldRenderer`, a port of the original `Display`). The
picture is handed to the canvas through a Reanimated shared value, so React never re-renders for
world updates. HUD and menus are regular React Native views that subscribe to small stores
(`src/lib/store.ts`) and only re-render when the value they read changes.

**Liquid Glass.** `GlassSurface` uses `expo-glass-effect` (native `UIGlassEffect`) on iOS 26+,
falls back to a system blur on older iOS and to translucent panels on Android or when Reduce
Transparency is on. Menu screens use the native stack header (a Liquid Glass bar on iOS 26), and
settings use native `Switch`, `Slider` and segmented controls, which adopt the system look.
Icons are SF Symbols on iOS and Material Symbols on Android via `expo-symbols`.

## Differences from the original

- **Touch and UI.** Pinch to zoom replaces the zoom slider. The HUD, build dock, upgrade panel,
  pause menu and end-of-game summary were redesigned. Added haptics, a wave banner and toasts.
- **Options.** Android-era performance settings (HQ graphics, 16-bit backgrounds, bitmap
  filtering, frame-rate, battery gauge, performance overlay) were dropped. Sound, keep-awake,
  range display, fast-forward behaviour and classic Basic Level art remain; haptics were added.
- **Sound.** The Ogg Vorbis effects were converted to WAV because iOS can't decode Ogg.
- **Cannonball reward.** The original computed a larger splash radius for this reward but never
  used it; the port applies it so the reward does what its description says.
- **Abandoning a game** banks its score, as the original's "New Game" menu option did, and is now
  labelled as such.
- **English only.** The original also shipped German, French and Japanese strings.
- Progress from the Android app can't be imported.

## Web

`npm run web` works for development and was used to play-test this port, but it isn't a supported
target: Skia runs on CanvasKit (downloaded from a CDN), storage falls back to `localStorage`, and
SF Symbols / Material Symbols icons don't render.

## Credits

Sound effects from [Freesound](https://freesound.org): fire crackling (dobroide), military
exercise (juskiddink), heavy burst (alienbomb), rocket (nthompson), swoophoversplit3 (ignotus).
Artwork, sounds and game design belong to the original Robo Defense authors.
