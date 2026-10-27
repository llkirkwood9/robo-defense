/**
 * Platform-native icons: SF Symbols on iOS, Material Symbols on Android and web (the web build
 * renders the same Material Symbols font as Android).
 */
import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { colors } from './theme';

/** Semantic icon names mapped to each platform's symbol set. */
const ICONS = {
  play: { ios: 'play.fill', android: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause' },
  fastForward: { ios: 'forward.fill', android: 'fast_forward' },
  close: { ios: 'xmark', android: 'close' },
  heart: { ios: 'heart.fill', android: 'favorite' },
  trophy: { ios: 'trophy.fill', android: 'trophy' },
  star: { ios: 'star.fill', android: 'star' },
  settings: { ios: 'gearshape.fill', android: 'settings' },
  info: { ios: 'info.circle.fill', android: 'info' },
  shuffle: { ios: 'shuffle', android: 'shuffle' },
  save: { ios: 'square.and.arrow.down.fill', android: 'save' },
  exit: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  money: { ios: 'dollarsign.circle.fill', android: 'paid' },
  shield: { ios: 'shield.lefthalf.filled', android: 'shield' },
  bolt: { ios: 'bolt.fill', android: 'bolt' },
  lock: { ios: 'lock.fill', android: 'lock' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  up: { ios: 'chevron.up', android: 'keyboard_arrow_up' },
  down: { ios: 'chevron.down', android: 'keyboard_arrow_down' },
  plus: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  sell: { ios: 'tag.fill', android: 'sell' },
  upgrade: { ios: 'arrow.up.circle.fill', android: 'upgrade' },
  newGame: { ios: 'gamecontroller.fill', android: 'sports_esports' },
  resume: { ios: 'arrow.clockwise.circle.fill', android: 'history' },
  rewards: { ios: 'rosette', android: 'military_tech' },
  credits: { ios: 'person.2.fill', android: 'group' },
  restart: { ios: 'arrow.counterclockwise', android: 'refresh' },
  flag: { ios: 'flag.checkered', android: 'flag' },
  enemies: { ios: 'cpu.fill', android: 'smart_toy' },
  plane: { ios: 'airplane', android: 'flight' },
  speed: { ios: 'hare.fill', android: 'speed' },
  dev: { ios: 'hammer.fill', android: 'build' },
  range: { ios: 'scope', android: 'gps_fixed' },
  timer: { ios: 'timer', android: 'timer' },
} as const satisfies Record<string, SymbolViewProps['name']>;

export type IconName = keyof typeof ICONS;

/** Each icon's platform names, with web reusing the Android (Material Symbols) name. */
const SYMBOLS = Object.fromEntries(
  Object.entries(ICONS).map(([key, names]) => [key, { ...names, web: names.android }]),
) as Record<IconName, SymbolViewProps['name']>;

export function Icon({
  name,
  size = 20,
  color = colors.text,
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SymbolView
      name={SYMBOLS[name]}
      size={size}
      tintColor={color}
      weight="semibold"
      style={[{ width: size, height: size }, style]}
    />
  );
}
