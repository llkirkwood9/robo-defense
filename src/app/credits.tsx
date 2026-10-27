/**
 * Credits (port of `CreditsActivity`).
 */
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { APP_VERSION } from '@/services/version';
import { GlassSurface } from '@/ui/Glass';
import { GlassButton } from '@/ui/GlassButton';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { colors, radii, spacing } from '@/ui/theme';

const SOUND_CREDITS = [
  'fire crackling from dobroide',
  'military exercise from juskiddink',
  'heavy burst from alienbomb',
  'rocket from nthompson',
  'swoophoversplit3 from ignotus',
];

export default function CreditsScreen() {
  return (
    <Screen backdrop="cross_level" contentStyle={styles.content}>
      <GlassSurface radius={radii.lg} style={styles.card}>
        <Text variant="title">Robo Defense - {APP_VERSION}</Text>
        <Text variant="body" color={colors.textDim}>
          Original game - Lupis Labs Software
        </Text>
        <Text variant="body" color={colors.textDim}>
          Port - Logan Kirkwood
        </Text>
      </GlassSurface>
      <GlassSurface radius={radii.lg} style={styles.card}>
        <Text variant="heading">Sound effects</Text>
        <Text variant="body" color={colors.textDim}>
          Robo Defense uses the following sound files from Freesound:
        </Text>
        <View style={styles.list}>
          {SOUND_CREDITS.map((c) => (
            <Text key={c} variant="body">
              • {c}
            </Text>
          ))}
        </View>
        <GlassButton
          label="freesound.org"
          size="sm"
          style={styles.link}
          onPress={() => WebBrowser.openBrowserAsync('https://freesound.org')}
        />
      </GlassSurface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 640,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  list: {
    gap: 2,
  },
  link: {
    alignSelf: 'flex-start',
  },
});
