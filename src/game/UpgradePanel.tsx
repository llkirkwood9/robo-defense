/**
 * Tower upgrade sheet (port of `UpgradeDialog`): sell the selected tower or buy one of up to
 * three upgrades. The game keeps running underneath, as in the original. While a Command Tower is
 * on the map it also holds the targeting controls.
 */
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GRID, TICKS_PER_SECOND } from '@/engine/constants';
import type { Tower } from '@/engine/entities';
import {
  COMMAND_AURA_TILES,
  COMMAND_RANGE_BONUS,
  hasFireRate,
  TARGET_MODE_HINTS,
  TARGET_MODE_LABELS,
  TowerType,
} from '@/engine/towers';
import type { TowerProps, TowerTargets } from '@/engine/towers';
import { useStore } from '@/lib/store';
import { GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Icon } from '@/ui/Icon';
import { TowerIcon } from '@/ui/Sprite';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

import type { GameController, HudState } from './GameController';
import { TargetPicker } from './TargetPicker';

const selectSelected = (h: HudState) => h.selected;
const selectVersion = (h: HudState) => h.towerVersion;
const selectMoney = (h: HudState) => h.money;

const AURA_BONUS_PCT = Math.round((COMMAND_RANGE_BONUS - 1) * 100);

/**
 * Tower stats as two short lines (power and fire rate, then range and limits such as "Air only").
 * Lines wrap rather than truncate in the narrow upgrade cards. `boosted` shows the Command Tower's
 * range bonus.
 */
function describe(
  p: TowerProps,
  targets: TowerTargets | null,
  { boosted = false, aura = false }: { boosted?: boolean; aura?: boolean } = {},
): string[] {
  const attack: string[] = [];
  if (p.power > 0) attack.push(`Power ${p.power}`);
  if (hasFireRate(p)) {
    const rate = TICKS_PER_SECOND / p.shotDelay;
    attack.push(`${rate >= 10 ? Math.round(rate) : rate.toFixed(1)}/s`);
  }
  const reach: string[] = [];
  if (aura) {
    reach.push(`Aura ${COMMAND_AURA_TILES} tiles · +${AURA_BONUS_PCT}% range`);
  } else if (p.attackRadius > GRID / 5) {
    const range = (p.attackRadius * (boosted ? COMMAND_RANGE_BONUS : 1)) / GRID;
    reach.push(`Range ${range.toFixed(1)}${boosted ? ` (+${AURA_BONUS_PCT}%)` : ''}`);
  }
  if (targets === 'air') reach.push('Air only');
  if (targets === 'ground') reach.push('Ground only');
  if (targets === 'both') reach.push('Ground & air');
  if (!p.blocking) reach.push("Doesn't block path");
  return [attack.join(' · '), reach.join(' · ')].filter((line) => line.length > 0);
}

function StatLines({
  props,
  targets,
  boosted,
  aura,
}: {
  props: TowerProps;
  targets: TowerTargets | null;
  /** Inside a Command Tower's aura. */
  boosted?: boolean;
  /** The Command Tower itself (its range is an aura). */
  aura?: boolean;
}) {
  return describe(props, targets, { boosted, aura }).map((line) => (
    <Text key={line} variant="caption">
      {line}
    </Text>
  ));
}

/** Slight dark backing so the panel reads clearly over busy map art. */
const PANEL_TINT = 'rgba(8, 12, 22, 0.55)';

function UpgradeOption({
  type,
  props,
  targets,
  money,
  onPress,
}: {
  type: TowerType;
  props: TowerProps;
  targets: TowerTargets | null;
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
          <Text variant="label" color={affordable ? colors.text : colors.textFaint}>
            {props.label}
          </Text>
          <Text
            variant="stat"
            color={affordable ? colors.gold : colors.textFaint}
            style={styles.cost}
          >
            ${props.cost}
          </Text>
          <StatLines props={props} targets={targets} aura={type === TowerType.Command} />
          {notes.length > 0 && (
            <Text variant="caption" color={colors.accent}>
              {notes.join(' · ')}
            </Text>
          )}
        </View>
      </GlassSurface>
    </Pressable>
  );
}

/** Command Tower panel section: the default targeting for every tower. */
function CommandTargeting({ controller }: { controller: GameController }) {
  const { state } = controller;
  const mode = state.targetMode;
  const custom = state.towers.filter((t) => t.targetMode !== null).length;
  const commands = state.commandTowers.length;
  return (
    <View style={styles.section}>
      <Text variant="caption" style={styles.sectionTitle}>
        TARGETING FOR ALL TOWERS
      </Text>
      <TargetPicker
        value={mode}
        onChange={(choice) => choice !== 'default' && controller.setTargetMode(choice)}
      />
      <Text variant="caption">
        {TARGET_MODE_HINTS[mode]}.{commands > 1 && ` Shared by all ${commands} Command Towers.`}
      </Text>
      {custom > 0 && (
        <View style={styles.customRow}>
          <Text variant="caption" style={styles.flex}>
            {custom === 1 ? '1 tower uses' : `${custom} towers use`} its own targeting.
          </Text>
          <GlassButton
            label="Reset all"
            size="sm"
            onPress={() => controller.clearTargetOverrides()}
          />
        </View>
      )}
    </View>
  );
}

/** Per-tower targeting, shown while a Command Tower is on the map. */
function TowerTargeting({ controller, tower }: { controller: GameController; tower: Tower }) {
  const fallback = TARGET_MODE_LABELS[controller.state.targetMode];
  return (
    <View style={styles.section}>
      <Text variant="caption" style={styles.sectionTitle}>
        TARGETING
      </Text>
      <TargetPicker
        value={tower.targetMode ?? 'default'}
        defaultLabel={`Default · ${fallback}`}
        onChange={(choice) =>
          controller.setTowerTargetMode(tower, choice === 'default' ? null : choice)
        }
      />
    </View>
  );
}

export function UpgradePanel({ controller }: { controller: GameController }) {
  const tower = useStore(controller.hud, selectSelected);
  useStore(controller.hud, selectVersion);
  const money = useStore(controller.hud, selectMoney);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!tower) {
    return null;
  }
  const { state } = controller;
  const table = state.towerTable;
  const props = table.get(tower.type);
  const upgrades = props.upgrades.filter((u): u is TowerType => u >= 0);
  const isCommand = tower.type === TowerType.Command;
  // Only towers that actually shoot have a choice of target.
  const canTarget = state.commandActive && !isCommand && hasFireRate(props);
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
        <GlassSurface
          radius={radii.lg}
          tint={PANEL_TINT}
          style={[
            styles.panel,
            { maxHeight: height - insets.top - insets.bottom - spacing.lg * 2 },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.panelContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <TowerIcon props={props} size={48} />
              <View style={styles.flex}>
                <Text variant="title" style={styles.title}>
                  {props.label}
                </Text>
                <StatLines
                  props={props}
                  targets={table.targets(tower.type)}
                  boosted={tower.boosted}
                  aura={isCommand}
                />
              </View>
              <GlassButton
                icon="close"
                size="sm"
                accessibilityLabel="Close"
                onPress={() => controller.closeUpgradePanel()}
              />
            </View>

            {isCommand && <CommandTargeting controller={controller} />}
            {canTarget && <TowerTargeting controller={controller} tower={tower} />}

            {upgrades.length > 0 ? (
              <View style={styles.grid}>
                {upgrades.map((u) => (
                  <UpgradeOption
                    key={u}
                    props={table.get(u)}
                    type={u}
                    targets={table.targets(u)}
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
          </ScrollView>
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
    overflow: 'hidden',
  },
  panelContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    letterSpacing: 1.5,
    color: colors.accent,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    // Fill the row's height so side-by-side options match when one label wraps.
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
  },
  optionText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
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
