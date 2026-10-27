/**
 * Full-screen and toast overlays for the game screen: the start card, pause menu, end-of-game
 * score summary (port of `ScoreOverlay`), messages, achievement alerts (port of
 * `AchievementAlert`), the wave banner and the developer cheat panel.
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeOut,
  FadeOutRight,
  FadeOutUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACHIEVEMENT_DEFS } from '@/engine/data/achievements';
import { RunState } from '@/engine/constants';
import { ENEMIES, ENEMY_TYPE_COUNT } from '@/engine/enemies';
import type { GameOutcome, ScoreSummary } from '@/engine/gameState';
import { useStore } from '@/lib/store';
import { GlassGroup, GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Icon } from '@/ui/Icon';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

import type { FeedState, GameController, HudState } from './GameController';

const selectRunState = (h: HudState) => h.runState;
const selectDifficulty = (h: HudState) => h.difficulty;
const selectGameOver = (f: FeedState) => f.gameOver;
const selectMessages = (f: FeedState) => f.messages;
const selectAchievements = (f: FeedState) => f.achievements;
const selectBanner = (f: FeedState) => f.levelBanner;

function Scrim({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.scrim}
    >
      {onPress && (
        <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessible={false} />
      )}
      {children}
    </Animated.View>
  );
}

// ---- Start ------------------------------------------------------------------------------------

const INSTRUCTIONS: { icon: 'shield' | 'bolt' | 'upgrade' | 'fastForward'; text: string }[] = [
  { icon: 'shield', text: 'Stop the robots from crossing the map.' },
  {
    icon: 'bolt',
    text: 'Drag towers from the dock onto the map. Towers can reshape the path, but never block it.',
  },
  { icon: 'upgrade', text: 'Tap a tower to upgrade or sell it.' },
  { icon: 'fastForward', text: 'Drag to scroll, pinch to zoom. Fast-forward when you’re ready.' },
];

export function StartCard({ controller }: { controller: GameController }) {
  const runState = useStore(controller.hud, selectRunState);
  const difficulty = useStore(controller.hud, selectDifficulty);
  const gameOver = useStore(controller.feed, selectGameOver);
  if (runState !== RunState.NotStarted || gameOver) {
    return null;
  }
  const { config } = controller;
  return (
    <Scrim onPress={() => controller.startGame()}>
      <Animated.View entering={FadeIn.duration(180)}>
        <GlassSurface radius={radii.lg} style={styles.card}>
          <Text variant="caption" style={styles.kicker}>
            {config.survival ? 'SURVIVAL MODE' : `DIFFICULTY ${difficulty}`}
            {config.towerMixSeed > 0 ? ' · TOWER MIX' : ''}
          </Text>
          <Text variant="title">{controller.mapName}</Text>
          <View style={styles.list}>
            {INSTRUCTIONS.map((i) => (
              <View key={i.text} style={styles.listRow}>
                <Icon name={i.icon} size={16} color={colors.accent} />
                <Text variant="body" style={styles.flex}>
                  {i.text}
                </Text>
              </View>
            ))}
          </View>
          <GlassButton
            label="Start"
            icon="play"
            tone="primary"
            size="lg"
            onPress={() => controller.startGame()}
          />
        </GlassSurface>
      </Animated.View>
    </Scrim>
  );
}

// ---- Pause ------------------------------------------------------------------------------------

export function PauseMenu({
  controller,
  onOptions,
  onGuide,
  onSaveAndExit,
  onAbandon,
  onDevTools,
}: {
  controller: GameController;
  onOptions: () => void;
  onGuide: () => void;
  onSaveAndExit: () => void;
  onAbandon: () => void;
  /** Opens the developer panel; the button is hidden when omitted. */
  onDevTools?: () => void;
}) {
  const runState = useStore(controller.hud, selectRunState);
  if (runState !== RunState.Paused) {
    return null;
  }
  return (
    <Scrim>
      <Animated.View entering={FadeIn.duration(180)}>
        <GlassSurface radius={radii.lg} style={[styles.card, styles.menuCard]}>
          <Text variant="title" style={styles.center}>
            Paused
          </Text>
          <GlassGroup spacing={10} style={styles.menu}>
            <GlassButton
              label="Resume"
              icon="play"
              tone="primary"
              size="lg"
              onPress={() => controller.togglePause()}
            />
            <View style={styles.row}>
              <GlassButton label="Guide" icon="enemies" style={styles.flex} onPress={onGuide} />
              <GlassButton
                label="Options"
                icon="settings"
                style={styles.flex}
                onPress={onOptions}
              />
            </View>
            <GlassButton label="Save & Exit" icon="save" onPress={onSaveAndExit} />
            <GlassButton label="Abandon Game" icon="exit" tone="danger" onPress={onAbandon} />
            {onDevTools && (
              <GlassButton label="Developer" icon="dev" size="sm" onPress={onDevTools} />
            )}
          </GlassGroup>
        </GlassSurface>
      </Animated.View>
    </Scrim>
  );
}

// ---- Game over --------------------------------------------------------------------------------

function summaryRows(s: ScoreSummary): [string, number][] {
  const rows: [string, number][] = [['Score', s.score]];
  if (s.wonBonus > 0) rows.push(['Victory bonus', s.wonBonus]);
  if (s.healthBonus > 0) rows.push(['Remaining health bonus', s.healthBonus]);
  if (s.moneyBonus > 0) rows.push(['Remaining money bonus', s.moneyBonus]);
  if (s.perfectBonus > 0) rows.push(['Perfect game bonus', s.perfectBonus]);
  return rows;
}

const TITLES: Record<GameOutcome, string> = {
  won: 'Victory!',
  lost: 'Game Over',
  abandoned: 'Game Abandoned',
};

const MESSAGES: Record<GameOutcome, (level: number) => string> = {
  won: () => 'All 100 waves defeated. The next difficulty level is unlocked.',
  lost: (level) => `The robots broke through on wave ${level}.`,
  abandoned: () => 'Your score has been banked as upgrade points.',
};

export function GameOverCard({
  controller,
  onMenu,
}: {
  controller: GameController;
  onMenu: () => void;
}) {
  const result = useStore(controller.feed, selectGameOver);
  if (!result) {
    return null;
  }
  const { summary, outcome, level, newBest } = result;
  const won = outcome === 'won';
  const rows = summary ? summaryRows(summary) : [];
  return (
    <Scrim>
      <Animated.View entering={FadeIn.duration(180)}>
        <GlassSurface
          radius={radii.lg}
          tint={won ? 'rgba(40, 160, 90, 0.25)' : 'rgba(200, 40, 60, 0.2)'}
          style={styles.card}
        >
          <View style={styles.resultHeader}>
            <Icon
              name={won ? 'trophy' : 'shield'}
              size={28}
              color={won ? colors.gold : colors.danger}
            />
            <Text variant="title">{TITLES[outcome]}</Text>
          </View>
          <Text variant="caption">{MESSAGES[outcome](level)}</Text>

          {summary && (
            <View style={styles.summary}>
              {rows.map(([label, value], i) => (
                <Animated.View
                  key={label}
                  entering={FadeInDown.delay(250 + i * 220)}
                  style={styles.summaryRow}
                >
                  <Text variant="body" color={colors.textDim}>
                    {label}
                  </Text>
                  <Text variant="stat" color={colors.gold}>
                    {value.toLocaleString()}
                  </Text>
                </Animated.View>
              ))}
              <Animated.View
                entering={FadeInDown.delay(250 + rows.length * 220)}
                style={[styles.summaryRow, styles.totalRow]}
              >
                <Text variant="label">Upgrade points earned</Text>
                <Text variant="stat" style={styles.total}>
                  {summary.total.toLocaleString()}
                </Text>
              </Animated.View>
              {newBest && (
                <Animated.View
                  entering={FadeInDown.delay(450 + rows.length * 220)}
                  style={styles.bestRow}
                >
                  <Icon name="star" size={16} color={colors.gold} />
                  <Text variant="label" color={colors.gold}>
                    New personal best!
                  </Text>
                </Animated.View>
              )}
            </View>
          )}

          <View style={styles.row}>
            <GlassButton
              label="Play Again"
              icon="restart"
              tone="primary"
              style={styles.flex}
              onPress={() => controller.startGame()}
            />
            <GlassButton label="Main Menu" icon="exit" style={styles.flex} onPress={onMenu} />
          </View>
        </GlassSurface>
      </Animated.View>
    </Scrim>
  );
}

// ---- Toasts -----------------------------------------------------------------------------------

export function MessageToasts({ controller }: { controller: GameController }) {
  const insets = useSafeAreaInsets();
  const messages = useStore(controller.feed, selectMessages);
  const latest = messages[messages.length - 1];
  useEffect(() => {
    if (!latest) return;
    const id = setTimeout(() => controller.dismissToast(latest.id), latest.error ? 3000 : 1800);
    return () => clearTimeout(id);
  }, [latest, controller]);
  return (
    <View
      pointerEvents="none"
      style={[styles.toasts, { left: insets.left + spacing.md, top: insets.top + 72 }]}
    >
      {messages.slice(-3).map((m) => (
        <Animated.View key={m.id} entering={FadeInDown} exiting={FadeOutUp}>
          <GlassSurface radius={radii.pill} style={styles.toast}>
            <Text variant="label" color={m.error ? colors.danger : colors.text}>
              {m.text}
            </Text>
          </GlassSurface>
        </Animated.View>
      ))}
    </View>
  );
}

export function AchievementToast({ controller }: { controller: GameController }) {
  const insets = useSafeAreaInsets();
  const queue = useStore(controller.feed, selectAchievements);
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const id = setTimeout(() => controller.dismissAchievement(current.id), 3200);
    return () => clearTimeout(id);
  }, [current, controller]);
  if (!current) {
    return null;
  }
  const def = ACHIEVEMENT_DEFS[current.index];
  return (
    <Animated.View
      key={current.id}
      pointerEvents="none"
      entering={FadeInRight.duration(220)}
      exiting={FadeOutRight}
      style={[styles.achievement, { right: insets.right + spacing.md, top: insets.top + 72 }]}
    >
      <GlassSurface
        radius={radii.lg}
        tint="rgba(255, 200, 60, 0.18)"
        style={styles.achievementCard}
      >
        <Icon name="trophy" size={28} color={colors.gold} />
        <View style={styles.flex}>
          <Text variant="caption" color={colors.gold}>
            ACHIEVEMENT EARNED
          </Text>
          <Text variant="label" numberOfLines={1}>
            {def.name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            +1 kill bonus
          </Text>
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

export function LevelBanner({ controller }: { controller: GameController }) {
  const banner = useStore(controller.feed, selectBanner);
  useEffect(() => {
    if (!banner) return;
    // Linger longer when there's a wave preview to read.
    const id = setTimeout(
      () => controller.feed.set({ levelBanner: null }),
      banner.preview ? 2600 : 1400,
    );
    return () => clearTimeout(id);
  }, [banner, controller]);
  if (!banner) {
    return null;
  }
  return (
    <Animated.View
      key={banner.id}
      pointerEvents="none"
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(400)}
      style={styles.banner}
    >
      <Text variant="caption" style={styles.kicker}>
        INCOMING
      </Text>
      <Text variant="display" style={styles.bannerText}>
        WAVE {banner.level}
      </Text>
      {banner.preview ? (
        <Text variant="label" style={styles.bannerPreview}>
          {banner.preview}
        </Text>
      ) : null}
    </Animated.View>
  );
}

// ---- Developer --------------------------------------------------------------------------------

function DevRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.devRow}>
      <Text variant="caption" style={styles.devLabel}>
        {label}
      </Text>
      <View style={styles.devButtons}>{children}</View>
    </View>
  );
}

/** Cheats for testing, shown in place of the pause menu (development builds only). */
export function DevPanel({
  controller,
  onClose,
}: {
  controller: GameController;
  onClose: () => void;
}) {
  const runState = useStore(controller.hud, selectRunState);
  const paused = runState === RunState.Paused;
  // Close when the game resumes or ends (e.g. after skipping the last wave).
  useEffect(() => {
    if (!paused) onClose();
  }, [paused, onClose]);
  if (!paused) {
    return null;
  }
  const cheat = (apply: Parameters<GameController['cheat']>[0]) => () => controller.cheat(apply);
  return (
    <Scrim>
      <Animated.View entering={FadeIn.duration(180)}>
        <GlassSurface radius={radii.lg} style={[styles.card, styles.devCard]}>
          <View style={styles.resultHeader}>
            <Icon name="dev" size={22} color={colors.accent} />
            <Text variant="title" style={styles.flex}>
              Developer
            </Text>
            <GlassButton icon="close" size="sm" accessibilityLabel="Close" onPress={onClose} />
          </View>
          <ScrollView style={styles.devScroll} contentContainerStyle={styles.devList}>
            <DevRow label="Money">
              {[100, 1_000, 10_000].map((n) => (
                <GlassButton
                  key={n}
                  label={`+$${n.toLocaleString()}`}
                  size="sm"
                  onPress={cheat((s) => s.devAddMoney(n))}
                />
              ))}
            </DevRow>
            <DevRow label="Health">
              {[1, 10, 100].map((n) => (
                <GlassButton
                  key={n}
                  label={`+${n}`}
                  size="sm"
                  onPress={cheat((s) => s.devAddHealth(n))}
                />
              ))}
              <GlassButton label="−1" size="sm" onPress={cheat((s) => s.devAddHealth(-1))} />
            </DevRow>
            <DevRow label="Score">
              {[1_000, 100_000].map((n) => (
                <GlassButton
                  key={n}
                  label={`+${n.toLocaleString()}`}
                  size="sm"
                  onPress={cheat((s) => s.devAddScore(n))}
                />
              ))}
            </DevRow>
            <DevRow label="Waves">
              <GlassButton label="Skip wave" size="sm" onPress={cheat((s) => s.devSkipWave())} />
              <GlassButton
                label="Skip 10"
                size="sm"
                onPress={cheat((s) => {
                  for (let i = 0; i < 10 && s.isActive; i++) s.devSkipWave();
                })}
              />
              <GlassButton label="Kill all" size="sm" onPress={cheat((s) => s.devKillAll())} />
            </DevRow>
            <DevRow label="Spawn">
              {Array.from({ length: ENEMY_TYPE_COUNT }, (_, type) => (
                <GlassButton
                  key={type}
                  label={ENEMIES[type].name}
                  size="sm"
                  onPress={cheat((s) => s.devSpawn(type))}
                />
              ))}
            </DevRow>
            <DevRow label="End game">
              <GlassButton
                label="Win"
                icon="trophy"
                size="sm"
                onPress={cheat((s) => s.devEndGame(true))}
              />
              <GlassButton
                label="Lose"
                tone="danger"
                size="sm"
                onPress={cheat((s) => s.devEndGame(false))}
              />
            </DevRow>
          </ScrollView>
          <GlassButton
            label="Resume"
            icon="play"
            tone="primary"
            onPress={() => controller.togglePause()}
          />
        </GlassSurface>
      </Animated.View>
    </Scrim>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 460,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  menuCard: {
    width: 320,
  },
  menu: {
    gap: spacing.md,
  },
  kicker: {
    letterSpacing: 3,
    color: colors.accent,
    fontWeight: '700',
  },
  center: {
    textAlign: 'center',
  },
  list: {
    gap: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  summary: {
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  total: {
    fontSize: 20,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  toasts: {
    position: 'absolute',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  toast: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  achievement: {
    position: 'absolute',
    width: 300,
  },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '38%',
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 34,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 12,
  },
  bannerPreview: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xl,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 8,
  },
  devCard: {
    width: 560,
    maxWidth: '94%',
    maxHeight: '94%',
    padding: spacing.lg,
    gap: spacing.md,
  },
  devScroll: {
    flexShrink: 1,
  },
  devList: {
    gap: spacing.md,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  devLabel: {
    width: 64,
  },
  devButtons: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
