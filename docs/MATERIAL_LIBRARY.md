# 4Walls — Biblioteca de materiais

Dois tipos de material, ambos exportáveis para glTF (o shader liga a imagem direto no BSDF):

1. **Planos estilizados** (`fw_lib.flat_mat`): uma cor, brilho controlado e verniz opcional.
   Usados em personagens, props e ícones.
2. **Texturizados estilizados** (`fw_lib.tex_mat`): uma textura CC0 fotográfica **adaptada**
   por `fw_lib.stylize_texture`:
   - a luminância vira detalhe;
   - o contraste é reforçado;
   - a imagem é posterizada (aspecto pintado);
   - o resultado é multiplicado por uma cor definida pela direção de arte.

   O normal map é reduzido (força 0,3–0,5). Os resultados ficam em
   `game-assets/textures/processed/` em 512 px, e os originais nunca são alterados.

| Material | Origem | Cor de direção | Usado em |
|---|---|---|---|
| Basalt / BasaltB | `dark_rock` (CC0) | `#5b4c66` / `#4c4157` | tiles, colunas, rochas, portal |
| Ash | `dark_rock` | `#77707a` | tile de cinzas |
| CrackedBasalt | `dark_rock` + rachaduras Voronoi procedurais (emissão) | `#ff5a0a` | tile rachado |
| Lava | `Lava004` (CC0) | `#c2300a` + emissão `#ff7a12` | tile de lava, mar de magma |
| Stone | `dark_rock` | `#a38877` | bloco de pedra, arco do portal |
| Wood | `brown_planks_03` (CC0) | `#c98b4e` | caixotes, placa |
| Moss | `mossy_rock` (CC0) | `#6f8f45` | transição, pilar com musgo |
| Helmet, Glove, Accent, Outfit | planos, **recoloríveis** | paletas | personagem |
| Ember, Flame, FlameCore, Rune, Spark | emissivos | laranjas | lava, fogo, runas, pavios |
| Obsidian, RareGem, EpicGem, Gold | planos com verniz e emissão leve | roxos, azuis, ouro | props e raridade |

**Tamanhos:** 512 px para tudo nesta fase. 1K fica para superfícies grandes e importantes, e
4K e 8K não são usados. **Próximos:** atlas por bioma e compressão KTX2/Basis (Fase 7 de arte).
