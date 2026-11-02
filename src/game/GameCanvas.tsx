/**
 * The game world: a Skia canvas showing pictures produced by the controller, with pan, pinch and
 * tap gestures for moving the camera and selecting towers.
 */
import { Canvas, createPicture, Picture } from '@shopify/react-native-skia';
import type { ComponentRef } from 'react';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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

/** Zoom per wheel pixel. Trackpad pinches arrive as small wheel events with `ctrlKey` set. */
const WHEEL_ZOOM_SPEED = 0.002;
const PINCH_ZOOM_SPEED = 0.01;
/** Pixels per wheel line, for mice that report whole lines. */
const WHEEL_LINE_PX = 16;
/** Wait this long after the last wheel event before saving the zoom level. */
const WHEEL_COMMIT_MS = 250;

export function GameCanvas({
  controller,
  images,
}: {
  controller: GameController;
  images: GameImages;
}) {
  const picture = useSharedValue(createPicture(() => {}));
  const insets = useSafeAreaInsets();
  const view = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    controller.attach(picture, images);
    return () => controller.detach();
  }, [controller, images, picture]);

  // Web: the mouse wheel zooms around the cursor. Added by hand because React's wheel listeners are
  // passive, which would leave the page free to scroll as well.
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const node = view.current as unknown as HTMLElement | null;
    if (!node) {
      return;
    }
    let commit: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const pixels = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * WHEEL_LINE_PX;
      const speed = e.ctrlKey ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED;
      controller.zoomBy(Math.exp(-pixels * speed), e.clientX - rect.left, e.clientY - rect.top);
      clearTimeout(commit);
      commit = setTimeout(() => controller.commitZoom(), WHEEL_COMMIT_MS);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      clearTimeout(commit);
    };
  }, [controller]);

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
        ref={view}
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
