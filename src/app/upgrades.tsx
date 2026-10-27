/**
 * Upgrade shop (port of `RewardActivity`): spend upgrade points on permanent upgrades.
 */
import { StyleSheet, View } from 'react-native';

import type { RewardInfo } from '@/engine/rewards';
import { useStore } from '@/lib/store';
import { haptics } from '@/services/haptics';
import { profileStore, rewards } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Icon } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

const selectPoints = (s: ReturnType<typeof profileStore.get>) => s.rewardPoints;
const selectVersion = (s: ReturnType<typeof profileStore.get>) => s.rewardsVersion;

function RewardCard({ info }: { info: RewardInfo }) {
  const owned = info.isMaxed;
  const buy = () => {
    if (rewards.tryBuy(info.type)) {
      haptics.success();
    }
  };
  return (
    <GlassSurface radius={radii.lg} style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text variant="heading" color={owned ? colors.gold : colors.text}>
            {info.name}
          </Text>
          <Text variant="caption" color={colors.accent}>
            {info.blockedBy ??
              (info.isUnlock ? (owned ? 'Unlocked' : 'One-time unlock') : `Next: ${info.status}`)}
          </Text>
        </View>
        {owned ? (
          <Icon name="check" size={22} color={colors.success} />
        ) : (
          <GlassButton
            label={info.isUnlock ? 'Unlock' : 'Upgrade'}
            size="sm"
            tone="primary"
            disabled={!info.affordable}
            onPress={buy}
          />
        )}
      </View>
      <Text variant="body" color={colors.textDim}>
        {info.description}
      </Text>
      {!owned && (
        <View style={styles.cost}>
          <Icon name="rewards" size={14} color={info.affordable ? colors.gold : colors.textFaint} />
          <Text
            variant="stat"
            style={styles.costText}
            color={info.affordable ? colors.gold : colors.textFaint}
          >
            {info.cost.toLocaleString()}
          </Text>
        </View>
      )}
    </GlassSurface>
  );
}

export default function UpgradesScreen() {
  const points = useStore(profileStore, selectPoints);
  useStore(profileStore, selectVersion);
  const all = rewards.allInfo();

  return (
    <Screen backdrop="threeway_level">
      <GlassSurface radius={radii.lg} style={styles.balance}>
        <Icon name="rewards" size={26} color={colors.gold} />
        <View style={styles.flex}>
          <Text variant="caption">UPGRADE POINTS</Text>
          <Text variant="title" color={colors.gold}>
            {points.toLocaleString()}
          </Text>
        </View>
        <Text variant="caption" style={styles.hint}>
          Earn points by finishing games. Winning, staying healthy and saving cash add bonuses.
        </Text>
      </GlassSurface>
      <View style={styles.grid}>
        {all.map((info) => (
          <RewardCard key={info.type} info={info} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  hint: {
    flex: 1.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    flexGrow: 1,
    flexBasis: 300,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  costText: {
    fontSize: 13,
  },
  flex: {
    flex: 1,
  },
});
