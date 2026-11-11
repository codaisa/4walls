# 4Walls — Catálogo de Assets

Regra: nenhum asset entra no projeto sem uma linha nesta tabela e sem a licença conferida
individualmente. Prioridade: CC0 / domínio público / licença comercial compatível.

## Em uso

| Asset | Tipo | Origem | URL | Autor | Licença | Atribuição | Uso comercial | Redistribuição | Local no projeto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bombito (personagem) | Modelo procedural | Próprio (código) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/src/scene/Character.tsx` |
| Magmito (inimigo) | Modelo procedural | Próprio (código) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/src/scene/Enemies.tsx` |
| Arena Caldeira | Geometria/instancing | Próprio (código) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/src/scene/Arena.tsx` |
| Shader de lava | GLSL | Próprio (código) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/src/scene/Lava.tsx` |
| Efeitos sonoros | Síntese Web Audio | Próprio (código) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/src/audio/Sfx.ts` |
| Músicas "Caldeira" e "Floresta" | Sequenciador procedural | Próprio (código) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/src/audio/Music.ts` |
| Ninja, Engenheiro (acessórios) | Modelo procedural | Próprio (código) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/src/scene/Character.tsx` |
| Arena Floresta Encantada | Geometria/instancing + shader de água | Próprio (código) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/src/scene/Arena.tsx`, `Lava.tsx` |
| Lilita One | Fonte | Google Fonts via @fontsource | https://fonts.google.com/specimen/Lilita+One | Juan Montoreano | SIL OFL 1.1 | Não obrigatória | Sim | Sim, com a OFL | `node_modules/@fontsource/lilita-one` |
| Nunito | Fonte | Google Fonts via @fontsource | https://fonts.google.com/specimen/Nunito | Vernon Adams et al. | SIL OFL 1.1 | Não obrigatória | Sim | Sim, com a OFL | `node_modules/@fontsource/nunito` |

| Bombito, Ninja, Engenheiro (GLB rigados + 5 animações) | Modelo 3D gerado por script no Blender | Próprio (`tools/blender/build_characters.py`) | — | Equipe 4Walls | Proprietário | Não | Sim | — | `apps/web/public/models/*.glb` |

## Fase 1 de arte (estúdio): `game-assets/`

Todos os itens abaixo são originais (geometria, rig, animação por script) com texturas CC0
adaptadas. Licenças em [LICENSES.md](LICENSES.md); pipeline em [BLENDER_PIPELINE.md](BLENDER_PIPELINE.md).

| Grupo | Assets | GLB (fonte → web) | Manifesto |
|---|---|---|---|
| Personagem modular | `adventurer_base` (+8 animações); capacetes classic, pilot e wizard; rostos happy, angry e surprised; roupas jumpsuit, hoodie e armor; costas rocketpack e bombpack; `acc_scarf` | `game-assets/glb/characters/**` → `/assets/characters/**` | `manifests/characters/adventurer.json`, `manifests/customization/*.json` |
| Chão | basalto a/b, rachado, cinzas, lava, musgo (transição), grama | `glb/ground/**` | `manifests/assets/volcanic_kit.json` |
| Blocos | coluna de basalto; caixote (intacto, danificado, fragmentos); bloco de pedra (intacto, danificado) | `glb/blocks/**` | idem |
| Bomba e power-ups | `bomb_classic`; `pu_bomb_up` (comum), `pu_fire_up` (raro), `pu_speed_up` (épico) | `glb/bombs/**`, `glb/powerups/**` | idem |
| Props | rochas a/b, obsidiana, árvore morta, cogumelo gigante, árvore, arbusto, placa | `glb/props/**` | idem |
| Conexão | `gate_arch_vol_forest` | `glb/environments/**` | idem |
| Perigo | `hz_fire_vent_{disabled,idle,warning,active}` | `glb/hazards/**` | idem |
| Mundo | `vol_exploration_01`, `trans_vol_forest_01` | `glb/world-chunks/**` | `manifests/world-chunks/*.json`, `manifests/biomes/*.json` |

Arquivos editáveis: `game-assets/blender/characters/adventurer_kit.blend`,
`environments/volcanic_kit.blend` e `showcase/phase1_showcase.blend`.

## Pipeline Blender (personagens)

```bash
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup --python tools/blender/build_characters.py -- apps/web/public/models tools/blender/previews
```

- **Corpo:** esqueleto de vértices passado pelo modificador Skin e depois por subdivisão. As peças rígidas (capacete, luvas, botas e acessórios) ficam presas 100% ao osso delas, e tudo vira **uma única malha com skinning** por personagem.
- **Visual:** proporção de brinquedo, com a cabeça ocupando mais ou menos metade da altura.
  - Cabeça branca em bloco macio, um pouco mais estreita no queixo e sem pescoço.
  - Olhos em pílula projetados na curva do rosto.
  - Corpo atarracado, punhos redondos grandes, botas grandes e cinto preto grosso com fivela amarela.
- **Expressões:** três conjuntos de olhos no mesmo rosto: `Eye` (normal), `EyeHappy` (^ ^, na vitória) e `EyeX` (X X, na derrota). O jogo mostra um conjunto por vez com `material.visible`.
- **Animações:**
  - `Defeat`: recua, cai de costas e fica deitado. O jogo segura o corpo no chão por 2,6 s antes de sumir.
  - `Cast`: arremesso lateral com o braço direito, no Shift ou botão B.
  - `Roll`: cambalhota para frente girando no centro do corpo, com a duração ajustada à esquiva.
  - `Jump`: preparação, impulso, encolhe no alto e aterrissa. O arco e a deformação na queda são feitos no jogo.
  - `Throw`: arremesso por cima do ombro, com a Luva.
  - `Slide`: carrinho de pés, no chute e no gelo.
- **Animações:**
  - **Feitas à mão para o corpo chibi** (`tools/blender/chibi_actions.py`): Run, Roll, Jump, Slide, Throw e Victory.
  - **Mixamo** (`tools/blender/mixamo_retarget.py`): só Idle e Defeat. A captura de movimento humana, analisada nas folhas de quadros, ficou ruim nesse corpo. Os punhos ficavam colados na barriga, a cabeça grande entrava no chão no rolar e o arremesso virava o corpo de lado.
- **Revisão das animações** (`tools/blender/anim_contact_sheet.py`):
  - **Folhas de quadros:** gera uma visão de lado com 8 a 10 quadros de cada clipe, a partir do mesmo GLB que o jogo usa.
  - **Métricas impressas:** duração, altura do quadril, abertura dos pés e diferença entre a primeira/última pose e a Idle, que mostra os "pulos" de pose na troca de clipe.
- **Cuidado:** o importador de FBX troca a cena para 30 fps. O script volta para 24 fps antes de exportar, senão todos os clipes saem 25% mais curtos.
  - **O que continua feito à mão:** a `Cast` (habilidade) e as poses de expressão.
- **Materiais com nome fixo:** o jogo recolore `Suit` (cor do jogador), `Glove` (cor um pouco mais clara) e `Boot` (cor um pouco mais escura). `Head` continua branco e os demais materiais mantêm a cor do modelo.
- **Bomba** (`apps/web/src/scene/Bombs.tsx`): esfera preta brilhante, emblema de caveira desenhado em canvas, tampa escura com um anel na cor do dono e pavio de corda trançada.
- **Animações (actions do glTF):** `Idle`, `Run`, `Victory`, `Defeat` e `Cast`.
- **Prévias:** PNGs em `tools/blender/previews/`, para conferir o resultado sem abrir o Blender.
- **Reserva:** se um GLB faltar ou falhar, o jogo usa o modelo procedural (`scene/Character.tsx`).

## Fila de avaliação (não incorporados)

| Necessidade | Fonte candidata | Observação |
| --- | --- | --- |
| Modelos de personagens rigados (GLB) | Blender (autoral) + Mixamo | Conferir os termos do Mixamo para redistribuição dentro de um jogo web |
| Texturas PBR (pedra, lava, argila) | ambientCG, Poly Haven | CC0, usar 512px/1K e comprimir em KTX2 |
| Props de ambiente | Kenney, Quaternius | CC0 |
| Música | Pixabay Music / OpenGameArt / Incompetech | A licença varia por faixa e precisa ser registrada aqui |
