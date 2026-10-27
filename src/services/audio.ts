/**
 * Weapon sound effects (port of the original `SoundManager`).
 *
 * Each effect group plays at most once every few frames so a wall of guns doesn't turn into
 * noise. The original Ogg files were converted to WAV because iOS can't decode Ogg Vorbis.
 */
import type { AudioPlayer } from 'expo-audio';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { SoundEffect, soundForShot } from '@/engine/data/projectiles';
import type { ShotType } from '@/engine/data/projectiles';

const SOURCES: Record<SoundEffect, number> = {
  [SoundEffect.Gun]: require('@/assets/sounds/gun.wav'),
  [SoundEffect.Ice]: require('@/assets/sounds/ice.wav'),
  [SoundEffect.Rocket]: require('@/assets/sounds/rocket.wav'),
  [SoundEffect.Fire]: require('@/assets/sounds/fire.wav'),
  [SoundEffect.Mortar]: require('@/assets/sounds/mortar.wav'),
};

/** Frames an effect group stays silent after playing (original DELAY_FRAMES). */
const COOLDOWN_FRAMES = 8;

class SoundBoard {
  private players: AudioPlayer[] | null = null;
  private readonly cooldown = new Array<number>(Object.keys(SOURCES).length).fill(0);
  private readonly queued = new Array<boolean>(Object.keys(SOURCES).length).fill(false);

  /** Loads the players. Safe to call repeatedly. */
  load(): void {
    if (this.players) {
      return;
    }
    // Mix with other apps (music, podcasts) and keep playing when the device is on silent;
    // sound is controlled by the in-game option instead.
    setAudioModeAsync({ interruptionMode: 'mixWithOthers', playsInSilentMode: true }).catch(
      () => {},
    );
    this.players = Object.values(SOURCES).map((src) => createAudioPlayer(src));
  }

  unload(): void {
    this.players?.forEach((p) => p.remove());
    this.players = null;
  }

  /** Requests the sound for a projectile; actually played on the next `flush`. */
  queueShot(shot: ShotType): void {
    const effect = soundForShot(shot);
    if (this.cooldown[effect] === 0) {
      this.queued[effect] = true;
    }
  }

  /** Plays queued effects and advances cooldowns; call once per rendered frame. */
  flush(enabled: boolean): void {
    for (let i = 0; i < this.cooldown.length; i++) {
      if (this.queued[i]) {
        this.queued[i] = false;
        this.cooldown[i] = COOLDOWN_FRAMES;
        if (enabled && this.players) {
          const player = this.players[i];
          player.seekTo(0).catch(() => {});
          player.play();
        }
      } else if (this.cooldown[i] > 0) {
        this.cooldown[i]--;
      }
    }
  }
}

export const soundBoard = new SoundBoard();
