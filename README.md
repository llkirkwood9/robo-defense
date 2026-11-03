# Robo Defense Reloaded (Expo)

A React Native port of the Android tower defense game **Robo Defense**, built with Expo SDK 58.

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

**Simulation.** The engine started as a port of the original Java: integer maths, 30 ticks per
second, and the same structure for waves, path finding, targeting and damage (see "Balance" below
for what has since changed). It has no React Native dependencies and reports side effects (sounds, haptics, UI messages, saves) through
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

## Balance

`npm run balance` plays full games with scripted bots against the real engine and prints a tower
value table, the wave economy, and how far each strategy gets on each map and difficulty, including
which robot leaks most. For example, three games per setup at difficulties 0 and 5 on the first two
maps, with every levelled upgrade at level 3:

```bash
npm run balance -- 3 0,5 0,1 3
```

These numbers were tuned against it. They intentionally differ from the original:

- **Economy.** Clearing a wave pays `2 + wave / 5` cash, and each path after the first adds $10 of
  starting cash. Kill money alone caused a death spiral, especially on multi-lane maps.
- **Difficulty ramp.** A difficulty's extra hit points phase in by wave 40. Early waves have the
  same total hit points but more, weaker robots, so they pay more.
- **Truck.** Slower (28, was 35) and worth $4 (was $3). It was the top cause of mid-game losses.
- **Guns.** Medium and Heavy Guns fire faster (5 and 4 ticks per shot, was 6), so upgrading beats
  spamming Basic Guns and still helps against armor.
- **Rockets and shells.** Rocket reloads are 55 / 50 / 45 ticks (was 70 / 55 / 50), and Mortar and
  Artillery reload in 75 ticks (was 90).
- **Inferno.** Burn added per shot scales with the tower, so the upgrade adds damage rather than
  only a longer burn.
- **Upgrade points.** Completing wave N is worth `5 * N * N` points, win or lose.

## Added features

- **Rail Cannon.** A new upgrade from the Medium Gun, upgrading to the Mass Driver. Every 2.5 seconds
  it fires a slug that ignores armor and hits every robot along a straight line, ground or air. The
  charge lights up along its rails from breech to muzzle.
- **Arc Crawler.** A new robot from wave 12: a crab whose coil jams towers within 2.5 tiles for 2
  seconds. Jammed towers stay immune for 2 seconds afterwards, so crawlers can't lock them down.
- **Elite robots.** The first robot of every 10th wave has 5× hit points and pays 5× cash.
- **Send the next wave early.** Once a wave has finished spawning, a HUD button (or `N` on the web)
  starts the next one and pays twice the clear bonus on the spot.
- **Upgrade all.** The upgrade panel can upgrade every tower of the same type when money covers
  all of them, which also re-arms all mines and teleporters at once.
- **Livelier maps.** The Ruins, Factory, Sky Tower, Courtyard and Roadway were repainted. Gates are marked
  with green (entrance) and red (exit) lamps, dust blows through the Ruins, clouds drift
  around the Sky Tower over its churning lava, the Courtyard has a fountain (which blocks towers and
  robots), and the Roadway's coloured lamps blink over open sky.
- **Scroll to zoom.** On the web, the mouse wheel or a trackpad pinch zooms around the cursor.
- **Game stats.** The end-of-game card shows robots destroyed, towers built and lives lost.
- **Difficulty warning.** The new-game screen warns when a difficulty is well above your best win.

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
