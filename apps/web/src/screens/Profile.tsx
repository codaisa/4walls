import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ACHIEVEMENTS, SLOT_COLORS, currentSeason, type ModeId } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { ensureAccount, useAccount } from '../store/useAccount';
import { useProfile } from '../store/useProfile';
import { Coins, LevelBadge, TitleTag, XpBar } from '../ui/progression';
import { useMenuNav } from '../ui/useMenuNav';

const MODE_NAME: Record<ModeId, string> = { versus: 'Versus', solo: 'Caçada', adventure: 'Aventura', bossrush: 'Boss Rush' };
const OUTCOME = { win: { label: 'Vitória', cls: 'text-emerald-300' }, loss: { label: 'Derrota', cls: 'text-red-300' }, draw: { label: 'Empate', cls: 'text-amber-200' } } as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}min` : `${m}min`;
};

/** Account page: level, statistics, achievements and the last matches. */
export function Profile() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const { account, status } = useAccount();
  const profile = useProfile();
  const back = () => {
    sfx.ui();
    navigate('/');
  };
  useMenuNav(root, { onBack: back });
  useEffect(() => {
    void ensureAccount();
  }, []);

  const color = SLOT_COLORS[profile.colorIndex];
  const s = account?.stats;
  const season = currentSeason();

  return (
    <div ref={root} className="menu-bg relative flex h-full w-full flex-col overflow-hidden font-body text-white">
      <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col gap-3 px-4 py-4 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:py-2">
        <header className="flex items-center justify-between gap-3">
          <button data-nav data-nav-default className="menu-btn !min-w-0 !px-4 !py-2 !text-lg [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-base" onClick={back}>
            ← Voltar
          </button>
          <h1 className="logo font-display text-4xl sm:text-5xl [@media(max-height:500px)]:text-2xl">Perfil</h1>
          <div className="w-24" />
        </header>

        {!account ? (
          <div className="hud-panel px-4 py-6 text-center">{status === 'offline' ? 'Sem conexão com o servidor: o perfil fica guardado nele.' : 'Carregando…'}</div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [@media(max-height:500px)]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" data-testid="profile-page">
            <section className="flex flex-col gap-3">
              <div className="hud-panel flex flex-col items-center gap-1 px-4 py-3">
                <div className="flex items-center gap-2">
                  <LevelBadge xp={account.xp} className="!h-10 !min-w-10 !text-2xl" />
                  <span className="font-display text-3xl leading-none" style={{ color: color.primary }}>
                    {account.name}
                  </span>
                </div>
                <TitleTag id={account.loadout.title} />
                <XpBar xp={account.xp} className="mt-1" />
                <div className="mt-1 flex w-full items-center justify-between text-sm">
                  <Coins value={account.coins} className="text-xl" />
                  <span className="text-xs font-bold" style={{ color: season.color }}>
                    {season.name}: {(account.seasonXp[season.id] ?? 0).toLocaleString('pt-BR')} XP
                  </span>
                </div>
              </div>

              <div className="hud-panel grid grid-cols-3 gap-2 px-3 py-3 text-center">
                <Stat label="Partidas" value={s!.matches} />
                <Stat label="Vitórias" value={s!.wins} />
                <Stat label="Derrotas" value={s!.losses} />
                <Stat label="Rivais" value={s!.kills} />
                <Stat label="Inimigos" value={s!.enemies} />
                <Stat label="Chefões" value={s!.bossesDefeated} />
                <Stat label="Blocos" value={s!.blocks} />
                <Stat label="Power-ups" value={s!.powerups} />
                <Stat label="Melhor sequência" value={s!.bestWinStreak} />
                <Stat label="Aproveitamento" value={s!.matches ? `${Math.round((s!.wins / s!.matches) * 100)}%` : '—'} />
                <Stat label="Mortes" value={s!.deaths} />
                <Stat label="Tempo de jogo" value={fmtTime(s!.playSeconds)} />
              </div>

              <div className="hud-panel px-3 py-2">
                <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-amber-100/60">Por modo</h2>
                {(Object.keys(MODE_NAME) as ModeId[]).map((m) => {
                  const v = s!.byMode[m];
                  return (
                    <div key={m} className="flex justify-between text-sm">
                      <span>{MODE_NAME[m]}</span>
                      <span className="text-white/70">
                        {plural(v?.matches ?? 0, 'partida', 'partidas')} · {plural(v?.wins ?? 0, 'vitória', 'vitórias')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <div className="hud-panel px-3 py-2">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-100/60">
                  Conquistas · {account.achievements.length}/{ACHIEVEMENTS.length}
                </h2>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 [@media(max-height:500px)]:grid-cols-2">
                  {ACHIEVEMENTS.map((a) => {
                    const done = account.achievements.includes(a.id);
                    const [v, goal] = a.progress(s!);
                    return (
                      <div key={a.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${done ? 'bg-amber-300/15 ring-1 ring-amber-300/50' : 'bg-black/25'}`} data-testid={`ach-${a.id}`}>
                        <span className={`text-2xl ${done ? '' : 'opacity-40 grayscale'}`}>{a.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-base leading-tight">{a.name}</span>
                          <span className="block truncate text-[10px] text-white/60">{a.desc}</span>
                          {!done && (
                            <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-white/15">
                              <span className="block h-full bg-amber-300" style={{ width: `${Math.min(100, (v / goal) * 100)}%` }} />
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] font-bold text-amber-200">{done ? '✓' : `${Math.min(v, goal)}/${goal}`}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="hud-panel px-3 py-2">
                <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-amber-100/60">Últimas partidas</h2>
                {account.history.length === 0 && <div className="py-2 text-sm text-white/60">Jogue uma partida online para começar seu histórico.</div>}
                <ul className="flex flex-col gap-1">
                  {account.history.map((h) => (
                    <li key={h.at} className="flex items-center gap-2 rounded-md bg-black/25 px-2 py-1 text-sm">
                      <span className={`w-16 font-bold ${OUTCOME[h.outcome].cls}`}>{OUTCOME[h.outcome].label}</span>
                      <span className="flex-1 truncate text-white/80">{MODE_NAME[h.mode] ?? h.mode}</span>
                      <span className="text-xs text-white/50">{new Date(h.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                      <span className="w-16 text-right font-bold text-amber-200">+{h.xp} XP</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="font-display text-2xl leading-none text-amber-100 [@media(max-height:500px)]:text-xl">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/55">{label}</div>
    </div>
  );
}

