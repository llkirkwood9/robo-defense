/**
 * Field guide: the enemies the player has met and the towers they've bought, on separate tabs.
 */
import NativeSegmentedControl from '@react-native-segmented-control/segmented-control';
import type { SegmentedControlProps } from '@react-native-segmented-control/segmented-control';
import type { ComponentType } from 'react';
import { useState } from 'react';

import { EnemyGuide } from '@/guide/EnemyGuide';
import { TowerGuide } from '@/guide/TowerGuide';
import { Screen } from '@/ui/Screen';

// The package's class typings predate React 19's JSX types; the component itself is fine.
const SegmentedControl = NativeSegmentedControl as unknown as ComponentType<SegmentedControlProps>;

const TABS = ['Enemies', 'Towers'] as const;

export default function GuideScreen() {
  const [tab, setTab] = useState(0);

  return (
    <Screen backdrop="cross_level">
      <SegmentedControl
        values={[...TABS]}
        selectedIndex={tab}
        appearance="dark"
        onChange={(e) => setTab(e.nativeEvent.selectedSegmentIndex)}
      />
      {tab === 0 ? <EnemyGuide /> : <TowerGuide />}
    </Screen>
  );
}
