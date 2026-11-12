import { useFrame } from '@react-three/fiber';
import { useState } from 'react';
import { AdventureProps } from './AdventureProps';
import { Arena } from './Arena';
import { Cages } from './Cages';
import { useGame } from './context';
import { Gates } from './Gates';
import type { ArenaTheme } from './themes';

/**
 * The endless Adventure's live regions. Regions join and leave the window as the group travels;
 * every static mesh (instanced floor, walls, gates, cages, props) is rebuilt when that happens.
 */
export function AdventureWorld({ theme }: { theme: ArenaTheme }) {
  const { controller } = useGame();
  const keyOf = () => controller.state.adventure?.windowKey ?? '';
  const [windowKey, setWindowKey] = useState(keyOf);
  useFrame(() => {
    const k = keyOf();
    if (k !== windowKey) setWindowKey(k);
  });
  return (
    <group key={windowKey}>
      <Arena theme={theme} />
      <Gates />
      <Cages />
      <AdventureProps />
    </group>
  );
}
