/**
 * Tower guide: every tower's sprite and stats, including the player's upgrades. Towers stay
 * locked (an outline only) until they are first built or upgraded to in a game. Teleporters and
 * mines, which are bought unarmed and then armed, get one card each.
 */
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { GRID, TICKS_PER_SECOND } from '@/engine/constants';
import { MINE_RADIUS_SQ, ShotType } from '@/engine/data/projectiles';
import { hasFireRate, TowerTable, TowerType } from '@/engine/towers';
import type { TowerProps, TowerTargets } from '@/engine/towers';
import { useStore } from '@/lib/store';
import { profileStore, rewards } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import { Icon } from '@/ui/Icon';
import { LockedLabel, SpriteOutline } from '@/ui/Locked';
import { TowerIcon } from '@/ui/Sprite';
import { Stat } from '@/ui/Stat';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

import type { Clock } from './clock';
import { useClock } from './clock';

/** A guide card: one tower, or an unarmed tower and its armed form together. */
interface Entry {
  type: TowerType;
  /** The armed form, for towers that are armed after building (and re-armed after each use). */
  armed?: TowerType;
  /** Card title, when it differs from the tower's own label. */
  name?: string;
}

/** Grouped by family, each in upgrade order. */
const ORDER: Entry[] = [
  { type: TowerType.Gun1 },
  { type: TowerType.Gun2 },
  { type: TowerType.Gun3 },
  { type: TowerType.Command },
  { type: TowerType.Antiair1 },
  { type: TowerType.Antiair2 },
  { type: TowerType.Flame1 },
  { type: TowerType.Flame2 },
  { type: TowerType.Rocket1 },
  { type: TowerType.Rocket2 },
  { type: TowerType.Rocket3 },
  { type: TowerType.SurfaceAir1 },
  { type: TowerType.SurfaceAir2 },
  { type: TowerType.Mortar },
  { type: TowerType.Artillery },
  { type: TowerType.Slow1 },
  { type: TowerType.Slow2 },
  { type: TowerType.Slow3 },
  { type: TowerType.TeleportUnarmed, armed: TowerType.TeleportArmed, name: 'Teleport Tower' },
  { type: TowerType.MineUnarmed, armed: TowerType.MineArmed, name: 'Mine' },
  { type: TowerType.Flare },
];

/** A tower's name in the guide (its card title, so unarmed variants read as "Mine"). */
const nameOf = (type: TowerType, table: TowerTable) =>
  ORDER.find((e) => e.type === type || e.armed === type)?.name ?? table.get(type).label;

const isUnlocked = (entry: Entry, bought: readonly TowerType[]) =>
  bought.includes(entry.type) || (entry.armed !== undefined && bought.includes(entry.armed));

/** Mine blast radius in tiles. */
const MINE_BLAST_TILES = Math.sqrt(MINE_RADIUS_SQ) / GRID;

const BLURBS: Partial<Record<TowerType, string>> = {
  [TowerType.Gun1]: 'A cheap, quick-firing gun. The backbone of most mazes.',
  [TowerType.Gun2]: 'Double the punch of the Basic Gun for a few dollars more.',
  [TowerType.Gun3]: 'Heavy rounds that start to get through armor.',
  [TowerType.Command]:
    'Unarmed, but it lets you choose how every tower picks targets (first, last, closest, strongest or weakest), for all towers or one at a time. Nearby towers get extra range; build several to cover more of the map (boosts do not stack).',
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
  [TowerType.TeleportUnarmed]:
    'Built on the path, then armed. Sends the first robot to reach it back to the start, then needs re-arming.',
  [TowerType.MineUnarmed]:
    'Buried in the path, then armed. Blows up the first robot to reach it and anything nearby, setting off neighbouring armed mines too. Re-arm it after each blast.',
  [TowerType.Flare]: 'A burning flare on the path that sets passing robots alight.',
};

/** Towers that must first be unlocked with upgrade points. */
const REWARD_TOWERS = new Set([
  TowerType.TeleportUnarmed,
  TowerType.MineUnarmed,
  TowerType.Flare,
  TowerType.Command,
]);

const TARGET_LABELS: Record<TowerTargets, string> = {
  ground: 'Ground',
  air: 'Air',
  both: 'Ground & air',
};

const ICON_SIZE = 64;
const ICON_BOX = 96;

/** An animated tower cycling its frames at the in-game speed (one frame every other tick). */
function AnimatedTowerIcon({ props }: { props: TowerProps }) {
  const { directions } = props;
  const frame = useClock(useCallback((c: Clock) => (c.tick >> 1) % directions, [directions]));
  return <TowerIcon props={props} size={ICON_SIZE} animFrame={frame} />;
}

function TowerCard({ entry, table }: { entry: Entry; table: TowerTable }) {
  const { type, armed } = entry;
  // Building stats come from the tower as bought; attack stats from its armed form, if any.
  const p = table.get(type);
  const a = table.get(armed ?? type);
  const targets = table.targets(armed ?? type);
  const target = targets && TARGET_LABELS[targets];
  const notes = a.notes.filter((n): n is string => !!n);
  const rate = TICKS_PER_SECOND / a.shotDelay;
  const blurb = BLURBS[type] ?? '';
  const { downgrade } = p;
  const from = downgrade === -1 ? null : nameOf(downgrade, table);
  return (
    <GlassSurface radius={radii.md} style={styles.card}>
      <View style={styles.iconBox}>
        {a.animated ? <AnimatedTowerIcon props={a} /> : <TowerIcon props={a} size={ICON_SIZE} />}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Text variant="heading" style={styles.flex}>
            {entry.name ?? p.label}
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
          {from ? `Upgrade from ${from}` : 'Built from the dock'}
        </Text>
        <View style={styles.stats}>
          <Stat
            icon="money"
            color={colors.gold}
            value={`$${p.cost}`}
            label={from ? 'upgrade' : 'cost'}
          />
          {armed !== undefined && (
            <Stat icon="money" color={colors.gold} value={`$${a.cost}`} label="to arm" />
          )}
          {a.power > 0 && (
            <Stat icon="bolt" color={colors.danger} value={String(a.power)} label="power" />
          )}
          {hasFireRate(a) && (
            <Stat
              icon="timer"
              color={colors.success}
              value={rate >= 10 ? String(Math.round(rate)) : rate.toFixed(1)}
              label="shots/s"
            />
          )}
          {a.attackRadius > GRID / 5 && (
            <Stat
              icon="range"
              color={colors.accent}
              value={(a.attackRadius / GRID).toFixed(1)}
              label={type === TowerType.Command ? 'aura' : 'range'}
            />
          )}
          {a.shotType === ShotType.Mine && (
            <Stat
              icon="range"
              color={colors.accent}
              value={MINE_BLAST_TILES.toFixed(1)}
              label="blast"
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

function LockedTowerCard({ entry, table }: { entry: Entry; table: TowerTable }) {
  const props = table.get(entry.armed ?? entry.type);
  return (
    <GlassSurface radius={radii.md} style={styles.card}>
      <View style={styles.iconBox}>
        <SpriteOutline
          render={(tint) => <TowerIcon props={props} size={ICON_SIZE} tintColor={tint} />}
        />
      </View>
      <LockedLabel
        hint={
          REWARD_TOWERS.has(entry.type)
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
  const unlocked = ORDER.filter((entry) => isUnlocked(entry, bought)).length;

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
        {ORDER.map((entry) =>
          isUnlocked(entry, bought) ? (
            <TowerCard key={entry.type} entry={entry} table={table} />
          ) : (
            <LockedTowerCard key={entry.type} entry={entry} table={table} />
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
