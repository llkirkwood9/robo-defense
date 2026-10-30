/**
 * Targeting controls shown in the upgrade panel while a Command Tower is on the map: a row of
 * chips for choosing how towers pick their targets.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { TARGET_MODE_LABELS, TARGET_MODES } from '@/engine/towers';
import type { TargetMode } from '@/engine/towers';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

/** A chip value: a targeting mode, or `default` to follow the Command Tower. */
export type TargetChoice = TargetMode | 'default';

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text variant="caption" color={selected ? colors.text : colors.textDim}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Chips for each targeting mode. With `defaultLabel`, a leading "Default" chip (described by that
 * label, e.g. "Default · First") lets a tower follow the Command Tower again.
 */
export function TargetPicker({
  value,
  onChange,
  defaultLabel,
}: {
  value: TargetChoice;
  onChange: (choice: TargetChoice) => void;
  defaultLabel?: string;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {defaultLabel !== undefined && (
        <Chip
          label={defaultLabel}
          selected={value === 'default'}
          onPress={() => onChange('default')}
        />
      )}
      {TARGET_MODES.map((mode) => (
        <Chip
          key={mode}
          label={TARGET_MODE_LABELS[mode]}
          selected={value === mode}
          onPress={() => onChange(mode)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(36, 150, 220, 0.45)',
  },
  pressed: {
    opacity: 0.7,
  },
});
