# 4Walls — Licenças de assets

Regra: nenhum asset externo entra sem uma linha aqui, com a licença conferida **por asset**.
O registro de máquina fica em `game-assets/textures/downloaded/SOURCES.json`, gerado pelo
script de download.

## Assets externos em uso

| Asset | Categoria | Autor(es) | Fonte / URL | Licença | Uso comercial | Atribuição | Baixado em | Modificações | Caminho local |
|---|---|---|---|---|---|---|---|---|---|
| `dark_rock` | Textura PBR (cor, normal GL, rugosidade) 1K | Amal Kumar | Poly Haven — https://polyhaven.com/a/dark_rock | CC0 1.0 | Sim | Não exigida | 2026-11-11 | Cor estilizada (tom, contraste, posterização) para basalto, cinzas e pedra; normal reduzido para 512 px | `game-assets/textures/downloaded/polyhaven/dark_rock/` → `processed/vol_basalt_*.jpg`, `vol_ash.jpg`, `vol_stone_block.jpg`, `vol_rock_normal.jpg` |
| `brown_planks_03` | Textura PBR 1K | Rob Tuytel | Poly Haven — https://polyhaven.com/a/brown_planks_03 | CC0 1.0 | Sim | Não exigida | 2026-11-11 | Tom de madeira quente e saturado, posterizado; normal 512 px | `.../polyhaven/brown_planks_03/` → `processed/wood_planks*.jpg` |
| `mossy_rock` | Textura PBR 1K | Rob Tuytel | Poly Haven — https://polyhaven.com/a/mossy_rock | CC0 1.0 | Sim | Não exigida | 2026-11-11 | Verde-musgo estilizado para os tiles de transição | `.../polyhaven/mossy_rock/` → `processed/trans_mossy_*.jpg` |
| `belfast_sunset_puresky` | HDRI 1K | Greg Zaal, Dimitrios Savva, Jarod Guest | Poly Haven — https://polyhaven.com/a/belfast_sunset_puresky | CC0 1.0 | Sim | Não exigida | 2026-11-11 | Nenhuma (iluminação das prévias e do Ateliê) | `.../polyhaven/belfast_sunset_puresky/`, cópia em `apps/web/public/assets/hdri/` |
| `Lava004` | Textura PBR 1K | ambientCG (Lennart Demes) | ambientCG — https://ambientcg.com/view?id=Lava004 | CC0 1.0 | Sim | Não exigida | 2026-11-11 | Cor estilizada para o tile de lava; máscara de emissão extraída do mapa de emissão. Arquivos extras do pacote (.blend, .usdc, .tres, .mtlx, NormalDX, prévia) foram apagados sem abrir. | `.../ambientcg/Lava004/` → `processed/vol_lava_*.jpg` |
| Lilita One / Nunito | Fontes | Juan Montoreano / Vernon Adams et al. | Google Fonts via @fontsource | SIL OFL 1.1 | Sim | Não exigida | — | — | `node_modules/@fontsource/*` |

Referências das licenças: Poly Haven → https://polyhaven.com/license · ambientCG → https://docs.ambientcg.com/license/

### Animações Mixamo (Adobe)
- **Clipes:**
  - Happy Idle e Running (`Idle`, `Run`);
  - Jumping (`Jump`), Stand To Roll (`Roll`) e Running Slide (`Slide`);
  - Throw (`Throw`), Victory (`Victory`) e Falling Back Death (`Defeat`).
- **Origem e licença:** baixados em 11/11/2026 pela conta Adobe do dono do projeto. Pelos termos do Mixamo, o uso em jogos é livre de royalties, inclusive comercial. Só não é permitido redistribuir os arquivos de animação crus como asset separado.
- **Onde ficam:**
  - Os FBX originais ficam em `game-assets/mixamo/`, fonte de trabalho, e não vão para a pasta pública.
  - O jogo só distribui as animações já reaproveitadas no nosso rig, dentro de `apps/web/public/models/*.glb`.

## Assets originais (gerados por código)

Toda a geometria, rigs, animações, rachaduras de lava procedurais (Voronoi) e materiais
estilizados foram criados pelos scripts em `game-assets/blender/scripts/`, assim como a música
e os efeitos sonoros do jogo (`apps/web/src/audio/`). Eles são propriedade do projeto e não
exigem atribuição.

## Pesquisados e **não** usados nesta fase

| Fonte | O que foi avaliado | Por que não entrou agora |
|---|---|---|
| ambientCG `Rock064`, `Planks037A`, `Ground111` | Alternativas de pedra, madeira e chão (comparadas via API) | As escolhas do Poly Haven liam melhor como basalto, tábua e musgo depois da estilização |
| Mixamo (Adobe) | Animações humanoides | Exige login Adobe, que não posso fazer por você. Os rigs do Mixamo também esperam proporção humana, e o nosso personagem tem cabeça de ~50% da altura: o retarget distorceria. As animações foram feitas à mão no rig próprio. Para avaliar: entrar em https://www.mixamo.com com uma conta Adobe, enviar `adventurer_base` em FBX e testar animações de idle e corrida. |
| Quaternius / Kenney / Poly Pizza | Personagens e props low-poly CC0 | Não pesquisado por API nesta fase. Os pacotes ficam em itch.io e Google Drive, com download manual. Fica para a Fase 3 (props e criaturas), seguindo o fluxo "procurar antes de modelar". |
| Sketchfab / CGTrader / BlenderKit | Modelos específicos | A licença é por asset (muitos CC-BY, NC ou pagos) e o download exige login. Nada foi baixado. |
