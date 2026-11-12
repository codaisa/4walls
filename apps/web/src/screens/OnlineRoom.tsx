import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ARENAS } from '@4walls/shared';
import { MAX_ROOM_SLOTS, type LobbyInfo, type OnlineMode, type StartInfo } from '@4walls/protocol';
import { sfx } from '../audio/Sfx';
import { Hud } from '../hud/Hud';
import { HeroReveal } from '../ui/HeroReveal';
import { deviceLabel, devicesOfLocal, type DeviceId, type UiEvent } from '../input/InputManager';
import { ME, useProfile } from '../store/useProfile';
import { ONLINE_MODES } from '@4walls/protocol';
import { inputManager } from '../input/instance';
import { OnlineController, type LocalSlot } from '../online/OnlineController';
import { online, useOnline } from '../online/session';
import { GameScene } from '../scene/GameScene';
import { LobbyPreview } from '../scene/LobbyPreview';
import { MODE_INFO } from '../store/useMatchSetup';
import { MatchSettings } from '../ui/MatchSettings';
import { InviteModal } from '../ui/InviteModal';
import { RewardPanel } from '../ui/RewardPanel';
import { isTouchDevice } from '../input/InputManager';

/** Phones: no on-screen pad in the room — every control is tappable. */
const TOUCH = isTouchDevice();
import { MatchTouchControls } from './GameScreen';
import { useUiHandler } from '../ui/uiInput';
import { EmptySlot, PlayerSlotCard, StatusLine } from './LocalLobby';
import { credential, ensureAccount } from '../store/useAccount';

export function OnlineRoom() {
  const navigate = useNavigate();
  const { status, lobby, start, sessionId, error } = useOnline();

  useEffect(() => {
    if (status === 'idle' || (status === 'error' && !lobby)) navigate('/online');
  }, [status, lobby, navigate]);

  const leave = () => {
    sfx.ui();
    void online.leave();
    navigate('/online');
  };

  if (!lobby) {
    return (
      <div className="menu-bg flex h-full w-full items-center justify-center font-display text-3xl text-amber-100">
        {error ?? 'Entrando na sala…'}
      </div>
    );
  }
  const locals: LocalSlot[] = lobby.slots.filter((s) => s.owner === sessionId).map((s) => ({ slot: s.slot, device: s.localId as DeviceId }));
  if (start && lobby.phase !== 'lobby') {
    return <OnlineMatch start={start} locals={locals} mode={lobby.mode} onLeave={leave} reconnecting={status === 'reconnecting'} />;
  }
  return <RoomLobby lobby={lobby} me={sessionId} onLeave={leave} reconnecting={status === 'reconnecting'} />;
}

function OnlineMatch({ start, locals, mode, onLeave, reconnecting }: { start: StartInfo; locals: LocalSlot[]; mode: OnlineMode; onLeave: () => void; reconnecting: boolean }) {
  // One controller per match start; local slots are fixed once the match begins.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const controller = useMemo(() => new OnlineController(start, inputManager, locals), [start]);
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __game?: OnlineController }).__game = controller;
    const unmount = controller.mount();
    return () => {
      unmount();
      controller.dispose();
    };
  }, [controller]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a0d10]">
      <GameScene controller={controller} />
      <Hud mode={mode} onResume={() => controller.toggleMenu(false)} onExit={onLeave} exitLabel="Sair da sala" resultNote="Voltando à sala…" />
      <HeroReveal controller={controller} />
      <MatchTouchControls />
      {reconnecting && <ReconnectBanner />}
    </div>
  );
}

const ReconnectBanner = () => (
  <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
    <div className="hud-panel animate-pulse border-amber-300 px-5 py-2 font-display text-xl text-amber-100">Reconectando ao servidor…</div>
  </div>
);

function RoomLobby({ lobby, me, onLeave, reconnecting }: { lobby: LobbyInfo; me: string; onLeave: () => void; reconnecting: boolean }) {
  const isHost = lobby.hostId === me;
  const mine = lobby.slots.filter((s) => s.owner === me);
  const min = MODE_INFO[lobby.mode].min;
  const canStart = lobby.slots.length >= min && lobby.slots.every((s) => s.connected);
  const clockOffset = useOnline((s) => s.clockOffset);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    if (lobby.startsAt === null) return;
    const id = window.setInterval(() => force((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [lobby.startsAt]);
  const countdown = lobby.startsAt !== null ? Math.max(1, Math.ceil((lobby.startsAt - (Date.now() + clockOffset)) / 1000)) : null;

  // The profile player joins automatically, wearing their own character, color and name.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current || lobby.phase !== 'lobby' || mine.some((s) => s.localId === ME) || lobby.slots.length >= MAX_ROOM_SLOTS) return;
    autoJoined.current = true;
    // Join with the account (level + cosmetics) once it is loaded; offline it joins as a guest.
    void ensureAccount().finally(() => {
      const p = useProfile.getState();
      online.send('join_slot', { localId: ME, name: p.name, characterId: p.characterId, colorIndex: p.colorIndex, auth: credential() });
    });
  }, [lobby.phase, lobby.slots.length, mine]);

  useUiHandler((e: UiEvent) => {
    // Keyboard (left), first controller and touch belong to the profile player; others join as guests.
    const slot = mine.find((s) => devicesOfLocal(s.localId).includes(e.device));
    if (!slot) {
      if (e.action === 'confirm' && lobby.slots.length < MAX_ROOM_SLOTS) {
        sfx.pickup();
        const n = lobby.slots.length + 1;
        online.send('join_slot', { localId: e.device, name: `Convidado ${n}` });
      } else if ((e.action === 'back' || e.action === 'pause') && mine.length === 0) {
        onLeave();
      }
      return true;
    }
    switch (e.action) {
      case 'confirm':
        sfx.ui();
        online.send('ready', { slot: slot.slot, ready: !slot.ready });
        break;
      case 'back':
        sfx.ui();
        if (slot.ready) online.send('ready', { slot: slot.slot, ready: false });
        else online.send('leave_slot', { slot: slot.slot });
        break;
      case 'left':
      case 'right':
        sfx.ui();
        online.send('character', { slot: slot.slot, step: e.action === 'right' ? 1 : -1 });
        break;
      case 'up':
      case 'down':
        sfx.ui();
        online.send('color', { slot: slot.slot, step: e.action === 'down' ? 1 : -1 });
        break;
      case 'pause':
        // Only the host configures the match.
        if (isHost) {
          sfx.ui();
          setSettingsOpen(true);
        }
        break;
    }
    return true;
  });

  const previewPlayers = useMemo(
    () => lobby.slots.map((s) => ({ slot: s.slot, device: s.localId as DeviceId, colorIndex: s.colorIndex, characterId: s.characterId, ready: s.ready, hat: s.loadout?.hat ?? null })),
    [lobby.slots],
  );

  return (
    <div className="menu-bg relative flex h-full w-full flex-col overflow-y-auto overflow-x-hidden screen-safe font-body text-white">
      <div className="menu-embers" aria-hidden />
      <header className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <button className="menu-btn !min-w-0 !px-4 !py-2 !text-lg [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-base" onClick={onLeave}>
          ← Sair da sala
        </button>
        <div className="hud-panel flex items-center gap-4 px-4 py-2 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:py-1">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-amber-100/60 [@media(max-height:500px)]:hidden">{lobby.isPublic ? 'Sala pública' : 'Código da sala'}</div>
            <div className="font-display text-4xl tracking-[0.2em] text-amber-200 [@media(max-height:500px)]:text-2xl" data-testid="room-code">
              {lobby.code}
            </div>
          </div>
          <button
            className="menu-btn !min-w-0 !px-3 !py-1.5 !text-base [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-sm"
            onClick={() => {
              setInviteOpen(true);
              sfx.ui();
            }}
          >
            📱 Convidar
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto mt-2 w-full max-w-5xl [@media(max-height:500px)]:mt-0">
        <div className="h-56 sm:h-64 [@media(max-height:500px)]:h-24">
          <LobbyPreview players={previewPlayers} />
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-3 [@media(max-height:500px)]:gap-1.5">
          {Array.from({ length: MAX_ROOM_SLOTS }, (_, i) => {
            const s = lobby.slots.find((x) => x.slot === i);
            if (!s) return <EmptySlot key={i} slot={i} label="Vaga livre" hint={TOUCH ? 'amigos entram pelo código' : undefined} />;
            const local = s.owner === me;
            return (
              <PlayerSlotCard
                key={i}
                slot={i}
                characterId={s.characterId}
                colorIndex={s.colorIndex}
                ready={s.ready}
                name={s.name}
                subtitle={`${s.level ? `Nv. ${s.level} · ` : ''}${local ? (s.localId === ME ? `Você · ${deviceLabel('me')}` : `Neste PC · ${deviceLabel(s.localId as DeviceId)}`) : '🌐 Online'}`}
                warning={s.connected ? null : 'RECONECTANDO'}
                host={s.owner === lobby.hostId}
                local={local}
                onCharacter={local ? (step) => (sfx.ui(), online.send('character', { slot: s.slot, step })) : undefined}
                onColor={local ? () => (sfx.ui(), online.send('color', { slot: s.slot, step: 1 })) : undefined}
                onReady={local ? () => (sfx.ui(), online.send('ready', { slot: s.slot, ready: !s.ready })) : undefined}
              />
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:grid-cols-[1fr_auto] [@media(max-height:500px)]:gap-2">
          <button
            className="hud-panel flex flex-col items-start px-4 py-2 text-left enabled:hover:brightness-110 disabled:cursor-default [@media(max-height:500px)]:py-1"
            disabled={!isHost}
            onClick={() => setSettingsOpen(true)}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-amber-100/60">
              Partida · {isHost ? (TOUCH ? 'toque para escolher o modo' : 'você é o anfitrião (Start abre as opções)') : 'escolhida pelo anfitrião'}
            </span>
            <span className="font-display text-2xl [@media(max-height:500px)]:text-lg">
              {MODE_INFO[lobby.mode].title} · {ARENAS[lobby.arena].name}
            </span>
            <span className="text-xs opacity-75 [@media(max-height:500px)]:hidden">{MODE_INFO[lobby.mode].subtitle}</span>
          </button>
          <div className="flex flex-col items-stretch justify-end gap-2 sm:w-72 [@media(max-height:500px)]:w-56 [@media(max-height:500px)]:gap-1">
            {reconnecting ? (
              <div className="text-center font-display text-xl text-amber-100">Reconectando…</div>
            ) : (
              <StatusLine count={lobby.slots.length} ready={lobby.slots.filter((s) => s.ready).length} min={min} countdown={countdown} disconnected={false} />
            )}
            {isHost && (
              <button className="menu-btn menu-btn-primary [@media(max-height:500px)]:!min-w-0 [@media(max-height:500px)]:!py-1.5 disabled:cursor-not-allowed disabled:opacity-40" disabled={!canStart} onClick={() => online.send('start', {})}>
                Iniciar agora
              </button>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-amber-50/55 [@media(max-height:500px)]:hidden">
          Você já entrou com seu personagem · <b>A</b>/<b>Espaço</b> fica pronto · ← → personagem · ↑ ↓ cor · {isHost ? <><b>Start</b> escolhe o modo · </> : null}
          mais gente neste PC entra com <b>Enter</b> (teclado B) ou <b>A</b> num outro controle
        </p>
      </div>

      {inviteOpen && <InviteModal code={lobby.code} onClose={() => (sfx.ui(), setInviteOpen(false))} />}
      {/* Back from a match: what this player earned. */}
      <RewardPanel />

      {settingsOpen && isHost && (
        <MatchSettings
          mode={lobby.mode}
          modes={ONLINE_MODES}
          arena={lobby.arena}
          canStart={canStart}
          onMode={(mode) => online.send('mode', { mode })}
          onArena={(arena) => online.send('arena', { arena })}
          onStart={() => {
            setSettingsOpen(false);
            online.send('start', {});
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
