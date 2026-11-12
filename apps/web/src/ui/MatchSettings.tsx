import { useRef } from 'react';
import { ARENAS, ARENA_IDS, type ArenaId } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { MODE_INFO, useMatchSetup, type LocalMode } from '../store/useMatchSetup';
import { describeExpedition, loadExpedition } from '../game/expeditionSave';
import { useMenuNav } from './useMenuNav';

interface Props {
  mode: LocalMode;
  arena: ArenaId;
  canStart: boolean;
  onMode: (m: LocalMode) => void;
  /** Modes offered (default: all). Online rooms leave out Adventure. */
  modes?: LocalMode[];
  onArena: (a: ArenaId) => void;
  onStart: () => void;
  onClose: () => void;
}

/** Match settings (mode + arena), fully usable with a gamepad: D-pad moves, A picks, B closes. */
export function MatchSettings({ mode, arena, canStart, onMode, onArena, onStart, onClose, modes = Object.keys(MODE_INFO) as LocalMode[] }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, { onBack: onClose });
  const resume = useMatchSetup((s) => s.resume);
  const setResume = useMatchSetup((s) => s.setResume);
  const saved = mode === 'adventure' && modes.includes('adventure') ? loadExpedition() : null;
  const pick = (fn: () => void) => () => {
    sfx.ui();
    fn();
  };
  return (
    <div ref={ref} className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-sm" data-testid="match-settings">
      <div className="hud-panel flex max-h-full w-full max-w-xl flex-col gap-4 overflow-y-auto px-6 py-5 [@media(max-height:500px)]:max-w-3xl [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:py-2">
        <h2 className="font-display text-4xl text-amber-100 [@media(max-height:500px)]:text-2xl">Configurar partida</h2>
        <div>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-widest text-amber-100/60">Modo</div>
          <div className="flex flex-wrap gap-2 [@media(max-height:500px)]:grid [@media(max-height:500px)]:grid-cols-4">
            {modes.map((m) => (
              <button key={m} data-nav data-nav-default={m === mode ? '' : undefined} onClick={pick(() => onMode(m))} className={`choice ${mode === m ? 'choice-on' : ''}`}>
                <span className="font-display text-xl [@media(max-height:500px)]:text-lg">{MODE_INFO[m].title}</span>
                <span className="text-xs opacity-75 [@media(max-height:500px)]:text-[10px]">{MODE_INFO[m].subtitle}</span>
              </button>
            ))}
          </div>
        </div>
        {saved && (
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-widest text-amber-100/60">Expedição</div>
            <div className="flex flex-wrap gap-2">
              <button data-nav onClick={pick(() => setResume(true))} className={`choice ${resume ? 'choice-on' : ''}`} data-testid="resume-expedition">
                <span className="font-display text-xl [@media(max-height:500px)]:text-lg">🏕️ Continuar</span>
                <span className="text-xs opacity-75 [@media(max-height:500px)]:text-[10px]">
                  {describeExpedition(saved)} · 🪙 {saved.save.coins}
                </span>
              </button>
              <button data-nav onClick={pick(() => setResume(false))} className={`choice ${!resume ? 'choice-on' : ''}`}>
                <span className="font-display text-xl [@media(max-height:500px)]:text-lg">✨ Nova expedição</span>
                <span className="text-xs opacity-75 [@media(max-height:500px)]:text-[10px]">Apaga a salva ao começar</span>
              </button>
            </div>
          </div>
        )}
        {mode !== 'adventure' && mode !== 'bossrush' && (
        <div>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-widest text-amber-100/60">Arena</div>
          <div className="flex flex-wrap gap-2">
            {ARENA_IDS.map((a) => (
              <button key={a} data-nav onClick={pick(() => onArena(a))} className={`choice ${arena === a ? 'choice-on' : ''}`}>
                <span className="font-display text-xl">{ARENAS[a].name}</span>
                <span className="text-xs opacity-75">{ARENAS[a].subtitle}</span>
              </button>
            ))}
          </div>
        </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button data-nav className="menu-btn menu-btn-primary disabled:opacity-40 [@media(max-height:500px)]:!py-1.5" disabled={!canStart} onClick={pick(onStart)}>
            Iniciar partida
          </button>
          <button data-nav className="menu-btn [@media(max-height:500px)]:!py-1.5" onClick={pick(onClose)}>
            Fechar
          </button>
        </div>
        <div className="text-xs opacity-70 [@media(max-height:500px)]:hidden">🎮 D-pad escolhe · A confirma · B fecha</div>
      </div>
    </div>
  );
}
