/**
 * Enemy field guide: every robot's sprite and stats, with hit points scaled to a chosen wave and
 * difficulty so players can see what they'll be up against. Robots stay locked (an outline only)
 * until they first appear in a game.
 */
import Slider from '@react-native-community/slider';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Dir, GRID_SUB, TICKS_PER_SECOND } from '@/engine/constants';
import { SPRITES } from '@/engine/data/sprites';
import {
  ENEMIES,
  ENEMY_TYPE_COUNT,
  enemyBaseHealth,
  enemyFrame,
  EnemyType,
} from '@/engine/enemies';
import { PERFECT_LEVELS_FOR_TITAN } from '@/engine/gameState';
import { NUM_LEVELS } from '@/engine/waves';
import { useStore } from '@/lib/store';
import { maxDifficulty, profileStore } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Icon } from '@/ui/Icon';
import { LockedLabel, SpriteOutline } from '@/ui/Locked';
import { SpriteFrame } from '@/ui/Sprite';
import { Stat } from '@/ui/Stat';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

import { useClock } from './clock';

const BLURBS: Record<EnemyType, string> = {
  [EnemyType.Soldier]: 'Basic infantry. Weak alone, but they come in numbers.',
  [EnemyType.HeavySoldier]: 'Plated infantry that shrugs off the lightest rounds.',
  [EnemyType.Runner]: 'Fragile and fast. Slips past slow-firing towers.',
  [EnemyType.Truck]: 'An armored transport and the fastest thing on the ground.',
  [EnemyType.LightTank]: 'Slow and heavily armored. Small guns barely scratch it.',
  [EnemyType.HeavyTank]: 'A crawling fortress. Only hard-hitting weapons get through its armor.',
  [EnemyType.Helicopter]: 'Flies straight over your maze.',
  [EnemyType.Jet]: 'The fastest aircraft. Have anti-air ready before it arrives.',
  [EnemyType.Bomber]: 'A slow, heavy aircraft that soaks up a lot of fire.',
  [EnemyType.Titan]: `A colossal walker. Appears only after ${PERFECT_LEVELS_FOR_TITAN} waves in a row without losing a life.`,
  [EnemyType.Dropper]: 'A flying carrier that drops soldiers onto the path as it goes.',
};

const FLYER_NOTE = 'Immune to flame, mortar and artillery.';

/** Encounter order: by first wave, then by type. */
const ORDER = Array.from({ length: ENEMY_TYPE_COUNT }, (_, i) => i as EnemyType).sort(
  (a, b) => ENEMIES[a].firstLevel - ENEMIES[b].firstLevel || a - b,
);

/** Movement speed in grid cells per second. */
const cellsPerSecond = (type: EnemyType) => (ENEMIES[type].speed * TICKS_PER_SECOND) / GRID_SUB;

const SPRITE_BOX = 96;

function EnemyFrame({
  type,
  frame,
  tintColor,
}: {
  type: EnemyType;
  frame: number;
  tintColor?: string;
}) {
  const p = ENEMIES[type];
  const sheet = SPRITES[p.sprite];
  const width = Math.min(SPRITE_BOX, (SPRITE_BOX * sheet.frameWidth) / sheet.frameHeight);
  return <SpriteFrame sprite={p.sprite} frame={frame} width={width} tintColor={tintColor} />;
}

/** The enemy walking (or flying) towards the viewer, animated at the game's tick rate. */
function EnemySprite({ type }: { type: EnemyType }) {
  // Selecting the frame (not the tick) re-renders only when the visible frame changes.
  const frame = useClock(useCallback((c) => enemyFrame(type, Dir.Down, c.tick), [type]));
  return (
    <View style={styles.spriteBox}>
      <EnemyFrame type={type} frame={frame} />
    </View>
  );
}

function LockedEnemyCard({ type }: { type: EnemyType }) {
  return (
    <GlassSurface radius={radii.md} style={styles.card}>
      <View style={styles.spriteBox}>
        <SpriteOutline
          render={(tint) => (
            <EnemyFrame type={type} frame={enemyFrame(type, Dir.Down, 0)} tintColor={tint} />
          )}
        />
      </View>
      <LockedLabel hint="Face this robot in battle to unlock it." />
    </GlassSurface>
  );
}

function EnemyCard({
  type,
  wave,
  difficulty,
  destroyed,
}: {
  type: EnemyType;
  wave: number;
  difficulty: number;
  destroyed: number;
}) {
  const p = ENEMIES[type];
  const blurb = BLURBS[type];
  const appears =
    type === EnemyType.Titan
      ? `Difficulty ${p.minDifficulty}+`
      : `Wave ${p.firstLevel}+${p.minDifficulty > 0 ? ` · difficulty ${p.minDifficulty}+` : ''}`;
  return (
    <GlassSurface radius={radii.md} style={styles.card}>
      <EnemySprite type={type} />
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Text variant="heading" style={styles.flex} numberOfLines={1}>
            {p.name}
          </Text>
          <View style={[styles.tag, p.isFlyer && styles.tagAir]}>
            <Icon name={p.isFlyer ? 'plane' : 'shield'} size={11} color={colors.text} />
            <Text variant="caption" color={colors.text}>
              {p.isFlyer ? 'Air' : 'Ground'}
            </Text>
          </View>
        </View>
        <Text variant="caption" color={colors.accent}>
          {appears}
        </Text>
        <View style={styles.stats}>
          <Stat
            icon="heart"
            color={colors.danger}
            value={enemyBaseHealth(type, wave, difficulty).toLocaleString()}
            label="HP"
          />
          <Stat icon="shield" color={colors.accent} value={String(p.armor)} label="armor" />
          <Stat
            icon="speed"
            color={colors.success}
            value={cellsPerSecond(type).toFixed(1)}
            label="tiles/s"
          />
          <Stat icon="money" color={colors.gold} value={`$${p.value}`} label="bounty" />
        </View>
        <Text variant="caption">
          {blurb}
          {p.isFlyer ? ` ${FLYER_NOTE}` : ''}
        </Text>
        <Text variant="caption" color={colors.textFaint}>
          Destroyed: {destroyed.toLocaleString()}
        </Text>
      </View>
    </GlassSurface>
  );
}

function ScaleControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.scaleField}>
      <View style={styles.titleRow}>
        <Text variant="label">{label}</Text>
        <Text variant="stat" color={colors.accent}>
          {value}
        </Text>
      </View>
      <View style={styles.row}>
        <GlassButton
          icon="minus"
          size="sm"
          accessibilityLabel={`Lower ${label.toLowerCase()}`}
          disabled={value <= min}
          onPress={() => onChange(value - 1)}
        />
        <Slider
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          step={1}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor="rgba(255,255,255,0.2)"
        />
        <GlassButton
          icon="plus"
          size="sm"
          accessibilityLabel={`Raise ${label.toLowerCase()}`}
          disabled={value >= max}
          onPress={() => onChange(value + 1)}
        />
      </View>
    </View>
  );
}

const selectDifficulty = (s: ReturnType<typeof profileStore.get>) => s.newGame.difficulty;
const selectSeen = (s: ReturnType<typeof profileStore.get>) => s.discovered.enemies;
const selectKills = (s: ReturnType<typeof profileStore.get>) => s.stats.kills;

/** The Enemies tab of the guide. */
export function EnemyGuide() {
  const maxDiff = maxDifficulty();
  const savedDifficulty = useStore(profileStore, selectDifficulty);
  const seen = useStore(profileStore, selectSeen);
  const kills = useStore(profileStore, selectKills);
  const [wave, setWave] = useState(1);
  const [difficulty, setDifficulty] = useState(() => Math.min(savedDifficulty, maxDiff));

  return (
    <>
      <GlassSurface radius={radii.lg} style={styles.summary}>
        <View style={styles.summaryText}>
          <Text variant="caption">FIELD GUIDE</Text>
          <Text variant="title">
            {seen.length} of {ENEMY_TYPE_COUNT} robots
          </Text>
          <Text variant="caption">
            Hit points grow with each wave and difficulty level. Armor is subtracted from every hit,
            so weak shots may do little damage.
          </Text>
        </View>
        <ScaleControl label="Wave" value={wave} min={1} max={NUM_LEVELS} onChange={setWave} />
        <ScaleControl
          label="Difficulty"
          value={difficulty}
          min={0}
          max={maxDiff}
          onChange={setDifficulty}
        />
      </GlassSurface>

      <View style={styles.grid}>
        {ORDER.map((type) =>
          seen.includes(type) ? (
            <EnemyCard
              key={type}
              type={type}
              wave={wave}
              difficulty={difficulty}
              destroyed={kills[type] ?? 0}
            />
          ) : (
            <LockedEnemyCard key={type} type={type} />
          ),
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xl,
    padding: spacing.lg,
  },
  summaryText: {
    flexGrow: 1,
    flexBasis: 220,
    gap: 2,
  },
  scaleField: {
    flexGrow: 1,
    flexBasis: 200,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  slider: {
    flex: 1,
    height: 40,
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
  spriteBox: {
    width: SPRITE_BOX,
    height: SPRITE_BOX,
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
