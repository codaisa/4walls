import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CHARACTERS, SLOT_COLORS } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { online, useOnline } from '../online/session';
import { ProfilePreview } from '../scene/ProfilePreview';
import { useAccount } from '../store/useAccount';
import { useProfile } from '../store/useProfile';
import { Coins, LevelBadge, TitleTag, XpBar } from '../ui/progression';
import { useMenuNav } from '../ui/useMenuNav';
import { promptInstall, useInstall } from '../pwa';

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
  const install = useInstall();
  const [iosTip, setIosTip] = useState(false);
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

  const iconBtn = 'menu-btn !min-w-0 !flex-row items-center gap-1.5 !px-3 !py-1.5 !text-base [@media(max-height:500px)]:!px-2.5 [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-lg';
  const LINKS = [
    { path: '/loja', icon: '🛒', label: 'Loja' },
    { path: '/ranking', icon: '🏆', label: 'Ranking' },
    { path: '/perfil', icon: '📊', label: 'Perfil' },
    { path: '/config', icon: '⚙️', label: 'Configurações' },
  ];

  return (
    <div ref={root} className="menu-bg relative flex h-full w-full flex-col items-center overflow-y-auto screen-safe font-body text-white">
      <div className="menu-embers" aria-hidden />
      {/* Secondary pages live in the corner; the middle is just you and "play". */}
      <nav className="corner-tr flex gap-2 [@media(max-height:500px)]:gap-1.5" aria-label="Menu">
        {LINKS.map((l) => (
          <button key={l.path} data-nav className={iconBtn} onClick={() => go(l.path)} aria-label={l.label} title={l.label}>
            <span aria-hidden>{l.icon}</span>
            {l.path !== '/config' && <span className="hidden lg:inline">{l.label}</span>}
          </button>
        ))}
      </nav>
      {install && (
        <button
          data-nav
          className="menu-btn corner-tl !min-w-0 !px-3 !py-1.5 !text-base [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-sm"
          onClick={() => (sfx.ui(), install === 'prompt' ? void promptInstall() : setIosTip((v) => !v))}
          data-testid="install-app"
        >
          📲 Instalar
        </button>
      )}
      {iosTip && (
        <div className="hud-panel corner-tl !z-30 mt-12 max-w-xs px-3 py-2 text-sm [@media(max-height:500px)]:mt-10" role="note" onClick={() => setIosTip(false)}>
          No Safari, toque em <b>Compartilhar</b> (□↑) e depois em <b>Adicionar à Tela de Início</b>. O 4Walls abre em tela cheia, sem a barra do navegador.
        </div>
      )}
      <div className="relative z-10 my-auto flex w-full max-w-4xl flex-col items-center pt-10 [@media(max-height:500px)]:pt-0">
        <Logo />
        <p className="mt-1 text-center text-base text-amber-100/80 [@media(max-height:500px)]:hidden">Quatro paredes. Muitas bombas. Um sobrevivente.</p>

        <div className="mt-8 grid w-full items-center gap-10 md:grid-cols-[1fr_1fr] [@media(max-height:500px)]:mt-4 [@media(max-height:500px)]:grid-cols-[1fr_1fr] [@media(max-height:500px)]:gap-8">
          {/* The player's character, with editing right below it. */}
          <section className="flex flex-col items-center" data-testid="profile">
            <div className="h-60 w-full max-w-xs [@media(max-height:500px)]:h-32">
              <ProfilePreview characterId={profile.characterId} colorIndex={profile.colorIndex} hat={account?.loadout.hat} />
            </div>
            <div className="font-display text-3xl leading-none [@media(max-height:500px)]:text-2xl" style={{ color: color.primary }} data-testid="profile-name">
              {profile.name}
            </div>
            <TitleTag id={account?.loadout.title} />
            <div className="text-xs font-bold uppercase tracking-widest text-amber-100/60 [@media(max-height:500px)]:hidden">
              {ch.name} · {ch.abilityName}
            </div>
            {account ? (
              <div className="mt-2 flex w-full max-w-xs items-center gap-2 [@media(max-height:500px)]:mt-1" data-testid="progress">
                <LevelBadge xp={account.xp} />
                <XpBar xp={account.xp} className="flex-1" />
                <Coins value={account.coins} className="text-lg" />
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-amber-100/50">{accountStatus === 'offline' ? 'Sem servidor: o progresso não está sendo salvo.' : 'Carregando conta…'}</div>
            )}
            <button data-nav className="menu-btn mt-3 !min-w-0 !flex-row gap-1.5 !px-5 !py-1.5 !text-base [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-sm" onClick={() => go('/atelie')}>
              ✏️ Editar personagem
            </button>
          </section>

          {/* One way to play: an online room; locals join it with their own devices. */}
          <section className="flex flex-col gap-4 [@media(max-height:500px)]:gap-2.5">
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
