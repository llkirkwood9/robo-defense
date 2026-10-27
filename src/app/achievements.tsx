/**
 * Achievement list (port of `AchievementActivity`). Each achievement earned adds one point to
 * the in-game kill bonus.
 */
import { StyleSheet, View } from 'react-native';

import { ACHIEVEMENT_COUNT } from '@/engine/achievements';
import { useStore } from '@/lib/store';
import { achievements, profileStore } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import { Icon } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

const selectCount = (s: ReturnType<typeof profileStore.get>) => s.achievementCount;

export default function AchievementsScreen() {
  const count = useStore(profileStore, selectCount);
  const all = achievements.allInfo();
  // Earned first, then by original order.
  const sorted = [...all].sort((a, b) => Number(b.achieved) - Number(a.achieved));

  return (
    <Screen backdrop="courtyard_level">
      <GlassSurface radius={radii.lg} style={styles.summary}>
        <View style={styles.flex}>
          <Text variant="caption">ACHIEVEMENTS</Text>
          <Text variant="title">
            {count}{' '}
            <Text variant="body" color={colors.textDim}>
              of {ACHIEVEMENT_COUNT}
            </Text>
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(count / ACHIEVEMENT_COUNT) * 100}%` }]} />
        </View>
        <Text variant="caption" style={styles.flex}>
          Each achievement adds +1 to the bonus you score for every enemy destroyed.
        </Text>
      </GlassSurface>

      <View style={styles.grid}>
        {sorted.map((a) => (
          <GlassSurface key={a.index} radius={radii.md} style={styles.card}>
            <Icon
              name={a.achieved ? 'trophy' : 'lock'}
              size={24}
              color={a.achieved ? colors.gold : colors.textFaint}
            />
            <View style={styles.flex}>
              <Text
                variant="label"
                color={a.achieved ? colors.gold : colors.text}
                numberOfLines={1}
              >
                {a.name}
              </Text>
              <Text variant="caption" numberOfLines={2}>
                {a.description}
              </Text>
              {a.progress && !a.achieved && (
                <Text variant="caption" color={colors.accent}>
                  {a.progress}
                </Text>
              )}
            </View>
          </GlassSurface>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    padding: spacing.lg,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.gold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    flexGrow: 1,
    flexBasis: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  flex: {
    flex: 1,
  },
});
