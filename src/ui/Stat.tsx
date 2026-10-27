/** A compact icon + value + label stat, as used on the field-guide cards. */
import { StyleSheet, View } from 'react-native';

import type { IconName } from './Icon';
import { Icon } from './Icon';
import { Text } from './Text';

export function Stat({
  icon,
  color,
  value,
  label,
}: {
  icon: IconName;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={14} color={color} />
      <Text variant="stat">{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
