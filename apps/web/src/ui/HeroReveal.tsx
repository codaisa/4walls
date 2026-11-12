import { useEffect, useMemo, useState } from 'react';
import { CHARACTERS, SLOT_COLORS, type CharacterId } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import type { MatchView } from '../game/presentation';
import { claimHero } from '../store/useAccount';

interface Reveal {
  key: number;
  characterId: CharacterId;
  name: string;
  color: string;
  revived: boolean;
  byName: string;
  isNew: boolean;
}

let nextKey = 1;
const SHOW_MS = 2700;
const SHOW_NEW_MS = 3700;

/**
 * "Joins the fight!" — the big animated card shown when a caged hero is rescued in Adventure:
 * a torn, waving green-and-gold banner, the hero's portrait sliding in, the name slamming down,
 * and a "new hero" ribbon with confetti when it is new for this device's collection.
 * Gameplay keeps running underneath (online matches can't pause); it never takes input.
 */
export function HeroReveal({ controller }: { controller: MatchView }) {
  const [queue, setQueue] = useState<Reveal[]>([]);

  useEffect(
    () =>
      controller.on((e, s) => {
        if (e.type !== 'heroJoined') return;
        const p = s.players.find((pp) => pp.id === e.playerId);
        const by = s.players.find((pp) => pp.id === e.byId);
        const local = controller.isLocal ? controller.isLocal(e.playerId) : true;
        const isNew = local && claimHero(e.characterId);
        sfx.heroReveal(isNew);
        setQueue((q) => [
          ...q,
          {
            key: nextKey++,
            characterId: e.characterId as CharacterId,
            name: p?.name ?? 'Jogador',
            color: SLOT_COLORS[(p?.colorIndex ?? 0) % SLOT_COLORS.length].primary,
            revived: e.revived,
            byName: by?.name ?? '',
            isNew,
          },
        ]);
      }),
    [controller],
  );

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), current.isNew ? SHOW_NEW_MS : SHOW_MS);
    return () => window.clearTimeout(t);
  }, [current]);

  if (!current) return null;
  return <RevealCard key={current.key} r={current} />;
}

/** Jagged "torn paper" edges for the banner, stable per card. */
function tornClip(seed: number) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const px = (i / 40) * 100;
    top.push(`${px}% ${4 + rnd() * 7}%`);
    bottom.push(`${100 - px}% ${89 + rnd() * 7}%`);
  }
  return `polygon(${[...top, ...bottom].join(',')})`;
}

function RevealCard({ r }: { r: Reveal }) {
  const hero = CHARACTERS[r.characterId];
  const clip = useMemo(() => tornClip(r.key), [r.key]);
  const total = r.isNew ? SHOW_NEW_MS : SHOW_MS;
  const confetti = useMemo(
    () =>
      r.isNew
        ? Array.from({ length: 46 }, (_, i) => ({
            left: (i * 37) % 100,
            delay: 0.55 + ((i * 13) % 20) / 25,
            dur: 1.6 + ((i * 7) % 10) / 10,
            color: ['#009c3b', '#ffdf00', '#2f6bff', '#ffffff', '#ff5a3c'][i % 5],
            rot: (i * 47) % 360,
          }))
        : [],
    [r.isNew],
  );
  const who = r.revived ? `${r.name} voltou como` : `${r.name} agora é`;

  return (
    <div className="hero-reveal pointer-events-none absolute inset-0 z-50 overflow-hidden" style={{ ['--hr-total' as string]: `${total}ms` }} data-testid="hero-reveal" aria-live="polite">
      <div className="hr-flash" />
      <div className="hr-band-wrap">
        <div className="hr-band" style={{ clipPath: clip }}>
          <div className="hr-flag">
            <div className="hr-diamond" />
            <div className="hr-globe">
              <div className="hr-globe-stripe" />
              {[18, 30, 44, 62, 70, 52, 38].map((l, i) => (
                <span key={i} className="hr-star" style={{ left: `${l}%`, top: `${[58, 70, 64, 72, 60, 80, 82][i]}%` }} />
              ))}
            </div>
          </div>
          <div className="hr-wave" />
        </div>
      </div>

      <img className="hr-portrait" src={`/heroes/${r.characterId}.png`} alt="" draggable={false} />

      <div className="hr-text">
        <div className="hr-who">
          <span className="hr-dot" style={{ background: r.color }} />
          {who}
        </div>
        <div className="hr-name font-display">{hero.name}</div>
        <div className="hr-sub font-display">{r.revived ? 'VOLTOU PRA BRIGA!' : 'ENTRA NA BRIGA!'}</div>
        <div className="hr-quote">
          “{hero.quote}” <span className="hr-ability">⚡ {hero.abilityName}</span>
        </div>
      </div>

      {r.isNew && (
        <>
          <div className="hr-new font-display">
            <span>★ NOVO PERSONAGEM! ★</span>
            <small>Agora ele é seu: escolha no Ateliê ou na sala</small>
          </div>
          {confetti.map((c, i) => (
            <span
              key={i}
              className="hr-confetti"
              style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, transform: `rotate(${c.rot}deg)` }}
            />
          ))}
        </>
      )}
    </div>
  );
}
