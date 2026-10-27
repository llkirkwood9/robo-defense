/**
 * New game setup (port of `LevelSelectActivity`): choose a map, difficulty and game mode.
 */
import NativeSegmentedControl from '@react-native-segmented-control/segmented-control';
import type { SegmentedControlProps } from '@react-native-segmented-control/segmented-control';
import Slider from '@react-native-community/slider';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ComponentType } from 'react';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import type { MapType } from '@/engine/maps';
import { createMapLayout, MAP_COUNT, MAP_IMAGES, MAP_NAMES, MapType as Maps } from '@/engine/maps';
import { useStore } from '@/lib/store';
import { LEVEL_SOURCES } from '@/render/assets';
import { haptics } from '@/services/haptics';
import { maxDifficulty, profileStore, towerMixUnlocked, updateNewGame } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

const MAP_BLURBS: Record<MapType, string> = {
  [Maps.Basic]: 'One road, open field. The classic.',
  [Maps.Ruins]: 'Two crossing paths through old ruins.',
  [Maps.Factory]: 'Three parallel assembly lines.',
  [Maps.Courtyard]: 'Four gates and a fortified centre.',
  [Maps.VrTraining]: 'Procedural maps generated from a code.',
  [Maps.Roadway]: 'A narrow highway in the sky.',
  [Maps.SkyTower]: 'Two paths weaving around platforms.',
};

// The package's class typings predate React 19's JSX types; the component itself is fine.
const SegmentedControl = NativeSegmentedControl as unknown as ComponentType<SegmentedControlProps>;

const selectNewGame = (s: ReturnType<typeof profileStore.get>) => s.newGame;
const selectMaxLevelWon = (s: ReturnType<typeof profileStore.get>) => s.maxLevelWon;

export default function NewGameScreen() {
  const settings = useStore(profileStore, selectNewGame);
  useStore(profileStore, selectMaxLevelWon);
  const max = maxDifficulty();
  const difficulty = Math.min(settings.difficulty, max);
  const mixUnlocked = towerMixUnlocked();
  const layouts = useMemo(
    () =>
      Array.from({ length: MAP_COUNT }, (_, i) =>
        i === Maps.VrTraining ? null : createMapLayout(i as MapType),
      ),
    [],
  );

  const setDifficulty = (value: number) => {
    const next = Math.max(0, Math.min(max, Math.round(value)));
    if (next !== settings.difficulty) {
      updateNewGame({ difficulty: next });
    }
  };

  const start = () => {
    haptics.impact();
    const needsCodes =
      settings.mapType === Maps.VrTraining || (mixUnlocked && settings.towerMixEnabled);
    if (needsCodes) {
      router.push('/codes');
    } else {
      router.replace('/game');
    }
  };

  return (
    <Screen backdrop={MAP_IMAGES[settings.mapType]} contentStyle={styles.content}>
      <View style={styles.mapsColumn}>
        <Text variant="heading">Map</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.maps}
        >
          {Array.from({ length: MAP_COUNT }, (_, i) => {
            const selected = i === settings.mapType;
            const layout = layouts[i];
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={MAP_NAMES[i as MapType]}
                onPress={() => {
                  haptics.selection();
                  updateNewGame({ mapType: i });
                }}
              >
                <GlassSurface
                  radius={radii.lg}
                  interactive
                  tint={selected ? 'rgba(36, 150, 220, 0.45)' : undefined}
                  style={[styles.mapCard, selected && styles.mapCardSelected]}
                >
                  <Image
                    source={LEVEL_SOURCES[MAP_IMAGES[i as MapType]]}
                    style={styles.mapImage}
                    contentFit="cover"
                  />
                  <View style={styles.mapInfo}>
                    <Text variant="label" numberOfLines={1}>
                      {MAP_NAMES[i as MapType]}
                    </Text>
                    <Text variant="caption" numberOfLines={2}>
                      {MAP_BLURBS[i as MapType]}
                    </Text>
                    <Text variant="caption" color={colors.accent}>
                      {layout
                        ? `${layout.paths.length} path${layout.paths.length > 1 ? 's' : ''} · ${layout.scoreMultiplier}% score`
                        : '1-5 paths · 180% score'}
                    </Text>
                  </View>
                </GlassSurface>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <GlassSurface radius={radii.lg} style={styles.panel}>
        <View style={styles.field}>
          <Text variant="heading">Mode</Text>
          <SegmentedControl
            values={['Classic', 'Survival']}
            selectedIndex={settings.survival ? 1 : 0}
            appearance="dark"
            onChange={(e) => updateNewGame({ survival: e.nativeEvent.selectedSegmentIndex === 1 })}
          />
          <Text variant="caption">
            {settings.survival
              ? 'Difficulty climbs every wave. How long can you last?'
              : '100 waves at a fixed difficulty.'}
          </Text>
        </View>

        {!settings.survival && (
          <View style={styles.field}>
            <View style={styles.rowBetween}>
              <Text variant="heading">Difficulty</Text>
              <Text variant="title" color={colors.accent}>
                {difficulty}
              </Text>
            </View>
            <View style={styles.row}>
              <GlassButton
                icon="minus"
                size="sm"
                accessibilityLabel="Lower difficulty"
                disabled={difficulty <= 0}
                onPress={() => setDifficulty(difficulty - 1)}
              />
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={max}
                step={1}
                value={difficulty}
                onValueChange={setDifficulty}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor="rgba(255,255,255,0.2)"
              />
              <GlassButton
                icon="plus"
                size="sm"
                accessibilityLabel="Raise difficulty"
                disabled={difficulty >= max}
                onPress={() => setDifficulty(difficulty + 1)}
              />
            </View>
            <Text variant="caption">
              Win at difficulty {max} to raise the limit to {max + 10}.
            </Text>
          </View>
        )}

        {mixUnlocked && (
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text variant="heading">Tower Mix</Text>
              <Text variant="caption">Rebalance towers with a code.</Text>
            </View>
            <Switch
              value={settings.towerMixEnabled}
              onValueChange={(v) => updateNewGame({ towerMixEnabled: v })}
              trackColor={{ true: colors.accentDeep }}
            />
          </View>
        )}

        <GlassButton label="Start Game" icon="play" tone="primary" size="lg" onPress={start} />
      </GlassSurface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
  },
  mapsColumn: {
    flex: 1,
    gap: spacing.md,
  },
  maps: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
    paddingRight: spacing.lg,
  },
  mapCard: {
    width: 200,
    overflow: 'hidden',
  },
  mapCardSelected: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  mapImage: {
    width: '100%',
    height: 110,
  },
  mapInfo: {
    padding: spacing.md,
    gap: 2,
  },
  panel: {
    width: 330,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  flex: {
    flex: 1,
  },
});
