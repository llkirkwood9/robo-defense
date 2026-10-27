/**
 * Game screen (port of `GameActivity`): hosts the world canvas, HUD, build dock and overlays,
 * and handles app lifecycle (auto-pause and quick save when backgrounded or leaving).
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';

import { GameCanvas } from '@/game/GameCanvas';
import { GameController } from '@/game/GameController';
import { Hud } from '@/game/Hud';
import {
  AchievementToast,
  DevPanel,
  GameOverCard,
  LevelBanner,
  MessageToasts,
  PauseMenu,
  StartCard,
} from '@/game/Overlays';
import { TowerDock } from '@/game/TowerDock';
import { UpgradePanel } from '@/game/UpgradePanel';
import { useStore } from '@/lib/store';
import { useGameImages } from '@/render/images';
import {
  clearQuickSave,
  loadQuickSave,
  profileStore,
  sessionConfigFromSettings,
} from '@/services/profile';
import { confirm } from '@/ui/dialog';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

/** Creates the session: from the quick save when resuming, otherwise from new-game settings. */
function createController(resume: boolean): GameController {
  const save = resume ? loadQuickSave() : null;
  if (save) {
    const controller = new GameController(save.config);
    try {
      controller.load(save);
      return controller;
    } catch (err) {
      console.warn('Quick load failed', err);
      clearQuickSave();
      const fresh = new GameController(save.config);
      fresh.toast('Quick load failed, starting a new game', true);
      return fresh;
    }
  }
  return new GameController(sessionConfigFromSettings());
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

const selectKeepAwake = (s: ReturnType<typeof profileStore.get>) => s.options.keepAwake;

export default function GameScreen() {
  const { resume } = useLocalSearchParams<{ resume?: string }>();
  const [controller] = useState(() => createController(resume === '1'));
  const { images, error } = useGameImages(controller.state.layout.image);
  const keepAwake = useStore(profileStore, selectKeepAwake);
  const [devOpen, setDevOpen] = useState(false);
  const closeDev = useCallback(() => setDevOpen(false), []);

  // Pause and save whenever the app goes to the background (the original saved in onStop).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        controller.setPaused(true);
        controller.saveNow();
      }
    });
    return () => sub.remove();
  }, [controller]);

  // Save when leaving the screen by any route.
  useEffect(() => () => void controller.saveNow(), [controller]);

  // Android back: close the upgrade panel, otherwise toggle the pause menu.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (controller.hud.get().selected) {
          controller.closeUpgradePanel();
        } else if (controller.state.isActive) {
          controller.togglePause();
        } else {
          router.back();
        }
        return true;
      });
      return () => sub.remove();
    }, [controller]),
  );

  const exitToMenu = () => {
    if (router.canDismiss()) {
      router.dismissTo('/');
    } else {
      router.replace('/');
    }
  };

  const saveAndExit = () => {
    controller.saveNow();
    exitToMenu();
  };

  const abandon = () => {
    confirm(
      {
        title: 'Abandon this game?',
        message: 'Your score so far is banked as upgrade points, but the game ends.',
        confirmLabel: 'Abandon',
        destructive: true,
      },
      () => {
        controller.abandon();
        clearQuickSave();
      },
    );
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text variant="heading">Couldn’t load the game graphics.</Text>
        <Text variant="caption">{error.message}</Text>
      </View>
    );
  }
  if (!images) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {keepAwake && Platform.OS !== 'web' && <KeepAwake />}
      <GameCanvas controller={controller} images={images} />
      <Hud controller={controller} />
      <TowerDock controller={controller} />
      <LevelBanner controller={controller} />
      <MessageToasts controller={controller} />
      <AchievementToast controller={controller} />
      <UpgradePanel controller={controller} />
      <StartCard controller={controller} />
      {devOpen ? (
        <DevPanel controller={controller} onClose={closeDev} />
      ) : (
        <PauseMenu
          controller={controller}
          onOptions={() => router.push('/options')}
          onSaveAndExit={saveAndExit}
          onAbandon={abandon}
          onDevTools={__DEV__ ? () => setDevOpen(true) : undefined}
        />
      )}
      <GameOverCard controller={controller} onMenu={exitToMenu} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.background,
  },
});
