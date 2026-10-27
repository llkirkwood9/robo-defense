/**
 * Tower upgrade sheet (port of `UpgradeDialog`): sell the selected tower or buy one of up to
 * three upgrades. The game keeps running underneath, as in the original.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GRID, TICKS_PER_SECOND } from '@/engine/constants';
import { TowerType } from '@/engine/towers';
import type { TowerProps } from '@/engine/towers';
import { useStore } from '@/lib/store';
import { GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Icon } from '@/ui/Icon';
import { TowerIcon } from '@/ui/Sprite';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

import type { GameController, HudState } from './GameController';

const selectSelected = (h: HudState) => h.selected;
const selectVersion = (h: HudState) => h.towerVersion;
const selectMoney = (h: HudState) => h.money;

/**
 * Tower stats as two short lines (power and fire rate, then range), so neither gets cut off in
 * the narrow upgrade cards.
 */
function describe(p: TowerProps): string[] {
  const attack: string[] = [];
  if (p.power > 0) attack.push(`Power ${p.power}`);
  if (p.shotDelay < 1000 && p.shotType !== 0) {
    const rate = TICKS_PER_SECOND / p.shotDelay;
    attack.push(`${rate >= 10 ? Math.round(rate) : rate.toFixed(1)}/s`);
  }
  const reach: string[] = [];
  if (p.attackRadius > GRID / 5) reach.push(`Range ${(p.attackRadius / GRID).toFixed(1)}`);
  if (!p.blocking) reach.push("Doesn't block path");
  return [attack.join(' · '), reach.join(' · ')].filter((line) => line.length > 0);
}

function StatLines({ props }: { props: TowerProps }) {
  return describe(props).map((line) => (
    <Text key={line} variant="caption" numberOfLines={1}>
      {line}
    </Text>
  ));
}

/** Slight dark backing so the panel reads clearly over busy map art. */
const PANEL_TINT = 'rgba(8, 12, 22, 0.55)';

function UpgradeOption({
  props,
  money,
  onPress,
}: {
  props: TowerProps;
  money: number;
  onPress: () => void;
}) {
  const affordable = money >= props.cost;
  const notes = props.notes.filter((n): n is string => !!n);
  return (
    <Pressable
      onPress={onPress}
      disabled={!affordable}
      accessibilityRole="button"
      accessibilityLabel={`Upgrade to ${props.label} for $${props.cost}`}
      accessibilityState={{ disabled: !affordable }}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <GlassSurface
        radius={radii.md}
        interactive={affordable}
        tint={affordable ? 'rgba(36, 150, 220, 0.35)' : undefined}
        style={styles.optionSurface}
      >
        <View style={!affordable && styles.dim}>
          <TowerIcon props={props} size={44} />
        </View>
        <View style={styles.optionText}>
          <Text
            variant="label"
            numberOfLines={1}
            color={affordable ? colors.text : colors.textFaint}
          >
            {props.label}
          </Text>
          <Text
            variant="stat"
            color={affordable ? colors.gold : colors.textFaint}
            style={styles.cost}
          >
            ${props.cost}
          </Text>
          <StatLines props={props} />
          {notes.length > 0 && (
            <Text variant="caption" numberOfLines={1} color={colors.accent}>
              {notes.join(' · ')}
            </Text>
          )}
        </View>
      </GlassSurface>
    </Pressable>
  );
}

export function UpgradePanel({ controller }: { controller: GameController }) {
  const tower = useStore(controller.hud, selectSelected);
  useStore(controller.hud, selectVersion);
  const money = useStore(controller.hud, selectMoney);
  if (!tower) {
    return null;
  }
  const table = controller.state.towerTable;
  const props = table.get(tower.type);
  const upgrades = props.upgrades.filter((u): u is TowerType => u >= 0);
  // Keep the tower (and its range ring) visible by docking the panel on the far side.
  const { camera } = controller;
  const towerOnLeft = camera.toScreenX((tower.gridX + 0.5) * GRID) < camera.screenWidth / 2;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={[styles.overlay, { alignItems: towerOnLeft ? 'flex-end' : 'flex-start' }]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Close upgrades"
        onPress={() => controller.closeUpgradePanel()}
      />
      <View>
        <GlassSurface radius={radii.lg} tint={PANEL_TINT} style={styles.panel}>
          <View style={styles.header}>
            <TowerIcon props={props} size={48} />
            <View style={styles.flex}>
              <Text variant="title" numberOfLines={1}>
                {props.label}
              </Text>
              <StatLines props={props} />
            </View>
            <GlassButton
              icon="close"
              size="sm"
              accessibilityLabel="Close"
              onPress={() => controller.closeUpgradePanel()}
            />
          </View>

          {upgrades.length > 0 ? (
            <View style={styles.grid}>
              {upgrades.map((u) => (
                <UpgradeOption
                  key={u}
                  props={table.get(u)}
                  money={money}
                  onPress={() => controller.upgradeSelected(u)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.maxed}>
              <Icon name="star" size={16} color={colors.gold} />
              <Text variant="caption">Fully upgraded</Text>
            </View>
          )}

          <GlassButton
            label={`Sell for $${table.sellValue(tower.type)}`}
            icon="sell"
            tone="danger"
            onPress={() => controller.upgradeSelected(TowerType.Sell)}
          />
        </GlassSurface>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 56,
  },
  panel: {
    width: 440,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  optionSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
  },
  optionText: {
    flex: 1,
  },
  cost: {
    fontSize: 13,
  },
  maxed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  dim: {
    opacity: 0.4,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  flex: {
    flex: 1,
  },
});
