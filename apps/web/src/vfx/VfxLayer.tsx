import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { graphicsPreset, useSettings } from '../store/useSettings';
import { SpritePool } from './SpritePool';
import { vfx } from './vfx';

/**
 * V1: mounts the two sprite pools (additive + blended) and plugs them into `vfx`. One per scene.
 * Capacity follows the graphics quality (600 / 1200 / 2400 sprites in total).
 */
export function VfxLayer({ tier: forced }: { tier?: 0 | 1 | 2 }) {
  const quality = useSettings((s) => s.quality);
  const gfx = graphicsPreset(quality);
  const tier = forced ?? gfx.tier;
  const cap = [300, 600, 1200][tier];
  const pools = useMemo(() => ({ add: new SpritePool(cap, true, tier === 0), blend: new SpritePool(cap, false, tier === 0) }), [cap, tier]);
  useEffect(() => {
    vfx.add = pools.add;
    vfx.blend = pools.blend;
    vfx.tier = tier;
    vfx.density = [0.5, 0.75, 1][tier];
    return () => {
      if (vfx.add === pools.add) vfx.add = vfx.blend = null;
      pools.add.mesh.geometry.dispose();
      pools.blend.mesh.geometry.dispose();
    };
  }, [pools, tier]);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    pools.add.update(d);
    pools.blend.update(d);
  });
  return (
    <>
      <primitive object={pools.blend.mesh} />
      <primitive object={pools.add.mesh} />
    </>
  );
}
