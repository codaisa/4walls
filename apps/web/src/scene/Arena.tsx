import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Cell, type BiomeId } from '@4walls/shared';
import { cellIndex, getCell, inBounds } from '@4walls/core';
import { useGame } from './context';
import type { ArenaTheme } from './themes';

/** Deterministic hash → [0,1) so decoration is stable for a given layout. */
const h01 = (x: number, y: number, k = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

function commit(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function Arena({ theme }: { theme: ArenaTheme }) {
  const { controller, ox, oz } = useGame();
  const grid = controller.state.grid;
  const { w, h } = grid;
  const tree = theme.pillar === 'tree';
  const crate = theme.block === 'crate';

  const adventure = controller.state.adventure;

  /**
   * Works for any map shape (rectangular arenas and irregular adventure islands):
   *  - walkable cells (floor, blocks, gates) get a floor tile;
   *  - a wall is drawn only if it touches something walkable; walls touching the void form the
   *    coast (tall columns), the rest are pillars; walls with nothing walkable around are void.
   */
  const layout = useMemo(() => {
    const k = (x: number, y: number) => `${x},${y}`;
    const gateSet = new Set(adventure?.gates.map((g) => k(g.x, g.y)) ?? []);
    // Cage cells are crates in the rules but drawn by <Cages />.
    const cageSet = new Set(adventure?.cages.map((c) => k(c.x, c.y)) ?? []);
    // Braziers stand on wall cells in the rules but are drawn by <AdventureProps />.
    const propSet = new Set(adventure?.props.filter((p) => p.kind === 'brazier' || p.kind === 'lever' || p.kind === 'seal' || p.kind === 'root').map((p) => k(p.x, p.y)) ?? []);
    // Brambles are crates in the rules, drawn as thorn bushes by <AdventureProps />.
    const bushSet = new Set(adventure?.props.filter((p) => p.kind === 'bramble').map((p) => k(p.x, p.y)) ?? []);
    // The lava river is an open channel down to the magma sea; bridges and the shuttle platform
    // are drawn by <AdventureProps /> (their cells change between lava and floor while playing).
    const riverSet = new Set<string>();
    for (const p of adventure?.props ?? []) {
      if (p.kind === 'bridge') riverSet.add(k(p.x, p.y));
      if (p.kind === 'platform') for (const c of p.track ?? []) riverSet.add(k(c.x, c.y));
    }
    const isRiver = (x: number, y: number) => getCell(grid, x, y) === Cell.Lava || riverSet.has(k(x, y));
    // getCell is Wall outside the grid window; cracked walls get a floor tile (they can be blown open).
    const solid = (x: number, y: number) => getCell(grid, x, y) === Cell.Wall && !gateSet.has(k(x, y)) && !propSet.has(k(x, y));
    const walkable = (x: number, y: number) => !solid(x, y);
    const near8 = (x: number, y: number, pred: (x: number, y: number) => boolean) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && pred(x + dx, y + dy)) return true;
      return false;
    };
    const isVoid = (x: number, y: number) => solid(x, y) && !near8(x, y, walkable);
    const floor: { x: number; y: number }[] = [];
    const border: { x: number; y: number }[] = [];
    const pillars: { x: number; y: number }[] = [];
    const blocks: { x: number; y: number }[] = [];
    const cracked: { x: number; y: number }[] = [];
    const lava: { x: number; y: number }[] = [];
    const chasm: { x: number; y: number }[] = [];
    const base: { x: number; y: number }[] = [];
    for (let y = grid.y0; y < grid.y0 + h; y++)
      for (let x = grid.x0; x < grid.x0 + w; x++) {
        if (walkable(x, y)) {
          if (getCell(grid, x, y) === Cell.Chasm) {
            chasm.push({ x, y });
            continue;
          }
          if (isRiver(x, y)) {
            lava.push({ x, y });
            continue;
          }
          floor.push({ x, y });
          base.push({ x, y });
          const cell = getCell(grid, x, y);
          if (cell === Cell.Block && !cageSet.has(k(x, y)) && !bushSet.has(k(x, y))) blocks.push({ x, y });
          if (cell === Cell.Cracked) cracked.push({ x, y });
          continue;
        }
        if (isVoid(x, y)) continue;
        base.push({ x, y });
        (near8(x, y, isVoid) ? border : pillars).push({ x, y });
      }
    return { floor, border, pillars, blocks, cracked, base, lava, chasm };
    // The layout only changes when a new match (new grid) starts.
  }, [grid, w, h, adventure]);

  /** Per-cell look: in adventure each region is painted by its biome. */
  const look = useMemo(() => {
    const byBiome: Record<BiomeId, { floor: [string, string]; wall: string; pillar: string; base: string }> = {
      volcanic: { floor: theme.floor, wall: theme.border, pillar: theme.pillarColor, base: '#1d171f' },
      transition: { floor: ['#6f7254', '#62664a'], wall: '#4d4f44', pillar: '#58594c', base: '#2a2620' },
      forest: { floor: ['#6a9a45', '#5c8a3c'], wall: '#55604c', pillar: '#5d6b52', base: '#3a2d22' },
    };
    return (x: number, y: number) => {
      if (!adventure) return { ...byBiome.volcanic, floor: theme.floor, wall: theme.border, pillar: theme.pillarColor, base: tree ? '#3a2d22' : '#1d171f' };
      const r = inBounds(grid, x, y) ? adventure.regionOf[cellIndex(grid, x, y)] : -1;
      return byBiome[adventure.regions.find((q) => q.id === r)?.biome ?? 'volcanic'];
    };
  }, [adventure, theme, tree, grid]);

  const geo = useMemo(
    () => ({
      tile: new RoundedBoxGeometry(0.95, 0.3, 0.95, 2, 0.05),
      column: new THREE.CylinderGeometry(0.5, 0.56, 1, 6),
      cap: new THREE.CylinderGeometry(0.4, 0.48, 0.1, 6),
      trunk: new THREE.CylinderGeometry(0.2, 0.3, 1, 8),
      canopy: new THREE.IcosahedronGeometry(0.5, 1),
      block: crate ? new RoundedBoxGeometry(0.84, 0.8, 0.84, 2, 0.05) : new RoundedBoxGeometry(0.84, 0.78, 0.84, 3, 0.12),
      mark: crate ? new THREE.BoxGeometry(0.88, 0.1, 0.88) : new THREE.BoxGeometry(0.42, 0.04, 0.12),
      base: new THREE.BoxGeometry(1.0, 0.64, 1.0),
      seam: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    }),
    [crate],
  );
  const mat = useMemo(
    () => ({
      tile: new THREE.MeshStandardMaterial({ roughness: tree ? 0.95 : 0.82, metalness: 0.05 }),
      // Instanced meshes carry their own per-instance color; the material stays white so it isn't multiplied twice.
      column: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
      pillar: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
      cap: new THREE.MeshStandardMaterial({ color: '#4a4152', roughness: 0.7, flatShading: true }),
      canopy: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
      block: new THREE.MeshStandardMaterial({ roughness: crate ? 0.8 : 0.7 }),
      mark: theme.mark.emissive
        ? new THREE.MeshBasicMaterial({ color: new THREE.Color(...theme.mark.color), toneMapped: false })
        : new THREE.MeshStandardMaterial({ color: new THREE.Color(...theme.mark.color), roughness: 0.8 }),
      seam: new THREE.MeshBasicMaterial({ color: new THREE.Color(...theme.seam), toneMapped: false }),
      base: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }),
    }),
    [theme, tree, crate],
  );

  const tilesRef = useRef<THREE.InstancedMesh>(null!);
  const borderRef = useRef<THREE.InstancedMesh>(null!);
  const pillarRef = useRef<THREE.InstancedMesh>(null!);
  const capRef = useRef<THREE.InstancedMesh>(null!);
  const blockRef = useRef<THREE.InstancedMesh>(null!);
  const markRef = useRef<THREE.InstancedMesh>(null!);
  const seamRef = useRef<THREE.InstancedMesh>(null!);
  const baseRef = useRef<THREE.InstancedMesh>(null!);

  // Static instances: floor tiles, border columns, pillars (basalt columns or trees).
  useLayoutEffect(() => {
    layout.floor.forEach((c, i) => {
      dummy.position.set(c.x + ox, -0.15, c.y + oz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tilesRef.current.setMatrixAt(i, dummy.matrix);
      tmpColor.set(look(c.x, c.y).floor[(c.x + c.y) % 2]).offsetHSL(0, 0, (h01(c.x, c.y) - 0.5) * (tree ? 0.07 : 0.04));
      tilesRef.current.setColorAt(i, tmpColor);
      // Glowing seam quad under each tile (visible through the gaps between tiles).
      dummy.position.set(c.x + ox, -0.29, c.y + oz);
      dummy.updateMatrix();
      seamRef.current.setMatrixAt(i, dummy.matrix);
    });
    commit(tilesRef.current);
    commit(seamRef.current);

    // Island body: an earth block under every existing cell (lava/void shows between islands).
    layout.base.forEach((c, i) => {
      dummy.position.set(c.x + ox, -0.62, c.y + oz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      baseRef.current.setMatrixAt(i, dummy.matrix);
      tmpColor.set(look(c.x, c.y).base).offsetHSL(0, 0, (h01(c.x, c.y, 9) - 0.5) * 0.04);
      baseRef.current.setColorAt(i, tmpColor);
    });
    commit(baseRef.current);

    layout.border.forEach((c, i) => {
      const height = 1.05 + h01(c.x, c.y, 1) * 0.45;
      dummy.position.set(c.x + ox, height / 2 - 0.3, c.y + oz);
      dummy.rotation.set(0, Math.floor(h01(c.x, c.y, 2) * 6) * (Math.PI / 3), 0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      borderRef.current.setMatrixAt(i, dummy.matrix);
      tmpColor.set(look(c.x, c.y).wall).offsetHSL(0, 0, (h01(c.x, c.y, 3) - 0.5) * 0.06);
      borderRef.current.setColorAt(i, tmpColor);
    });
    commit(borderRef.current);

    layout.pillars.forEach((c, i) => {
      const rot = Math.floor(h01(c.x, c.y, 4) * 6) * (Math.PI / 3);
      if (tree) {
        dummy.position.set(c.x + ox, 0.45, c.y + oz);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(1, 0.95, 1);
      } else {
        dummy.position.set(c.x + ox, 0.45, c.y + oz);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(0.96, 1, 0.96);
      }
      dummy.updateMatrix();
      pillarRef.current.setMatrixAt(i, dummy.matrix);
      tmpColor.set(look(c.x, c.y).pillar).offsetHSL(0, 0, (h01(c.x, c.y, 5) - 0.5) * 0.05);
      pillarRef.current.setColorAt(i, tmpColor);
      // Basalt cap, or a leafy canopy for trees.
      const s = tree ? 0.85 + h01(c.x, c.y, 6) * 0.2 : 1;
      dummy.position.set(c.x + ox, tree ? 1.18 : 0.96, c.y + oz);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(s, tree ? s * 0.85 : 1, s);
      dummy.updateMatrix();
      capRef.current.setMatrixAt(i, dummy.matrix);
      if (tree) {
        tmpColor.set(h01(c.x, c.y, 7) > 0.5 ? '#3f8a3a' : '#4f9a40').offsetHSL(0, 0, (h01(c.x, c.y, 8) - 0.5) * 0.08);
        capRef.current.setColorAt(i, tmpColor);
      }
    });
    commit(pillarRef.current);
    commit(capRef.current);

    layout.blocks.forEach((c, i) => {
      tmpColor.set(theme.blockColors[h01(c.x, c.y, 6) > 0.5 ? 0 : 1]).offsetHSL(0, 0, (h01(c.x, c.y, 7) - 0.5) * 0.06);
      blockRef.current.setColorAt(i, tmpColor);
    });
    commit(blockRef.current);
  }, [layout, ox, oz, theme, tree, look]);

  // Destructible blocks animate out when destroyed.
  const destroyedAt = useRef(new Map<number, number>());
  useEffect(
    () =>
      controller.on((e) => {
        if (e.type === 'blockDestroyed') destroyedAt.current.set(e.y * w + e.x, performance.now());
      }),
    [controller, w],
  );

  useFrame(({ clock }) => {
    const now = performance.now();
    const t = clock.elapsedTime;
    layout.blocks.forEach((c, i) => {
      const key = c.y * w + c.x;
      const gone = destroyedAt.current.get(key);
      let s = 1;
      let lift = 0;
      if (gone !== undefined) {
        const k = Math.min(1, (now - gone) / 260);
        s = k >= 1 ? 0 : (1 - k) * (1 + 0.35 * Math.sin(k * Math.PI));
        lift = k * 0.35;
      } else if (getCell(grid, c.x, c.y) !== Cell.Block) {
        s = 0;
      }
      const wobble = h01(c.x, c.y, 8) * 0.12 - 0.06;
      dummy.position.set(c.x + ox, (crate ? 0.4 : 0.39) * s + lift, c.y + oz);
      dummy.rotation.set(0, wobble, 0);
      dummy.scale.setScalar(Math.max(s, 0.0001));
      dummy.updateMatrix();
      blockRef.current.setMatrixAt(i, dummy.matrix);
      if (crate) {
        // A dark strap band around the middle of each crate.
        dummy.position.y = 0.4 * s + lift;
      } else {
        dummy.position.y = 0.79 * s + lift;
        dummy.rotation.set(0, wobble + (h01(c.x, c.y, 9) > 0.5 ? Math.PI / 2 : 0), 0);
      }
      dummy.updateMatrix();
      markRef.current.setMatrixAt(i, dummy.matrix);
    });
    blockRef.current.instanceMatrix.needsUpdate = true;
    markRef.current.instanceMatrix.needsUpdate = true;
    if (theme.mark.emissive) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
      (mat.mark as THREE.MeshBasicMaterial).color.setRGB(theme.mark.color[0] * pulse, theme.mark.color[1] * pulse, theme.mark.color[2] * pulse);
    }
  });

  const blockCount = Math.max(1, layout.blocks.length);
  return (
    <group>
      {/* Island body under every existing cell + glowing seams between the floor tiles. */}
      <instancedMesh ref={baseRef} args={[geo.base, mat.base, Math.max(1, layout.base.length)]} receiveShadow />
      <instancedMesh ref={seamRef} args={[geo.seam, mat.seam, Math.max(1, layout.floor.length)]} />
      <instancedMesh ref={tilesRef} args={[geo.tile, mat.tile, layout.floor.length]} receiveShadow />
      <instancedMesh ref={borderRef} args={[geo.column, mat.column, layout.border.length]} castShadow receiveShadow />
      <instancedMesh ref={pillarRef} args={[tree ? geo.trunk : geo.column, mat.pillar, layout.pillars.length]} castShadow receiveShadow />
      <instancedMesh ref={capRef} args={[tree ? geo.canopy : geo.cap, tree ? mat.canopy : mat.cap, layout.pillars.length]} castShadow />
      <instancedMesh ref={blockRef} args={[geo.block, mat.block, blockCount]} castShadow receiveShadow />
      <instancedMesh ref={markRef} args={[geo.mark, mat.mark, blockCount]} />
      {layout.lava.length > 0 && <LavaRiver cells={layout.lava} />}
      {layout.chasm.length > 0 && <Chasm cells={layout.chasm} />}
      {layout.cracked.length > 0 && <CrackedWalls cells={layout.cracked} color={look(layout.cracked[0].x, layout.cracked[0].y).pillar} />}
      {/* Arena dressing; the adventure world is too large for fixed corner props and backdrops. */}
      {!adventure && <Corners w={w} h={h} theme={theme} />}
      {!adventure && (theme.liquid === 'lava' ? <VolcanoSurroundings w={w} h={h} /> : <ForestSurroundings w={w} h={h} />)}
      {theme.particles === 'embers' ? <Embers /> : <Fireflies />}
    </group>
  );
}

/** Four corner light anchors: braziers (Caldeira) or paper lanterns (Floresta). */
function Corners({ w, h, theme }: { w: number; h: number; theme: ArenaTheme }) {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const flames = useRef<(THREE.Mesh | null)[]>([]);
  const lantern = theme.corner === 'lantern';
  const corners = useMemo(
    () => [
      [-(w / 2) - 0.2, -(h / 2) - 0.2],
      [w / 2 + 0.2, -(h / 2) - 0.2],
      [-(w / 2) - 0.2, h / 2 + 0.2],
      [w / 2 + 0.2, h / 2 + 0.2],
    ],
    [w, h],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    corners.forEach((_, i) => {
      const f = lantern ? 0.92 + 0.08 * Math.sin(t * 2 + i) : 0.85 + 0.15 * Math.sin(t * 9 + i * 2) + 0.08 * Math.sin(t * 23 + i);
      const l = lights.current[i];
      if (l) l.intensity = (lantern ? 7 : 9) * f;
      const m = flames.current[i];
      if (m) {
        if (lantern) m.rotation.y = Math.sin(t * 0.8 + i) * 0.25;
        else m.scale.set(1, 0.9 + 0.3 * f, 1);
      }
    });
  });
  return (
    <>
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          {lantern ? (
            <>
              <mesh position={[0, 0.55, 0]} castShadow>
                <cylinderGeometry args={[0.06, 0.08, 1.7, 8]} />
                <meshStandardMaterial color="#4a3324" roughness={0.9} />
              </mesh>
              <mesh position={[0, 1.42, 0]}>
                <boxGeometry args={[0.5, 0.06, 0.06]} />
                <meshStandardMaterial color="#4a3324" roughness={0.9} />
              </mesh>
              <mesh ref={(m) => void (flames.current[i] = m)} position={[0.2, 1.15, 0]}>
                <sphereGeometry args={[0.22, 14, 10]} />
                <meshBasicMaterial color={new THREE.Color(3.2, 2.2, 0.9)} toneMapped={false} />
              </mesh>
              <pointLight ref={(l) => void (lights.current[i] = l)} position={[0.2, 1.15, 0]} color="#ffd38a" distance={8} decay={1.6} />
            </>
          ) : (
            <>
              <mesh position={[0, 0.9, 0]} castShadow>
                <cylinderGeometry args={[0.45, 0.25, 0.5, 8]} />
                <meshStandardMaterial color="#3a2c33" roughness={0.6} metalness={0.4} flatShading />
              </mesh>
              <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.18, 0.3, 1.0, 6]} />
                <meshStandardMaterial color="#2a2128" roughness={0.9} flatShading />
              </mesh>
              <mesh ref={(m) => void (flames.current[i] = m)} position={[0, 1.35, 0]}>
                <coneGeometry args={[0.32, 0.8, 7]} />
                <meshBasicMaterial color={new THREE.Color(3.5, 1.3, 0.25)} toneMapped={false} />
              </mesh>
              <pointLight ref={(l) => void (lights.current[i] = l)} position={[0, 1.8, 0]} color="#ff8a3c" distance={9} decay={1.6} />
            </>
          )}
        </group>
      ))}
    </>
  );
}

/** Scatter helper: positions on a ring around the arena, skipping the arena itself. */
function ringPositions(count: number, w: number, h: number, seed: number, rMin = 10, rMax = 36) {
  const out: { x: number; z: number; s: number; i: number }[] = [];
  for (let i = 0; out.length < count && i < count * 30; i++) {
    const a = h01(i, 1, seed) * Math.PI * 2;
    const r = rMin + h01(i, 2, seed) * (rMax - rMin);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.85;
    if (Math.abs(x) < w / 2 + 1.5 && Math.abs(z) < h / 2 + 1.5) continue;
    out.push({ x, z, s: h01(i, 3, seed), i });
  }
  return out;
}

/** Rocks in the lava sea and distant volcano silhouettes. */
function VolcanoSurroundings({ w, h }: { w: number; h: number }) {
  const rocksRef = useRef<THREE.InstancedMesh>(null!);
  const ROCKS = 70;
  useLayoutEffect(() => {
    const pos = ringPositions(ROCKS, w, h, 12);
    pos.forEach(({ x, z, s: r, i }, k) => {
      const s = 0.4 + r * 1.9;
      dummy.position.set(x, -0.55 + s * 0.15, z);
      dummy.rotation.set(h01(i, 4) * 3, h01(i, 5) * 3, h01(i, 6) * 3);
      dummy.scale.set(s, s * (0.5 + h01(i, 7) * 0.6), s);
      dummy.updateMatrix();
      rocksRef.current.setMatrixAt(k, dummy.matrix);
    });
    rocksRef.current.count = pos.length;
    rocksRef.current.instanceMatrix.needsUpdate = true;
  }, [w, h]);
  return (
    <>
      <instancedMesh ref={rocksRef} args={[undefined, undefined, ROCKS]}>
        <dodecahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial color="#231b22" roughness={0.95} flatShading />
      </instancedMesh>
      {[
        [-26, -34, 15, 11],
        [8, -42, 20, 14],
        [34, -30, 12, 9],
      ].map(([x, z, height, radius], i) => (
        <group key={i} position={[x, -0.6, z]}>
          <mesh position={[0, height / 2, 0]}>
            <coneGeometry args={[radius, height, 9, 1, true]} />
            <meshStandardMaterial color="#1a1318" roughness={1} flatShading side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, height * 0.86, 0]}>
            <cylinderGeometry args={[radius * 0.16, radius * 0.2, 0.6, 9]} />
            <meshBasicMaterial color={new THREE.Color(3, 0.9, 0.15)} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Pond islands with pine-like trees, mossy rocks and giant glowing mushrooms. */
function ForestSurroundings({ w, h }: { w: number; h: number }) {
  const trunks = useRef<THREE.InstancedMesh>(null!);
  const crowns = useRef<THREE.InstancedMesh>(null!);
  const rocks = useRef<THREE.InstancedMesh>(null!);
  const TREES = 46;
  const ROCKS = 40;
  useLayoutEffect(() => {
    const trees = ringPositions(TREES, w, h, 21, 11, 34);
    trees.forEach(({ x, z, s: r, i }, k) => {
      const s = 0.9 + r * 1.6;
      dummy.position.set(x, -0.5 + s * 0.8, z);
      dummy.rotation.set(0, h01(i, 9) * 6, 0);
      dummy.scale.set(s, s * 1.6, s);
      dummy.updateMatrix();
      trunks.current.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, -0.5 + s * 2.6, z);
      dummy.scale.set(s * 1.3, s * 2.2, s * 1.3);
      dummy.updateMatrix();
      crowns.current.setMatrixAt(k, dummy.matrix);
      tmpColor.set(h01(i, 4) > 0.5 ? '#2f6b34' : '#3d7d3a').offsetHSL(0, 0, (h01(i, 5) - 0.5) * 0.1);
      crowns.current.setColorAt(k, tmpColor);
    });
    trunks.current.count = crowns.current.count = trees.length;
    commit(trunks.current);
    commit(crowns.current);
    const rs = ringPositions(ROCKS, w, h, 33, 9.5, 26);
    rs.forEach(({ x, z, s: r, i }, k) => {
      const s = 0.4 + r * 1.2;
      dummy.position.set(x, -0.5 + s * 0.2, z);
      dummy.rotation.set(h01(i, 4) * 3, h01(i, 5) * 3, 0);
      dummy.scale.set(s, s * 0.6, s);
      dummy.updateMatrix();
      rocks.current.setMatrixAt(k, dummy.matrix);
    });
    rocks.current.count = rs.length;
    commit(rocks.current);
  }, [w, h]);
  const mushrooms = useMemo(() => ringPositions(7, w, h, 47, 9.5, 16), [w, h]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, TREES]} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 1, 7]} />
        <meshStandardMaterial color="#5a3b24" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, TREES]} castShadow>
        <coneGeometry args={[0.7, 1, 8]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[undefined, undefined, ROCKS]}>
        <dodecahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial color="#56604f" roughness={0.95} flatShading />
      </instancedMesh>
      {mushrooms.map(({ x, z, s }, i) => {
        const k = 0.9 + s * 1.3;
        return (
          <group key={i} position={[x, -0.5, z]} scale={k}>
            <mesh position={[0, 0.6, 0]}>
              <cylinderGeometry args={[0.16, 0.22, 1.2, 10]} />
              <meshStandardMaterial color="#efe3cf" roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.25, 0]}>
              <sphereGeometry args={[0.65, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={i % 2 ? '#c8324a' : '#7a4bd6'} emissive={i % 2 ? '#5a0c18' : '#4a1fa0'} emissiveIntensity={0.6} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** Rising embers floating over the arena. */
function Embers() {
  return <FloatingParticles count={260} color={[3, 1.1, 0.2]} size={0.09} rise={[0.3, 1.2]} wander={0.3} />;
}

/** Slow, blinking fireflies drifting among the trees. */
function Fireflies() {
  return <FloatingParticles count={140} color={[2.2, 3, 0.6]} size={0.11} rise={[-0.15, 0.15]} wander={0.9} blink />;
}

function FloatingParticles({ count, color, size, rise, wander, blink = false }: { count: number; color: [number, number, number]; size: number; rise: [number, number]; wander: number; blink?: boolean }) {
  const ref = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 44;
      positions[i * 3 + 1] = Math.random() * (blink ? 4 : 12) - 0.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 36;
      speeds[i] = rise[0] + Math.random() * (rise[1] - rise[0]);
    }
    return { positions, speeds };
  }, [count, rise, blink]);
  useFrame(({ clock, camera }, dt) => {
    // Embers / fireflies hover around wherever the camera is looking (the Adventure travels far).
    ref.current.position.x = camera.position.x;
    ref.current.position.z = camera.position.z - 8;
    const p = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      a[i * 3 + 1] += speeds[i] * dt;
      a[i * 3] += Math.sin(t * 0.7 + i) * dt * wander;
      a[i * 3 + 2] += Math.cos(t * 0.5 + i * 1.3) * dt * wander * 0.6;
      if (a[i * 3 + 1] > (blink ? 4 : 12)) a[i * 3 + 1] = -0.3;
      if (a[i * 3 + 1] < -0.3) a[i * 3 + 1] = blink ? 4 : 12;
    }
    p.needsUpdate = true;
    if (blink) matRef.current.opacity = 0.55 + 0.45 * Math.sin(t * 2.3);
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={matRef} size={size} color={new THREE.Color(...color)} toneMapped={false} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/**
 * Adventure secrets: a rock wall veined with glowing cracks. It looks almost like the coast but
 * breathes light — a blast turns it to rubble and opens the hidden pocket behind it.
 */
function CrackedWalls({ cells, color }: { cells: { x: number; y: number }[]; color: string }) {
  const { controller, ox, oz } = useGame();
  const rock = useRef<THREE.InstancedMesh>(null!);
  const glow = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(() => ({ rock: new RoundedBoxGeometry(0.92, 1.0, 0.92, 2, 0.08), vein: new THREE.BoxGeometry(0.08, 0.8, 0.05) }), []);
  const mat = useMemo(
    () => ({
      rock: new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, -0.05, -0.02), roughness: 0.95, flatShading: true }),
      vein: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.1, 0.35), toneMapped: false }),
    }),
    [color],
  );
  const crumbled = useRef(new Map<string, number>());
  useEffect(
    () =>
      controller.on((e) => {
        if (e.type === 'secretFound') crumbled.current.set(`${e.x},${e.y}`, performance.now());
      }),
    [controller],
  );
  useFrame(({ clock }) => {
    const now = performance.now();
    const pulse = 0.7 + 0.3 * Math.sin(clock.elapsedTime * 2.4);
    mat.vein.color.setRGB(2.4 * pulse, 1.1 * pulse, 0.35 * pulse);
    const grid = controller.state.grid;
    cells.forEach((c, i) => {
      const gone = crumbled.current.get(`${c.x},${c.y}`);
      let s = getCell(grid, c.x, c.y) === Cell.Cracked ? 1 : 0;
      if (gone !== undefined) s = Math.max(0, 1 - (now - gone) / 320);
      dummy.position.set(c.x + ox, 0.5 * s, c.y + oz);
      dummy.rotation.set(0, h01(c.x, c.y, 3) * 0.3, 0);
      dummy.scale.setScalar(Math.max(0.0001, s));
      dummy.updateMatrix();
      rock.current.setMatrixAt(i, dummy.matrix);
      // Two crossing veins on each visible side.
      for (let k = 0; k < 4; k++) {
        const side = k < 2 ? 1 : -1;
        dummy.position.set(c.x + ox + (k < 2 ? 0 : 0.47 * side * s), 0.5 * s, c.y + oz + (k < 2 ? 0.47 * s : 0));
        dummy.rotation.set(0, k < 2 ? 0 : Math.PI / 2, (k % 2 ? 0.6 : -0.5));
        dummy.scale.setScalar(Math.max(0.0001, s));
        dummy.updateMatrix();
        glow.current.setMatrixAt(i * 4 + k, dummy.matrix);
      }
    });
    rock.current.instanceMatrix.needsUpdate = true;
    glow.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={rock} args={[geo.rock, mat.rock, cells.length]} castShadow receiveShadow />
      <instancedMesh ref={glow} args={[geo.vein, mat.vein, cells.length * 4]} />
    </>
  );
}

/**
 * Lava river: the channel between the banks shows the magma sea far below; a glowing surface just
 * under the floor makes it read as a river of fire, with heat shimmering along the banks.
 */
function LavaRiver({ cells }: { cells: { x: number; y: number }[] }) {
  const { ox, oz } = useGame();
  const surf = useRef<THREE.InstancedMesh>(null!);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.3, 0.05), toneMapped: false }), []);
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  useLayoutEffect(() => {
    cells.forEach((c, i) => {
      dummy.position.set(c.x + ox, -0.42, c.y + oz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      surf.current.setMatrixAt(i, dummy.matrix);
      // Crusty patches: some cells darker, a few hotter.
      const v = h01(c.x, c.y, 2);
      tmpColor.setRGB(0.7 + v * 0.45, 0.6 + v * 0.5, 0.6 + h01(c.x, c.y, 3) * 0.4);
      surf.current.setColorAt(i, tmpColor);
    });
    commit(surf.current);
  }, [cells, ox, oz]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = 0.85 + 0.15 * Math.sin(t * 1.7);
    mat.color.setRGB(1.25 * k, 0.3 * k + 0.05 * Math.sin(t * 3.1), 0.05);
  });
  return <instancedMesh ref={surf} args={[geo, mat, cells.length]} />;
}

/** Bottomless chasm: a black drop with violet mist curling up from the depths. */
function Chasm({ cells }: { cells: { x: number; y: number }[] }) {
  const { ox, oz } = useGame();
  const deep = useRef<THREE.InstancedMesh>(null!);
  const mist = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(() => new THREE.PlaneGeometry(1.02, 1.02).rotateX(-Math.PI / 2), []);
  const mats = useMemo(
    () => ({
      deep: new THREE.MeshBasicMaterial({ color: '#07040c' }),
      mist: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.07, 0.38), transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }),
    }),
    [],
  );
  useLayoutEffect(() => {
    cells.forEach((c, i) => {
      dummy.position.set(c.x + ox, -0.5, c.y + oz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      deep.current.setMatrixAt(i, dummy.matrix);
    });
    commit(deep.current);
  }, [cells, ox, oz]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    cells.forEach((c, i) => {
      const k = 0.5 + 0.5 * Math.sin(t * 0.8 + h01(c.x, c.y, 4) * 6);
      dummy.position.set(c.x + ox, -0.38 + k * 0.08, c.y + oz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mist.current.setMatrixAt(i, dummy.matrix);
    });
    mist.current.instanceMatrix.needsUpdate = true;
    mats.mist.opacity = 0.1 + 0.06 * Math.sin(t * 0.6);
  });
  return (
    <>
      <instancedMesh ref={deep} args={[geo, mats.deep, cells.length]} />
      <instancedMesh ref={mist} args={[geo, mats.mist, cells.length]} />
    </>
  );
}
