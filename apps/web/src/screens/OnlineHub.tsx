import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CODE_ALPHABET, CODE_LENGTH, isValidCode } from '@4walls/protocol';
import { sfx } from '../audio/Sfx';
import { online, serverUrl, useOnline } from '../online/session';
import { useUiHandler } from '../ui/uiInput';

/**
 * "Entrar com código": the room code entry (typed, or picked letter by letter with a gamepad).
 * Invite links (/online?code=XXXXXX) join straight away. Creating rooms lives on the home screen.
 */
export function OnlineHub() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { status, error } = useOnline();
  const busy = status === 'connecting';

  const go = async (connect: () => Promise<boolean>) => {
    sfx.unlock();
    sfx.ui();
    if (await connect()) navigate('/online/room');
  };

  const invite = params.get('code')?.toUpperCase() ?? '';
  useEffect(() => {
    if (isValidCode(invite)) void go(() => online.joinByCode(invite));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite]);

  return (
    // Centered with my-auto (not justify-center): if the on-screen keyboard shrinks the screen,
    // the content scrolls instead of being pushed off the top.
    <div className="menu-bg relative flex h-full w-full flex-col items-center overflow-y-auto screen-safe font-body text-white">
      <div className="menu-embers" aria-hidden />
      <div className="relative z-10 my-auto flex w-full max-w-md flex-col items-center gap-3 [@media(max-height:500px)]:gap-2">
        <h1 className="logo font-display text-5xl sm:text-6xl [@media(max-height:500px)]:text-3xl">Entrar numa sala</h1>
        <p className="text-center text-sm text-amber-100/70 [@media(max-height:500px)]:hidden">Peça o código de 6 letras para quem criou a sala (ou abra o link do convite).</p>
        {isValidCode(invite) && busy ? (
          <div className="hud-panel px-6 py-4 font-display text-2xl text-amber-100">Entrando na sala {invite}…</div>
        ) : (
          <CodeEntry onCancel={() => navigate('/')} onSubmit={(code) => void go(() => online.joinByCode(code))} />
        )}
        <div className="min-h-6 text-center text-sm">
          {busy && <span className="animate-pulse text-amber-100">Conectando…</span>}
          {status === 'error' && error && <span className="font-bold text-red-300">{error}</span>}
        </div>
        <div className="text-xs text-white/35 [@media(max-height:500px)]:hidden">Servidor: {serverUrl()}</div>
      </div>
    </div>
  );
}

/** 6-character code input: type it on a keyboard, or pick letters with a gamepad (↑↓ letter, ←→ position). */
function CodeEntry({ onSubmit, onCancel }: { onSubmit: (code: string) => void; onCancel: () => void }) {
  const [chars, setChars] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const code = chars.join('');

  useEffect(() => inputRef.current?.focus(), []);

  const typed = (raw: string) => {
    const clean = [...raw.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).slice(0, CODE_LENGTH);
    setChars(Array.from({ length: CODE_LENGTH }, (_, i) => clean[i] ?? ''));
    setCursor(Math.min(clean.length, CODE_LENGTH - 1));
  };

  useUiHandler((e) => {
    switch (e.action) {
      case 'up':
      case 'down': {
        const cur = chars[cursor];
        const i = cur ? CODE_ALPHABET.indexOf(cur) : -1;
        const n = CODE_ALPHABET.length;
        const next = CODE_ALPHABET[(((i + (e.action === 'up' ? 1 : -1)) % n) + n) % n];
        setChars(chars.map((c, k) => (k === cursor ? next : c)));
        sfx.ui();
        return true;
      }
      case 'left':
      case 'right':
        setCursor((c) => Math.max(0, Math.min(CODE_LENGTH - 1, c + (e.action === 'right' ? 1 : -1))));
        sfx.ui();
        return true;
      case 'confirm':
        if (isValidCode(code)) onSubmit(code);
        else setCursor((c) => Math.min(CODE_LENGTH - 1, c + 1));
        return true;
      case 'back':
        onCancel();
        return true;
      default:
        return false;
    }
  });

  return (
    <form
      className="hud-panel flex w-full flex-col items-center gap-3 px-5 py-4 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:py-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (isValidCode(code)) onSubmit(code);
      }}
    >
      <div className="font-display text-2xl [@media(max-height:500px)]:hidden">Código da sala</div>
      <div className="relative flex gap-2" onClick={() => inputRef.current?.focus()}>
        {chars.map((c, i) => (
          <div
            key={i}
            className={`flex h-14 w-11 items-center justify-center rounded-xl border-2 font-display text-3xl [@media(max-height:500px)]:h-11 [@media(max-height:500px)]:w-9 [@media(max-height:500px)]:text-2xl ${
              i === cursor ? 'border-amber-300 bg-amber-300/15' : 'border-white/25 bg-black/30'
            }`}
          >
            {c || '·'}
          </div>
        ))}
        <input
          ref={inputRef}
          aria-label="Código da sala"
          value={code}
          onChange={(ev) => typed(ev.target.value)}
          onKeyDown={(ev) => ev.key === 'Escape' && onCancel()}
          maxLength={CODE_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          inputMode="text"
          spellCheck={false}
          className="absolute inset-0 cursor-text opacity-0"
        />
      </div>
      <div className="text-center text-xs opacity-70 [@media(max-height:500px)]:hidden">
        Teclado: digite e Enter · 🎮 ↑↓ letra · ←→ posição · A entra · B cancela
      </div>
      <div className="flex gap-2">
        <button type="submit" className="menu-btn menu-btn-primary !min-w-0 !py-2 !text-lg" disabled={!isValidCode(code)}>
          Entrar
        </button>
        <button type="button" className="menu-btn !min-w-0 !py-2 !text-lg" onClick={onCancel}>
          ← Voltar
        </button>
      </div>
    </form>
  );
}
