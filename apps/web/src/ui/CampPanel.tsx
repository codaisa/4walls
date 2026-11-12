import { useEffect, useRef, useState } from 'react';
import { CAMP_ACTIONS, CHARACTERS, RESIDENT_OF, SLOT_COLORS, campActionIndex, type CampService, type CharacterId } from '@4walls/shared';
import { campActionState } from '@4walls/core';
import { sfx } from '../audio/Sfx';
import type { MatchView } from '../game/presentation';
import { useHud } from '../store/useHud';
import { useMenuNav } from './useMenuNav';

const TABS: { id: CampService; icon: string; name: string }[] = [
  { id: 'shop', icon: '🛒', name: 'Lojinha' },
  { id: 'smith', icon: '⚒️', name: 'Ferreiro' },
  { id: 'cook', icon: '🍲', name: 'Cozinha' },
  { id: 'scout', icon: '🔭', name: 'Batedor' },
  { id: 'contract', icon: '📜', name: 'Contratos' },
  { id: 'wheel', icon: '🎡', name: 'Roleta' },
  { id: 'hero', icon: '🎭', name: 'Heróis' },
];

/**
 * Task 3 · A3 — the camp's services: one tab per tent (opened by the hero living there), the
 * purse on top, a player picker when several play on this device. Touch, mouse and gamepad.
 * Every purchase is validated by the simulation itself (local and online share the rules).
 */
export function CampPanel({ controller, slots }: { controller: MatchView; slots: number[] }) {
  const open = useHud((s) => s.campOpen);
  const inCamp = useHud((s) => !!s.adventure?.inCamp);
  const close = () => useHud.getState().set({ campOpen: false });
  useEffect(() => {
    if (open && !inCamp) close();
  }, [open, inCamp]);
  if (!open || !inCamp) return null;
  return <Panel controller={controller} slots={slots} onClose={close} />;
}

function Panel({ controller, slots, onClose }: { controller: MatchView; slots: number[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, { onBack: onClose });
  const [tab, setTab] = useState<CampService>('shop');
  const [slot, setSlot] = useState(slots[0] ?? 0);
  // Re-read the state a few times a second (purse, what was used, who is alive).
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, []);
  const s = controller.state;
  const ex = s.expedition;
  const p = s.players.find((pp) => pp.slot === slot) ?? s.players[0];
  const residents = ex?.residents ?? [];
  const resident = tab === 'hero' ? null : (RESIDENT_OF[tab as Exclude<CampService, 'hero'>] as CharacterId);
  const open = !resident || residents.includes(resident);
  const actions = CAMP_ACTIONS.filter((a) => a.service === tab && (tab !== 'hero' || a.id !== `hero:${p.characterId}`));
  const contract = ex?.contract;
  return (
    <div ref={ref} className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-2 backdrop-blur-sm" data-testid="camp-panel">
      <div className="hud-panel flex max-h-full w-full max-w-3xl flex-col gap-2 overflow-hidden px-4 py-3 [@media(max-height:500px)]:gap-1.5 [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-3xl text-amber-100 [@media(max-height:500px)]:text-xl">🏕️ Acampamento</h2>
          <span className="font-display text-xl text-amber-200 [@media(max-height:500px)]:text-base" data-testid="camp-purse">
            🪙 {ex?.coins ?? 0}
            {ex?.banked ? <span className="ml-2 text-sm opacity-75">🔒 {ex.banked}</span> : null}
          </span>
        </div>
        {slots.length > 1 && (
          <div className="flex gap-1.5">
            {slots.map((sl) => {
              const pl = s.players.find((pp) => pp.slot === sl);
              if (!pl) return null;
              const c = SLOT_COLORS[pl.colorIndex % SLOT_COLORS.length];
              return (
                <button key={sl} data-nav onClick={() => (sfx.ui(), setSlot(sl))} className={`choice !min-w-0 !px-3 !py-1 ${sl === slot ? 'choice-on' : ''}`} style={{ borderColor: c.primary }}>
                  <span className="font-display text-base" style={{ color: c.primary }}>{pl.name}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const res = t.id === 'hero' ? null : RESIDENT_OF[t.id as Exclude<CampService, 'hero'>];
            const locked = !!res && !residents.includes(res);
            return (
              <button key={t.id} data-nav data-nav-default={t.id === tab ? '' : undefined} onClick={() => (sfx.ui(), setTab(t.id))} className={`choice !min-w-0 !px-2.5 !py-1 ${t.id === tab ? 'choice-on' : ''} ${locked ? 'opacity-50' : ''}`} data-testid={`camp-tab-${t.id}`}>
                <span className="text-sm font-bold [@media(max-height:500px)]:text-xs">
                  {locked ? '🔒' : t.icon} {t.name}
                </span>
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scroll-area">
          {resident && (
            <div className="mb-1 text-xs text-amber-50/70">
              {open ? `${CHARACTERS[resident].name} mora aqui.` : `🔒 Tenda fechada: resgate ${CHARACTERS[resident].name} numa cela para abrir.`}
            </div>
          )}
          {tab === 'contract' && contract && (
            <div className="mb-1 rounded-lg bg-amber-300/15 px-2 py-1 text-sm ring-1 ring-amber-300/40">
              📜 Contrato ativo: {CAMP_ACTIONS.find((a) => a.id === `contract:${contract.kind}`)?.name} · {contract.progress}/{contract.goal} · prêmio 🪙 {contract.reward}
            </div>
          )}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 [@media(max-height:500px)]:grid-cols-2">
            {open &&
              actions.map((a) => {
                const st = campActionState(s, p, a);
                return (
                  <button
                    key={a.id}
                    data-nav
                    disabled={!st.ok}
                    onClick={() => {
                      sfx.ui();
                      controller.campAction?.(p.slot, campActionIndex(a.id));
                    }}
                    className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1.5 text-left ring-1 ring-white/10 hover:brightness-125 disabled:opacity-45"
                    data-testid={`camp-${a.id}`}
                  >
                    <span className="text-2xl">{a.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base leading-tight">{a.name}</span>
                      <span className="block text-[10px] leading-tight text-white/65">{a.desc}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-amber-200">{st.ok ? (st.price ? `🪙 ${st.price}` : 'Grátis') : st.reason}</span>
                  </button>
                );
              })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-white/50 [@media(max-height:500px)]:hidden">🎮 D-pad escolhe · A compra · B fecha</span>
          <button data-nav className="menu-btn !min-w-0 !px-4 !py-1" onClick={() => (sfx.ui(), onClose())}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
