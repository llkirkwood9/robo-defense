/**
 * Renders single frames of the game's sprite sheets with regular React Native images, for use in
 * menus and HUD controls (the game world itself is drawn with Skia).
 */
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import type { SpriteId } from '@/engine/data/sprites';
import { SPRITES } from '@/engine/data/sprites';
import type { TowerProps } from '@/engine/towers';
import { SPRITE_SOURCES } from '@/render/assets';

/**
 * One frame of a sprite sheet, scaled so the frame is `width` points wide. `tintColor` paints every
 * opaque pixel in one color (used for locked silhouettes).
 */
export function SpriteFrame({
  sprite,
  frame = 0,
  width,
  style,
  tintColor,
}: {
  sprite: SpriteId;
  frame?: number;
  width: number;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
}) {
  const sheet = SPRITES[sprite];
  const scale = width / sheet.frameWidth;
  return (
    // Decorative: never the touch target (lets drags start on the parent, and avoids the browser's
    // native image dragging on web).
    <View
      pointerEvents="none"
      style={[{ width, height: sheet.frameHeight * scale, overflow: 'hidden' }, style]}
    >
      <Image
        source={SPRITE_SOURCES[sprite]}
        style={{
          width: sheet.frameWidth * sheet.frames * scale,
          height: sheet.frameHeight * scale,
          transform: [{ translateX: -frame * sheet.frameWidth * scale }],
        }}
        contentFit="fill"
        tintColor={tintColor}
      />
    </View>
  );
}

/** A tower icon: base plus turret facing down, as on the original build buttons. */
export function TowerIcon({
  props,
  size,
  tintColor,
}: {
  props: TowerProps;
  size: number;
  tintColor?: string;
}) {
  if (!props.sprite) {
    return <View style={{ width: size, height: size }} />;
  }
  const scale = size / 70;
  const turretOffset = props.towerHeight * scale;
  const turretFrame =
    props.directions === 0
      ? -1
      : props.animated
        ? 1
        : Math.trunc((props.directions * 270) / 360) + 1;
  return (
    <View style={{ width: size, height: size + turretOffset }}>
      <SpriteFrame
        sprite={props.sprite}
        frame={0}
        width={size}
        style={{ marginTop: turretOffset }}
        tintColor={tintColor}
      />
      {turretFrame >= 0 && (
        <SpriteFrame
          sprite={props.sprite}
          frame={turretFrame}
          width={size}
          style={styles.turret}
          tintColor={tintColor}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  turret: { position: 'absolute', top: 0, left: 0 },
});
