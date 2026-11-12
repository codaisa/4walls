# 4Walls — Inventário de VFX, animação e texturas

> Status: **aprovado** (só CC0). **V0 a V6 concluídos** (seções 6 e 7).
> Objetivo: um **sistema de VFX coerente** (não uma coleção solta). Explosões, ambientes, chefes e
> transições de bioma devem parecer polidos e satisfatórios **sem perder desempenho no celular**.

## Direção visual (regras do sistema)

- **Estilo:** cartoon 3D colorido e polido, combinando com os heróis e o mundo atuais.
  - Formas legíveis da câmera alta, cores saturadas e brilho "quente" (HDR + bloom).
- **Evitar:**
  - VFX fotorrealista;
  - pixel art misturada no 3D;
  - auréola escura em sprites transparentes (usar alpha pré-multiplicado ou blending aditivo);
  - efeitos "barulhentos" que escondem o jogo.
- **Telegrafia em primeiro lugar:** todo perigo marca o chão antes. O efeito nunca pode esconder uma marca de perigo.
- **Uma linguagem de cor por elemento:**
  - fogo: laranja → amarelo;
  - gelo: ciano;
  - corrupção: violeta;
  - natureza: verde;
  - ouro e recompensa: dourado;
  - dano: branco e vermelho.

## 1. Onde estamos hoje (auditoria do código)

**Arquitetura de efeitos já existente (boa base, vale manter):**
- `scene/Fx.tsx` é o roteador central: escuta os eventos da simulação e dispara efeitos. Usa 6 pools instanciadas, criadas uma vez e reaproveitadas:
  - faíscas: 900;
  - sólidos: 500;
  - fumaça: 480;
  - bolas de fogo: 360;
  - marcas no chão: 160;
  - ondas de choque: 40.
- `scene/SoftParticles.ts` e `scene/vfxShaders.ts` desenham fumaça, fogo, marcas e ondas de choque com shaders próprios: ruído procedural (FBM), rampa de calor em HDR para o bloom e billboards "em pé".
- `scene/Flames.tsx` desenha as chamas das explosões em instâncias (até 400 casas / 1.200 línguas de fogo).
- `scene/Lava.tsx` é o mar de lava do fundo: um plano de tela inteira com FBM em *domain warp* (várias chamadas de FBM por pixel).
- Não há texturas de efeito: todo efeito é procedural. Isso deixa o download leve, mas o custo vai para a GPU, pixel a pixel.

**Medição (cena típica da Aventura, 844×390, qualidade automática de celular = "medium", DPR 2 limitado a 1,25):**
- cerca de **206 chamadas de desenho por quadro** (incluindo o passe de sombra);
- 1.138 instâncias por quadro;
- **27 programas de shader**.
- O navegador de teste limita a 30 fps, então o número de fps não vale; precisa medir num aparelho real.

**Pontos fracos de desempenho (o que mais pesa no celular):**
1. **Lava de tela inteira**:
   - domain warp com FBM aninhado em todo pixel do fundo, sempre visível nos mapas vulcânicos;
   - é o maior custo por pixel do jogo.
2. **18 luzes pontuais na cena** (fogueiras, braseiros, gêiseres, explosões):
   - no three.js, cada luz pontual entra na conta de **todo** material iluminado;
   - o custo do shader cresce com o número de luzes, e trocar o número de luzes recompila os shaders (travadas).
3. **91 objetos com sombra** e mapa de sombra de 1024 no "medium". A sombra dobra boa parte das chamadas de desenho.
4. **Pools com tamanho fixo**, iguais no celular e no PC. O número de partículas não muda com a qualidade.
5. **Ruído procedural no fogo e na fumaça**: FBM de 4 oitavas por fragmento, com muita sobreposição (overdraw) numa explosão grande.
6. **Pós-processamento** (bloom com mipmap, vinheta e tone mapping) ligado no "medium". É caro em GPU de celular.

**Lacunas visuais (o que falta de vida/feedback):**
- **51 dos 111 eventos do jogo não têm efeito visual próprio**, só som e faixa de texto. Os mais sentidos:
  - **Chefes:** preparação de golpe (`bossWindup`), investida (`bossCharge`), pulo e pouso (`bossLeap`, `bossLand`), troca de fase (`bossPhase`), fúria (`bossEnraged`), armadura de volta (`bossArmor`), lava subindo (`lavaRising`), aparição (`bossSpawned`).
  - **Jogador:** bomba posta (`bombPlaced`), pulo (`playerJumped`), coração perdido (`heartLost`), pena salvando (`featherSaved`), mordida do Mímico (`mimicBite`), agachar do Mímico (`mimicCrouch`).
  - **Mundo:** portão abrindo e fechando (`gateOpened`, `gateClosing`, `gateClosed`), região vencida (`regionCleared`), aviso de gêiser (`geyserWarn`), ponte rachando (`bridgeCracking`), espinheiro voltando (`brambleRegrow`), power-up queimado (`powerupBurned`), mina (`mineTriggered`).
  - **Acampamento e progresso:** relíquia achada (`relicFound`), relíquia salvando (`relicSaved`), compra (`campBought`), cofre (`coinsBanked`), contrato cumprido (`contractDone`), roleta (`wheelSpun`), morador chegando (`residentArrived`), volta ao acampamento (`campReturn`).
- **Materiais quase todos lisos** (cor sólida, `flatShading`), sem textura:
  - blocos, chão, tendas, inimigos e chefes ficam "de plástico";
  - falta variação de cor, bordas gastas e desenho pintado à mão.
- **Animação:**
  - os heróis têm 9 clipes (Idle, Run, Victory, Defeat, Cast, Roll, Jump, Throw, Slide);
  - os inimigos (Magmito, Fagulha, Broto, Mímico, motas) e os chefes (Golem, Guardião) são animados por código: pulinhos, escala e rotação, sem esqueleto;
  - não há antecipação nem *squash & stretch* consistente, e falta "hit stop" e piscada branca ao levar dano.
- **Ambiente:**
  - não há água, cachoeira, chuva, neve ou vento;
  - as transições de bioma (vulcão → floresta) não têm partícula ambiente própria além da névoa e da noite.

## 2. Busca de assets gratuitos (resultado e política)

Pesquisa feita nas fontes pedidas, com a licença conferida na página sempre que possível. **Nada foi baixado.**

**Como cada fonte licencia:**

| Fonte | Licença | Serve para o jogo? |
|---|---|---|
| **Kenney** | CC0 em todo o site (conferido), uso comercial, sem crédito | **Sim**, a melhor base: formas limpas para tingir |
| **Poly Haven** | CC0 (conferido) | Pouco: é fotorrealista (texturas, HDRI). Só referência |
| **ambientCG** | CC0 (conferido) | Pouco: PBR fotorrealista |
| **OpenGameArt** | Por asset (CC0, CC-BY, GPL…). O site bloqueou a leitura automática | Sim, mas **cada licença precisa ser conferida à mão antes de baixar** |
| **itch.io** | Por pacote, e muitas páginas são **contraditórias** ou sem licença | Só com a licença clara (ler o arquivo de licença do pacote) |
| **Sketchfab** | Por modelo, quase sempre CC-BY (exige crédito) | Pontual: modelos leves (portal, fogueira) |
| **Fab** | Licença padrão: uso comercial em qualquer motor; proíbe redistribuir o arquivo solto | Risco num jogo web (os PNGs ficam acessíveis no navegador) |
| **Unity Asset Store** | EULA padrão: não é só para Unity, mas proíbe deixar extrair os arquivos crus | Mesmo risco do Fab |
| **PVFX Foundry** | CC0 (conferido) | **Não**: é pixel art (fora do estilo) |
| **SEAMPROOF** | Não existe como fonte de VFX (é um software de controle de qualidade têxtil) | — |

**Candidatos fortes (todos CC0 ou MIT, comerciais e sem crédito obrigatório):**
1. **Kenney – Particle Pack** (kenney.nl/assets/particle-pack): 80 PNGs de 512 px (faíscas, magia, estrelas, anéis, brilhos, eletricidade).
2. **Kenney – Smoke Particles** (kenney.nl/assets/smoke-particles): 70 PNGs de fumaça, poeira e baforadas de explosão.
3. **Kenney – Splat Pack + Light Masks**: marcas no chão (crateras, pancadas) e máscaras de brilho.
4. **Screaming Brain Studios – Noise Texture Pack** (opengameart.org/content/noise-texture-pack): 768 ruídos Perlin e Voronoi de 128 a 512 px, quase todos repetíveis. É a base dos shaders de lava, água, portal e dissolução. *(licença vista só em resultado de busca: conferir na página)*
5. **Brackeys' VFX Bundle** (brackeysgames.itch.io/brackeys-vfx-bundle): CC0 (conferido), flipbooks e texturas de partícula reunidos.
6. **Unity Labs – flipbooks CC0** (Thomas Iché): fogo, explosão e fumaça em flipbook. São realistas, mas ficam cartoon com um shader de rampa de cor. *(conferir se os links ainda funcionam)*
7. **Bibliotecas MIT (só referência, não dependência):**
   - **three.quarks** (motor de partículas com rastro e sub-emissores);
   - **wawa-vfx** (emissores instanciados leves para R3F);
   - **three-nebula**.

**Lacunas sem asset gratuito bom:** folhas, pólen, vagalumes, chuva, neve, vento, onda de choque de pancada, rajada de raízes, raio de energia e rastro de meteoro. **Vamos criá-los** com os sprites Kenney e as texturas de ruído nos nossos shaders.

**Política proposta:** **só CC0** (Kenney, Screaming Brain, Brackeys, Unity Labs CC0), com a licença conferida na página de cada item antes do download.
- Fica fora, a não ser que você aprove: Unity Asset Store e Fab (o "Cartoon FX Remaster Free" é o visual mais próximo, mas um jogo web expõe os PNGs) e Sketchfab CC-BY (exige crédito no jogo).
- Cada asset baixado entra em `docs/ASSETS_LICENCAS.md` com URL, autor, licença, crédito exigido e uso comercial.

## 3. Orçamento de desempenho (celular primeiro)

| Meta (celular "medium") | Hoje | Alvo |
|---|---|---|
| Chamadas de desenho por quadro | ~206 | **≤ 120** |
| Programas de shader | 27 | ≤ 22, sem recompilar no meio do jogo |
| Luzes dinâmicas | até 18 | **≤ 4 fixas** (pool de luzes que nunca muda de quantidade) |
| Partículas vivas | até ~2.400 (pools fixas) | 600 (low) / 1.200 (medium) / 2.400 (high) |
| Texturas de VFX | 0 | **1 atlas de 2048** (1024 no low) + 2 ruídos de 256 |
| Custo do fundo de lava | FBM aninhado por pixel | ruído por textura e resolução menor no medium/low |

- Toda melhoria nova entra com uma regra para **"low"**: menos partículas, sem distorção e sem luz.
- Medição antes/depois: contador de chamadas de desenho e fps no HUD de desenvolvimento, conferido num celular real.

## 4. Plano em marcos

| Marco | Conteúdo | Por quê primeiro |
|---|---|---|
| **V0 — Base de desempenho** | Medidor no HUD de dev. Pools que respeitam a qualidade. **Lava por textura de ruído** (bem mais barata). **Pool fixa de 4 luzes** (as demais viram brilho falso com sprite aditivo). Orçamento de sombras (só heróis, chefes e inimigos; o cenário estático ganha sombra-bolha). Bloom mais leve no medium. | Abre espaço para todo o resto rodar liso no celular |
| **V1 — Núcleo da biblioteca** | **Atlas único** com os sprites Kenney (CC0). Material de **flipbook/sprite sheet** instanciado. **Catálogo de efeitos como dados** (um preset por efeito: sprites, cores, curvas, tamanho, duração, qualidade mínima). Tempo pelo tick da simulação (igual no online). Página de dev **/vfx** com prévia de cada efeito e controles. `ASSETS_LICENCAS.md`. | Tudo o que vem depois usa essas peças |
| **V2 — Combate e sensação** | Explosão nova (núcleo em flipbook, anel de choque, estilhaços, fumaça em camadas, marca de queimado). Bomba posta (baforada e pulso do pavio). Bloco quebrando com lascas do material certo. **Piscada branca e micro-pausa** ao levar dano. Coração perdido. Poeira ao correr, rolar e pular. Power-up queimando. Mina. | É o que o jogador vê a cada segundo |
| **V3 — Chefes** | Preparação de golpe com brilho crescente. Rastro da investida. Pulo e pouso (sombra que cresce, cratera, onda). Troca de fase (explosão de energia e escurecimento curto). Aura de fúria. Placas voltando. Lava subindo (bolhas). Meteoros com rastro. Rajada de raízes. Golpes da névoa. Motas com rastro violeta. | Os chefes são o clímax de cada arco |
| **V4 — Mundo e biomas** | Partículas ambiente por bioma: brasas e cinza no vulcão; vagalumes, pólen e folhas na floresta; névoa em camadas; estrelas e vaga-lumes à noite. Fluxo de lava nos rios. Portões e portais. Fogueira e tendas mais vivas. Água e cachoeira só se entrar um bioma de água. | Dá identidade e "vida" a cada região |
| **V5 — Materiais e texturas** | Visual "pintado à mão" sem pesar: rampa toon e rim light em todos os materiais. Ruído de variação por posição (adeus aspecto de plástico). Bordas gastas por vértice nos blocos e no chão. Atlas de detalhes (rachaduras, musgo, brasas) via ruído CC0. | Muda a cara do jogo inteiro com custo baixo |
| **V6 — Animação** | Inimigos e chefes com antecipação, *squash & stretch* e reação a dano (biblioteca de curvas reaproveitável). Heróis: aterrissagem, reação a golpe, comemoração. Câmera: tremor em camadas e zoom de impacto (respeitando o ajuste de tremor). Juice na interface (moedas voando para o contador, corações pulsando). | Acabamento de "jogo pronto" |

Cada marco segue o fluxo de sempre: implementar, testar, verificar no navegador (844×390) e no celular, fazer commit e pedir seu ok para o deploy.

## 5. O que sai como entrega

- `apps/web/src/vfx/`: a biblioteca, com sprite sheet, flipbook, partículas, decals, ondas, rastros, luzes falsas, presets e qualidade.
- `apps/web/public/assets/vfx/`: o atlas CC0 e os ruídos.
- Página **/vfx** (só em desenvolvimento): catálogo vivo, com prévia, nome, custo e qualidade mínima de cada efeito.
- `docs/VFX_CATALOGO.md`: como usar cada componente e cada preset.
- `docs/ASSETS_LICENCAS.md`: registro de licença de cada arquivo.

## 6. Resultado do V0 (12/11/2026)

**Como foi medido:**
- tempo de GPU por quadro (extensão de timer do WebGL), chamadas de desenho e triângulos;
- medidor de dev ligado em Ajustes → "Mostrar FPS";
- mesmas cenas, 844×390, numa RTX 3060.

Num celular os números são muitas vezes maiores, mas a **proporção** do ganho vale.

| Cena (qualidade média, a do celular) | GPU antes | GPU depois | Chamadas de desenho | Triângulos |
|---|---|---|---|---|
| Acampamento (6 moradores) | 8,2 ms | **4,8 ms (−42%)** | 351 → 197 | 568k → 362k |
| Região inicial (lava) | ~4,0 ms | **3,1 ms (−22%)** | ~150 → ~150 | igual |
| Boss Rush (Golem, muita lava) | 4,0 ms | **3,2 ms (−19%)** | 108 → 110 | igual |
| Pior quadro na 1ª explosão (travada) | **485 ms** | **55–70 ms** | — | — |
| Qualidade alta (PC), região inicial | 7,5 ms | 6,5 ms | — | — |

**O que mudou:**
- **Moradores do acampamento viram estátuas:**
  - a pose de descanso é congelada numa malha única (cor por vértice; 1 a 3 chamadas de desenho por herói, antes de 12 a 20 com esqueleto);
  - respiração e um leve olhar em volta por código;
  - sombra real só no "alto"; no celular, uma mancha suave.
- **Lava e água do fundo:** o ruído de 5 camadas agora vem de uma textura repetível de 256×256 gerada no código, com o mesmo algoritmo. O fundo ficou cerca de 4 vezes mais barato, com a mesma aparência.
- **Shaders pré-compilados** ao carregar a cena (em segundo plano). A primeira explosão não congela mais o jogo.
- **Pool fixa de luzes:**
  - fogueiras, braseiros, totens, tochas, a chave, a auréola e a lanterna da noite viraram luzes virtuais;
  - a cada quadro acendem as mais fortes perto do centro da tela, em 2 / 4 / 6 luzes reais (baixo / médio / alto) mais 1 / 2 / 4 clarões de explosão;
  - o número de luzes nunca muda, então os shaders não recompilam.
- **Vagas de inimigo sob demanda:** antes eram 40 vagas fixas de cerca de 66 malhas cada (~2.600 objetos percorridos por quadro, mesmo invisíveis). Agora só as necessárias.
- **Partículas por qualidade:** densidade de 40% / 65% / 100% (as bolas de fogo das explosões ficam em no mínimo 80%).
- **Bloom** calculado em meia resolução no baixo e no médio.

**Capturas antes e depois:** `docs/vfx/v0_acampamento.jpg`, `docs/vfx/v0_explosao.jpg` e `docs/vfx/v0_chefe_lava.jpg`. Ficaram visualmente equivalentes.

**Ainda não feito (vai para o V1):**
- os objetos de cenário (tendas, baús, capim, espinheiros) ainda são várias malhas cada; instanciar reduz bem as chamadas de desenho da Aventura;
- conferir num celular de verdade.

## 7. Resultado do V1 ao V6 (12/11/2026)

**Decisão de assets:** o atlas de efeitos é **pintado em código** (`apps/web/src/vfx/atlas.ts`), no lugar dos pacotes Kenney. Assim o estilo fica único, o download é zero e não há licença a rastrear. Os pacotes CC0 seguem aprovados se faltar algo. Catálogo: `docs/VFX_CATALOGO.md`.

| Marco | O que entrou |
|---|---|
| **V1 — Biblioteca** | Atlas 8×8 com 40 sprites e 3 flipbooks. Pool de sprites em 2 chamadas de desenho no total. 40 efeitos como dados, com qualidade mínima por camada. Página `/vfx` (só em dev). Espinheiros: 15 → 2 chamadas de desenho cada. Capim: 15 → 1 (3 quando queima). |
| **V2 — Combate** | Explosão com núcleo em flipbook, faíscas esticadas, estilhaços e marca queimada. A bola de fogo de cada braço virou flipbook (mais barata que o ruído por pixel). Baforada da bomba posta, lascas de bloco, poeira de corrida, pouso e rolamento. Golpe no herói: **flash branco**, corte, estrelas e **micro-pausa** de 75 ms (só no jogo local). Coração perdido, power-up queimando, inimigo atingido e "puf" ao morrer, moedas quicando, cura. |
| **V3 — Chefes** | Runa no chão durante a preparação, rastro da investida, rachadura e onda na pancada, pouso, troca de fase (clarão e anéis), aura de fúria, raízes, esporos, bolhas de lava subindo, golpe da névoa, rastro das motas, placas da armadura e grande final. |
| **V4 — Mundo** | Ambiente por bioma em volta da câmera: brasas e cinzas no vulcão, pólen e folhas na floresta, mistura na transição; vagalumes à noite e névoa rasteira. Fagulhas das fogueiras, braseiros e capim em chamas. |
| **V5 — Materiais** | Luz de contorno em todo material iluminado (heróis e inimigos se destacam do chão) e variação de cor por posição no cenário (blocos, pilares e chão sem cara de plástico repetido). Feito por vértice, no shader padrão, antes de compilar: não recompila no meio do jogo. Médio e alto. |
| **V6 — Animação** | Inimigos amassam e voltam com mola ao levar dano. Câmera com tremor em camadas (ronco grave + tremida rápida + leve rotação) e **zoom de impacto** em dano, pancada, troca de fase e vitória (desligados junto com o tremor nos Ajustes). Interface: o coração perdido trinca, o último coração bate e o contador de moedas pula. |

**Custo medido (médio, 844×390, região inicial):** +2 chamadas de desenho e algumas dezenas de sprites vivos no ambiente. GPU 3,3 a 3,6 ms (V0: 3,1 ms). Boss Rush com o Golem furioso: 3,4 ms.

**Não verificado:** celular de verdade (as medidas são da placa deste PC).

**Ficou para depois:** fluxo de lava nos rios, brilho girando nos portais abertos (o efeito existe, falta ligar aos portões), faíscas do pavio, moedas voando até o contador.
