import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { COSMETICS, SLOT_LABEL, unlockHint, type CosmeticDef, type CosmeticSlot } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { buy, ensureAccount, equip, useAccount } from '../store/useAccount';
import { Coins, ItemSwatch, RarityLabel } from '../ui/progression';
import { useMenuNav } from '../ui/useMenuNav';

const SLOTS: CosmeticSlot[] = ['hat', 'bomb', 'fire', 'title'];
const TAB_LABEL: Record<CosmeticSlot, string> = { hat: 'Chapéus', bomb: 'Bombas', fire: 'Explosões', title: 'Títulos' };

/**
 * Loja: cosmetics for coins (earned by playing; never gameplay advantages). Items that are earned
 * through levels, achievements or seasons are listed too, with how to get them.
 */
export function Shop() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<CosmeticSlot>('hat');
  const [confirm, setConfirm] = useState<string | null>(null);
  const { account, status, shopError } = useAccount();
  const back = () => {
    sfx.ui();
    navigate('/');
  };
  useMenuNav(root, { onBack: back });
  useEffect(() => {
    void ensureAccount();
  }, []);

  const items = Object.values(COSMETICS).filter((c) => c.slot === tab && !c.starter);
  const forSale = items.filter((c) => c.price > 0).sort((a, b) => a.price - b.price);
  const earned = items.filter((c) => c.price === 0);

  const onBuy = async (c: CosmeticDef) => {
    if (confirm !== c.id) {
      sfx.ui();
      setConfirm(c.id);
      return;
    }
    setConfirm(null);
    if (await buy(c.id)) {
      sfx.pickup();
      void equip(c.slot, c.id);
    } else sfx.ui();
  };

  return (
    <div ref={root} className="menu-bg relative flex h-full w-full flex-col overflow-hidden font-body text-white">
      <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col gap-3 px-4 py-4 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:py-2">
        <header className="flex items-center justify-between gap-3">
          <button data-nav className="menu-btn !min-w-0 !px-4 !py-2 !text-lg [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-base" onClick={back}>
            ← Voltar
          </button>
          <h1 className="logo font-display text-4xl sm:text-5xl [@media(max-height:500px)]:text-2xl">Loja</h1>
          <div className="hud-panel px-3 py-1">{account ? <Coins value={account.coins} className="text-2xl [@media(max-height:500px)]:text-lg" /> : <span className="text-sm opacity-60">—</span>}</div>
        </header>

        <nav className="flex gap-2 overflow-x-auto no-scrollbar" aria-label="Categorias">
          {SLOTS.map((s) => (
            <button
              key={s}
              data-nav
              data-nav-default={s === tab ? '' : undefined}
              onClick={() => {
                sfx.ui();
                setTab(s);
                setConfirm(null);
              }}
              className={`shrink-0 rounded-full border-2 px-4 py-1.5 font-display text-lg transition [@media(max-height:500px)]:py-0.5 [@media(max-height:500px)]:text-base ${tab === s ? 'border-amber-300 bg-amber-300/25 text-amber-100' : 'border-white/20 bg-black/30 text-white/80 hover:bg-white/10'}`}
            >
              {TAB_LABEL[s]}
            </button>
          ))}
        </nav>

        {status === 'offline' && <div className="hud-panel border-red-400/70 px-4 py-2 text-center text-sm text-red-200">Sem conexão com o servidor: a loja precisa dele para guardar suas compras.</div>}
        {shopError && <div className="text-center text-sm font-bold text-red-300" role="alert">{shopError}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="shop-items">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 [@media(max-height:500px)]:grid-cols-4">
            {forSale.map((c) => {
              const owned = !!account?.owned.includes(c.id);
              const equipped = account?.loadout[c.slot] === c.id;
              const afford = (account?.coins ?? 0) >= c.price;
              return (
                <div key={c.id} className={`hud-panel flex flex-col items-center gap-1 px-2 py-2 text-center ${equipped ? 'ring-4 ring-amber-300/80' : ''}`} data-testid={`shop-${c.id}`}>
                  <ItemSwatch item={c} />
                  <div className="font-display text-lg leading-tight">{c.name}</div>
                  <RarityLabel item={c} />
                  <p className="line-clamp-2 text-[11px] leading-tight text-amber-50/70 [@media(max-height:500px)]:hidden">{c.desc}</p>
                  {owned ? (
                    <button data-nav className={`menu-btn mt-auto !min-w-0 !px-3 !py-1 !text-sm ${equipped ? 'menu-btn-primary' : ''}`} onClick={() => void equip(c.slot, equipped ? null : c.id)}>
                      {equipped ? '✓ Equipado' : 'Equipar'}
                    </button>
                  ) : (
                    <button
                      data-nav
                      disabled={!account || !afford}
                      className={`menu-btn mt-auto !min-w-0 !px-3 !py-1 !text-sm ${confirm === c.id ? 'menu-btn-primary' : ''}`}
                      onClick={() => void onBuy(c)}
                      aria-label={`Comprar ${c.name} por ${c.price} moedas`}
                    >
                      {confirm === c.id ? 'Confirmar?' : <Coins value={c.price} className="text-base" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {earned.length > 0 && (
            <>
              <h2 className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest text-amber-100/60">Ganhe jogando</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 [@media(max-height:500px)]:grid-cols-4">
                {earned.map((c) => {
                  const owned = !!account?.owned.includes(c.id);
                  const equipped = account?.loadout[c.slot] === c.id;
                  return (
                    <div key={c.id} className={`hud-panel flex flex-col items-center gap-1 px-2 py-2 text-center ${owned ? '' : 'opacity-70'} ${equipped ? 'ring-4 ring-amber-300/80' : ''}`}>
                      <ItemSwatch item={c} />
                      <div className="font-display text-lg leading-tight">{c.name}</div>
                      <RarityLabel item={c} />
                      {owned ? (
                        <button data-nav className={`menu-btn mt-auto !min-w-0 !px-3 !py-1 !text-sm ${equipped ? 'menu-btn-primary' : ''}`} onClick={() => void equip(c.slot, equipped ? null : c.id)}>
                          {equipped ? '✓ Equipado' : 'Equipar'}
                        </button>
                      ) : (
                        <div className="mt-auto rounded-md bg-black/35 px-2 py-1 text-[11px] font-bold text-amber-100/80">🔒 {unlockHint(c)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <p className="mt-3 text-center text-[11px] text-amber-50/40">Tudo aqui é cosmético: {Object.values(SLOT_LABEL).join(', ').toLowerCase()} nunca mudam o jogo.</p>
        </div>
      </div>
    </div>
  );
}
