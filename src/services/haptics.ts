/**
 * Haptic feedback for key game moments, gated by the player's option.
 */
import * as Haptics from 'expo-haptics';

import { profileStore } from './profile';

const enabled = () => profileStore.get().options.haptics;

export const haptics = {
  /** Light tick: selecting, picking up a tower. */
  selection() {
    if (enabled()) Haptics.selectionAsync().catch(() => {});
  },
  /** Tower placed or upgraded. */
  impact() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  /** A life was lost. */
  warning() {
    if (enabled())
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  /** Achievement earned or game won. */
  success() {
    if (enabled())
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /** Game lost / invalid action. */
  error() {
    if (enabled())
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
