import { PerspectiveCamera, View } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import * as THREE from 'three';
import { CHARACTER_IDS, CHARACTERS, COSMETICS, RULES, SLOT_COLORS, SLOT_LABEL, unlockHint, type CharacterId, type CosmeticSlot } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { ShowcaseAvatar, type ShowcaseClip } from '../scene/ShowcaseAvatar';
import { equip, useAccount } from '../store/useAccount';
import { useProfile } from '../store/useProfile';
import { ItemSwatch, TitleTag } from '../ui/progression';
import { useMenuNav } from '../ui/useMenuNav';
import { graphicsPreset, useSettings } from '../store/useSettings';

/** Animations the player can preview (same clips as in a match). */
const CLIPS: { id: ShowcaseClip; label: string }[] = [
  { id: 'Idle', label: 'Parado' },
  { id: 'Run', label: 'Correr' },
  { id: 'Jump', label: 'Pular' },
  { id: 'Roll', label: 'Rolar' },
  { id: 'Slide', label: 'Deslizar' },
  { id: 'Throw', label: 'Arremessar' },
  { id: 'Cast', label: 'Habilidade' },
  { id: 'Victory', label: 'Vitória' },
  { id: 'Defeat', label: 'Derrota' },
];

const RANDOM_NAMES = ['Faísca', 'Pavio', 'Brasa', 'Kaboom', 'Fumaça', 'Pólvora', 'Estopim', 'Trovão', 'Lava', 'Cometa', 'Pipoca', 'Rojão'];

/** 0..1 bars from the real gameplay numbers (cosmetics never change them). */
const stats = (id: CharacterId) => {
  const c = CHARACTERS[id];
  const speed = RULES.baseSpeed + c.speedBonus;
  return [
    { label: 'Velocidade', value: (speed - 3.2) / (4.3 - 3.2) },
    { label: 'Bombas máx.', value: (c.maxBombs - 4) / (8 - 4) },
    { label: 'Habilidade', value: 1 - (c.cooldownSec - 4) / (10 - 4) },
  ];
};

/**
 * Ateliê: the player's character. A big live preview with every animation, character cards with
 * their own 3D preview, ability and stats, color cards and the name. Everything saves instantly.
 * One WebGL canvas draws all previews through drei <View>s (phones limit WebGL contexts).
 */
export function Atelier() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null!);
  const profile = useProfile();
  const account = useAccount((s) => s.account);
  /** A locked hat being tried on (preview only). */
  const [tryHat, setTryHat] = useState<string | null>(null);
  const hat = tryHat ?? account?.loadout.hat ?? null;
  const [clip, setClip] = useState<ShowcaseClip>('Idle');
  const back = () => {
    sfx.ui();
    navigate('/');
  };
  useMenuNav(root, { onBack: back });
  const pick = (fn: () => void) => () => {
    sfx.ui();
    fn();
  };
  const color = SLOT_COLORS[profile.colorIndex];

  return (
    <div ref={root} className="menu-bg relative h-full w-full overflow-hidden font-body text-white">
      <div className={`relative z-10 mx-auto grid h-full max-w-6xl grid-rows-[auto_1fr] gap-3 screen-safe [@media(max-height:500px)]:gap-2`}>
        <header className="flex items-center justify-between gap-3">
          <button data-nav className={`menu-btn !min-w-0 !px-4 !py-2 !text-lg [@media(max-height:500px)]:!py-1 [@media(max-height:500px)]:!text-base`} onClick={back}>
            ← Pronto
          </button>
          <h1 className={`logo font-display text-4xl sm:text-5xl [@media(max-height:500px)]:text-2xl`}>Seu personagem</h1>
          <div className="w-24" />
        </header>

        <div className={`grid min-h-0 gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [@media(max-height:500px)]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [@media(max-height:500px)]:gap-3`}>
          {/* Big preview + animation picker. */}
          <section className="hud-panel flex min-h-[18rem] min-w-0 flex-col items-center px-3 py-3 [@media(max-height:500px)]:min-h-0 [@media(max-height:500px)]:py-2" data-testid="atelier-preview">
            <View className="h-full min-h-0 w-full flex-1">
              <PreviewScene characterId={profile.characterId} colorIndex={profile.colorIndex} clip={clip} hat={hat} />
            </View>
            <div className="font-display text-3xl leading-none [@media(max-height:500px)]:text-xl" style={{ color: color.primary }}>
              {profile.name}
            </div>
            {tryHat ? (
              <div className="text-xs font-black uppercase tracking-widest text-sky-300" data-testid="try-on">
                🔒 Experimentando: {COSMETICS[tryHat].name}
              </div>
            ) : (
              <TitleTag id={account?.loadout.title} />
            )}
            <div className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-100/60 [@media(max-height:500px)]:mb-1">{CHARACTERS[profile.characterId].name}</div>
            <div className="flex max-w-full flex-wrap justify-center gap-1.5 [@media(max-height:500px)]:gap-1">
              {CLIPS.map((c) => (
                <button
                  key={c.id}
                  data-nav
                  onClick={pick(() => setClip(c.id))}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold transition [@media(max-height:500px)]:px-2 [@media(max-height:500px)]:py-0.5 [@media(max-height:500px)]:text-[11px] ${clip === c.id ? 'border-amber-300 bg-amber-300/25 text-amber-100' : 'border-white/20 bg-black/30 text-white/80 hover:bg-white/10'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </section>

          {/* Options: cards. */}
          <section className="scroll-area min-h-0 overflow-y-auto" data-testid="atelier-options">
            <h2 className={`mb-2 text-xs font-bold uppercase tracking-widest text-amber-100/60`}>Personagem</h2>
            <div className="grid grid-cols-3 gap-2">
              {CHARACTER_IDS.map((id) => {
                const ch = CHARACTERS[id];
                const on = profile.characterId === id;
                return (
                  <button
                    key={id}
                    data-nav
                    data-nav-default={on ? '' : undefined}
                    onClick={pick(() => profile.set({ characterId: id }))}
                    className={`hud-panel flex min-w-0 flex-col items-stretch px-2 pb-2 pt-1 text-left transition ${on ? 'ring-4 ring-amber-300/80' : 'opacity-85 hover:opacity-100'}`}
                    data-testid={`card-${id}`}
                  >
                    <View className={`h-32 w-full [@media(max-height:500px)]:h-24`}>
                      <CardScene characterId={id} colorIndex={profile.colorIndex} selected={on} hat={hat} />
                    </View>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="font-display text-xl leading-tight">{ch.name}</span>
                      {on && <span className="text-xs font-black text-amber-300">✓</span>}
                    </div>
                    <div className={`text-[11px] leading-tight text-amber-100/70 [@media(max-height:500px)]:hidden`}>{ch.tagline}</div>
                    <div className="mt-1 rounded-md bg-black/30 px-1.5 py-1">
                      <div className="text-xs font-bold text-amber-200">⚡ {ch.abilityName}</div>
                      <div className={`text-[10px] leading-tight opacity-80 [@media(max-height:500px)]:hidden`}>{ch.abilityDesc}</div>
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {stats(id).map((s) => (
                        <div key={s.label} className="flex items-center gap-1.5 text-[10px]">
                          <span className="w-16 shrink-0 opacity-70">{s.label}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                            <span className="block h-full rounded-full bg-amber-300" style={{ width: `${Math.round(Math.max(0.08, Math.min(1, s.value)) * 100)}%` }} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <h2 className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest text-amber-100/60">Cor</h2>
            <div className="grid grid-cols-4 gap-2">
              {SLOT_COLORS.map((c, i) => {
                const on = profile.colorIndex === i;
                return (
                  <button
                    key={c.name}
                    data-nav
                    onClick={pick(() => profile.set({ colorIndex: i }))}
                    className={`hud-panel flex flex-col items-center gap-1 px-2 py-2 transition ${on ? 'ring-4 ring-amber-300/80' : 'opacity-85 hover:opacity-100'}`}
                    data-testid={`color-${i}`}
                  >
                    <span
                      className={`block h-10 w-10 rounded-full border-2 border-white/80 shadow-[0_3px_0_rgba(0,0,0,0.4)] [@media(max-height:500px)]:h-7 [@media(max-height:500px)]:w-7`}
                      style={{ background: `radial-gradient(circle at 35% 30%, ${c.secondary}, ${c.primary} 65%)` }}
                    />
                    <span className="font-display text-base leading-none">{c.name}</span>
                  </button>
                );
              })}
            </div>

            {(['hat', 'bomb', 'fire', 'title'] as CosmeticSlot[]).map((slot) => (
              <InventoryRow key={slot} slot={slot} trying={slot === 'hat' ? tryHat : null} onTry={slot === 'hat' ? setTryHat : undefined} />
            ))}

            <h2 className="mb-2 mt-4 text-xs font-bold uppercase tracking-widest text-amber-100/60">Nome</h2>
            <div className="flex gap-2">
              <input
                data-nav
                value={profile.name}
                maxLength={12}
                onChange={(e) => profile.set({ name: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && profile.set({ name: 'Jogador' })}
                className="min-w-0 flex-1 rounded-xl border-2 border-white/25 bg-black/40 px-3 py-2 text-center font-display text-2xl text-white outline-none focus:border-amber-300"
                aria-label="Nome do jogador"
              />
              <button
                data-nav
                className="menu-btn !min-w-0 !px-4 !py-2 !text-xl"
                title="Nome aleatório"
                aria-label="Nome aleatório"
                onClick={pick(() => profile.set({ name: RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] }))}
              >
                🎲
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* One canvas behind the page draws every <View> above (cards scroll, the views follow). */}
      <Canvas
        eventSource={root}
        className="!pointer-events-none !fixed !inset-0 z-20"
        dpr={graphicsPreset(useSettings.getState().quality).dpr}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <View.Port />
        </Suspense>
      </Canvas>
    </div>
  );
}

/** Slow turntable. */
function Turntable({ speed = 0.5, children }: { speed?: number; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    g.current.rotation.y = Math.sin(clock.elapsedTime * speed) * 0.75;
  });
  return <group ref={g}>{children}</group>;
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#ffe2c8', '#4a1f28', 1.15]} />
      <directionalLight position={[-3, 6, 5]} intensity={2.3} />
      <pointLight position={[0, 0.4, 1.6]} color="#ff6a2c" intensity={4} distance={6} />
    </>
  );
}

function Pedestal({ radius = 0.62 }: { radius?: number }) {
  return (
    <>
      <mesh position={[0, -0.16, 0]}>
        <cylinderGeometry args={[radius, radius + 0.1, 0.3, 6]} />
        <meshStandardMaterial color="#2b1d22" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[radius - 0.12, radius - 0.02, 6]} />
        <meshBasicMaterial color={new THREE.Color(2.6, 0.9, 0.25)} toneMapped={false} />
      </mesh>
    </>
  );
}

/**
 * Inventory of one cosmetic slot: owned items equip with a click (again = remove); locked ones
 * show how to get them (shop price, level, achievement, season).
 */
function InventoryRow({ slot, trying, onTry }: { slot: CosmeticSlot; trying: string | null; onTry?: (id: string | null) => void }) {
  const navigate = useNavigate();
  const account = useAccount((s) => s.account);
  const items = Object.values(COSMETICS).filter((c) => c.slot === slot);
  const current = account?.loadout[slot] ?? null;
  return (
    <>
      <h2 className="mb-2 mt-4 flex items-baseline justify-between text-xs font-bold uppercase tracking-widest text-amber-100/60">
        <span>{SLOT_LABEL[slot]}</span>
        {!account && <span className="normal-case tracking-normal text-white/40">conecte ao servidor para usar o inventário</span>}
      </h2>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 [@media(max-height:500px)]:grid-cols-5">
        {slot !== 'title' && (
          <button
            data-nav
            disabled={!account}
            onClick={() => {
              sfx.ui();
              onTry?.(null);
              void equip(slot, null);
            }}
            className={`hud-panel flex flex-col items-center justify-center gap-1 px-1 py-2 text-xs transition ${account && current === null ? 'ring-4 ring-amber-300/80' : 'opacity-85 hover:opacity-100'}`}
            data-testid={`inv-${slot}-none`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-white/30 text-lg text-white/50">∅</span>
            <span className="font-display text-sm leading-none">Nenhum</span>
          </button>
        )}
        {items.map((c) => {
          const owned = !!account?.owned.includes(c.id);
          const on = current === c.id;
          return (
            <button
              key={c.id}
              data-nav
              disabled={!account}
              title={owned ? c.desc : `🔒 ${unlockHint(c)}`}
              onClick={() => {
                sfx.ui();
                onTry?.(null);
                if (owned) void equip(slot, on && slot !== 'title' ? null : c.id);
                // Locked hats can be tried on; a second click on a shop item opens the shop.
                else if (onTry && trying !== c.id) onTry(c.id);
                else if (c.price > 0) navigate('/loja');
              }}
              className={`hud-panel relative flex flex-col items-center gap-1 px-1 py-2 text-center transition ${on ? 'ring-4 ring-amber-300/80' : trying === c.id ? 'ring-4 ring-sky-300/80' : owned ? 'opacity-90 hover:opacity-100' : 'opacity-45'}`}
              data-testid={`inv-${c.id}`}
            >
              <ItemSwatch item={c} size={44} />
              <span className="font-display text-sm leading-none">{c.name}</span>
              {!owned && <span className="text-[9px] leading-tight text-amber-100/80">🔒 {unlockHint(c)}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function PreviewScene({ characterId, colorIndex, clip, hat }: { characterId: CharacterId; colorIndex: number; clip: ShowcaseClip; hat: string | null }) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.35, 4.6]} fov={30} onUpdate={(c) => c.lookAt(0, 0.5, 0)} />
      <Lights />
      <Suspense fallback={null}>
        <group position={[0, -0.1, 0]}>
          <Pedestal />
          <Turntable>
            <ShowcaseAvatar key={`${characterId}-${colorIndex}-${hat}`} characterId={characterId} colorIndex={colorIndex} clip={clip} hat={hat} />
          </Turntable>
        </group>
      </Suspense>
    </>
  );
}

function CardScene({ characterId, colorIndex, selected, hat }: { characterId: CharacterId; colorIndex: number; selected: boolean; hat: string | null }) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.95, 3.1]} fov={30} onUpdate={(c) => c.lookAt(0, 0.55, 0)} />
      <Lights />
      <Suspense fallback={null}>
        <Pedestal radius={0.5} />
        <Turntable speed={0.35}>
          <ShowcaseAvatar key={`${characterId}-${colorIndex}-${hat}`} characterId={characterId} colorIndex={colorIndex} clip={selected ? 'Victory' : 'Idle'} hat={hat} />
        </Turntable>
      </Suspense>
    </>
  );
}
