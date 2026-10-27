/**
 * Layout shell for menu sub-screens: animated backdrop plus a scroll view that insets itself
 * below the native (Liquid Glass on iOS 26) header and around the device's safe areas.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LevelImageId } from '@/engine/data/sprites';

import { Backdrop } from './Backdrop';
import { colors, spacing } from './theme';

export function Screen({
  children,
  backdrop = 'mixer_level',
  contentStyle,
  scroll = true,
}: {
  children: ReactNode;
  backdrop?: LevelImageId;
  contentStyle?: StyleProp<ViewStyle>;
  /** Disable for screens that manage their own scrolling. */
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingLeft: Math.max(insets.left, spacing.xl),
    paddingRight: Math.max(insets.right, spacing.xl),
    paddingBottom: Math.max(insets.bottom, spacing.lg),
  };
  return (
    <View style={styles.root}>
      <Backdrop level={backdrop} dim={0.7} />
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, padding, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, padding, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  fill: {
    flex: 1,
  },
});
