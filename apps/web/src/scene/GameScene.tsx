import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { STARTER_CHARACTERS, type ArenaId, type CharacterId } from '@4walls/shared';
import { RootSpikes } from './RootSpikes';
import { music } from '../audio/Music';
import * as THREE from 'three';
import type { MatchView } from '../game/presentation';
import { Arena } from './Arena';
import { Bombs } from './Bombs';
import { CameraRig } from './CameraRig';
import { PlayerAvatar, preloadHeroes } from './CharacterGLB';
import { Cages } from './Cages';
import { Enemies } from './Enemies';
import { Flames } from './Flames';
import { Fx } from './Fx';
import { GameContext, useGame, type SceneCtx } from './context';
import { Lava } from './Lava';
import { Hazards } from './Hazards';
import { Gates } from './Gates';
import { Boss } from './Boss';
import { Powerups } from './Powerups';
import { THEMES } from './themes';
import { graphicsPreset, useSettings } from '../store/useSettings';

/** Steps the simulation once per rendered frame, before any visual reads the state. */
function GameLoop() {
  const { controller } = useGame();
  useFrame((_, dt) => controller.update(dt), -1);
  return null;
}

/** FPS readout (settings → "Mostrar FPS"): measured inside the render loop, drawn in HTML. */
function FpsProbe({ out }: { out: React.RefObject<HTMLDivElement | null> }) {
  const acc = useMemo(() => ({ frames: 0, time: 0 }), []);
  useFrame((_, dt) => {
    acc.frames++;
    acc.time += dt;
    if (acc.time >= 0.5) {
      if (out.current) out.current.textContent = `${Math.round(acc.frames / acc.time)} FPS`;
      acc.frames = 0;
      acc.time = 0;
    }
  });
  return null;
}

export function GameScene({ controller }: { controller: MatchView }) {
  const quality = useSettings((s) => s.quality);
  const showFps = useSettings((s) => s.showFps);
  const gfx = graphicsPreset(quality);
  const fpsRef = useRef<HTMLDivElement>(null);
  // Adventure has caged heroes: fetch their models while the players explore, and any hero
  // somebody already plays as.
  useEffect(() => {
    if (controller.state.adventure || controller.state.players.some((p) => !STARTER_CHARACTERS.includes(p.characterId as CharacterId))) preloadHeroes();
  }, [controller]);
  const ctx = useMemo<SceneCtx>(() => {
    const { w, h } = controller.state.grid;
    return { controller, fx: { shake: 0 }, ox: -(w - 1) / 2, oz: -(h - 1) / 2 };
  }, [controller]);
  // Boss Rush: the arena dresses for whoever is fighting (the Guardião brings the forest).
  const [arenaTheme, setArenaTheme] = useState<ArenaId>(controller.state.config.arenaId ?? 'caldeira');
  useEffect(() => {
    if (controller.state.mode !== 'bossrush') return;
    const id = window.setInterval(() => {
      const kind = controller.state.boss?.kind;
      if (kind) setArenaTheme(kind === 'guardian' ? 'floresta' : 'caldeira');
    }, 250);
    return () => window.clearInterval(id);
  }, [controller]);
  const theme = THEMES[arenaTheme];
  useEffect(() => {
    music.play(theme.music);
    return () => music.stop();
  }, [theme.music]);

  return (
    <>
    <Canvas
      // Remount when the quality changes: shadows / post-processing are fixed at creation.
      key={quality}
      shadows={gfx.shadows}
      dpr={gfx.dpr}
      camera={{ fov: 38, near: 0.5, far: 140, position: [0, 18, 14] }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        // With post-processing the ToneMapping effect does it; without, the renderer must.
        gl.toneMapping = gfx.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      }}
    >
      <GameContext.Provider value={ctx}>
        <color attach="background" args={[theme.background]} />
        <fog attach="fog" args={[theme.background, theme.fog[0], theme.fog[1]]} />
        <GameLoop />
        <hemisphereLight args={theme.hemi} />
        <ambientLight intensity={0.15} color={theme.ambient} />
        <directionalLight
          name="KeyLight"
          position={[-8, 18, 10]}
          intensity={theme.sun.intensity}
          color={theme.sun.color}
          castShadow={gfx.shadows}
          shadow-mapSize={[gfx.shadowMap, gfx.shadowMap]}
          shadow-camera-left={-13}
          shadow-camera-right={13}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-camera-near={1}
          shadow-camera-far={50}
          shadow-bias={-0.0006}
          shadow-normalBias={0.02}
        />
        <directionalLight position={[10, 6, -12]} intensity={theme.rim.intensity} color={theme.rim.color} />
        <Lava
          key={`lava-${arenaTheme}`}
          fogColor={theme.background}
          variant={theme.liquid}
          fog={theme.fog}
          half={controller.state.adventure ? undefined : [controller.state.grid.w / 2 + 0.35, controller.state.grid.h / 2 + 0.35]}
        />
        <Arena key={`arena-${arenaTheme}`} theme={theme} />
        <Hazards />
        {controller.state.adventure && <Gates />}
        {controller.state.adventure && <Cages />}
        {controller.state.mode === 'bossrush' && <Boss />}
        {controller.state.mode === 'bossrush' && <RootSpikes />}
        {controller.state.players.map((p) => (
          <PlayerAvatar key={p.id} playerId={p.id} />
        ))}
        <Bombs />
        <Powerups />
        <Enemies />
        <Flames />
        <Fx />
        <CameraRig />
        {gfx.post && (
          <EffectComposer multisampling={gfx.msaa}>
            <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.7} />
            <Vignette offset={0.25} darkness={0.6} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
        {showFps && <FpsProbe out={fpsRef} />}
      </GameContext.Provider>
    </Canvas>
    {showFps && (
      <div ref={fpsRef} className="pointer-events-none absolute bottom-1 left-1/2 z-30 -translate-x-1/2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[11px] text-lime-300" data-testid="fps" />
    )}
    </>
  );
}
