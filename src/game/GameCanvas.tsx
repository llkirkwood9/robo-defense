/**
 * The game world: a Skia canvas showing pictures produced by the controller, with pan, pinch and
 * tap gestures for moving the camera and selecting towers.
 */
import { Canvas, createPicture, Picture } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GameImages } from '@/render/images';

import type { GameController } from './GameController';

/** Room left for the HUD and the build dock when scrolling to the map edges. */
const HUD_HEIGHT = 64;
const DOCK_HEIGHT = 110;

export function GameCanvas({
  controller,
  images,
}: {
  controller: GameController;
  images: GameImages;
}) {
  const picture = useSharedValue(createPicture(() => {}));
  const insets = useSafeAreaInsets();

  useEffect(() => {
    controller.attach(picture, images);
    return () => controller.detach();
  }, [controller, images, picture]);

  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 6,
    onUpdate: (e) => controller.panBy(e.changeX, e.changeY),
  });
  const pinch = usePinchGesture({
    runOnJS: true,
    onUpdate: (e) => controller.zoomBy(e.scaleChange, e.focalX, e.focalY),
    onDeactivate: () => controller.commitZoom(),
  });
  const tap = useTapGesture({
    runOnJS: true,
    maxDistance: 12,
    onDeactivate: (e) => {
      if (!e.canceled) controller.tapAt(e.x, e.y);
    },
  });
  const camera = useSimultaneousGestures(pan, pinch);
  const gesture = useCompetingGestures(tap, camera);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          controller.resize(width, height, {
            top: insets.top + HUD_HEIGHT,
            bottom: insets.bottom + DOCK_HEIGHT,
            left: insets.left + 8,
            right: insets.right + 8,
          });
        }}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Picture picture={picture} />
        </Canvas>
      </View>
    </GestureDetector>
  );
}
