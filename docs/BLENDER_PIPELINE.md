# 4Walls — Pipeline Blender

Tudo é gerado por script, de forma reproduzível, no **Blender 5.3 sem interface** (modo
headless). Para reconstruir tudo:

```bash
powershell -ExecutionPolicy Bypass -File game-assets/scripts/build_all.ps1
```

Para usar outra instalação do Blender, defina `BLENDER_EXE`.

## Etapas

| Script | O que faz | Saídas |
|---|---|---|
| `game-assets/scripts/fetch_cc0_assets.ps1` | Baixa as texturas e o HDRI CC0 pelas APIs do Poly Haven e do ambientCG e registra a procedência | `textures/downloaded/**`, `SOURCES.json` |
| `blender/scripts/fw_lib.py` | Biblioteca: cena, primitivas, materiais, estilização de textura, rachaduras Voronoi, exportação GLB, manifestos, câmeras e render | — |
| `blender/scripts/character_kit.py` | Esqueleto `4W_Rig`, base, 12 peças modulares, 8 animações, paletas, folhas de prévia | `glb/characters/**`, `manifests/characters`, `manifests/customization`, `previews/characters/**`, `blender/characters/adventurer_kit.blend` |
| `blender/scripts/volcanic_kit.py` | 30 assets de ambiente (chão, blocos com estados, bomba, power-ups, props, portal, perigo com estados) | `glb/{ground,blocks,bombs,powerups,props,environments,hazards}/**`, `manifests/assets/volcanic_kit.json`, `previews/assets/volcanic_kit_sheet.png`, `blender/environments/volcanic_kit.blend` |
| `blender/scripts/showcase.py` | Monta os 2 chunks com o kit, posiciona personagens, renderiza na câmera isométrica e exporta os chunks | `glb/world-chunks/**`, `manifests/{world-chunks,biomes,world}/**`, `previews/environments/**`, `blender/showcase/phase1_showcase.blend` |
| `game-assets/scripts/publish_glb.mjs` | Comprime todo GLB com Meshopt (glTF-Transform) e publica no cliente com os manifestos | `apps/web/public/assets/**`, `manifests/publish_report.json` |

## Convenções

- **Escala:** 1 tile = 1 unidade. O personagem tem ~1,2 un. de altura, com a origem entre os pés.
- **Origem dos tiles:** os tiles e blocos têm a origem no centro da célula e apoiam em Z = 0.
- **Eixos:** no Blender o Z é para cima e o personagem olha para −Y. Na exportação glTF o Y vira
  para cima, e −Y do Blender vira +Z no Three.js.
- **Coleções:** `Characters`, `Character_Headgear`, `Character_Faces`, `Character_Clothing`,
  `Character_Accessories`, `Kit`, `World_Chunks/<chunk>` e `Preview`.
- **Nomes:** `<bioma>_<tipo>_<variação>` (por exemplo `vol_ground_basalt_a`), `trans_*` para
  transição, `for_*` para floresta, `hz_*_<estado>` para perigos e `pu_*` para power-ups.
- **Downloads:** o original fica em `textures/downloaded`. A versão adaptada vai para
  `textures/processed`, e o que é do projeto fica em `textures/original` (reservado).

## Controle de qualidade feito na Fase 1

- **Prévias:**
  - personagem de frente, lado, 3/4 e isométrico;
  - folhas por categoria;
  - kit inteiro;
  - visão geral do mundo, câmera de jogo e close da transição.
- **Problemas encontrados e corrigidos:**
  - recorte do capacete calculado em coordenada errada;
  - casca do moletom incompleta;
  - lava "lavada";
  - fogo parecendo um cone;
  - topos de coluna chamativos demais;
  - chão de transição em xadrez;
  - fresta entre os chunks;
  - personagens ocultos no render.
- **Teste no Three.js:** todos os GLB carregam com Meshopt no **Ateliê** (`/atelie`). As peças
  são religadas ao esqueleto e animadas, as paletas aplicadas e os chunks montados com o portal.
