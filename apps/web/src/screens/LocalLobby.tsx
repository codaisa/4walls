import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ARENAS, CHARACTER_IDS, CHARACTERS, SLOT_COLORS, type CharacterId } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { deviceLabel, type DeviceId, type UiEvent } from '../input/InputManager';
import { inputManager } from '../input/instance';
import { LobbyPreview } from '../scene/LobbyPreview';
import { MatchSettings } from '../ui/MatchSettings';
import { useProfile } from '../store/useProfile';
import { isTouchDevice } from '../input/InputManager';

/** Phones: the docked pad is shown, so leave room for it. */
const TOUCH = isTouchDevice();
import { TouchDock } from '../ui/TouchControls';
import { useUiHandler } from '../ui/uiInput';
import { MAX_LOCAL_PLAYERS, MODE_INFO, useMatchSetup, type LobbyPlayer } from '../store/useMatchSetup';

const AUTO_START_MS = 3000;

function nextFreeColor(players: LobbyPlayer[], from: number, step: 1 | -1, self?: number) {
  const used = new Set(players.filter((p) => p.slot !== self).map((p) => p.colorIndex));
  for (let i = 1; i <= SLOT_COLORS.length; i++) {
    const c = (((from + step * i) % SLOT_COLORS.length) + SLOT_COLORS.length) % SLOT_COLORS.length;
    if (!used.has(c)) return c;
  }
  return from;
}

export function cycleCharacter(id: CharacterId, step: 1 | -1): CharacterId {
  const n = CHARACTER_IDS.length;
  return CHARACTER_IDS[(((CHARACTER_IDS.indexOf(id) + step) % n) + n) % n];
}

/**
 * Local lobby: players join by pressing a button on their own device (keyboard half or gamepad),
 * pick a character (← →) and a color (↑ ↓), and mark themselves ready. Start opens the match
 * settings (mode + arena). No account, server or network involved.
 */
export function LocalLobby() {
  const navigate = useNavigate();
  const { mode, arena, setMode, setArena, players: savedPlayers, setPlayers: savePlayers } = useMatchSetup();
  // Returning from a match keeps the roster but everyone must confirm again.
  const [players, setPlayersState] = useState<LobbyPlayer[]>(() => savedPlayers.map((p) => ({ ...p, ready: false })));
  const [disconnected, setDisconnected] = useState<Set<DeviceId>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(performance.now());
  const playersRef = useRef(players);
  // Several devices can press in the same frame: keep the ref authoritative between renders.
  const setPlayers = useCallback((next: LobbyPlayer[]) => {
    playersRef.current = next;
    setPlayersState(next);
  }, []);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const canStart = players.length >= MODE_INFO[mode].min && disconnected.size === 0;
  const allReady = canStart && players.every((p) => p.ready);

  const start = useCallback(() => {
    const ps = playersRef.current;
    if (ps.length < MODE_INFO[modeRef.current].min) return;
    sfx.go();
    savePlayers(ps);
    navigate('/play?from=lobby');
  }, [navigate, savePlayers]);

  const handle = useCallback(
    (e: UiEvent) => {
      const ps = playersRef.current;
      const me = ps.find((p) => p.device === e.device);
      if (!me) {
        if (e.action === 'confirm' && ps.length < MAX_LOCAL_PLAYERS) {
          const used = new Set(ps.map((p) => p.slot));
          const slot = [0, 1, 2, 3].find((s) => !used.has(s))!;
          // The first player is the profile owner: their own character and favourite color.
          const profile = ps.length === 0 ? useProfile.getState() : null;
          const wanted = profile ? profile.colorIndex : slot;
          const colorIndex = ps.some((p) => p.colorIndex === wanted) ? nextFreeColor(ps, wanted, 1) : wanted;
          const characterId = (profile?.characterId ?? 'bombito') as CharacterId;
          sfx.pickup();
          setPlayers([...ps, { slot, device: e.device, colorIndex, characterId, ready: false }].sort((a, b) => a.slot - b.slot));
        } else if ((e.action === 'back' || e.action === 'pause') && ps.length === 0) {
          sfx.ui();
          navigate('/');
        }
        return;
      }
      if (e.action === 'pause') {
        // Start on any joined device opens the match settings (mode, arena, start).
        sfx.ui();
        setSettingsOpen(true);
        return;
      }
      const update = (patch: Partial<LobbyPlayer>) => setPlayers(ps.map((p) => (p.slot === me.slot ? { ...p, ...patch } : p)));
      switch (e.action) {
        case 'confirm':
          sfx.ui();
          update({ ready: !me.ready });
          break;
        case 'back':
          sfx.ui();
          if (me.ready) update({ ready: false });
          else setPlayers(ps.filter((p) => p.slot !== me.slot));
          break;
        case 'left':
        case 'right':
          if (!me.ready) {
            sfx.ui();
            update({ characterId: cycleCharacter(me.characterId, e.action === 'right' ? 1 : -1) });
          }
          break;
        case 'up':
        case 'down':
          if (!me.ready) {
            sfx.ui();
            update({ colorIndex: nextFreeColor(ps, me.colorIndex, e.action === 'down' ? 1 : -1, me.slot) });
          }
          break;
      }
    },
    [navigate, setPlayers],
  );

  // Every device's presses arrive through the global UI input loop (the settings panel sits on top when open).
  useUiHandler(handle);

  useEffect(() => {
    inputManager.resetLatches();
    const off = inputManager.onDeviceChange((id, connected) => {
      setDisconnected((prev) => {
        const next = new Set(prev);
        if (connected) next.delete(id);
        else if (playersRef.current.some((p) => p.device === id)) next.add(id);
        return next;
      });
    });
    return off;
  }, []);

  // Auto-start once everyone is ready; any change cancels the countdown.
  useEffect(() => {
    setStartAt(allReady && !settingsOpen ? performance.now() + AUTO_START_MS : null);
    setNow(performance.now());
  }, [allReady, players, mode, arena, settingsOpen]);
  useEffect(() => {
    if (startAt === null) return;
    const id = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= startAt) {
        window.clearInterval(id);
        setStartAt(null);
        start();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [startAt, start]);
  const countdown = startAt !== null ? Math.max(1, Math.ceil((startAt - now) / 1000)) : null;

  const remove = (slot: number) => {
    sfx.ui();
    setPlayers(players.filter((p) => p.slot !== slot));
  };

  return (
    <div className={`menu-bg relative flex h-full w-full flex-col overflow-y-auto overflow-x-hidden screen-safe font-body text-white ${TOUCH ? 'dock-space' : ''}`}>
      <TouchDock />
      <div className="menu-embers" aria-hidden />
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between">
        <button className="menu-btn !min-w-0 !px-4 !py-2 !text-lg [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-base" onClick={() => navigate('/')}>
          ← Voltar
        </button>
        <h1 className="logo font-display text-4xl sm:text-5xl [@media(max-height:500px)]:text-2xl">Jogar offline</h1>
        <div className="w-24" />
      </header>

      <div className="relative z-10 mx-auto mt-2 w-full max-w-5xl">
        <div className="h-56 sm:h-64 [@media(max-height:500px)]:h-24">
          <LobbyPreview players={players} />
        </div>
        {/* Always 4 columns so each card sits under its character in the 3D strip. */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 [@media(max-height:500px)]:gap-1.5">
          {Array.from({ length: MAX_LOCAL_PLAYERS }, (_, slot) => {
            const p = players.find((pp) => pp.slot === slot);
            return p ? (
              <PlayerSlotCard
                key={slot}
                slot={slot}
                characterId={p.characterId}
                colorIndex={p.colorIndex}
                ready={p.ready}
                subtitle={deviceLabel(p.device)}
                warning={disconnected.has(p.device) ? 'CONTROLE DESCONECTADO' : null}
                onRemove={() => remove(slot)}
              />
            ) : (
              <EmptySlot key={slot} slot={slot} />
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:grid-cols-[1fr_auto] [@media(max-height:500px)]:gap-2">
          <button
            className="hud-panel flex flex-col items-start px-4 py-2 text-left hover:brightness-110"
            onClick={() => setSettingsOpen(true)}
            data-testid="settings-summary"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-amber-100/60">Partida · Start abre as opções</span>
            <span className="font-display text-2xl">
              {MODE_INFO[mode].title} · {ARENAS[arena].name}
            </span>
            <span className="text-xs opacity-75">{MODE_INFO[mode].subtitle}</span>
          </button>
          <div className="flex flex-col items-stretch justify-end gap-2 sm:w-72">
            <StatusLine count={players.length} ready={players.filter((p) => p.ready).length} min={MODE_INFO[mode].min} countdown={countdown} disconnected={disconnected.size > 0} />
            <button className="menu-btn menu-btn-primary disabled:cursor-not-allowed disabled:opacity-40" disabled={!canStart} onClick={start}>
              Iniciar
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-amber-50/55 [@media(max-height:500px)]:hidden">
          Entrar: <b>Espaço</b> (WASD) · <b>Enter</b> (setas) · <b>A/✕</b> no controle — de novo para ficar pronto · ← → personagem · ↑ ↓ cor ·{' '}
          <b>Shift</b>/<b>Ctrl dir.</b>/<b>B</b> volta ou sai · <b>Start</b>/<b>Esc</b> opções da partida · sem ninguém na sala, <b>B</b> volta ao menu
        </p>
      </div>

      {settingsOpen && (
        <MatchSettings
          mode={mode}
          arena={arena}
          canStart={canStart}
          onMode={setMode}
          onArena={setArena}
          onStart={() => {
            setSettingsOpen(false);
            start();
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

interface CardProps {
  slot: number;
  characterId: CharacterId;
  colorIndex: number;
  ready: boolean;
  subtitle: string;
  warning: string | null;
  onRemove?: () => void;
  host?: boolean;
  local?: boolean;
  /** Player name (online rooms); defaults to P<slot>. */
  name?: string;
  /** Tap/click controls (every lobby is touch- and mouse-friendly, not only D-pad). */
  onCharacter?: (step: 1 | -1) => void;
  onColor?: () => void;
  onReady?: () => void;
}

/** Lobby card shared by local and online lobbies. */
export function PlayerSlotCard({ slot, characterId, colorIndex, ready, subtitle, warning, onRemove, host, local = true, name, onCharacter, onColor, onReady }: CardProps) {
  const c = SLOT_COLORS[colorIndex];
  const ch = CHARACTERS[characterId];
  return (
    <div
      data-testid={`slot-${slot}`}
      className={`hud-panel relative flex min-w-0 flex-col items-center gap-0.5 px-2 py-3 text-center transition [@media(max-height:500px)]:py-1.5 ${ready ? 'ring-4 ring-lime-300/70' : ''}`}
      style={{ borderColor: c.primary }}
    >
      {host && <div className="absolute left-2 top-1.5 text-xs" title="Anfitrião">👑</div>}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute right-2 top-1.5 rounded-full px-2 text-lg leading-none text-white/50 hover:bg-white/10 hover:text-white"
          title="Remover jogador"
          aria-label={`Remover P${slot + 1}`}
        >
          ×
        </button>
      )}
      <div className="w-full truncate px-4 font-display text-3xl [@media(max-height:500px)]:text-xl" style={{ color: c.primary }}>
        {name ?? `P${slot + 1}`}
      </div>
      <div className="flex items-center gap-1 font-display text-lg [@media(max-height:500px)]:text-base">
        {local && !ready && (onCharacter ? (
          <button className="rounded-md px-2 text-xl leading-none hover:bg-white/15" aria-label="Personagem anterior" onClick={() => onCharacter(-1)}>‹</button>
        ) : (
          <span className="opacity-50">‹</span>
        ))}
        {ch.name}
        {local && !ready && (onCharacter ? (
          <button className="rounded-md px-2 text-xl leading-none hover:bg-white/15" aria-label="Próximo personagem" onClick={() => onCharacter(1)}>›</button>
        ) : (
          <span className="opacity-50">›</span>
        ))}
      </div>
      <div className="text-[11px] leading-tight opacity-80 [@media(max-height:500px)]:hidden">
        {ch.abilityName}: {ch.abilityDesc}
      </div>
      <div className="flex min-w-0 max-w-full items-center gap-1 text-xs opacity-70">
        <span className="min-w-0 truncate">{subtitle}</span>
        {onColor && local && !ready ? (
          <button className="flex shrink-0 items-center gap-1 rounded-md px-1 hover:bg-white/15" onClick={onColor} aria-label="Trocar cor">
            <span className="inline-block h-3 w-3 rounded-full border border-white/70" style={{ background: c.primary }} />
            {c.name}
          </button>
        ) : (
          <span className="shrink-0">· {c.name}</span>
        )}
      </div>
      {warning ? (
        <div className="mt-1 rounded-lg bg-red-500/80 px-2 py-0.5 text-xs font-black">{warning}</div>
      ) : onReady && local ? (
        <button
          onClick={onReady}
          className={`mt-1 rounded-lg px-3 py-1 font-display text-lg [@media(max-height:500px)]:py-0.5 [@media(max-height:500px)]:text-base ${ready ? 'bg-lime-400 text-lime-950' : 'bg-white/15 text-white hover:bg-white/25'}`}
        >
          {ready ? 'PRONTO! ✓' : 'Estou pronto'}
        </button>
      ) : ready ? (
        <div className="mt-1 rounded-lg bg-lime-400 px-3 py-0.5 font-display text-lg text-lime-950">PRONTO!</div>
      ) : (
        <div className="mt-1 text-xs opacity-70 [@media(max-height:500px)]:hidden">{local ? '←→ personagem · ↑↓ cor · confirme' : 'escolhendo…'}</div>
      )}
    </div>
  );
}

export function EmptySlot({ slot, label = 'Aperte para entrar', hint }: { slot: number; label?: string; hint?: string | null }) {
  return (
    <div data-testid={`slot-${slot}`} className="flex min-h-32 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-black/20 px-3 py-3 text-center [@media(max-height:500px)]:min-h-0 [@media(max-height:500px)]:py-2">
      <div className="font-display text-3xl text-white/30 [@media(max-height:500px)]:text-xl">P{slot + 1}</div>
      <div className="animate-pulse text-sm font-bold text-white/60">{label}</div>
      <div className="text-xs text-white/40 [@media(max-height:500px)]:hidden">{hint ?? 'Espaço · Enter · A · toque em A'}</div>
    </div>
  );
}

export function StatusLine({ count, ready, min, countdown, disconnected }: { count: number; ready: number; min: number; countdown: number | null; disconnected: boolean }) {
  let text: string;
  if (disconnected) text = 'Reconecte o controle para continuar';
  else if (count < min) text = 'Aguardando jogadores…';
  else if (countdown !== null) text = `Todos prontos! Começando em ${countdown}…`;
  else text = `${ready}/${count} prontos`;
  return (
    <div className="text-center font-display text-xl text-amber-100 [@media(max-height:500px)]:text-base" data-testid="room-status">
      {text}
    </div>
  );
}
