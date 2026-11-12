import { useEffect, useState } from 'react';
import { regionById } from '@4walls/core';
import type { MatchView } from '../game/presentation';

interface Card {
  key: number;
  index: number;
  name: string;
  chapter: string;
  objective: string;
}

const objectiveText = (kind: 'clear' | 'key' | 'lever') =>
  kind === 'key' ? '🔑 Ache a chave e leve até o portão' : kind === 'lever' ? '⚙️ Cruze o rio de lava e exploda a alavanca' : '💥 Exploda todos os Magmitos';
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
      setCard({ key: seq++, index: id + 1, name: r.name, chapter: r.chapter, objective: objectiveText(r.objective.kind) });
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
    const t = window.setTimeout(() => setCard(null), 3600);
    return () => window.clearTimeout(t);
  }, [card]);
  if (!card) return null;
  return (
    <div key={card.key} className="chapter-card pointer-events-none absolute inset-x-0 top-[16%] z-40 flex justify-center px-4" data-testid="chapter-card">
      <div className="chapter-inner flex flex-col items-center">
        <div className="chapter-index font-display">REGIÃO {card.index}</div>
        <div className="chapter-name font-display">{card.name}</div>
        <div className="chapter-sub">— {card.chapter} —</div>
        <div className="chapter-goal">{card.objective}</div>
      </div>
    </div>
  );
}
