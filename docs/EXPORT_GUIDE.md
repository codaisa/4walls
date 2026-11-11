# 4Walls — Guia de exportação e integração

## Exportação (Blender → GLB)

`fw_lib.export_glb(objs, "categoria/id")` exporta **só** os objetos passados, com estas opções:

- `export_yup` (Y para cima);
- `export_apply` (aplica os modificadores, exceto a armadura);
- skins;
- animações como actions, apenas na base do personagem;
- materiais PBR.

O resultado vai para `game-assets/glb/<categoria>/<id>.glb`, e o número de triângulos e o
tamanho saem no log e nos manifestos.

## Otimização e publicação

`node game-assets/scripts/publish_glb.mjs` faz o seguinte:

- `dedup` + `prune` + **Meshopt** (`EXT_meshopt_compression`, nível medium);
- grava em `apps/web/public/assets/<categoria>/<id>.glb`;
- copia os manifestos para `/assets/manifests/`.

Fase 1: 45 GLB, de 8,8 MB para 5,2 MB (o restante é textura JPG de 512 px). O detalhe por
arquivo está em `manifests/publish_report.json`.

## Carregando no Three.js / React Three Fiber

- **Meshopt:** o `useGLTF` do drei já liga o `MeshoptDecoder`.
- **Personagem modular:** é o padrão usado no Ateliê (`apps/web/src/screens/Atelier.tsx`).

  ```ts
  const root = SkeletonUtils.clone(base.scene);            // base + animações
  const bones = new Map(); root.traverse(o => o.isBone && bones.set(o.name, o));
  for (const part of parts) {                                // capacete, rosto, roupa…
    SkeletonUtils.clone(part.scene).traverse(o => {
      if (!o.isSkinnedMesh) return;
      const mapped = o.skeleton.bones.map(b => bones.get(b.name));
      o.bind(new THREE.Skeleton(mapped, o.skeleton.boneInverses), o.bindMatrix);
      skinnedHost.add(o);
    });
  }
  // Cor: clonar materiais e definir .color em Helmet/Glove/Accent/Outfit pela paleta.
  ```

- **Chunks:** use o JSON do chunk (layout + legenda) para montar com instancing no jogo. O GLB
  do chunk é uma prévia pronta, com malhas compartilhadas.

## Manifestos

| Arquivo | Conteúdo |
|---|---|
| `characters/adventurer.json` | esqueleto, ossos, pontos de fixação, slots de material, animações, padrões |
| `customization/items.json` | cada peça: slot, osso, modelo, prévia, triângulos, raridade, licença |
| `customization/palettes.json` | paletas de cor |
| `assets/volcanic_kit.json` | cada asset: categoria, bioma, tipo, destrutível, perigo, pegada no grid, modelo, triângulos |
| `world-chunks/*.json` | layout 16×16, legenda, conexões, assets usados |
| `biomes/*.json` | paleta, kits por categoria, transições, chefe |
| `world/world_graph_example.json` | exemplo de encadeamento de regiões |
