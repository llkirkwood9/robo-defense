/**
 * Animated menu background: a slowly drifting map from the game, darkened so glass panels and
 * text stay readable (the modern take on the original's fading background images).
 *
 * The drift only runs while the screen is focused (a menu left underneath the game or another
 * screen stops animating, saving battery) and not at all with Reduce Motion on.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { LevelImageId } from '@/engine/data/sprites';
import { LEVEL_SOURCES } from '@/render/assets';

import { colors } from './theme';

export function Backdrop({ level, dim = 0.55 }: { level: LevelImageId; dim?: number }) {
  const drift = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) {
        return;
      }
      drift.set(
        withRepeat(withTiming(1, { duration: 40000, easing: Easing.inOut(Easing.quad) }), -1, true),
      );
      return () => cancelAnimation(drift);
    }, [drift, reduceMotion]),
  );

  const animated = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.15 + drift.value * 0.1 },
      { translateX: -30 + drift.value * 60 },
      { translateY: -12 + drift.value * 24 },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, animated]}>
        <Image
          source={LEVEL_SOURCES[level]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={6}
          transition={600}
        />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(3,5,10,${dim})` }]} />
      <LinearGradient
        colors={['rgba(5,7,13,0.95)', 'rgba(5,7,13,0.35)', 'rgba(5,7,13,0.0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 0.9, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(5,7,13,0)', colors.background]}
        start={{ x: 0.5, y: 0.6 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
