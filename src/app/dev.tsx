/**
 * Developer test menu for the player profile: upgrade points, difficulty unlocks, achievements and
 * the quick save. Only reachable in development builds (`__DEV__`); in-game cheats live in the
 * game's pause menu.
 */
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStore } from '@/lib/store';
import {
  achievements,
  clearQuickSave,
  devSetAllDiscovered,
  devSetMaxLevelWon,
  maxDifficulty,
  profileStore,
  rewards,
} from '@/services/profile';
import { confirm } from '@/ui/dialog';
import { GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

type ProfileState = ReturnType<typeof profileStore.get>;
const selectPoints = (s: ProfileState) => s.rewardPoints;
const selectMaxLevelWon = (s: ProfileState) => s.maxLevelWon;
const selectAchievements = (s: ProfileState) => s.achievementCount;
const selectHasSave = (s: ProfileState) => s.hasQuickSave;
const selectDiscovered = (s: ProfileState) => s.discovered;

function Section({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <GlassSurface radius={radii.lg} style={styles.section}>
      <View style={styles.header}>
        <Text variant="heading">{title}</Text>
        <Text variant="stat" color={colors.accent}>
          {status}
        </Text>
      </View>
      <View style={styles.buttons}>{children}</View>
    </GlassSurface>
  );
}

const confirmReset = (what: string, onConfirm: () => void) =>
  confirm(
    {
      title: `Reset ${what}?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Reset',
      destructive: true,
    },
    onConfirm,
  );

export default function DevScreen() {
  const points = useStore(profileStore, selectPoints);
  const maxLevelWon = useStore(profileStore, selectMaxLevelWon);
  const achievementCount = useStore(profileStore, selectAchievements);
  const hasSave = useStore(profileStore, selectHasSave);
  const discovered = useStore(profileStore, selectDiscovered);

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <Screen backdrop="skytower_level">
      <Text variant="caption">
        Development builds only. In-game cheats (money, health, waves, enemies) are in the pause
        menu under Developer.
      </Text>

      <Section title="Upgrade points" status={points.toLocaleString()}>
        {[1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000].map((n) => (
          <GlassButton
            key={n}
            label={`+${n.toLocaleString()}`}
            icon="rewards"
            size="sm"
            onPress={() => rewards.addPoints(n)}
          />
        ))}
        <GlassButton
          label="Zero points"
          size="sm"
          tone="danger"
          onPress={() => rewards.addPoints(-rewards.points)}
        />
        <GlassButton
          label="Reset upgrades"
          size="sm"
          tone="danger"
          onPress={() => confirmReset('all upgrades', () => rewards.devResetLevels())}
        />
      </Section>

      <Section title="Difficulty limit" status={String(maxDifficulty())}>
        <GlassButton
          label="Unlock next 10"
          icon="lock"
          size="sm"
          onPress={() => devSetMaxLevelWon(maxDifficulty())}
        />
        <GlassButton
          label="Unlock 100"
          icon="lock"
          size="sm"
          onPress={() => devSetMaxLevelWon(Math.max(maxLevelWon, 99))}
        />
        <GlassButton label="Reset" size="sm" tone="danger" onPress={() => devSetMaxLevelWon(0)} />
      </Section>

      <Section title="Achievements" status={String(achievementCount)}>
        <GlassButton
          label="Earn all"
          icon="trophy"
          size="sm"
          onPress={() => achievements.devSetAll(true)}
        />
        <GlassButton
          label="Reset all"
          size="sm"
          tone="danger"
          onPress={() => confirmReset('all achievements', () => achievements.devSetAll(false))}
        />
      </Section>

      <Section
        title="Field guides"
        status={`${discovered.enemies.length} enemies · ${discovered.towers.length} towers`}
      >
        <GlassButton
          label="Unlock all"
          icon="enemies"
          size="sm"
          onPress={() => devSetAllDiscovered(true)}
        />
        <GlassButton
          label="Lock all"
          size="sm"
          tone="danger"
          onPress={() => confirmReset('the enemy and tower guides', () => devSetAllDiscovered(false))}
        />
      </Section>

      <Section title="Quick save" status={hasSave ? 'Saved' : 'None'}>
        <GlassButton
          label="Delete quick save"
          size="sm"
          tone="danger"
          disabled={!hasSave}
          onPress={clearQuickSave}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
