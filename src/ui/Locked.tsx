/**
 * Placeholder for a field-guide entry the player hasn't unlocked yet: the sprite drawn as a dark
 * silhouette with a light outline, plus a "Locked" caption.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { colors, spacing } from './theme';

const OUTLINE = 'rgba(255, 255, 255, 0.55)';
const FILL = 'rgb(16, 22, 34)';
const OUTLINE_WIDTH = 1.5;
/** Eight copies around the silhouette build up the outline. */
const OFFSETS = [-1, 0, 1].flatMap((dx) =>
  [-1, 0, 1].filter((dy) => dx !== 0 || dy !== 0).map((dy) => [dx, dy] as const),
);

/** `render` draws the sprite in the given tint color; it's called once per layer. */
export function SpriteOutline({ render }: { render: (tintColor: string) => ReactNode }) {
  return (
    <View>
      {OFFSETS.map(([dx, dy]) => (
        <View
          key={`${dx},${dy}`}
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ translateX: dx * OUTLINE_WIDTH }, { translateY: dy * OUTLINE_WIDTH }],
            },
          ]}
        >
          {render(OUTLINE)}
        </View>
      ))}
      {render(FILL)}
    </View>
  );
}

export function LockedLabel({ hint }: { hint: string }) {
  return (
    <View style={styles.label}>
      <View style={styles.row}>
        <Icon name="lock" size={16} color={colors.textFaint} />
        <Text variant="heading" color={colors.textFaint}>
          Locked
        </Text>
      </View>
      <Text variant="caption">{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    flex: 1,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
