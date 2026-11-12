import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { RotatePrompt } from './ui/RotatePrompt';
// Latin subsets only (Portuguese accents live in Latin-1): no Cyrillic / Vietnamese font files.
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-900.css';
import './index.css';
import { MainMenu } from './screens/MainMenu';
import { startUiInput } from './ui/uiInput';
import { ensureAccount } from './store/useAccount';
import './store/useSettings';
import { applyMaterialStyle } from './scene/materialStyle';
import { startPwa } from './pwa';

// Every other screen loads on demand: the home screen comes up without the game code.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const GameScreen = named(() => import('./screens/GameScreen'), 'GameScreen');
const LocalLobby = named(() => import('./screens/LocalLobby'), 'LocalLobby');
const OnlineHub = named(() => import('./screens/OnlineHub'), 'OnlineHub');
const Atelier = named(() => import('./screens/Atelier'), 'Atelier');
const OnlineRoom = named(() => import('./screens/OnlineRoom'), 'OnlineRoom');
const Profile = named(() => import('./screens/Profile'), 'Profile');
const Ranking = named(() => import('./screens/Ranking'), 'Ranking');
const Shop = named(() => import('./screens/Shop'), 'Shop');
const Settings = named(() => import('./screens/Settings'), 'Settings');
// V1: live VFX catalog, development builds only.
const VfxLab = import.meta.env.DEV ? named(() => import('./screens/VfxLab'), 'VfxLab') : null;

// V5: rim light + scenery color variation in the standard shaders (before anything compiles).
applyMaterialStyle();
// Installable app + fullscreen on phones.
startPwa();
// Keyboard and gamepads drive every screen through one input loop.
startUiInput();
// The player's guest account (progression) loads in the background.
void ensureAccount();

function Loading() {
  return (
    <div className="menu-bg flex h-full w-full items-center justify-center font-display text-2xl text-amber-100/80" role="status">
      Carregando…
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/local" element={<LocalLobby />} />
          <Route path="/play" element={<GameScreen />} />
          <Route path="/online" element={<OnlineHub />} />
          <Route path="/atelie" element={<Atelier />} />
          <Route path="/online/room" element={<OnlineRoom />} />
          <Route path="/loja" element={<Shop />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/config" element={<Settings />} />
          {VfxLab && <Route path="/vfx" element={<VfxLab />} />}
        </Routes>
      </Suspense>
      <RotatePrompt />
    </BrowserRouter>
  </StrictMode>,
);
