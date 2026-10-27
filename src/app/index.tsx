/**
 * Title screen (port of `TitleActivity`): resume or start a game and reach every menu.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LevelImageId } from '@/engine/data/sprites';
import { useStore } from '@/lib/store';
import { TITLE_SOURCES } from '@/render/assets';
import { clearQuickSave, profileStore, takeSurvivorAnnouncement } from '@/services/profile';
import { Backdrop } from '@/ui/Backdrop';
import { confirm, notify } from '@/ui/dialog';
import { GlassGroup, GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

const BACKDROPS: LevelImageId[] = [
  'basic_level',
  'cross_level',
  'threeway_level',
  'courtyard_level',
  'skytower_level',
  'mixer_level',
];

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const selectPoints = (s: ReturnType<typeof profileStore.get>) => s.rewardPoints;
const selectAchievements = (s: ReturnType<typeof profileStore.get>) => s.achievementCount;
const selectHasSave = (s: ReturnType<typeof profileStore.get>) => s.hasQuickSave;

export default function TitleScreen() {
  const [backdrop] = useState(() => pick(BACKDROPS));
  const [robot] = useState(() => pick(TITLE_SOURCES));
  const { width } = useWindowDimensions();
  // The hero column gets roughly half the screen; size the logo to fit it on any phone.
  const titleSize = Math.max(26, Math.min(46, width * 0.042));
  const points = useStore(profileStore, selectPoints);
  const achievementCount = useStore(profileStore, selectAchievements);
  const hasSave = useStore(profileStore, selectHasSave);

  useEffect(() => {
    if (takeSurvivorAnnouncement()) {
      notify(
        'Congratulations, Survivor!',
        'You beat survival mode and unlocked Tower Mix mode. When you start a new game you can now rebalance the towers for more strategic variety. Have fun!',
      );
    }
  }, []);

  const newGame = () => {
    if (!hasSave) {
      router.push('/new-game');
      return;
    }
    confirm(
      {
        title: 'Discard saved game?',
        message: 'Starting a new game will replace your saved game.',
        confirmLabel: 'New Game',
        destructive: true,
      },
      () => {
        clearQuickSave();
        router.push('/new-game');
      },
    );
  };

  return (
    <View style={styles.root}>
      <Backdrop level={backdrop} />
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'top', 'bottom']}>
        <View style={styles.hero}>
          <Animated.View entering={FadeInDown.duration(700)}>
            <Text variant="caption" style={styles.kicker}>
              TOWER DEFENSE
            </Text>
            <Text
              variant="display"
              style={[styles.title, { fontSize: titleSize }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              ROBO DEFENSE
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(150).duration(700)} style={styles.chips}>
            <GlassSurface radius={radii.pill} style={styles.chip}>
              <Icon name="rewards" size={16} color={colors.gold} />
              <Text variant="stat">{points.toLocaleString()}</Text>
              <Text variant="caption">upgrade pts</Text>
            </GlassSurface>
            <GlassSurface radius={radii.pill} style={styles.chip}>
              <Icon name="trophy" size={16} color={colors.accent} />
              <Text variant="stat">{achievementCount}</Text>
              <Text variant="caption">achievements</Text>
            </GlassSurface>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(300).duration(900)} style={styles.robotWrap}>
            <Image source={robot} style={styles.robot} contentFit="contain" />
          </Animated.View>
        </View>

        <Animated.View entering={FadeInRight.delay(200).duration(600)} style={styles.menuColumn}>
          <ScrollView
            contentContainerStyle={styles.menuScroll}
            showsVerticalScrollIndicator={false}
          >
            <GlassGroup spacing={10} style={styles.menu}>
              {hasSave && (
                <GlassButton
                  label="Resume Game"
                  icon="resume"
                  tone="primary"
                  size="lg"
                  onPress={() => router.push({ pathname: '/game', params: { resume: '1' } })}
                />
              )}
              <GlassButton
                label="New Game"
                icon="newGame"
                tone={hasSave ? 'default' : 'primary'}
                size="lg"
                onPress={newGame}
              />
              <View style={styles.row}>
                <GlassButton
                  label="Upgrades"
                  icon="rewards"
                  style={styles.flex}
                  onPress={() => router.push('/upgrades')}
                />
                <GlassButton
                  label="Achievements"
                  icon="trophy"
                  style={styles.flex}
                  onPress={() => router.push('/achievements')}
                />
              </View>
              <View style={styles.row}>
                <GlassButton
                  label="Guide"
                  icon="enemies"
                  style={styles.flex}
                  onPress={() => router.push('/guide')}
                />
                <GlassButton
                  label="Options"
                  icon="settings"
                  style={styles.flex}
                  onPress={() => router.push('/options')}
                />
              </View>
              <GlassButton label="Credits" icon="credits" onPress={() => router.push('/credits')} />
              {__DEV__ && (
                <GlassButton
                  label="Developer"
                  icon="dev"
                  size="sm"
                  onPress={() => router.push('/dev')}
                />
              )}
            </GlassGroup>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  hero: {
    flex: 1.2,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  kicker: {
    letterSpacing: 6,
    color: colors.accent,
    fontWeight: '700',
  },
  title: {
    textShadowColor: 'rgba(79, 209, 255, 0.55)',
    textShadowRadius: 18,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  robotWrap: {
    flexShrink: 1,
    minHeight: 80,
  },
  robot: {
    width: 150,
    height: '100%',
    maxHeight: 150,
  },
  menuColumn: {
    flex: 1,
    maxWidth: 360,
    justifyContent: 'center',
  },
  menuScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  menu: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});
