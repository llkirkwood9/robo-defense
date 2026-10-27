/**
 * Design tokens: a dark, high-contrast sci-fi palette that sits well over the game's artwork
 * and Liquid Glass surfaces.
 */
export const colors = {
  background: '#05070D',
  /** Glass fallback for platforms without Liquid Glass. */
  surface: 'rgba(18, 22, 34, 0.82)',
  surfaceStrong: 'rgba(24, 30, 46, 0.94)',
  border: 'rgba(255, 255, 255, 0.14)',
  text: '#F4F7FB',
  textDim: 'rgba(232, 238, 248, 0.64)',
  textFaint: 'rgba(232, 238, 248, 0.38)',
  accent: '#4FD1FF',
  accentDeep: '#1B8FD6',
  gold: '#FFD25A',
  danger: '#FF5D6C',
  success: '#5BE49B',
  scrim: 'rgba(3, 5, 10, 0.62)',
} as const;

export const fonts = {
  /** Orbitron for titles and numbers; system font elsewhere for legibility. */
  display: 'Orbitron_800ExtraBold',
  displayMedium: 'Orbitron_600SemiBold',
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
