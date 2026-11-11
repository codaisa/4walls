import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { createGame } from '@4walls/core';
import { MAX_LOCAL_PLAYERS, type LobbyPlayer } from '../store/useMatchSetup';
import type { MatchView } from '../game/presentation';
import { PlayerAvatar } from './CharacterGLB';
import { GameContext, type SceneCtx } from './context';
import { graphicsPreset, useSettings } from '../store/useSettings';

/** World X of each lobby column, so characters line up with the HTML slot cards below. */
const columnX = (slot: number) => (slot - (MAX_LOCAL_PLAYERS - 1) / 2) * 1.6;

/** Ortho camera whose width always spans exactly the four columns. */
function FitCamera() {
  const { camera, size } = useThree();
  useFrame(() => {
    const cam = camera as THREE.OrthographicCamera;
    const worldWidth = MAX_LOCAL_PLAYERS * 1.6;
    cam.zoom = size.width / worldWidth;
    cam.position.set(0, 1.6, 6);
    cam.lookAt(0, 0.55, 0);
    cam.updateProjectionMatrix();
  });
  return null;
}

/**
 * 3D lobby strip: every joined player's character on a basalt pedestal. Ready players celebrate.
 * Reuses the in-game <Character> by feeding it a tiny read-only view of a game state.
 */
export function LobbyPreview({ players }: { players: (LobbyPlayer & { hat?: string | null })[] }) {
  const ctx = useMemo<SceneCtx>(() => {
    const state = createGame({
      mode: 'versus',
      seed: 1,
      width: 15,
      height: 13,
      players: players.map((p) => ({ id: `s${p.slot}`, slot: p.slot, colorIndex: p.colorIndex, characterId: p.characterId, name: '', ...(p.hat ? { loadout: { hat: p.hat, bomb: null, fire: null, title: null } } : {}) })),
    });
    for (const p of state.players) {
      p.x = p.px = columnX(p.slot);
      p.y = p.py = 0;
    }
    state.phase = 'ended';
    state.result = { outcome: 'winner', reason: 'lastStanding', winnerIds: players.filter((p) => p.ready).map((p) => `s${p.slot}`) };
    const view = { state, alpha: 1, tickF: 0, paused: false, on: () => () => {}, update: () => {} } satisfies MatchView;
    return { controller: view, fx: { shake: 0 }, ox: 0, oz: 0 };
  }, [players]);

  return (
    <Canvas orthographic dpr={graphicsPreset(useSettings.getState().quality).dpr} gl={{ alpha: true, antialias: true }} camera={{ near: 0.1, far: 50 }} shadows>
      <FitCamera />
      <hemisphereLight args={['#ffe2c8', '#4a1f28', 1.1]} />
      <directionalLight position={[-3, 6, 5]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 0.3, 1.5]} color="#ff6a2c" intensity={6} distance={8} />
      <GameContext.Provider value={ctx}>
        {Array.from({ length: MAX_LOCAL_PLAYERS }, (_, slot) => (
          <group key={slot} position={[columnX(slot), 0, 0]}>
            <mesh position={[0, -0.16, 0]} receiveShadow>
              <cylinderGeometry args={[0.62, 0.72, 0.3, 6]} />
              <meshStandardMaterial color="#3a3040" roughness={0.85} flatShading />
            </mesh>
            <mesh position={[0, -0.005, 0]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.5, 0.56, 6]} />
              <meshBasicMaterial color={new THREE.Color(2, 0.6, 0.15)} toneMapped={false} />
            </mesh>
          </group>
        ))}
        {ctx.controller.state.players.map((p) => (
          <PlayerAvatar key={`${p.id}-${p.colorIndex}-${p.characterId}`} playerId={p.id} />
        ))}
      </GameContext.Provider>
    </Canvas>
  );
}
