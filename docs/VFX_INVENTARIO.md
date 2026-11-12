# 4Walls — Inventário de VFX, animação e texturas

> Status: **inventário e plano para aprovação**. Nada foi baixado nem integrado ainda.
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
