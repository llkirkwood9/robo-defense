/**
 * Build dock: drag a tower from here onto the map to build it (the original's tower buttons).
 */
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RunState } from '@/engine/constants';
import { BUILDABLE_TOWERS } from '@/engine/towers';
import type { TowerType } from '@/engine/towers';
import { useStore } from '@/lib/store';
import { GlassGroup, GlassSurface } from '@/ui/Glass';
import { TowerIcon } from '@/ui/Sprite';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

import type { GameController, HudState } from './GameController';

const selectMoney = (h: HudState) => h.money;
const selectRunning = (h: HudState) =>
  h.runState === RunState.Running || h.runState === RunState.FastForward;

function DockButton({ controller, type }: { controller: GameController; type: TowerType }) {
  const money = useStore(controller.hud, selectMoney);
  const props = controller.state.towerTable.get(type);
  const affordable = money >= props.cost;

  const drag = usePanGesture({
    runOnJS: true,
    enabled: affordable,
    minDistance: 10,
    // Position the preview on activation too, so even a quick flick places the tower.
    onActivate: (e) => controller.dragTower(type, e.absoluteX, e.absoluteY),
    onUpdate: (e) => controller.dragTower(type, e.absoluteX, e.absoluteY),
    onDeactivate: (e) => {
      if (e.canceled) controller.cancelDrag();
      else controller.dropTower();
    },
    onFinalize: () => controller.cancelDrag(),
  });

  return (
    <GestureDetector gesture={drag}>
      <View
        accessible
        accessibilityLabel={`${props.label}, $${props.cost}. Drag onto the map to build.`}
      >
        <GlassSurface radius={radii.lg} interactive={affordable} style={styles.button}>
          <View style={!affordable && styles.unaffordable}>
            <TowerIcon props={props} size={46} />
          </View>
          <Text
            variant="stat"
            style={styles.price}
            color={affordable ? colors.gold : colors.textFaint}
          >
            ${props.cost}
          </Text>
        </GlassSurface>
      </View>
    </GestureDetector>
  );
}

export function TowerDock({ controller }: { controller: GameController }) {
  const insets = useSafeAreaInsets();
  const running = useStore(controller.hud, selectRunning);
  if (!running) {
    return null;
  }
  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      style={[
        styles.dock,
        { right: insets.right + spacing.md, bottom: Math.max(insets.bottom, spacing.md) },
      ]}
    >
      <GlassGroup spacing={10} style={styles.group}>
        {BUILDABLE_TOWERS.map((type) => (
          <DockButton key={type} controller={controller} type={type} />
        ))}
      </GlassGroup>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
  },
  group: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    width: 74,
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  unaffordable: {
    opacity: 0.35,
  },
  price: {
    fontSize: 13,
  },
});
