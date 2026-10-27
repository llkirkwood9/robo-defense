/**
 * In-game heads-up display: pause / fast-forward controls, wave counter and the player's stats.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOutUp, LinearTransition, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RunState } from '@/engine/constants';
import { useStore } from '@/lib/store';
import { GlassGroup, GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

import type { FeedState, GameController, HudState } from './GameController';

const selectRunState = (h: HudState) => h.runState;
const selectLevel = (h: HudState) => h.level;
const selectDifficulty = (h: HudState) => h.difficulty;
const selectMoney = (h: HudState) => h.money;
const selectHealth = (h: HudState) => h.health;
const selectScore = (h: HudState) => h.score;
const selectBonus = (h: HudState) => h.bonus;
const selectScoreAdds = (f: FeedState) => f.scoreAdds;

/**
 * Animates a number towards its target in readable steps, like the original HUD counters
 * (ones, then tens, then hundreds...).
 */
function useTickingNumber(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    if (shownRef.current === target) {
      return;
    }
    const id = setInterval(() => {
      const diff = target - shownRef.current;
      if (diff === 0) {
        clearInterval(id);
        return;
      }
      const magnitude = Math.abs(diff);
      const step = magnitude < 10 ? 1 : 10 ** Math.min(5, Math.floor(Math.log10(magnitude)));
      shownRef.current += Math.sign(diff) * step;
      setShown(shownRef.current);
    }, 33);
    return () => clearInterval(id);
  }, [target]);
  return shown;
}

function Stat({ icon, value, color }: { icon: 'money' | 'heart'; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={16} color={color} />
      <Text variant="stat" style={styles.statValue}>
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

function ScoreStat({ controller }: { controller: GameController }) {
  const score = useTickingNumber(useStore(controller.hud, selectScore));
  const adds = useStore(controller.feed, selectScoreAdds);
  const latest = adds[adds.length - 1];

  useEffect(() => {
    if (!latest) return;
    const id = setTimeout(() => controller.consumeScoreAdd(latest.id), 700);
    return () => clearTimeout(id);
  }, [latest, controller]);

  return (
    <View style={styles.scoreBlock}>
      <Text variant="caption">SCORE</Text>
      <View style={styles.row}>
        <Text variant="stat">{score.toLocaleString()}</Text>
        {latest && (
          <Animated.View key={latest.id} entering={SlideInDown.duration(180)} exiting={FadeOutUp}>
            <Text variant="stat" color={colors.gold} style={styles.adder}>
              +{latest.amount.toLocaleString()}
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export function Hud({ controller }: { controller: GameController }) {
  const insets = useSafeAreaInsets();
  const runState = useStore(controller.hud, selectRunState);
  const level = useStore(controller.hud, selectLevel);
  const difficulty = useStore(controller.hud, selectDifficulty);
  const money = useStore(controller.hud, selectMoney);
  const health = useStore(controller.hud, selectHealth);
  const bonus = useStore(controller.hud, selectBonus);

  const active =
    runState === RunState.Running ||
    runState === RunState.FastForward ||
    runState === RunState.Paused;
  const fastForward = runState === RunState.FastForward;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.bar,
        {
          top: Math.max(insets.top, spacing.sm),
          left: insets.left + spacing.md,
          right: insets.right + spacing.md,
        },
      ]}
    >
      <GlassGroup spacing={8} style={styles.group}>
        {active && (
          <>
            <GlassButton
              icon={runState === RunState.Paused ? 'play' : 'pause'}
              size="md"
              accessibilityLabel={runState === RunState.Paused ? 'Resume' : 'Pause'}
              onPress={() => controller.togglePause()}
            />
            <GlassButton
              icon="fastForward"
              size="md"
              tone={fastForward ? 'primary' : 'default'}
              accessibilityLabel={fastForward ? 'Normal speed' : 'Fast forward'}
              disabled={runState === RunState.Paused}
              onPress={() => controller.toggleFastForward()}
            />
          </>
        )}
        <GlassSurface radius={radii.pill} style={styles.pill}>
          <Icon name="flag" size={16} color={colors.accent} />
          <Text variant="stat">
            {level}
            <Text variant="caption"> / 100</Text>
          </Text>
          <Text variant="caption">· Lv {difficulty}</Text>
        </GlassSurface>
      </GlassGroup>

      <Animated.View layout={LinearTransition}>
        <GlassSurface radius={radii.pill} style={[styles.pill, styles.stats]}>
          <ScoreStat controller={controller} />
          <View style={styles.divider} />
          <View style={styles.scoreBlock}>
            <Text variant="caption">BONUS</Text>
            <Text variant="stat" color={colors.gold}>
              +{bonus}
            </Text>
          </View>
          <View style={styles.divider} />
          <Stat icon="money" value={money} color={colors.success} />
          <Stat icon="heart" value={health} color={colors.danger} />
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  stats: {
    gap: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    minWidth: 28,
  },
  scoreBlock: {
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adder: {
    fontSize: 13,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 10,
    backgroundColor: colors.border,
  },
});
