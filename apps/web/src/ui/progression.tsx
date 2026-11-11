import { COSMETICS, RARITY_COLOR, RARITY_LABEL, levelInfo, type CosmeticDef } from '@4walls/shared';
import { BOMB_SKINS } from '../scene/Cosmetics';

/** Small shared pieces of the progression UI (level, XP, coins, titles, item swatches). */

export function LevelBadge({ xp, className = '' }: { xp: number; className?: string }) {
  const { level } = levelInfo(xp);
  return (
    <span
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border-2 border-amber-200/80 bg-gradient-to-b from-amber-400 to-orange-600 px-1.5 font-display text-lg leading-none text-white shadow-[0_2px_0_rgba(0,0,0,0.45)] ${className}`}
      title={`Nível ${level}`}
      data-testid="level-badge"
    >
      {level}
    </span>
  );
}

export function XpBar({ xp, className = '' }: { xp: number; className?: string }) {
  const { level, xpInLevel, xpForLevel } = levelInfo(xp);
  const pct = Math.round((xpInLevel / xpForLevel) * 100);
  return (
    <div className={`w-full ${className}`}>
      <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/20 bg-black/40">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] font-bold uppercase tracking-wider text-amber-100/60">
        <span>Nível {level}</span>
        <span>
          {xpInLevel}/{xpForLevel} XP
        </span>
      </div>
    </div>
  );
}

export function Coins({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-display text-amber-200 ${className}`} data-testid="coins">
      <CoinIcon />
      {value.toLocaleString('pt-BR')}
    </span>
  );
}

export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#ffc23a" stroke="#a8650a" strokeWidth="1.6" />
      <circle cx="10" cy="10" r="5.6" fill="none" stroke="#ffe48a" strokeWidth="1.4" />
      <text x="10" y="13.6" textAnchor="middle" fontSize="9" fontWeight="900" fill="#a8650a">4</text>
    </svg>
  );
}

export function TitleTag({ id, className = '' }: { id: string | null | undefined; className?: string }) {
  const t = id ? COSMETICS[id] : undefined;
  if (!t) return null;
  return (
    <span className={`text-xs font-black uppercase tracking-widest ${className}`} style={{ color: RARITY_COLOR[t.rarity] }}>
      « {t.name} »
    </span>
  );
}

const HAT_ICON: Record<string, string> = {
  hat_bone: '🧢',
  hat_cartola: '🎩',
  hat_bruxa: '🧙',
  hat_coroa: '👑',
  hat_aureola: '😇',
  hat_chifres: '😈',
  hat_folhas: '🌿',
};
const FIRE_GRADIENT: Record<string, string> = {
  fire_azul: 'radial-gradient(circle at 50% 70%, #e8f6ff, #3fa0ff 45%, #062a7a)',
  fire_verde: 'radial-gradient(circle at 50% 70%, #f0ffd8, #5aff3a 45%, #0d4a05)',
  fire_roxo: 'radial-gradient(circle at 50% 70%, #ffe8ff, #c45aff 45%, #3a0a5a)',
  fire_dourado: 'radial-gradient(circle at 50% 70%, #fffbe8, #ffc23a 45%, #6a3a00)',
};

/** Visual chip for an item: icon (hat), shiny sphere (bomb), fireball (explosion), text (title). */
export function ItemSwatch({ item, size = 44 }: { item: CosmeticDef; size?: number }) {
  const box = { width: size, height: size };
  if (item.slot === 'hat') return <span className="flex items-center justify-center rounded-full bg-black/30" style={{ ...box, fontSize: size * 0.55 }}>{HAT_ICON[item.id] ?? '🎩'}</span>;
  if (item.slot === 'bomb') {
    const s = BOMB_SKINS[item.id];
    return <span className="block rounded-full border-2 border-black/50 shadow-[inset_-4px_-5px_0_rgba(0,0,0,0.35)]" style={{ ...box, background: `radial-gradient(circle at 35% 30%, #ffffffaa, ${s?.body ?? '#222'} 40%, ${s?.emissive ?? '#000'} 140%)` }} />;
  }
  if (item.slot === 'fire') return <span className="block rounded-full" style={{ ...box, background: FIRE_GRADIENT[item.id] ?? '#f60', boxShadow: '0 0 12px rgba(255,255,255,0.25)' }} />;
  return (
    <span className="flex items-center justify-center rounded-lg bg-black/30 px-1 text-center font-display text-[11px] leading-tight" style={{ ...box, color: RARITY_COLOR[item.rarity] }}>
      «»
    </span>
  );
}

export function RarityLabel({ item }: { item: CosmeticDef }) {
  return (
    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: RARITY_COLOR[item.rarity] }}>
      {RARITY_LABEL[item.rarity]}
    </span>
  );
}
