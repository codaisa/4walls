import { useEffect, useRef, useState } from 'react';
import { RULES, SLOT_COLORS, type ModeId } from '@4walls/shared';
import { useHud, type HudPlayer } from '../store/useHud';
import { useMenuNav } from '../ui/useMenuNav';
import { isTouchDevice } from '../input/InputManager';

/** Phones/tablets: on-screen pad present (layout leaves room for it). */
const TOUCH = isTouchDevice();
import { sfx } from '../audio/Sfx';

interface HudProps {
  onResume: () => void;
  /** Omitted online: the server decides when the next round starts. */
  onRestart?: () => void;
  onExit: () => void;
  exitLabel: string;
  mode: ModeId;
  /** Shown on the result screen instead of "play again" (online). */
  resultNote?: string;
}

export function Hud({ onResume, onRestart, onExit, exitLabel, mode, resultNote }: HudProps) {
  const { phase, countdown, timeLeft, players, enemiesAlive, enemiesTotal, paused, showResult, result, banner, missing } = useHud();
  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, '0');
  const urgent = phase === 'playing' && timeLeft <= 30;

  return (
    <div className="hud-safe pointer-events-none select-none font-body text-white">
      {/* Top bar */}
      <div className={`flex items-start justify-between gap-3 [@media(max-height:500px)]:gap-2 ${TOUCH ? 'pr-14' : ''}`}>
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          {mode === 'adventure' ? (
            <AdventurePanel />
          ) : (
            <div className={`hud-panel px-5 py-1.5 font-display text-3xl tracking-wide tabular-nums [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:py-0.5 [@media(max-height:500px)]:text-2xl ${urgent ? 'text-ember animate-pulse' : ''}`}>
              {mm}:{ss}
            </div>
          )}
          {mode === 'solo' && enemiesTotal > 0 && (
            <div className="hud-panel flex items-center gap-2 px-3 py-1 text-sm font-bold">
              <span className="inline-block h-3 w-3 rounded-full bg-[#ff5a1f] shadow-[0_0_10px_#ff5a1f]" />
              Magmitos: {enemiesAlive}/{enemiesTotal}
            </div>
          )}
          <EventPanel />
        </div>
        <div className="hidden w-48 sm:block" />
      </div>

      {(mode === 'bossrush' || mode === 'adventure') && <BossBar />}

      {phase === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div key={countdown} className="countdown-pop font-display text-[9rem] leading-none text-white drop-shadow-[0_6px_0_#7a1f0e]">
            {countdown}
          </div>
        </div>
      )}

      {banner && phase === 'playing' && <Banner key={banner.key} text={banner.text} />}

      {phase !== 'ended' && !TOUCH && <ControlsHint mode={mode} players={players} />}

      {paused && (
        <Overlay onBack={missing.length > 0 ? undefined : onResume}>
          <h2 className="font-display text-6xl text-white drop-shadow-[0_5px_0_#7a1f0e] [@media(max-height:500px)]:text-4xl">{onRestart ? 'PAUSA' : 'MENU'}</h2>
          {!onRestart && <div className="text-sm opacity-80">A partida online continua rodando.</div>}
          {missing.length > 0 && (
            <div className="hud-panel max-w-md border-red-400/70 px-5 py-3 text-center" data-testid="missing-controller">
              {missing.map((m) => (
                <div key={m.slot} className="font-display text-2xl" style={{ color: SLOT_COLORS[m.colorIndex].primary }}>
                  🎮 Controle do {m.name} desconectado
                </div>
              ))}
              <div className="mt-1 text-sm opacity-85">Reconecte o controle, ou aperte A / Espaço / Enter num dispositivo livre para assumir.</div>
            </div>
          )}
          <MenuButton onClick={onResume} primary disabled={missing.length > 0}>
            Continuar
          </MenuButton>
          {onRestart && <MenuButton onClick={onRestart}>Reiniciar</MenuButton>}
          <MenuButton onClick={onExit}>{exitLabel}</MenuButton>
          <AudioToggles />
          {!TOUCH && <ControlsToggle />}
          {missing.length === 0 && <NavHint text="Start / Esc / B continua" />}
        </Overlay>
      )}

      {showResult && result && (
        <Overlay onBack={onExit} armDelayMs={900}>
          <ResultTitle outcome={result.outcome} winner={players.find((p) => result.winnerIds.includes(p.id))} reason={result.reason} team={players.length > 1} />
          <div className="flex flex-wrap justify-center gap-3">
            {players.map((p) => (
              <div key={p.id} className="hud-panel min-w-36 px-4 py-2 text-center">
                <div className="font-display text-xl" style={{ color: SLOT_COLORS[p.colorIndex].primary }}>
                  {p.name}
                </div>
                <div className="text-sm opacity-80">Eliminações: {p.kills}</div>
              </div>
            ))}
          </div>
          {onRestart ? (
            <MenuButton onClick={onRestart} primary>
              Jogar de novo
            </MenuButton>
          ) : (
            <div className="font-display text-2xl text-amber-100">{resultNote}</div>
          )}
          <MenuButton onClick={onExit} primary={!onRestart}>
            {exitLabel}
          </MenuButton>
          <NavHint text="A / Espaço / Enter escolhe · B / Shift volta" />
        </Overlay>
      )}
    </div>
  );
}

function PlayerCard({ p }: { p: HudPlayer }) {
  const c = SLOT_COLORS[p.colorIndex % SLOT_COLORS.length];
  return (
    <div
      className={`hud-panel flex items-center gap-3 px-3 py-2 transition-all [@media(max-height:500px)]:origin-top-left [@media(max-height:500px)]:scale-[0.82] ${p.alive ? '' : 'opacity-40 grayscale'}`}
      style={{ borderColor: c.primary }}
    >
      <div className="relative h-9 w-9 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, ${c.secondary}, ${c.primary} 60%)` }}>
        {p.shield && <div className="absolute -inset-1 rounded-full border-2 border-sky-300 shadow-[0_0_10px_#7fd6ff]" />}
        {!p.alive && <div className="absolute inset-0 flex items-center justify-center font-display text-xl">✕</div>}
      </div>
      <div className="leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-lg" style={{ color: c.primary }}>
            {p.name}
          </span>
          <span className="text-[10px] font-bold uppercase opacity-60">{p.character}</span>
          {p.frozen && <span title="Congelado">🧊</span>}
        </div>
        <div className="flex gap-2.5 text-xs font-bold">
          <Stat icon="💣" value={`${p.bombsAvailable}/${p.bombs}`} title="Bombas" />
          <Stat icon="🔥" value={p.range} title="Alcance" />
          <Stat icon="⚡" value={p.speedLevel} title="Velocidade" />
          {p.special && <Stat icon={p.special.kind === 'fire' ? '♨️' : '❄️'} value={`×${p.special.charges}`} title="Bombas especiais" />}
        </div>
        <PowerBadges p={p} />
        <div className="mt-1 flex items-center gap-1.5" title={p.hasRemoteBombs ? 'Habilidade detona a bomba remota' : p.abilityName}>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15">
            <div
              className={`h-full rounded-full transition-[width] duration-150 ${p.abilityCharge >= 1 ? 'bg-amber-300 shadow-[0_0_6px_#ffd36a]' : 'bg-white/45'}`}
              style={{ width: `${p.abilityCharge * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-bold opacity-75">{p.hasRemoteBombs ? '📡 Detonar' : p.abilityName}</span>
        </div>
      </div>
    </div>
  );
}

const PERKS: Record<HudPlayer['perks'][number], { icon: string; name: string; color: string; how: string }> = {
  kick: { icon: '🦶', name: 'Chute', color: '#6fe36f', how: 'Ande contra uma bomba' },
  boots: { icon: '🥾', name: 'Botas', color: '#6fe36f', how: 'Atravessa bombas' },
  remote: { icon: '📡', name: 'Remoto', color: '#4fa8ff', how: 'Habilidade detona' },
  ghost: { icon: '👻', name: 'Fantasma', color: '#4fa8ff', how: 'Atravessa blocos' },
  glove: { icon: '🧤', name: 'Luva', color: '#4fa8ff', how: 'Bomba 2× arremessa' },
};

/** Collected powers as readable badges, plus the roll/jump readiness pip. */
function PowerBadges({ p }: { p: HudPlayer }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-testid="power-badges">
      <span
        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors ${p.moveCharge >= 1 ? 'bg-sky-400/25 text-sky-100' : 'bg-white/10 text-white/45'}`}
        title="Rolar (E / Shift dir. / X) · Pular (Q / Num0 / Y)"
      >
        🌀 {p.moveCharge >= 1 ? 'Esquiva' : '…'}
      </span>
      {p.perks.map((k) => (
        <span
          key={k}
          className="badge-pop flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold"
          style={{ borderColor: PERKS[k].color, background: `${PERKS[k].color}22` }}
          title={PERKS[k].how}
        >
          <span>{PERKS[k].icon}</span>
          {PERKS[k].name}
          {k === 'ghost' && p.ghostLeft > 0 && <span className="tabular-nums opacity-80">{p.ghostLeft}s</span>}
        </span>
      ))}
    </div>
  );
}

/** The Golem's plates left (one shield each), or its open core. */
function Armor({ b }: { b: { plates?: number; core?: boolean } }) {
  return (
    <span className="mr-1.5 tracking-tighter" data-testid="boss-armor" title="Placas de pedra">
      {b.core ? '🔥' : '🛡️'.repeat(b.plates ?? 0) || '—'}
    </span>
  );
}

function BossBar() {
  const b = useHud((s) => s.boss);
  if (!b) return null;
  const pct = (b.hp / b.maxHp) * 100;
  const fill = b.enraged ? 'animate-pulse bg-gradient-to-r from-red-600 to-orange-400' : 'bg-gradient-to-r from-orange-600 to-amber-300';
  if (TOUCH) {
    // Phones: one slim line between the stick and the buttons.
    return (
      <div className="absolute inset-x-0 bottom-2 flex justify-center" data-testid="boss-bar">
        <div className={`hud-panel w-[17rem] px-3 py-1 ${b.enraged ? 'border-red-400/80' : ''}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-display text-base leading-tight" style={{ color: b.enraged ? '#ff6a4a' : '#ffb347' }}>
              {b.name}
            </span>
            <span className="shrink-0 text-[10px] font-bold opacity-75">
              {b.plates !== undefined && !b.dead && <Armor b={b} />}
              {b.dead ? 'Derrotado!' : b.core ? 'NÚCLEO!' : b.enraged ? 'ENFURECIDO' : `${b.hp}/${b.maxHp}`}
            </span>
          </div>
          <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/15">
            <div className={`h-full rounded-full transition-[width] duration-200 ${fill}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-x-0 bottom-14 flex justify-center px-4" data-testid="boss-bar">
      <div className={`hud-panel w-full max-w-xl px-4 py-2 ${b.enraged ? 'border-red-400/80' : ''}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-2xl" style={{ color: b.enraged ? '#ff6a4a' : '#ffb347' }}>
            {b.name}
          </span>
          <span className="text-xs font-bold opacity-75">
            {b.plates !== undefined && !b.dead && <Armor b={b} />}
            {b.dead ? 'Derrotado!' : b.core ? 'NÚCLEO EXPOSTO!' : b.enraged ? 'ENFURECIDO' : b.title} ·{' '}
            {b.arc ? `Guardião do Arco ${b.arc}${b.level ? ` · Nv. ${b.level + 1}` : ''}` : `Chefão ${Math.max(1, b.index)}/${b.total}`}
          </span>
        </div>
        <div className="mt-1 h-3 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/15">
          <div className={`h-full rounded-full transition-[width] duration-200 ${fill}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function AdventurePanel() {
  const a = useHud((s) => s.adventure);
  const fighting = useHud((s) => !!s.boss && !s.boss.dead);
  if (!a) return null;
  // Phones: during a chamber fight the boss bar says it all, and the top of the hall must stay visible.
  if (fighting && TOUCH) return null;
  const objective = a.gateOpen ? (
    <span className="text-violet-200">✦ Portão aberto: siga em frente</span>
  ) : a.objective === 'boss' ? (
    <span className="text-red-200">☠️ Derrote o guardião do arco</span>
  ) : a.objective === 'seals' ? (
    <span className="text-violet-200">💠 Selos {a.progress}/{a.goal} · só em cadeia</span>
  ) : a.objective === 'purify' ? (
    <span className="text-emerald-200">🌿 Raízes purificadas {a.progress}/{a.goal}</span>
  ) : a.objective === 'lever' ? (
    <span className="text-orange-200">⚙️ Cruze o rio e exploda a alavanca</span>
  ) : a.objective === 'key' ? (
    <span className="text-amber-200">🔑 {a.keyCarried ? 'Leve a chave ao portão' : 'Ache a chave do portão'}</span>
  ) : (
    <>
      <span className="inline-block h-3 w-3 rounded-full bg-[#ff5a1f] shadow-[0_0_10px_#ff5a1f]" />
      Magmitos: {a.progress}
    </>
  );
  return (
    <div className="hud-panel min-w-56 px-4 py-1.5 text-center [@media(max-height:500px)]:min-w-40 [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:py-0.5" data-testid="adventure-panel">
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
        Região {a.index} · {a.chapter}
      </div>
      <div className="font-display text-2xl leading-tight [@media(max-height:500px)]:text-base">{a.regionName}</div>
      <div className="flex items-center justify-center gap-2 text-sm font-bold [@media(max-height:500px)]:text-xs" data-testid="adventure-objective">
        {objective}
      </div>
      {a.braziers && (
        <div className={`text-[11px] font-bold ${a.braziers.lit === a.braziers.goal ? 'text-emerald-300' : 'text-orange-200/90'}`} data-testid="mission">
          🔥 Braseiros {a.braziers.lit}/{a.braziers.goal}
          {a.braziers.lit === a.braziers.goal ? ' · tesouro revelado!' : ' (opcional)'}
        </div>
      )}
      {a.closingIn !== null && (
        <div className="mt-0.5 animate-pulse text-[11px] font-black uppercase tracking-wider text-red-300" data-testid="gate-closing">
          ⛓ O portão de trás fecha em {a.closingIn}s
        </div>
      )}
    </div>
  );
}

function EventPanel() {
  const ev = useHud((s) => s.event);
  if (!ev) return null;
  const warn = ev.phase === 'warning';
  return (
    <div className={`hud-panel px-3 py-1 text-center ${warn ? 'animate-pulse border-red-400' : 'border-sky-300/70'}`}>
      <div className="font-display text-base">
        {warn ? '⚠ ' : ''}
        {ev.name} {warn ? `em ${ev.secondsLeft}` : `· ${ev.secondsLeft}s`}
      </div>
      <div className="text-[11px] opacity-80">{ev.description}</div>
    </div>
  );
}

const Stat = ({ icon, value, title }: { icon: string; value: string | number; title: string }) => (
  <span title={title} className="flex items-center gap-0.5">
    <span>{icon}</span>
    <span className="tabular-nums">{value}</span>
  </span>
);

function Banner({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1100);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="absolute inset-x-0 top-[22%] flex justify-center">
      <div className="banner-pop font-display text-5xl text-amber-200 drop-shadow-[0_4px_0_#7a1f0e]">{text}</div>
    </div>
  );
}

const CONTROL_ROWS: [string, string, string, string][] = [
  ['Mover', 'WASD', 'Setas', 'D-pad'],
  ['Bomba', 'Espaço', 'Enter', 'A'],
  ['Habilid.', 'Shift E', 'Ctrl D', 'B'],
  ['Rolar', 'E', 'Shift D', 'X/RB'],
  ['Pular', 'Q', 'Num0', 'Y/LB'],
  ['Pausa', 'Esc', 'Backsp.', 'Start'],
];

/** Controls reference: a box on the right that can be closed (and reopened from the pause menu). */
function ControlsHint({ players }: { mode: ModeId; players: HudPlayer[] }) {
  const hidden = useHud((s) => s.controlsHidden);
  const setHidden = useHud((s) => s.setControlsHidden);
  if (hidden) return null;
  return (
    <div className="pointer-events-auto absolute right-2 top-1/2 hidden w-52 -translate-y-1/2 opacity-90 sm:block" data-testid="controls-box">
      <div className="hud-panel px-2.5 py-2 text-[11px] leading-tight">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-display text-base text-amber-100">🎮 Controles</span>
          <button
            onClick={() => setHidden(true)}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm font-bold hover:bg-white/25"
            title="Fechar (reabra no menu de pausa)"
            aria-label="Fechar controles"
          >
            ✕
          </button>
        </div>
        {players.length > 1 && (
          <div className="mb-1.5 flex flex-col gap-0.5">
            {players.map((p) => (
              <div key={p.id} className="rounded px-1.5 py-0.5" style={{ background: `${SLOT_COLORS[p.colorIndex].primary}26` }}>
                <b style={{ color: SLOT_COLORS[p.colorIndex].primary }}>{p.name}</b> · {p.device}
              </div>
            ))}
          </div>
        )}
        <table className="w-full border-separate border-spacing-y-0.5">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider opacity-60">
              <th className="text-left font-bold" />
              <th className="text-left font-bold" title="Teclado A">⌨ A</th>
              <th className="text-left font-bold" title="Teclado B">⌨ B</th>
              <th className="text-left font-bold" title="Controle">🎮</th>
            </tr>
          </thead>
          <tbody>
            {CONTROL_ROWS.map(([action, a, b, pad]) => (
              <tr key={action}>
                <td className="pr-1 font-bold text-amber-100/90">{action}</td>
                <td className="pr-1 opacity-85">{a}</td>
                <td className="pr-1 opacity-85">{b}</td>
                <td className="opacity-85">{pad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultTitle({ outcome, winner, reason, team }: { outcome: string; winner?: HudPlayer; reason: string; team: boolean }) {
  const adventure = useHud((s) => s.adventure);
  let title = 'EMPATE!';
  let sub = reason === 'timeUp' ? 'O tempo acabou.' : 'Ninguém sobreviveu.';
  let color = '#ffd23f';
  if (outcome === 'victory' && reason === 'bossesDefeated') {
    title = 'CHEFÕES DERROTADOS!';
    sub = 'Golem e Guardião caíram. A Caldeira e a Floresta estão livres.';
  } else if (outcome === 'victory' && reason === 'allRegionsCleared') {
    title = 'AVENTURA CONCLUÍDA!';
    sub = 'Todas as regiões foram libertadas.';
  } else if (outcome === 'victory') {
    title = 'VITÓRIA!';
    sub = 'Todos os Magmitos foram explodidos.';
  } else if (outcome === 'defeat' && adventure) {
    // The endless journey has no "lose": it ends, and the score is how far it got.
    title = 'FIM DA JORNADA';
    sub = `Vocês chegaram à região ${adventure.depth}: ${adventure.regionName}.`;
    color = '#ffcf6a';
  } else if (outcome === 'defeat') {
    title = 'DERROTA';
    sub = reason === 'timeUp' ? 'O tempo acabou.' : team ? 'A equipe inteira foi pelos ares.' : 'Você foi pelos ares.';
    color = '#ff6a4a';
  } else if (outcome === 'winner' && winner) {
    title = `${winner.name} VENCEU!`;
    sub = 'Último explosivo de pé.';
    color = SLOT_COLORS[winner.colorIndex].primary;
  }
  return (
    <div className="text-center">
      <h2 className="result-pop font-display text-7xl drop-shadow-[0_6px_0_rgba(0,0,0,0.5)] [@media(max-height:500px)]:text-4xl" style={{ color }}>
        {title}
      </h2>
      <p className="mt-1 text-lg opacity-85">{sub}</p>
    </div>
  );
}

/** Modal menu fully navigable with a gamepad (D-pad + A) as well as mouse and keyboard. */
function Overlay({ children, onBack, armDelayMs = 0 }: { children: React.ReactNode; onBack?: () => void; armDelayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, { onBack, armDelayMs });
  return (
    <div ref={ref} className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/55 py-4 backdrop-blur-sm [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:py-2">
      {children}
    </div>
  );
}

function ControlsToggle() {
  const hidden = useHud((s) => s.controlsHidden);
  const setHidden = useHud((s) => s.setControlsHidden);
  return (
    <button data-nav className="menu-btn !min-w-0 !px-4 !py-2 !text-base" onClick={() => (sfx.ui(), setHidden(!hidden))}>
      🎮 Controles na tela: {hidden ? 'ocultos' : 'visíveis'}
    </button>
  );
}

function AudioToggles() {
  const [, rerender] = useState(0);
  const toggle = (bus: 'music' | 'sfx') => {
    sfx.setMuted(bus, !sfx.muted[bus]);
    if (bus === 'sfx') sfx.setMuted('ui', sfx.muted.sfx);
    sfx.ui();
    rerender((n) => n + 1);
  };
  return (
    <div className="flex gap-2">
      <button data-nav className="menu-btn !min-w-0 !px-4 !py-2 !text-base" onClick={() => toggle('music')}>
        🎵 Música: {sfx.muted.music ? 'desligada' : 'ligada'}
      </button>
      <button data-nav className="menu-btn !min-w-0 !px-4 !py-2 !text-base" onClick={() => toggle('sfx')}>
        🔊 Efeitos: {sfx.muted.sfx ? 'desligados' : 'ligados'}
      </button>
    </div>
  );
}

const NavHint = ({ text }: { text: string }) => (TOUCH ? null : <div className="text-sm opacity-70 [@media(max-height:500px)]:hidden">🎮 {text}</div>);

export function MenuButton({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      data-nav
      data-nav-default={primary && !disabled ? '' : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`menu-btn ${primary ? 'menu-btn-primary' : ''} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
