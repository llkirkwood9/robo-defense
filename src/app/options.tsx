/**
 * Options (port of `OptionsActivity`). Android-era performance settings were dropped; the native
 * switches pick up Liquid Glass styling automatically on iOS 26.
 */
import { StyleSheet, Switch, View } from 'react-native';

import { useStore } from '@/lib/store';
import type { Options } from '@/services/profile';
import { profileStore, setOption } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

interface OptionRow {
  key: keyof Options;
  title: string;
  detail: string;
}

const SECTIONS: { title: string; rows: OptionRow[] }[] = [
  {
    title: 'Sound & Feel',
    rows: [
      {
        key: 'sound',
        title: 'Sound effects',
        detail: 'Weapon sounds, even when the device is on silent.',
      },
      {
        key: 'haptics',
        title: 'Haptics',
        detail: 'Feedback when building, losing lives and earning achievements.',
      },
      {
        key: 'keepAwake',
        title: 'Keep screen awake',
        detail: 'Prevent the screen from locking while playing.',
      },
    ],
  },
  {
    title: 'Gameplay',
    rows: [
      { key: 'showRange', title: 'Show tower range', detail: 'While placing or upgrading towers.' },
      {
        key: 'ffStopsBetweenLevels',
        title: 'Stop fast-forward between waves',
        detail: 'Return to normal speed when a wave is cleared.',
      },
      {
        key: 'ffPausesOnLifeLoss',
        title: 'Pause fast-forward on life loss',
        detail: 'Pause the game if a robot gets through while fast-forwarding.',
      },
    ],
  },
];

const selectOptions = (s: ReturnType<typeof profileStore.get>) => s.options;

export default function OptionsScreen() {
  const options = useStore(profileStore, selectOptions);
  return (
    <Screen backdrop="skytower_level" contentStyle={styles.content}>
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text variant="caption" style={styles.sectionTitle}>
            {section.title.toUpperCase()}
          </Text>
          <GlassSurface radius={radii.lg} style={styles.group}>
            {section.rows.map((row, i) => (
              <View key={row.key} style={[styles.row, i > 0 && styles.separator]}>
                <View style={styles.flex}>
                  <Text variant="label">{row.title}</Text>
                  <Text variant="caption">{row.detail}</Text>
                </View>
                <Switch
                  value={options[row.key]}
                  onValueChange={(v) => setOption(row.key, v)}
                  trackColor={{ true: colors.accentDeep }}
                  accessibilityLabel={row.title}
                />
              </View>
            ))}
          </GlassSurface>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 640,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    letterSpacing: 2,
    marginLeft: spacing.lg,
  },
  group: {
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  separator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  flex: {
    flex: 1,
  },
});
