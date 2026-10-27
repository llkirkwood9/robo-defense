/** The Records tab of the guide: lifetime career statistics. */
import { StyleSheet, View } from 'react-native';

import type { EnemyType } from '@/engine/enemies';
import { ENEMIES } from '@/engine/enemies';
import { useStore } from '@/lib/store';
import { profileStore } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import type { IconName } from '@/ui/Icon';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

type ProfileState = ReturnType<typeof profileStore.get>;
const selectStats = (s: ProfileState) => s.stats;
const selectBestScore = (s: ProfileState) => s.bestScore;
const selectAchievements = (s: ProfileState) => s.achievementCount;

function RecordCard({
  icon,
  color,
  label,
  value,
}: {
  icon: IconName;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <GlassSurface radius={radii.md} style={styles.record}>
      <Icon name={icon} size={22} color={color} />
      <View style={styles.flex}>
        <Text variant="caption">{label}</Text>
        <Text variant="title">{value}</Text>
      </View>
    </GlassSurface>
  );
}

export function Records() {
  const stats = useStore(profileStore, selectStats);
  const bestScore = useStore(profileStore, selectBestScore);
  const achievementCount = useStore(profileStore, selectAchievements);
  const totalKills = stats.kills.reduce((sum, n) => sum + (n ?? 0), 0);
  let favourite: EnemyType | null = null;
  for (let type = 0; type < stats.kills.length; type++) {
    const n = stats.kills[type] ?? 0;
    if (n > 0 && (favourite === null || n > (stats.kills[favourite] ?? 0))) {
      favourite = type;
    }
  }

  return (
    <>
      <GlassSurface radius={radii.lg} style={styles.summary}>
        <Text variant="title">RECORDS</Text>
        <Text variant="caption">
          Lifetime totals across every game. Robots destroyed per type are also shown on each
          robot&apos;s card.
        </Text>
      </GlassSurface>
      <View style={styles.grid}>
        <RecordCard
          icon="rewards"
          color={colors.gold}
          label="Best score"
          value={bestScore.toLocaleString()}
        />
        <RecordCard
          icon="flag"
          color={colors.accent}
          label="Highest wave"
          value={String(stats.highestWave)}
        />
        <RecordCard
          icon="play"
          color={colors.text}
          label="Games played"
          value={stats.gamesPlayed.toLocaleString()}
        />
        <RecordCard
          icon="trophy"
          color={colors.gold}
          label="Victories"
          value={stats.gamesWon.toLocaleString()}
        />
        <RecordCard
          icon="enemies"
          color={colors.danger}
          label="Robots destroyed"
          value={totalKills.toLocaleString()}
        />
        <RecordCard
          icon="star"
          color={colors.danger}
          label="Most destroyed"
          value={favourite === null ? '—' : ENEMIES[favourite].name}
        />
        <RecordCard
          icon="shield"
          color={colors.success}
          label="Towers built"
          value={stats.towersBuilt.toLocaleString()}
        />
        <RecordCard
          icon="check"
          color={colors.success}
          label="Achievements earned"
          value={achievementCount.toLocaleString()}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: 2,
    padding: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  record: {
    flexGrow: 1,
    flexBasis: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});
