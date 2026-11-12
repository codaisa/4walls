import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { sfx, type Bus } from '../audio/Sfx';
import { credential, restoreAccount, useAccount } from '../store/useAccount';
import { closeCamera, graphicsPreset, useSettings, type CameraMode, type Quality } from '../store/useSettings';
import { useMenuNav } from '../ui/useMenuNav';

const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automático', hint: 'Médio no celular, alto no PC' },
  { id: 'low', label: 'Baixo', hint: 'Sem sombras nem brilho · mais FPS' },
  { id: 'medium', label: 'Médio', hint: 'Sombras e brilho leves' },
  { id: 'high', label: 'Alto', hint: 'Sombras nítidas · antisserrilhado' },
];
const CAMERAS: { id: CameraMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'close', label: 'Perto' },
  { id: 'arena', label: 'Arena toda' },
];
const BUSES: { id: Bus; label: string }[] = [
  { id: 'music', label: 'Música' },
  { id: 'sfx', label: 'Efeitos' },
  { id: 'ui', label: 'Interface' },
];

/** Configurações: graphics quality, volumes, comfort options and moving the account to another device. */
export function Settings() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const s = useSettings();
  const account = useAccount((st) => st.account);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [restore, setRestore] = useState<'idle' | 'busy' | 'ok' | 'bad'>('idle');
  const back = () => {
    sfx.ui();
    navigate('/');
  };
  useMenuNav(root, { onBack: back });
  const gfx = graphicsPreset(s.quality);

  const vol = (bus: Bus, step: number) => {
    sfx.unlock();
    s.setVolume(bus, s.volumes[bus] + step);
    if (bus === 'music') return;
    if (bus === 'ui') sfx.ui();
    else sfx.pickup();
  };

  return (
    <div ref={root} className="menu-bg relative flex h-full w-full flex-col overflow-hidden font-body text-white">
      <div className="relative z-10 mx-auto flex h-full w-full max-w-4xl flex-col gap-3 px-4 py-4 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:py-2">
        <header className="flex items-center justify-between gap-3">
          <button data-nav data-nav-default className="menu-btn !min-w-0 !px-4 !py-2 !text-lg [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-base" onClick={back}>
            ← Voltar
          </button>
          <h1 className="logo font-display text-4xl sm:text-5xl [@media(max-height:500px)]:text-2xl">Configurações</h1>
          <div className="w-24" />
        </header>

        <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-1 md:grid-cols-2 [@media(max-height:500px)]:grid-cols-2" data-testid="settings">
          <section className="hud-panel flex flex-col gap-2 px-3 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-amber-100/60">Gráficos</h2>
            <div className="grid grid-cols-2 gap-2">
              {QUALITIES.map((q) => (
                <button
                  key={q.id}
                  data-nav
                  onClick={() => (sfx.ui(), s.set({ quality: q.id }))}
                  className={`rounded-xl border-2 px-2 py-1.5 text-left transition ${s.quality === q.id ? 'border-amber-300 bg-amber-300/20' : 'border-white/15 bg-black/30 hover:bg-white/10'}`}
                  data-testid={`quality-${q.id}`}
                >
                  <span className="block font-display text-lg leading-tight">{q.label}</span>
                  <span className="block text-[10px] leading-tight text-white/60">{q.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/50">
              Agora: resolução até {gfx.dpr[1]}× · sombras {gfx.shadows ? `${gfx.shadowMap}px` : 'desligadas'} · brilho {gfx.post ? 'ligado' : 'desligado'}
            </p>
            <Toggle label="Mostrar FPS" on={s.showFps} onChange={(v) => s.set({ showFps: v })} testId="toggle-fps" />
          </section>

          <section className="hud-panel flex flex-col gap-2 px-3 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-amber-100/60">Áudio</h2>
            {BUSES.map((b) => (
              <div key={b.id} className="flex items-center gap-2" data-testid={`vol-${b.id}`}>
                <span className="w-20 text-sm font-bold">{b.label}</span>
                <button data-nav aria-label={`Diminuir ${b.label}`} className="menu-btn !min-w-0 !px-3 !py-0.5 !text-lg" onClick={() => vol(b.id, -0.1)}>
                  −
                </button>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/40">
                  <span className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500" style={{ width: `${s.volumes[b.id] * 100}%` }} />
                </span>
                <button data-nav aria-label={`Aumentar ${b.label}`} className="menu-btn !min-w-0 !px-3 !py-0.5 !text-lg" onClick={() => vol(b.id, 0.1)}>
                  +
                </button>
                <span className="w-9 text-right text-xs tabular-nums text-white/70">{Math.round(s.volumes[b.id] * 100)}%</span>
              </div>
            ))}
            <h2 className="mt-2 text-xs font-bold uppercase tracking-widest text-amber-100/60">Conforto</h2>
            <Toggle label="Tremor da câmera" on={s.shake} onChange={(v) => s.set({ shake: v })} testId="toggle-shake" />
            <div className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-1.5 text-sm font-bold">
              <span className="flex-1">Câmera</span>
              {CAMERAS.map((c) => (
                <button
                  key={c.id}
                  data-nav
                  onClick={() => (sfx.ui(), s.set({ camera: c.id }))}
                  className={`rounded-lg border-2 px-2 py-0.5 text-xs transition ${s.camera === c.id ? 'border-amber-300 bg-amber-300/20' : 'border-white/15 bg-black/30 hover:bg-white/10'}`}
                  data-testid={`camera-${c.id}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/50">{closeCamera(s.camera) ? 'Segue o seu personagem de perto.' : 'Mostra a arena inteira.'}</p>
          </section>

          <section className="hud-panel flex flex-col gap-2 px-3 py-3 md:col-span-2 [@media(max-height:500px)]:col-span-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-amber-100/60">Conta em outro aparelho</h2>
            <p className="text-xs text-white/70">
              Cada aparelho cria sua própria conta. Para jogar com o <b>mesmo progresso</b> no celular e no PC, copie o código de transferência daqui e cole no outro aparelho.
              Não mostre esse código a ninguém: quem tiver ele usa sua conta.
            </p>
            {account ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-1.5 text-xs" data-testid="transfer-code">
                  {showCode ? credential() : '•••••••••••••••••••••••••••'}
                </code>
                <button data-nav className="menu-btn !min-w-0 !px-3 !py-1 !text-sm" onClick={() => (sfx.ui(), setShowCode((v) => !v))}>
                  {showCode ? 'Esconder' : 'Mostrar'}
                </button>
                <button data-nav className="menu-btn !min-w-0 !px-3 !py-1 !text-sm" onClick={() => (sfx.ui(), void navigator.clipboard?.writeText(credential() ?? ''))}>
                  Copiar
                </button>
              </div>
            ) : (
              <div className="text-xs text-red-200">Sem conexão com o servidor.</div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                data-nav
                value={code}
                onChange={(e) => (setCode(e.target.value), setRestore('idle'))}
                placeholder="Cole aqui o código do outro aparelho"
                className="min-w-0 flex-1 rounded-lg border-2 border-white/20 bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-amber-300"
                aria-label="Código de transferência"
                data-testid="restore-input"
              />
              <button
                data-nav
                className="menu-btn !min-w-0 !px-3 !py-1 !text-sm"
                disabled={!code.trim() || restore === 'busy'}
                onClick={async () => {
                  sfx.ui();
                  setRestore('busy');
                  setRestore((await restoreAccount(code)) ? 'ok' : 'bad');
                }}
              >
                Usar esta conta
              </button>
            </div>
            {restore === 'ok' && <div className="text-xs font-bold text-emerald-300">Pronto! Este aparelho agora usa a conta de {account?.name}.</div>}
            {restore === 'bad' && <div className="text-xs font-bold text-red-300">Código inválido para este servidor.</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange, testId }: { label: string; on: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <button data-nav role="switch" aria-checked={on} onClick={() => (sfx.ui(), onChange(!on))} className="flex items-center justify-between rounded-xl bg-black/25 px-3 py-1.5 text-sm font-bold" data-testid={testId}>
      {label}
      <span className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-amber-400' : 'bg-white/20'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
