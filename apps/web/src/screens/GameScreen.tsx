import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ARENAS, ARENA_IDS, type ArenaId, type GameConfig } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { GameController, type LocalPlayerBinding } from '../game/GameController';
import { Hud } from '../hud/Hud';
import { HeroReveal } from '../ui/HeroReveal';
import { AdventureMap } from '../ui/AdventureMap';
import { ChapterCard } from '../ui/ChapterCard';
import { EdgeArrows } from '../ui/EdgeArrows';
import { TutorialHints } from '../ui/TutorialHints';
import { inputManager } from '../input/instance';
import { GameScene } from '../scene/GameScene';
import { useMatchSetup, type LocalMode } from '../store/useMatchSetup';
import { useUiHandler } from '../ui/uiInput';
import { isTouchDevice } from '../input/InputManager';
import { TouchControls } from '../ui/TouchControls';
import { useHud } from '../store/useHud';
import { myLoadout } from '../store/useAccount';

interface MatchPlan {
  mode: LocalMode;
  config: GameConfig;
  bindings: LocalPlayerBinding[];
}

const newSeed = () => (Math.random() * 2 ** 31) | 0;
const arenaConfig = (id: ArenaId) => ({ arenaId: id, width: ARENAS[id].width, height: ARENAS[id].height });

/** Quick play from the main menu: one player, any keyboard half or the first gamepad, random arena. */
function quickSolo(): MatchPlan {
  const arena = ARENA_IDS[Math.floor(Math.random() * ARENA_IDS.length)];
  return {
    mode: 'solo',
    config: { mode: 'solo', seed: newSeed(), ...arenaConfig(arena), players: [{ id: 'p1', slot: 0, characterId: 'bombito', name: 'Você', loadout: myLoadout() }] },
    bindings: [{ slot: 0, devices: ['kb1', 'kb2', 'gp0', 'touch'] }],
  };
}

/** Adventure quick start from the main menu: one player, fog-covered regions to unlock. */
function quickAdventure(): MatchPlan {
  return {
    mode: 'adventure',
    config: { mode: 'adventure', seed: newSeed(), ...arenaConfig('caldeira'), events: false, players: [{ id: 'p1', slot: 0, characterId: 'bombito', name: 'Você', loadout: myLoadout() }] },
    bindings: [{ slot: 0, devices: ['kb1', 'kb2', 'gp0', 'touch'] }],
  };
}

/** Boss Rush quick start from the main menu. */
function quickBossRush(): MatchPlan {
  return {
    mode: 'bossrush',
    config: { mode: 'bossrush', seed: newSeed(), ...arenaConfig('caldeira'), players: [{ id: 'p1', slot: 0, characterId: 'bombito', name: 'Você', loadout: myLoadout() }] },
    bindings: [{ slot: 0, devices: ['kb1', 'kb2', 'gp0', 'touch'] }],
  };
}

/** Match built from the local lobby roster: one device per player. */
function fromLobby(): MatchPlan | null {
  const { mode, arena, players } = useMatchSetup.getState();
  if (players.length === 0) return null;
  return {
    mode,
    config: {
      mode,
      seed: newSeed(),
      ...arenaConfig(mode === 'adventure' || mode === 'bossrush' ? 'caldeira' : arena),
      ...(mode === 'adventure' ? { events: false } : {}),
      // The first player is the profile owner: they wear their cosmetics.
      players: players.map((p, i) => ({ id: `p${p.slot + 1}`, slot: p.slot, colorIndex: p.colorIndex, characterId: p.characterId, name: `P${p.slot + 1}`, ...(i === 0 ? { loadout: myLoadout() } : {}) })),
    },
    bindings: players.map((p) => ({ slot: p.slot, devices: [p.device] })),
  };
}

export function GameScreen() {
  const [params] = useSearchParams();
  const fromLobbyFlow = params.get('from') === 'lobby';
  const adventureFlow = params.get('mode') === 'adventure';
  const bossFlow = params.get('mode') === 'bossrush';
  const navigate = useNavigate();
  const makePlan = useCallback(
    () => (fromLobbyFlow ? fromLobby() : null) ?? (adventureFlow ? quickAdventure() : bossFlow ? quickBossRush() : quickSolo()),
    [fromLobbyFlow, adventureFlow, bossFlow],
  );
  const [plan, setPlan] = useState(makePlan);
  const [controller, setController] = useState(() => new GameController(plan.config, inputManager, plan.bindings));

  const restart = useCallback(() => {
    sfx.ui();
    const next = makePlan();
    setPlan(next);
    setController(new GameController(next.config, inputManager, next.bindings));
  }, [makePlan]);

  const exit = useCallback(() => {
    sfx.ui();
    navigate(fromLobbyFlow ? '/local' : '/');
  }, [navigate, fromLobbyFlow]);

  useEffect(() => {
    inputManager.attach();
    sfx.unlock();
    return () => inputManager.detach();
  }, []);

  // A free device can take over a player whose controller was unplugged.
  useUiHandler((e) => controller.handleUi(e));

  useEffect(() => {
    controller.onRebind = (slot, device) => {
      const setup = useMatchSetup.getState();
      setup.setPlayers(setup.players.map((p) => (p.slot === slot ? { ...p, device } : p)));
    };
    // Dev-only hook for automated browser tests and debugging.
    if (import.meta.env.DEV) (window as unknown as { __game?: GameController }).__game = controller;
    const unmount = controller.mount();
    return () => {
      unmount();
      controller.dispose();
    };
  }, [controller]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a0d10]">
      <GameScene key={controller.state.config.seed} controller={controller} />
      <Hud mode={plan.mode} onResume={() => controller.setPaused(false)} onRestart={restart} onExit={exit} exitLabel={fromLobbyFlow ? 'Voltar ao lobby' : 'Menu principal'} />
      <HeroReveal key={`reveal-${controller.state.config.seed}`} controller={controller} />
      {controller.state.adventure && (
        <>
          <ChapterCard key={`chapter-${controller.state.config.seed}`} controller={controller} />
          <EdgeArrows />
          <TutorialHints key={`tips-${controller.state.config.seed}`} controller={controller} />
          <div className="hud-safe pointer-events-none z-30">
            <AdventureMap controller={controller} />
          </div>
        </>
      )}
      <MatchTouchControls />
    </div>
  );
}

/** On-screen pad during play; hidden while a menu (pause / result) is open so it never covers it. */
export function MatchTouchControls() {
  const paused = useHud((s) => s.paused);
  const showResult = useHud((s) => s.showResult);
  if (paused || showResult) return null;
  return <TouchControls />;
}
