/**
 * Code entry (port of `MixerSelectActivity`): the VR Training map code and/or the Tower Mix code.
 *
 * Codes have five digits shown least-significant first, as in the original. A map code's first
 * digit is a letter A-E selecting the number of paths (E = a single fixed path).
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { describeVrCode, MapType } from '@/engine/maps';
import { useStore } from '@/lib/store';
import { haptics } from '@/services/haptics';
import { profileStore, towerMixUnlocked, updateNewGame } from '@/services/profile';
import { GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

const DIGITS = 5;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const digitsOf = (code: number) =>
  Array.from({ length: DIGITS }, (_, i) => Math.trunc(code / 10 ** i) % 10);
const codeOf = (digits: number[]) => digits.reduce((sum, d, i) => sum + d * 10 ** i, 0);

function CodeEditor({
  title,
  description,
  code,
  lettered,
  onChange,
}: {
  title: string;
  description: string;
  code: number;
  /** First digit is a letter A-E. */
  lettered: boolean;
  onChange: (code: number) => void;
}) {
  const digits = digitsOf(code);
  if (lettered) {
    digits[0] = digits[0] % LETTERS.length;
  }
  const step = (index: number, delta: number) => {
    const base = lettered && index === 0 ? LETTERS.length : 10;
    const next = [...digits];
    next[index] = (next[index] + delta + base) % base;
    haptics.selection();
    onChange(codeOf(next));
  };
  const randomize = () => {
    haptics.impact();
    const next = digitsOf(Math.floor(Math.random() * 100000));
    if (lettered) next[0] %= LETTERS.length;
    onChange(codeOf(next));
  };

  return (
    <GlassSurface radius={radii.lg} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <Text variant="title">{title}</Text>
          <Text variant="caption">{description}</Text>
        </View>
        <GlassButton label="Randomize" icon="shuffle" size="sm" onPress={randomize} />
      </View>
      <View style={styles.digits}>
        {digits.map((d, i) => (
          <View key={i} style={styles.digit}>
            <GlassButton
              icon="up"
              size="sm"
              accessibilityLabel={`Increase digit ${i + 1}`}
              onPress={() => step(i, 1)}
            />
            <GlassSurface radius={radii.md} style={styles.digitFace}>
              <Text variant="title" style={styles.digitText}>
                {lettered && i === 0 ? LETTERS[d] : d}
              </Text>
            </GlassSurface>
            <GlassButton
              icon="down"
              size="sm"
              accessibilityLabel={`Decrease digit ${i + 1}`}
              onPress={() => step(i, -1)}
            />
          </View>
        ))}
      </View>
    </GlassSurface>
  );
}

const selectNewGame = (s: ReturnType<typeof profileStore.get>) => s.newGame;

export default function CodesScreen() {
  const settings = useStore(profileStore, selectNewGame);
  const showMap = settings.mapType === MapType.VrTraining;
  const showMix = towerMixUnlocked() && settings.towerMixEnabled;
  const vr = describeVrCode(settings.mapCode);

  return (
    <Screen backdrop="mixer_level" contentStyle={styles.content}>
      <View style={styles.editors}>
        {showMap && (
          <CodeEditor
            title="VR Training Map"
            description={`Enter any map code. ${
              vr.fixedPath
                ? 'E codes build one fixed path.'
                : `This code has ${vr.paths} path${vr.paths > 1 ? 's' : ''}.`
            }`}
            code={settings.mapCode}
            lettered
            onChange={(mapCode) => updateNewGame({ mapCode })}
          />
        )}
        {showMix && (
          <CodeEditor
            title="Tower Mix"
            description="Try different codes to vary tower properties in interesting ways."
            code={settings.towerMixCode}
            lettered={false}
            onChange={(towerMixCode) => updateNewGame({ towerMixCode })}
          />
        )}
      </View>
      <GlassButton
        label="Start Game"
        icon="play"
        tone="primary"
        size="lg"
        style={styles.start}
        onPress={() => {
          haptics.impact();
          router.replace('/game');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
  editors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  card: {
    width: 380,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  digits: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  digit: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  digitFace: {
    width: 52,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {
    fontSize: 28,
    color: colors.text,
  },
  start: {
    minWidth: 260,
  },
  flex: {
    flex: 1,
  },
});
