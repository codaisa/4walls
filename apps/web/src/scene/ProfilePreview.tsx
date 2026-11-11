import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createGame } from '@4walls/core';
import type { CharacterId } from '@4walls/shared';
import type { MatchView } from '../game/presentation';
import { PlayerAvatar } from './CharacterGLB';
import { GameContext, type SceneCtx } from './context';
import { graphicsPreset, useSettings } from '../store/useSettings';

/** Slow turntable so the player sees their character from every side. */
function Turntable({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    g.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.7;
  });
  return <group ref={g}>{children}</group>;
}

/**
 * The player's own character on a basalt pedestal (home screen). Reuses the in-game avatar
 * through a tiny read-only game state; `celebrate` plays the victory hop (e.g. right after editing).
 */
export function ProfilePreview({ characterId, colorIndex, celebrate = false, hat = null }: { characterId: CharacterId; colorIndex: number; celebrate?: boolean; hat?: string | null }) {
  const ctx = useMemo<SceneCtx>(() => {
    const state = createGame({ mode: 'versus', seed: 1, width: 15, height: 13, players: [{ id: 'me', slot: 0, colorIndex, characterId, name: '', loadout: { hat, bomb: null, fire: null, title: null } }] });
    const p = state.players[0];
    p.x = p.px = 0;
    p.y = p.py = 0;
    if (celebrate) {
      state.phase = 'ended';
      state.result = { outcome: 'winner', reason: 'lastStanding', winnerIds: ['me'] };
    }
    const view = { state, alpha: 1, tickF: 0, paused: false, on: () => () => {}, update: () => {} } satisfies MatchView;
    return { controller: view, fx: { shake: 0 }, ox: 0, oz: 0 };
  }, [characterId, colorIndex, celebrate, hat]);

  return (
    <Canvas dpr={graphicsPreset(useSettings.getState().quality).dpr} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 1.25, 3.3], fov: 32 }} shadows>
      <hemisphereLight args={['#ffe2c8', '#4a1f28', 1.1]} />
      <directionalLight position={[-3, 6, 5]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 0.3, 1.5]} color="#ff6a2c" intensity={5} distance={8} />
      <GameContext.Provider value={ctx}>
        <group position={[0, -0.35, 0]}>
          <mesh position={[0, -0.16, 0]} receiveShadow>
            <cylinderGeometry args={[0.62, 0.72, 0.3, 6]} />
            <meshStandardMaterial color="#2b1d22" roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.005, 0]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.5, 0.6, 6]} />
            <meshBasicMaterial color={new THREE.Color(2.6, 0.9, 0.25)} toneMapped={false} />
          </mesh>
          <Turntable>
            <PlayerAvatar key={`${characterId}-${colorIndex}-${hat}`} playerId="me" />
          </Turntable>
        </group>
      </GameContext.Provider>
    </Canvas>
  );
}
