/**
 * Root layout: fonts, gesture handling, theme and the native stack.
 *
 * Sub-screens use the native header so iOS 26 renders Liquid Glass navigation bars and back
 * buttons; the title and game screens draw their own chrome.
 */
import { Orbitron_600SemiBold, Orbitron_800ExtraBold, useFonts } from '@expo-google-fonts/orbitron';
import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { preloadSprites } from '@/render/images';
import { colors, fonts } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surfaceStrong,
    primary: colors.accent,
    text: colors.text,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Orbitron_600SemiBold, Orbitron_800ExtraBold });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
      // Decode sprite sheets in the background so the first game starts instantly.
      preloadSprites().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" hidden />
        <Stack
          screenOptions={{
            headerTintColor: colors.text,
            headerTitleStyle: { fontFamily: fonts.displayMedium, fontSize: 17 },
            headerBackButtonDisplayMode: 'minimal',
            // iOS 26 draws a Liquid Glass bar when no header background is set.
            headerStyle:
              Platform.OS === 'android' ? { backgroundColor: colors.background } : undefined,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="new-game" options={{ title: 'New Game' }} />
          <Stack.Screen name="codes" options={{ title: 'Codes' }} />
          <Stack.Screen
            name="game"
            options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}
          />
          <Stack.Screen name="upgrades" options={{ title: 'Upgrades' }} />
          <Stack.Screen name="achievements" options={{ title: 'Achievements' }} />
          <Stack.Screen name="guide" options={{ title: 'Guide' }} />
          <Stack.Screen name="dev" options={{ title: 'Developer' }} />
          <Stack.Screen name="options" options={{ title: 'Options' }} />
          <Stack.Screen name="credits" options={{ title: 'Credits' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
