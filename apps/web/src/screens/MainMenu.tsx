import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CHARACTERS, SLOT_COLORS } from '@4walls/shared';
import { isTouchDevice } from '../input/InputManager';
import { sfx } from '../audio/Sfx';
import { online, useOnline } from '../online/session';
import { ProfilePreview } from '../scene/ProfilePreview';
import { useAccount } from '../store/useAccount';
import { useProfile } from '../store/useProfile';
import { Coins, LevelBadge, TitleTag, XpBar } from '../ui/progression';
import { useMenuNav } from '../ui/useMenuNav';

/**
 * Home: the player's own character (with "edit" right below it) and one way to play — every
 * match is an online room; friends join by code and more players on this computer join with
 * their own keyboard half, controller or touchscreen.
 */
export function MainMenu() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const profile = useProfile();
  const account = useAccount((s) => s.account);
  const accountStatus = useAccount((s) => s.status);
  const [busy, setBusy] = useState<'create' | 'public' | null>(null);
  const error = useOnline((s) => (s.status === 'error' ? s.error : null));
  useMenuNav(root);

  const go = (path: string) => {
    sfx.unlock();
    sfx.ui();
    navigate(path);
  };
  const play = async (kind: 'create' | 'public') => {
    sfx.unlock();
    sfx.ui();
    setBusy(kind);
    const ok = kind === 'create' ? await online.createRoom(false) : await online.quickPlay();
    setBusy(null);
    if (ok) navigate('/online/room');
  };
  const ch = CHARACTERS[profile.characterId];
  const color = SLOT_COLORS[profile.colorIndex];

  return (
    <div ref={root} className="menu-bg relative flex h-full w-full flex-col items-center overflow-y-auto px-4 py-4 font-body text-white">
      <div className="menu-embers" aria-hidden />
      <button data-nav className="menu-btn !absolute right-3 top-3 z-20 !min-w-0 !px-3 !py-1.5 !text-xl [@media(max-height:500px)]:!py-1" onClick={() => go('/config')} aria-label="Configurações" title="Configurações">
        ⚙️
      </button>
      <div className="relative z-10 my-auto flex w-full max-w-4xl flex-col items-center">
        <Logo />
        <p className="mt-1 text-center text-base text-amber-100/80 [@media(max-height:500px)]:hidden">Quatro paredes. Muitas bombas. Um sobrevivente.</p>

        <div className="mt-4 grid w-full items-center gap-6 md:grid-cols-[1fr_1fr] [@media(max-height:500px)]:mt-1 [@media(max-height:500px)]:grid-cols-[1fr_1fr] [@media(max-height:500px)]:gap-3">
          {/* The player's character, with editing right below it. */}
          <section className="flex flex-col items-center" data-testid="profile">
            <div className="h-64 w-full max-w-xs [@media(max-height:500px)]:h-40">
              <ProfilePreview characterId={profile.characterId} colorIndex={profile.colorIndex} hat={account?.loadout.hat} />
            </div>
            <div className="font-display text-3xl leading-none" style={{ color: color.primary }} data-testid="profile-name">
              {profile.name}
            </div>
            <TitleTag id={account?.loadout.title} />
            <div className="text-xs font-bold uppercase tracking-widest text-amber-100/60 [@media(max-height:500px)]:hidden">
              {ch.name} · {ch.abilityName}
            </div>
            {account ? (
              <div className="mt-1 flex w-full max-w-xs items-center gap-2" data-testid="progress">
                <LevelBadge xp={account.xp} />
                <XpBar xp={account.xp} className="flex-1" />
                <Coins value={account.coins} className="text-lg" />
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-amber-100/50">{accountStatus === 'offline' ? 'Sem servidor: o progresso não está sendo salvo.' : 'Carregando conta…'}</div>
            )}
            <div className="mt-2 grid w-full max-w-md grid-cols-4 gap-1.5 [@media(max-height:500px)]:mt-1">
              <button data-nav className="menu-btn !min-w-0 !flex-row gap-1 whitespace-nowrap !px-1 !py-2 !text-base [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-sm" onClick={() => go('/atelie')}>
                ✏️ Editar
              </button>
              <button data-nav className="menu-btn !min-w-0 !flex-row gap-1 whitespace-nowrap !px-1 !py-2 !text-base [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-sm" onClick={() => go('/loja')}>
                🛒 Loja
              </button>
              <button data-nav className="menu-btn !min-w-0 !flex-row gap-1 whitespace-nowrap !px-1 !py-2 !text-base [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-sm" onClick={() => go('/ranking')}>
                🏆 Ranking
              </button>
              <button data-nav className="menu-btn !min-w-0 !flex-row gap-1 whitespace-nowrap !px-1 !py-2 !text-base [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-sm" onClick={() => go('/perfil')}>
                📊 Perfil
              </button>
            </div>
          </section>

          {/* One way to play: an online room; locals join it with their own devices. */}
          <section className="flex flex-col gap-3 [@media(max-height:500px)]:gap-2">
            <button data-nav data-nav-default className="menu-btn menu-btn-primary" disabled={busy !== null} onClick={() => void play('create')}>
              {busy === 'create' ? 'Criando sala…' : 'Jogar'}
              <span className="menu-btn-sub">Cria sua sala · escolha o modo · amigos entram pelo código</span>
            </button>
            <button data-nav className="menu-btn" onClick={() => go('/online')}>
              Entrar com código
              <span className="menu-btn-sub">A sala de um amigo, no PC ou no celular</span>
            </button>
            <button data-nav className="menu-btn" disabled={busy !== null} onClick={() => void play('public')}>
              {busy === 'public' ? 'Procurando…' : 'Partida pública'}
              <span className="menu-btn-sub">Entra numa sala aberta ou cria uma</span>
            </button>
            {error && (
              <div className="hud-panel border-red-400/70 px-4 py-2 text-center text-sm" data-testid="offline-box">
                <div className="font-bold text-red-200">{error}</div>
                <button data-nav className="menu-btn mt-2 !min-w-0 !px-4 !py-1.5 !text-base" onClick={() => go('/local')}>
                  Jogar offline neste computador
                </button>
              </div>
            )}
            <div className="flex gap-2">
              {isTouchDevice() && (
                <button
                  data-nav
                  className="menu-btn flex-1 !min-w-0 !py-2 !text-lg"
                  onClick={() => {
                    // Full screen + landscape lock (Android); iOS ignores both gracefully.
                    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
                    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
                    Promise.resolve(req?.())
                      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
                      .catch(() => {});
                  }}
                >
                  ⛶ Tela cheia
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
      <div className="absolute bottom-3 right-4 text-xs text-white/30 [@media(max-height:500px)]:hidden">4Walls · protótipo</div>
    </div>
  );
}

function Logo() {
  return (
    <div className="logo-wrap relative select-none">
      <h1 className="logo font-display text-[5rem] leading-none tracking-tight sm:text-[6.5rem] [@media(max-height:500px)]:text-[2.6rem]">
        <span className="logo-4">4</span>WALLS
      </h1>
    </div>
  );
}
