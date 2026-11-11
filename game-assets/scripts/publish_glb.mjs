// 4Walls — optimizes every Blender export and publishes it to the web client.
//   game-assets/glb/**.glb  →  apps/web/public/assets/**.glb   (meshopt-compressed)
// Also copies the JSON manifests so the game can discover assets at runtime.
// Usage (repo root): node game-assets/scripts/publish_glb.mjs
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(here, '..');
const SRC = join(ASSETS, 'glb');
const OUT = join(ASSETS, '..', 'apps', 'web', 'public', 'assets');

async function* walk(dir, ext) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p, ext);
    else if (entry.name.endsWith(ext)) yield p;
  }
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const report = [];
for await (const file of walk(SRC, '.glb')) {
  const rel = relative(SRC, file);
  const doc = await io.read(file);
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = join(OUT, rel);
  await mkdir(dirname(out), { recursive: true });
  await io.write(out, doc);
  const before = (await stat(file)).size;
  const after = (await stat(out)).size;
  report.push({ asset: rel.replaceAll('\\', '/'), kbBefore: Math.round(before / 1024), kbAfter: Math.round(after / 1024) });
}

// Manifests travel with the assets (the game loads items/chunks/biomes from them).
for await (const file of walk(join(ASSETS, 'manifests'), '.json')) {
  const out = join(OUT, 'manifests', relative(join(ASSETS, 'manifests'), file));
  await mkdir(dirname(out), { recursive: true });
  await copyFile(file, out);
}

const total = report.reduce((a, r) => [a[0] + r.kbBefore, a[1] + r.kbAfter], [0, 0]);
await writeFile(join(ASSETS, 'manifests', 'publish_report.json'), JSON.stringify({ totalKbBefore: total[0], totalKbAfter: total[1], assets: report }, null, 2));
console.log(`[publish] ${report.length} GLB  ${total[0]} KB → ${total[1]} KB`);
