/**
 * Buttons built on glass surfaces.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassSurface } from './Glass';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, radii, spacing } from './theme';

type Tone = 'default' | 'primary' | 'danger';

const TINTS: Record<Tone, string | undefined> = {
  default: undefined,
  primary: 'rgba(36, 150, 220, 0.55)',
  danger: 'rgba(220, 50, 70, 0.5)',
};

export interface GlassButtonProps {
  label?: string;
  /** Secondary line under the label. */
  detail?: string;
  icon?: IconName;
  onPress?: () => void;
  disabled?: boolean;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  /** Extra content rendered after the label (e.g. a price). */
  trailing?: ReactNode;
  accessibilityLabel?: string;
}

const SIZES = {
  sm: { height: 38, paddingHorizontal: spacing.md, icon: 16 },
  md: { height: 48, paddingHorizontal: spacing.lg, icon: 20 },
  lg: { height: 56, paddingHorizontal: spacing.xl, icon: 22 },
};

export function GlassButton({
  label,
  detail,
  icon,
  onPress,
  disabled = false,
  tone = 'default',
  size = 'md',
  style,
  trailing,
  accessibilityLabel,
}: GlassButtonProps) {
  const dims = SIZES[size];
  const textColor = disabled ? colors.textFaint : colors.text;
  const iconOnly = !label && !!icon;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [pressed && !disabled && styles.pressed, style]}
    >
      <GlassSurface
        interactive={!disabled}
        tint={disabled ? undefined : TINTS[tone]}
        radius={iconOnly ? dims.height / 2 : radii.pill}
        style={[
          styles.surface,
          {
            minHeight: dims.height,
            paddingHorizontal: iconOnly ? 0 : dims.paddingHorizontal,
            width: iconOnly ? dims.height : undefined,
          },
        ]}
      >
        {icon && <Icon name={icon} size={dims.icon} color={textColor} />}
        {label && (
          <View style={styles.labels}>
            <Text variant="label" color={textColor} numberOfLines={1}>
              {label}
            </Text>
            {detail && (
              <Text variant="caption" numberOfLines={1}>
                {detail}
              </Text>
            )}
          </View>
        )}
        {trailing}
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  labels: {
    flexShrink: 1,
    alignItems: 'center',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});
