import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { sfx } from '../audio/Sfx';
import { useMenuNav } from './useMenuNav';

declare const __LAN_HOST__: string;

/**
 * Invite link that a phone can actually open: when this page runs on localhost (the PC hosting the
 * game), swap in the PC's Wi-Fi address so the QR code / link works on other devices.
 */
export function inviteUrl(code: string): string {
  const { protocol, hostname, port } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const host = local && __LAN_HOST__ ? __LAN_HOST__ : hostname;
  return `${protocol}//${host}${port ? `:${port}` : ''}/online?code=${code}`;
}

/** Room invite: a big QR code to scan with the phone camera, the link and the code. */
export function InviteModal({ code, onClose }: { code: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, { onBack: onClose });
  const url = inviteUrl(code);
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1a0d10', light: '#fff6e8' } }).then(setSvg);
  }, [url]);

  const copy = () => {
    sfx.ui();
    void navigator.clipboard?.writeText(url).then(() => setCopied(true));
  };
  const share = () => {
    sfx.ui();
    void navigator.share?.({ title: '4Walls', text: `Entra na minha sala do 4Walls: ${code}`, url }).catch(() => {});
  };

  return (
    <div ref={ref} className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/65 p-3 backdrop-blur-sm" data-testid="invite-modal">
      <div className="hud-panel flex w-full max-w-md flex-col items-center gap-3 px-5 py-4 [@media(max-height:500px)]:max-w-2xl [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:gap-5 [@media(max-height:500px)]:py-3">
        <div
          className="aspect-square w-60 shrink-0 overflow-hidden rounded-2xl border-4 border-amber-200/80 bg-[#fff6e8] p-1 [@media(max-height:500px)]:w-44"
          aria-label="QR code do convite"
          // QR SVG generated locally from our own URL.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="flex w-full min-w-0 flex-col items-center gap-2">
          <div className="font-display text-3xl text-amber-100 [@media(max-height:500px)]:text-2xl">Convidar amigos</div>
          <p className="text-center text-sm text-amber-50/80">Aponte a câmera do celular para o QR code. Quem estiver na mesma rede Wi-Fi entra direto na sala.</p>
          <div className="font-display text-4xl tracking-[0.25em] text-amber-200" data-testid="invite-code">
            {code}
          </div>
          <div className="w-full truncate rounded-lg bg-black/40 px-3 py-1.5 text-center text-xs text-white/70" title={url}>
            {url}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button data-nav data-nav-default className="menu-btn menu-btn-primary !min-w-0 !px-4 !py-2 !text-lg" onClick={copy}>
              {copied ? 'Link copiado!' : 'Copiar link'}
            </button>
            {typeof navigator.share === 'function' && (
              <button data-nav className="menu-btn !min-w-0 !px-4 !py-2 !text-lg" onClick={share}>
                Compartilhar
              </button>
            )}
            <button data-nav className="menu-btn !min-w-0 !px-4 !py-2 !text-lg" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
