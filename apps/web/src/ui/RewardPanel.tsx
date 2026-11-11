import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, COSMETICS, type RewardReport } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { useAccount } from '../store/useAccount';
import { Coins, ItemSwatch, LevelBadge, XpBar } from './progression';
import { useMenuNav } from './useMenuNav';

/**
 * After an online match: XP earned (itemized), coins, level-up, new achievements and unlocked
 * cosmetics. The XP bar fills from the old total to the new one.
 */
export function RewardPanel() {
  const report = useAccount((s) => s.lastReward);
  if (!report) return null;
  return <Panel key={report.account.history[0]?.at ?? 0} report={report} />;
}

function Panel({ report }: { report: RewardReport }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    sfx.ui();
    useAccount.setState({ lastReward: null });
  };
  useMenuNav(ref, { onBack: close });
  const { reward, account, levelBefore, levelAfter, bonusCoins } = report;
  const xpBefore = account.xp - reward.xp;
  const [xpShown, setXpShown] = useState(xpBefore);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setXpShown(account.xp);
      if (levelAfter > levelBefore) sfx.victory();
      else sfx.pickup();
    }, 350);
    return () => window.clearTimeout(id);
  }, [account.xp, levelAfter, levelBefore]);

  return (
    <div ref={ref} className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/65 p-3 backdrop-blur-sm" data-testid="reward-panel">
      <div className="hud-panel flex w-full max-w-lg flex-col gap-2 px-5 py-4 [@media(max-height:500px)]:max-w-3xl [@media(max-height:500px)]:py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-3xl text-amber-100 [@media(max-height:500px)]:text-2xl">Recompensas</div>
          <div className="font-display text-3xl text-amber-300 [@media(max-height:500px)]:text-2xl">+{reward.xp} XP</div>
        </div>
        {levelAfter > levelBefore && (
          <div className="animate-bounce rounded-xl bg-gradient-to-r from-amber-400 to-orange-600 px-3 py-1.5 text-center font-display text-2xl text-white shadow-[0_3px_0_rgba(0,0,0,0.4)]" data-testid="level-up">
            Subiu para o nível {levelAfter}!
          </div>
        )}
        <div className="grid gap-3 [@media(max-height:500px)]:grid-cols-2">
          <div>
            {reward.xp === 0 && <p className="mb-1 text-sm text-white/60">Partida curta demais para render XP: jogue um pouco mais da próxima vez.</p>}
            <ul className="flex flex-col gap-0.5 text-sm">
              {reward.lines.map((l) => (
                <li key={l.label} className="flex justify-between">
                  <span className="text-white/80">{l.label}</span>
                  <span className="font-bold text-amber-200">+{l.xp}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-2">
              <LevelBadge xp={xpShown} />
              <XpBar xp={xpShown} className="flex-1" />
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-white/70">Moedas</span>
              <span className="flex items-center gap-2">
                <Coins value={reward.coins + bonusCoins} className="text-lg" />
                <span className="text-xs text-white/50">(total {account.coins.toLocaleString('pt-BR')})</span>
              </span>
            </div>
          </div>
          {(report.newAchievements.length > 0 || report.newItems.length > 0) && (
            <div className="flex flex-col gap-1.5">
              {report.newAchievements.map((id) => {
                const a = ACHIEVEMENTS.find((x) => x.id === id)!;
                return (
                  <div key={id} className="flex items-center gap-2 rounded-lg bg-amber-300/15 px-2 py-1 ring-1 ring-amber-300/50">
                    <span className="text-2xl">{a.icon}</span>
                    <span className="flex-1">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-amber-200">Conquista!</span>
                      <span className="font-display text-lg leading-none">{a.name}</span>
                    </span>
                    <Coins value={a.coins} className="text-sm" />
                  </div>
                );
              })}
              {report.newItems.map((id) => {
                const c = COSMETICS[id];
                return c ? (
                  <div key={id} className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1">
                    <ItemSwatch item={c} size={32} />
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-emerald-300">Desbloqueado</span>
                      <span className="font-display text-lg leading-none">{c.name}</span>
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
        <button data-nav data-nav-default className="menu-btn menu-btn-primary mt-1 self-center !min-w-0 !px-6 !py-2 !text-lg" onClick={close}>
          Continuar
        </button>
      </div>
    </div>
  );
}
