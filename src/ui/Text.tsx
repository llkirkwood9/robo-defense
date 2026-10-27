/**
 * Typography presets.
 */
import type { TextProps } from 'react-native';
import { StyleSheet, Text as RNText } from 'react-native';

import { colors, fonts } from './theme';

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'stat';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
}

export function Text({ variant = 'body', color, style, ...rest }: AppTextProps) {
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={1.4}
      style={[styles[variant], color !== undefined && { color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  display: {
    fontFamily: fonts.display,
    fontSize: 40,
    letterSpacing: 3,
    color: colors.text,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 1.5,
    color: colors.text,
  },
  heading: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    fontSize: 15,
    color: colors.text,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  caption: {
    fontSize: 12.5,
    color: colors.textDim,
  },
  /** Numbers in the HUD: fixed-width digits so values don't jitter while counting. */
  stat: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});
