import { useEffect, useState } from 'react';
import { arcInfo, regionById, type RegionVariant } from '@4walls/core';
import type { MatchView } from '../game/presentation';

interface Card {
  key: number;
  index: number;
  name: string;
  chapter: string;
  objective: string;
  /** Set on the first region of an arc: the arc's title. */
  arc: { n: number; name: string; variant: RegionVariant } | null;
  variant: RegionVariant;
  arcEnd: boolean;
}

export const VARIANT_BADGE: Record<RegionVariant, string> = { normal: '', night: '🌙 Noite', mist: '☁️ Névoa', corrupted: '🟣 Corrompida' };

const objectiveText = (kind: 'clear' | 'key' | 'lever' | 'seals' | 'purify' | 'boss' | 'camp') =>
  kind === 'camp'
    ? '🔥 Reúnam-se na fogueira para salvar a expedição'
    : kind === 'boss'
    ? '☠️ Derrote o guardião do arco'
    : kind === 'key'
    ? '🔑 Ache a chave e leve até o portão'
    : kind === 'lever'
      ? '⚙️ Cruze o rio de lava e exploda a alavanca'
      : kind === 'seals'
        ? '💠 Quebre os 3 selos com explosões em cadeia'
        : kind === 'purify'
          ? '🌿 Purifique as 3 raízes corrompidas'
          : '💥 Exploda todos os Magmitos';
let seq = 1;

/**
 * Adventure chapter card: a banner that slides down from the top when the group enters a region
 * (and at the start of the journey). Purely informative — it never pauses or takes input.
 */
export function ChapterCard({ controller }: { controller: MatchView }) {
  const [card, setCard] = useState<Card | null>(null);
  useEffect(() => {
    const show = (id: number) => {
      const r = regionById(controller.state, id);
      if (!r) return;
      const a = arcInfo(controller.state.config.seed, r.arc);
      setCard({
        key: seq++,
        index: id + 1,
        name: r.name,
        chapter: r.chapter,
        objective: objectiveText(r.objective.kind),
        arc: a.start === id ? { n: r.arc + 1, name: a.name, variant: a.variant } : null,
        variant: r.variant,
        arcEnd: r.arcEnd,
      });
    };
    // The first card waits for the countdown to finish (it would cover the big 3-2-1).
    const s = controller.state;
    const wait = s.phase === 'countdown' ? Math.max(0, ((s.countdownTicks - s.tick) / 60) * 1000 + 300) : 0;
    const first = s.adventure ? window.setTimeout(() => show(controller.state.adventure!.depth), wait) : 0;
    const off = controller.on((e) => {
      if (e.type === 'regionEntered') show(e.region);
    });
    return () => {
      window.clearTimeout(first);
      off();
    };
  }, [controller]);
  useEffect(() => {
    if (!card) return;
    const t = window.setTimeout(() => setCard(null), card.arc ? 4600 : 3600);
    return () => window.clearTimeout(t);
  }, [card]);
  if (!card) return null;
  return (
    <div key={card.key} className="chapter-card pointer-events-none absolute inset-x-0 top-[16%] z-40 flex justify-center px-4" data-testid="chapter-card">
      <div className="chapter-inner flex flex-col items-center">
        {card.arc && (
          <div className={`chapter-arc font-display variant-${card.arc.variant}`} data-testid="arc-title">
            ARCO {card.arc.n} · {card.arc.name}
          </div>
        )}
        <div className="chapter-index font-display">
          REGIÃO {card.index}
          {card.arcEnd && <span className="chapter-tag chapter-boss">CHEFE</span>}
          {card.variant !== 'normal' && <span className={`chapter-tag variant-${card.variant}`}>{VARIANT_BADGE[card.variant]}</span>}
        </div>
        <div className="chapter-name font-display">{card.name}</div>
        <div className="chapter-sub">— {card.chapter} —</div>
        <div className="chapter-goal">{card.objective}</div>
      </div>
    </div>
  );
}
