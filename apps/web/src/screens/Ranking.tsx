import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CHARACTERS, SEASONS, SLOT_COLORS, currentSeason, type CharacterId, type RankingBoard, type RankingEntry } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { ensureAccount, fetchRanking, useAccount } from '../store/useAccount';
import { TitleTag } from '../ui/progression';
import { useMenuNav } from '../ui/useMenuNav';

const BOARDS: { id: RankingBoard; label: string; unit: string }[] = [
  { id: 'xp', label: 'Nível', unit: 'XP' },
  { id: 'wins', label: 'Vitórias', unit: 'vitórias' },
  { id: 'season', label: 'Temporada', unit: 'XP da temporada' },
  { id: 'depth', label: 'Aventura', unit: 'regiões' },
];

/** Global ranking (every account on this server that played at least once). */
export function Ranking() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState<RankingBoard>('xp');
  const [data, setData] = useState<{ entries: RankingEntry[]; me: RankingEntry | null } | null>(null);
  const [error, setError] = useState(false);
  const myId = useAccount((s) => s.account?.id);
  const back = () => {
    sfx.ui();
    navigate('/');
  };
  useMenuNav(root, { onBack: back });

  useEffect(() => {
    let alive = true;
    setError(false);
    void ensureAccount()
      .then(() => fetchRanking(board))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [board]);

  const season = currentSeason();
  const unit = BOARDS.find((b) => b.id === board)!.unit;
  const meOutside = data?.me && !data.entries.some((e) => e.id === data.me!.id) ? data.me : null;

  return (
    <div ref={root} className="menu-bg relative flex h-full w-full flex-col overflow-hidden font-body text-white">
      <div className="relative z-10 mx-auto flex h-full w-full max-w-3xl flex-col gap-3 screen-safe [@media(max-height:500px)]:gap-2">
        <header className="flex items-center justify-between gap-3">
          <button data-nav className="menu-btn !min-w-0 !px-4 !py-2 !text-lg [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-base" onClick={back}>
            ← Voltar
          </button>
          <h1 className="logo font-display text-4xl sm:text-5xl [@media(max-height:500px)]:text-2xl">Ranking</h1>
          <div className="w-24" />
        </header>

        <nav className="flex flex-wrap items-center gap-2">
          {BOARDS.map((b) => (
            <button
              key={b.id}
              data-nav
              data-nav-default={b.id === board ? '' : undefined}
              onClick={() => {
                sfx.ui();
                setBoard(b.id);
              }}
              className={`rounded-full border-2 px-4 py-1.5 font-display text-lg transition [@media(max-height:500px)]:py-0.5 [@media(max-height:500px)]:text-base ${board === b.id ? 'border-amber-300 bg-amber-300/25 text-amber-100' : 'border-white/20 bg-black/30 text-white/80 hover:bg-white/10'}`}
            >
              {b.label}
            </button>
          ))}
          {board === 'season' && (
            <span className="ml-auto text-xs font-bold uppercase tracking-widest" style={{ color: season.color }}>
              {season.name} · até {new Date(season.end).toLocaleDateString('pt-BR')}
            </span>
          )}
        </nav>

        <div className="hud-panel min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2" data-testid="ranking-list">
          {error && <div className="py-6 text-center text-red-200">Sem conexão com o servidor.</div>}
          {!error && !data && <div className="py-6 text-center opacity-60">Carregando…</div>}
          {data && data.entries.length === 0 && <div className="py-6 text-center opacity-70">Ninguém jogou ainda. Seja o primeiro!</div>}
          {data && (
            <ol className="flex flex-col gap-1">
              {data.entries.map((e) => (
                <Row key={e.id} e={e} me={e.id === myId} unit={unit} />
              ))}
              {meOutside && (
                <>
                  <li className="py-1 text-center text-white/40">⋯</li>
                  <Row e={meOutside} me unit={unit} />
                </>
              )}
            </ol>
          )}
        </div>
        <p className="text-center text-[11px] text-amber-50/40 [@media(max-height:500px)]:hidden">
          Partidas online contam para o ranking. Próximas temporadas: {SEASONS.filter((s) => s.start > season.start).map((s) => s.name.replace('Temporada ', '')).join(', ')}.
        </p>
      </div>
    </div>
  );
}

function Row({ e, me, unit }: { e: RankingEntry; me: boolean; unit: string }) {
  const color = SLOT_COLORS[e.colorIndex % SLOT_COLORS.length];
  const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : null;
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3 py-1.5 ${me ? 'bg-amber-300/20 ring-2 ring-amber-300/70' : 'bg-black/25'}`} data-testid={me ? 'ranking-me' : undefined}>
      <span className="w-8 text-center font-display text-xl">{medal ?? e.rank}</span>
      <span className="h-6 w-6 shrink-0 rounded-full border-2 border-white/70" style={{ background: color.primary }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-lg leading-tight" style={{ color: color.primary }}>
          {e.name} {me && <span className="text-xs text-amber-200">(você)</span>}
        </span>
        <span className="flex gap-2 text-[11px] text-white/60">
          <span>Nv. {e.level}</span>
          <span>{CHARACTERS[e.characterId as CharacterId]?.name ?? ''}</span>
          <TitleTag id={e.title} className="!text-[10px]" />
        </span>
      </span>
      <span className="text-right">
        <span className="block font-display text-xl leading-none text-amber-200">{e.value.toLocaleString('pt-BR')}</span>
        <span className="text-[10px] uppercase tracking-wider text-white/50">{unit}</span>
      </span>
    </li>
  );
}
