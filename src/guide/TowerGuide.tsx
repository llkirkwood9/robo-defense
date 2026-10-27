/**
 * Tower guide: every tower's sprite and stats, including the player's upgrades. Towers stay
 * locked (an outline only) until they are first built or upgraded to in a game.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { GRID, TICKS_PER_SECOND } from '@/engine/constants';
import { ShotType } from '@/engine/data/projectiles';
import { TowerTable, TowerType } from '@/engine/towers';
import type { TowerTargets } from '@/engine/towers';
import { useStore } from '@/lib/store';
import { profileStore, rewards } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import { Icon } from '@/ui/Icon';
import { LockedLabel, SpriteOutline } from '@/ui/Locked';
import { TowerIcon } from '@/ui/Sprite';
import { Stat } from '@/ui/Stat';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

/** Grouped by family, each in upgrade order. */
const ORDER: TowerType[] = [
  TowerType.Gun1,
  TowerType.Gun2,
  TowerType.Gun3,
  TowerType.Antiair1,
  TowerType.Antiair2,
  TowerType.Flame1,
  TowerType.Flame2,
  TowerType.Rocket1,
  TowerType.Rocket2,
  TowerType.Rocket3,
  TowerType.SurfaceAir1,
  TowerType.SurfaceAir2,
  TowerType.Mortar,
  TowerType.Artillery,
  TowerType.Slow1,
  TowerType.Slow2,
  TowerType.Slow3,
  TowerType.TeleportUnarmed,
  TowerType.TeleportArmed,
  TowerType.MineUnarmed,
  TowerType.MineArmed,
  TowerType.Flare,
];

const BLURBS: Partial<Record<TowerType, string>> = {
  [TowerType.Gun1]: 'A cheap, quick-firing gun. The backbone of most mazes.',
  [TowerType.Gun2]: 'Double the punch of the Basic Gun for a few dollars more.',
  [TowerType.Gun3]: 'Heavy rounds that start to get through armor.',
  [TowerType.Antiair1]: 'Rapid flak cannon that only fires at aircraft.',
  [TowerType.Antiair2]: 'Hard-hitting flak for the toughest aircraft.',
  [TowerType.Flame1]: 'Sets ground robots alight, spreading the fire through a crowd.',
  [TowerType.Flame2]: 'Hotter flames that burn for longer.',
  [TowerType.Rocket1]: 'Long-range rockets with splash damage.',
  [TowerType.Rocket2]: 'Bigger rockets that reload faster.',
  [TowerType.Rocket3]: 'Heavy warheads for armored targets.',
  [TowerType.SurfaceAir1]: 'Long-range guided missiles that only target aircraft.',
  [TowerType.SurfaceAir2]: 'Devastating missiles for late-game air raids.',
  [TowerType.Mortar]: 'Lobs shells a long way onto ground robots.',
  [TowerType.Artillery]: 'The longest reach in your arsenal. Ground targets only.',
  [TowerType.Slow1]: 'Slows robots down so your other towers get more shots.',
  [TowerType.Slow2]: 'Slows robots more often and for longer.',
  [TowerType.Slow3]: 'The strongest, fastest-cycling slow tower.',
  [TowerType.TeleportUnarmed]: 'Sits on the path. Arm it to start teleporting.',
  [TowerType.TeleportArmed]:
    'Sends the next robot to cross it back to the start, then needs arming again.',
  [TowerType.MineUnarmed]: 'Buried in the path. Arm it to make it explode.',
  [TowerType.MineArmed]: 'Explodes when a robot crosses it, setting off neighbouring mines too.',
  [TowerType.Flare]: 'A burning flare on the path that sets passing robots alight.',
};

/** Towers that must first be unlocked with upgrade points. */
const REWARD_TOWERS = new Set([
  TowerType.TeleportUnarmed,
  TowerType.TeleportArmed,
  TowerType.MineUnarmed,
  TowerType.MineArmed,
  TowerType.Flare,
]);

const TARGET_LABELS: Record<TowerTargets, string> = {
  ground: 'Ground',
  air: 'Air',
  both: 'Ground & air',
};

const ICON_SIZE = 64;
const ICON_BOX = 96;

function TowerCard({ type, table }: { type: TowerType; table: TowerTable }) {
  const p = table.get(type);
  const targets = table.targets(type);
  const target = targets && TARGET_LABELS[targets];
  const notes = p.notes.filter((n): n is string => !!n);
  const fires = p.shotType !== ShotType.None && p.shotDelay < 1000;
  const rate = TICKS_PER_SECOND / p.shotDelay;
  const blurb = BLURBS[type] ?? '';
  const { downgrade } = p;
  const from = downgrade === -1 ? null : table.get(downgrade);
  return (
    <GlassSurface radius={radii.md} style={styles.card}>
      <View style={styles.iconBox}>
        <TowerIcon props={p} size={ICON_SIZE} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Text variant="heading" style={styles.flex}>
            {p.label}
          </Text>
          {target && (
            <View style={[styles.tag, target === 'Air' && styles.tagAir]}>
              <Icon name={target === 'Air' ? 'plane' : 'shield'} size={11} color={colors.text} />
              <Text variant="caption" color={colors.text}>
                {target}
              </Text>
            </View>
          )}
        </View>
        <Text variant="caption" color={colors.accent}>
          {from ? `Upgrade from ${from.label}` : 'Built from the dock'}
        </Text>
        <View style={styles.stats}>
          <Stat
            icon="money"
            color={colors.gold}
            value={`$${p.cost}`}
            label={from ? 'upgrade' : 'cost'}
          />
          {p.power > 0 && (
            <Stat icon="bolt" color={colors.danger} value={String(p.power)} label="power" />
          )}
          {fires && (
            <Stat
              icon="timer"
              color={colors.success}
              value={rate >= 10 ? String(Math.round(rate)) : rate.toFixed(1)}
              label="shots/s"
            />
          )}
          {p.attackRadius > GRID / 5 && (
            <Stat
              icon="range"
              color={colors.accent}
              value={(p.attackRadius / GRID).toFixed(1)}
              label="range"
            />
          )}
        </View>
        {notes.length > 0 && (
          <Text variant="caption" color={colors.accent}>
            {notes.join(' · ')}
          </Text>
        )}
        <Text variant="caption">
          {blurb}
          {p.blocking ? '' : " Doesn't block the path."}
        </Text>
      </View>
    </GlassSurface>
  );
}

function LockedTowerCard({ type, table }: { type: TowerType; table: TowerTable }) {
  return (
    <GlassSurface radius={radii.md} style={styles.card}>
      <View style={styles.iconBox}>
        <SpriteOutline
          render={(tint) => <TowerIcon props={table.get(type)} size={ICON_SIZE} tintColor={tint} />}
        />
      </View>
      <LockedLabel
        hint={
          REWARD_TOWERS.has(type)
            ? 'Unlock it in Upgrades, then buy one in a game.'
            : 'Buy this tower in a game to unlock it.'
        }
      />
    </GlassSurface>
  );
}

type ProfileState = ReturnType<typeof profileStore.get>;
const selectBought = (s: ProfileState) => s.discovered.towers;
const selectRewardsVersion = (s: ProfileState) => s.rewardsVersion;

/** The Towers tab of the guide. */
export function TowerGuide() {
  const bought = useStore(profileStore, selectBought);
  const rewardsVersion = useStore(profileStore, selectRewardsVersion);
  // Rebuilt when reward upgrades change, since they buff tower stats.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const table = useMemo(() => new TowerTable(rewards), [rewardsVersion]);
  const unlocked = ORDER.filter((t) => bought.includes(t)).length;

  return (
    <>
      <GlassSurface radius={radii.lg} style={styles.summary}>
        <Text variant="caption">TOWER GUIDE</Text>
        <Text variant="title">
          {unlocked} of {ORDER.length} towers
        </Text>
        <Text variant="caption">
          Stats include your upgrades. Range is in tiles; an upgrade&apos;s cost is paid on top of
          the tower it replaces.
        </Text>
      </GlassSurface>

      <View style={styles.grid}>
        {ORDER.map((type) =>
          bought.includes(type) ? (
            <TowerCard key={type} type={type} table={table} />
          ) : (
            <LockedTowerCard key={type} type={type} table={table} />
          ),
        )}
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
  card: {
    flexGrow: 1,
    flexBasis: 340,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(120, 200, 120, 0.25)',
  },
  tagAir: {
    backgroundColor: 'rgba(79, 209, 255, 0.25)',
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: 2,
  },
  flex: {
    flex: 1,
  },
});
