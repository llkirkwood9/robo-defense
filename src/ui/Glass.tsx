/**
 * Liquid Glass surfaces.
 *
 * On iOS 26+ this renders the native `UIGlassEffect` via `expo-glass-effect`. Older iOS versions
 * get a system blur material, and Android (or Reduce Transparency) gets a translucent panel, so
 * every screen looks intentional everywhere.
 */
import { BlurView } from 'expo-blur';
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { colors, radii } from './theme';

const nativeGlassSupported =
  Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

/**
 * Tracks the iOS Reduce Transparency setting (glass is replaced with solid panels).
 * The setting only exists on iOS.
 */
function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then(setReduce)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Which material surfaces will render with on this device. */
export function useGlassMode(): 'liquid' | 'blur' | 'solid' {
  const reduce = useReduceTransparency();
  if (reduce) return 'solid';
  if (nativeGlassSupported) return 'liquid';
  return Platform.OS === 'ios' ? 'blur' : 'solid';
}

export interface GlassSurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** Native press response (iOS 26). */
  interactive?: boolean;
  /** Tints the glass, e.g. for a primary action. */
  tint?: ColorValue;
  variant?: 'regular' | 'clear';
}

export function GlassSurface({
  children,
  style,
  radius = radii.md,
  interactive = false,
  tint,
  variant = 'regular',
}: GlassSurfaceProps) {
  const mode = useGlassMode();
  const shape = { borderRadius: radius, borderCurve: 'continuous' as const };

  if (mode === 'liquid') {
    return (
      <GlassView
        glassEffectStyle={variant}
        isInteractive={interactive}
        tintColor={tint}
        colorScheme="dark"
        style={[shape, style]}
      >
        {children}
      </GlassView>
    );
  }

  const tintLayer = tint ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.55 }]} />
  ) : null;

  if (mode === 'blur') {
    return (
      <View style={[shape, styles.outline, { overflow: 'hidden' }, style]}>
        <BlurView tint="systemThinMaterialDark" intensity={60} style={StyleSheet.absoluteFill} />
        {tintLayer}
        {children}
      </View>
    );
  }

  return (
    <View style={[shape, styles.outline, styles.solid, { overflow: 'hidden' }, style]}>
      {tintLayer}
      {children}
    </View>
  );
}

/**
 * Groups glass surfaces so they blend into each other when close (iOS 26).
 *
 * Never fade a group (or any of its parents) in from transparent: the native container applies
 * its glass once when mounted, and iOS silently skips it while the view is invisible, leaving the
 * buttons inside without a background until the screen is shown again. Slide or scale it in
 * instead (`GlassSurface` on its own waits until it's visible, so it can fade).
 */
export function GlassGroup({
  children,
  spacing = 8,
  style,
}: {
  children: ReactNode;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (nativeGlassSupported) {
    return (
      <GlassContainer spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return <View style={style}>{children}</View>;
}

const styles = StyleSheet.create({
  outline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  solid: {
    backgroundColor: colors.surface,
  },
});
