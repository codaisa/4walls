# 4Walls — Plano da Aventura

A Aventura foi dividida em **3 grandes tarefas**, feitas em ordem e cada uma entregue por completo
antes da próxima:

| # | Tarefa | Depende de | Status |
|---|---|---|---|
| 1 | **Mapa**: regiões viram fases, objetivos, mecânicas de ambiente, segredos, navegação, arcos | — | **Concluída** (M1–M5) |
| 2 | **Chefes**: elites, mini-chefes, chefes de bioma, lendários e secretos | Mapa (arenas, gatilhos, recompensas) | **Concluída** (B1–B5, seção 5) |
| 3 | **Acampamentos**: checkpoints, hub, progresso da expedição e da conta | Mapa + Chefes | Em andamento: A1 e A2 concluídos (seção 6) |

Ponto de partida (como está hoje):
- 5 regiões-ilha num reticulado de blocos de 16×14 casas, ligadas por corredores e geradas por seed.
- Cada região: Magmitos que andam ao acaso, blocos, 1 cela.
- O portão abre ao limpar os inimigos.
- Sem cronômetro e sem checkpoint.

---

## 1. Tarefa 1 — Mapa: objetivo

Transformar "5 arenas em sequência" numa **jornada**:
- cada região tem nome, capítulo, identidade, objetivo próprio e uma mecânica de ambiente;
- há segredos e caminhos opcionais;
- o jogador sempre sabe **onde está, o que fazer e para onde ir**;
- a arquitetura permite crescer para arcos de biomas infinitos.

Princípios:
1. **Tudo no núcleo determinístico** (`@4walls/core`), com o servidor como autoridade e funcionando igual no local e no online. Toda mecânica nova entra no snapshot e tem teste.
2. **Dados no lugar de código:** as regiões são descritas em `REGION_SCRIPTS` (dados) e montadas por um gerador que segue o script. Uma região nova = dados + no máximo uma mecânica nova.
3. **Toda ameaça é telegrafada:** nada mata sem aviso visível na grade (casas piscando, som, partícula).
4. **Sem softlock:** o gerador valida que cada objetivo é alcançável e cada item crítico tem plano B (uma chave que cai na lava volta ao pedestal).
5. **Pensar no celular primeiro:** toda informação nova tem que caber e ser legível em 844×390. Nada de texto pequeno no meio da tela.
6. **De 1 a 4 jogadores:** nada exige 2 pessoas. A cooperação acelera, mas nunca é obrigatória.

---

## 2. O Arco 1 (o começo roteirizado; depois dele o mundo é infinito, ver 2.1)

| # | Região | Capítulo | Objetivo para abrir o portão | Mecânica de ambiente | Opcional / segredo |
|---|---|---|---|---|---|
| 1 | Caldeira Rasa | **O despertar** | Limpar os Magmitos (são poucos) | — (tutorial contextual) | 1ª cela, 1º **muro rachado** com baú |
| 2 | Campos de Cinza | **A infestação** | **Chave do Portão**: está num baú trancado do outro lado; levar até a fechadura | Respiros de cinza (nuvens que escondem o chão) + rota alternativa em anel | **Missão: acender 3 braseiros** com explosões, o que abre um baú raro |
| 3 | Rio de Magma | **A travessia** | Atravessar o rio e explodir a **alavanca da ponte levadiça** | Rio de lava, **plataformas móveis**, **pontes frágeis**, **gêiseres** | Ilhota secreta alcançável só com Pular ou Luva |
| 4 | Ponte de Obsidiana | **O guardião** | Quebrar os **3 Selos de Obsidiana** (blocos que só cedem a explosões em cadeia) | Ponte estreita com abismos laterais e pilares que caem | Câmara do Guardião reservada (a Tarefa 2 coloca o mini-chefe aqui) |
| 5 | Bosque Chamuscado | **A corrupção** | **Purificar 3 Raízes Corrompidas** (cada uma com 3 pontos de vida de explosão) | **Espinheiros que voltam a crescer**, **capim seco que pega fogo** | Clareira escondida; final com o gancho "algo desperta…" (arena do chefe do arco, Tarefa 2) |

Quantidades de inimigos sugeridas (base com 1 jogador; ajustes na seção 3.8):
- Região 1: 2 Magmitos.
- Região 2: 3 Magmitos e 2 Fagulhas.
- Região 3: 3 Magmitos e 2 Fagulhas nas margens.
- Região 4: 4 Magmitos e 2 Fagulhas.
- Região 5: 3 Brotos Corrompidos e 3 Magmitos.

### 2.1 Mundo infinito: como os capítulos convivem com a geração procedural

**A Aventura não termina.** Ela só acaba quando o grupo inteiro cai (ou quando o grupo encerra no
acampamento, Tarefa 3). A medida de sucesso é a **profundidade**: quantas regiões o grupo atravessou.
Ela vira ranking ("mais longe") e conquistas.

**Região = módulos sorteados, não fases fixas.** Cada região é a combinação de quatro peças, sorteadas
pela seed:

| Peça | Opções | Exemplo |
|---|---|---|
| **Bioma** | vulcão, transição, floresta (mais tarde: gelo, deserto, ruínas…) | floresta |
| **Formato** | ilha, ilha dupla, rio cortando, ponte longa, anel | rio cortando |
| **Objetivo** (1) | limpar, chave, alavanca, selos, purificar, travessia (mais tarde: chefe) | selos |
| **Mecânicas** (0 a 3) | plataformas, gêiseres, pontes frágeis, nuvens de cinza, espinheiros, capim, braseiros… | gêiseres + ponte frágil |

**Regras de combinação:** cada mecânica e cada objetivo declara os biomas e formatos em que faz sentido
(o rio de lava não aparece na floresta, onde vira rio de água; os espinheiros só aparecem na floresta) e
quais combinações são proibidas.

**O "Arco 1" é só o começo roteirizado.** As 5 primeiras regiões usam combinações fixas (o tutorial na
1, a chave na 2, a travessia na 3, os selos na 4, a purificação na 5), com layout procedural. Isso
garante que todo jogador aprende as mecânicas na ordem certa. **Da região 6 em diante, tudo é sorteado.**
O nome da região também é gerado: prefixo + núcleo por bioma, como "Vale das Brasas" ou "Bosque Sussurrante".

**Arcos infinitos:**
- A jornada é uma sequência de arcos de **4 a 6 regiões** (o tamanho é sorteado, para o jogador não
  saber exatamente quando o arco acaba).
- Cada arco tem um bioma dominante e uma região de transição.
- O fim do arco fica reservado ao **chefe de bioma** (Tarefa 2); até lá, a última região do arco usa um
  objetivo mais pesado.
- O ciclo de biomas se repete enquanto não houver biomas novos, mas cada volta aplica uma **variante**:
  paleta "corrompida", mais noite, mais névoa, para não parecer repetido.

**Dificuldade crescente: um orçamento por profundidade.** Cada região recebe `budget(d)` pontos, que
crescem rápido no começo e devagar depois (curva logarítmica com degraus a cada arco). O gerador gasta
o orçamento em:
- **Inimigos:** quantidade e tipos. Magmito custa 1, Fagulha 2, elite 5 (Tarefa 2).
- **Mecânicas:** cada uma custa pontos; a intensidade (intervalo dos gêiseres, velocidade das
  plataformas, tempo da ponte frágil) também sobe com a profundidade.
- **Objetivo:** objetivos mais exigentes custam mais.
- **Menos ajuda:** baús e power-ups ficam um pouco mais raros com a profundidade, mas nunca zerados.
- **Teto:** o orçamento tem limites (por exemplo, no máximo 3 mecânicas e 12 inimigos por região) para
  continuar jogável. Depois disso, a dificuldade vem de combinações e velocidade, não de quantidade.
- **Recompensa:** XP e moedas por região atravessada também crescem com a profundidade. Ir mais longe
  vale a pena.

**Mundo em streaming (a parte técnica que muda a base):**
- Hoje o mundo inteiro (5 regiões) nasce de uma vez e o grid completo vai em todo snapshot. Para ser
  infinito, isso muda.
- **Geração sob demanda:** a região N é gerada a partir de `seed + N` no momento em que a região N−1
  abre o portão. Servidor e clientes geram o mesmo resultado, então a geometria **não trafega pela rede**.
  O servidor só avisa "região N criada".
- **Janela ativa:** só ficam vivas a região anterior, a atual e a próxima.
  - As regiões antigas são descarregadas: o portão de trás fecha ("não dá para voltar").
  - Memória, física e desenho ficam constantes, seja na região 3 ou na 300.
- **Coordenadas por região:** cada região tem a própria origem no mundo. O grid vira um conjunto de
  "pedaços" por região, em vez de uma matriz única.
- **Snapshot:** manda só o que muda: blocos destruídos (diferença por região), estado dos props e
  inimigos da janela ativa.
- **Determinismo:** cada região usa uma sub-seed própria. A mesma seed reproduz a mesma jornada, o que
  ajuda a testar e permite "jogar a seed de um amigo" no futuro.

---

## 3. Sistemas a construir

### 3.1 Scripts de região e gerador por salas (core + shared)

- **`REGION_SCRIPTS`** em `@4walls/shared`: `id`, `name`, `chapter`, `biome`, `size` (1 ou 2 blocos do reticulado), `objective`, `mechanics[]`, `enemies`, `cages`, `secrets`, `hints[]` e música.
- **`buildAdventure`** passa a montar cada região como um **grafo de salas**:
  - sala principal (a ilha atual), sala lateral opcional e sala secreta;
  - conectores: corredor, ponte, muro rachado ou porta com alavanca.
- **Cada mecânica tem um "carimbo" no gerador**, por exemplo `carveRiver(region)`, `placeBraziers(region, 3)` e `placeSeals(region, 3)`. Cada carimbo respeita a regra de solucionabilidade.
- **Validador `solvable(region)`**: busca em largura que considera blocos destrutíveis, pontes e plataformas (por período), e confere que o spawn alcança cada item do objetivo, a alavanca ou fechadura e a saída.
  - Se falhar, o gerador tenta de novo com outra sub-seed (até N vezes) e só então cai num layout de segurança.
  - Teste: 500 seeds × 5 regiões, todas solucionáveis.

### 3.2 Sistema de objetivos (core)

- **`RegionObjective`**: `{ kind, progress, goal, done }`, com os tipos `clear`, `key`, `switch`, `seals`, `purify` e `cross`. O tipo `defeat` fica reservado para a Tarefa 2.
- **`updateObjectives(s)`** substitui a regra atual de "sem inimigos, abre o portão".
  - Gera os eventos `objectiveProgress` e `objectiveDone`.
  - O portão continua sendo o resultado (animação atual de `Gates`).
  - Opcionais (braseiros, baús) contam à parte e dão recompensa.
- **Ao entrar numa região** (o primeiro jogador cruza o portão): evento `regionEntered`, que dispara o cartão de capítulo.

### 3.3 Novas peças de mapa (core: regras; snapshot: estado)

Tiles novos no `Cell` (o grid trafega como dígitos, sem custo extra de rede):

| Tile | Regra |
|---|---|
| `Lava` (3) | Ninguém anda. **Explosões atravessam** (dá para explodir do outro lado). Bombas jogadas com a Luva afundam com fumaça. |
| `Bridge` (4) | Andável. Uma variante frágil vira entidade (ver abaixo). |
| `Chasm` (5) | Abismo (região 4): como a lava, mas no visual de queda. |
| `Cracked` (6) | Muro rachado: bloqueia como parede e vira chão com uma explosão (segredos). |

Entidades novas (em `state.adventure.props[]`, com tipo, posição, estado e ticks):

| Entidade | Mecânica | Aviso / animação |
|---|---|---|
| **Baú** | Abre ao encostar ou com explosão. Solta power-ups (comum) ou um power-up raro mais um bônus de XP da expedição (raro). Fica o gancho para relíquias e moedas da Tarefa 3. | Tampa abre, brilho, moedas pulando |
| **Chave** | Pega ao encostar e aparece flutuando sobre quem carrega. Cai no chão se a pessoa morrer; se cair na lava, volta ao pedestal em 3 s. | Brilho dourado, rastro, seta no HUD apontando a fechadura |
| **Fechadura do portão** | Entregar a chave abre o portão. | Cadeado gigante explode |
| **Alavanca / placa de explosão** | Muda de estado quando uma explosão passa por ela (abre ponte levadiça ou porta secreta). | Runa acende e a alavanca vira |
| **Braseiro** | Acende com explosão; 3 acesos abrem o baú raro. | Fogo sobe e aparece o contador "2/3" |
| **Ponte frágil** | 0,6 s depois de alguém pisar, treme por 0,6 s e cai. Volta depois de 6 s. | Tremor, rachaduras, pedaços caindo na lava |
| **Plataforma móvel** | Percorre um trilho de casas (ida e volta) com período fixo. Quem está em cima é levado junto. Sair para a lava = morte. | Pedra flutuando com runas brilhando e respingos de lava |
| **Gêiser** | Ciclo de repouso, borbulhando (1,2 s de aviso) e jorro (0,8 s, mata como fogo, detona bombas). | Bolhas, anel vermelho piscando, coluna de lava |
| **Respiro de cinza** | Solta uma nuvem que esconde 3×3 casas por 4 s. Só visual: dificulta a leitura, não mata. | Fumaça densa |
| **Selo de Obsidiana** | Bloco 1×1 com 3 "rachaduras". Só uma explosão **encadeada** (2 ou mais bombas no mesmo tick) tira 1 de vida. Ensina cadeias. | Rachaduras crescendo, estilhaços, brilho roxo |
| **Raiz Corrompida** | 3 de vida (qualquer explosão). Enquanto viva, faz os espinheiros voltarem a crescer. | Pulsa em roxo; ao morrer, a área "cura" (cor volta) |
| **Espinheiro** | Bloco destrutível que volta a crescer em 10 s se não houver jogador ao lado. | Brotos surgindo antes de fechar |
| **Capim seco** | Tile decorativo que pega fogo com chamas e espalha a cada 0,35 s (até 6 casas). O fogo mata. | Faíscas e chão queimado depois |
| **Placa / totem** | Decoração narrativa com o nome da região e uma dica. | — |

Inimigos novos de mapa (os de elite ficam na Tarefa 2):
- **Fagulha** (regiões 2–4): pequena e rápida. Persegue quando vê o jogador em linha reta até 5 casas; fora isso, vaga. Morre com qualquer explosão. Aviso antes do bote: os olhos acendem por 0,4 s.
- **Broto Corrompido** (região 5): o Broto que já existe no Boss Rush, recolorido. Fica parado até alguém chegar perto, então pula.

### 3.4 Navegação e leitura (web)

1. **Cartão de capítulo** ao entrar numa região, por 2 s e sem pausar. Exemplo: "REGIÃO 3 · RIO DE MAGMA — *A travessia*" e o objetivo numa linha. Mesmo estilo da tela de herói, mas menor (faixa no topo).
2. **Rastreador de objetivo no HUD**, no lugar de "Magmitos: N": ícone mais texto curto ("🔑 Leve a chave ao portão", "⚡ Alavanca 0/1", "💠 Selos 1/3"). Opcionais aparecem embaixo, menores.
3. **Setas de borda de tela:** quando o alvo do objetivo, uma cela ou um aliado caído estão fora da tela, uma seta na borda aponta para eles, com ícone e distância em casas.
4. **Minimapa:**
   - No PC: no canto (alterna com M ou Select).
   - No celular: um botão 🗺️ abre o **mapa da jornada** em tela cheia. No online ele não pausa; no local, pausa.
   - Desenhado num canvas 2D a partir do grid e do `explored`, que já existe.
   - Mostra áreas exploradas, regiões, portões, celas, baús achados, objetivo e jogadores.
   - Volta a névoa de exploração **só no mapa**, não no 3D (a névoa no 3D foi removida a seu pedido).
5. **Dicas contextuais** (tutorial da região 1 e primeiras vezes de cada mecânica):
   - Dependem do dispositivo: "Toque em **A** para pôr uma bomba", "Aperte **Espaço**" ou "**A** no controle".
   - Uma vez por conta (guardado no aparelho e na conta).
   - Aparecem num balão curto perto do personagem, sem bloquear.
6. **Câmera:** ao abrir um portão ou alavanca, faz um "plano de apresentação" de 1 s mostrando o que mudou e volta; no online é só local, cada um vê o seu. Na região 3 a câmera abre um pouco mais para mostrar as plataformas.

### 3.5 Arte e modelagem (Blender + three)

Seguindo o pipeline atual (`tools/blender/*.py`, GLB em `apps/web/public/models/`), com um novo script `tools/blender/adventure_props.py`:

| Asset | Tipo | Notas |
|---|---|---|
| Baú (fechado, aberto, raro) | GLB animado (Open) | Madeira e ferro, dourado no raro. Pivô da tampa. |
| Chave e fechadura gigante | GLB | Chave com gema; cadeado do tamanho do portão, que estoura. |
| Alavanca e placa rúnica | GLB animado (Flip) | Runa com emissivo que acende. |
| Braseiro | GLB + fogo em shader | Reusa o shader de chamas. |
| Plataforma de pedra flutuante | GLB | Rachaduras de magma emissivas; leve balanço. |
| Ponte (normal e frágil) | Instanciado procedural | Tábuas de obsidiana; a frágil tem 3 estágios de rachadura. |
| Gêiser | GLB (anel de rocha) + coluna em shader | Bolhas em partículas. |
| Selo de Obsidiana | GLB com 3 estágios | Cristal roxo com veios brilhando. |
| Raiz Corrompida | GLB animado (Pulse) | Raiz torcida com núcleo roxo. |
| Espinheiro e capim seco | Instanciado procedural | O capim muda de cor queimado. |
| Muro rachado | Variante do pilar | Fissuras e luz vazando. |
| Placa e totem de região | GLB | Nome em textura gerada (canvas). |
| Fagulha | GLB rigado (Idle, Run, Lunge, Death) | No estilo dos Magmitos. |
| Lava, abismo e rio | Shader | Estende o `Lava.tsx` (rio com correnteza; abismo com vapor). |

- **Efeitos:** jorro do gêiser, respingo ao cair na lava, poeira da ponte caindo, abertura do baú (moedas e brilho), "objetivo concluído" (explosão de luz no HUD e no portão), fogo no capim.
- **Áudio** (síntese, como hoje):
  - sons novos: baú, chave, alavanca, ponte rachando, gêiser, selo, raiz, segredo descoberto (jingle) e objetivo concluído;
  - música por região: variação de intensidade e instrumentação do tema de cada bioma.

### 3.6 Rede e protocolo

- **No snapshot:**
  - estado dos props: lista compacta `[id, estado, tick]`; as plataformas mandam o índice no trilho e a fase;
  - quem carrega a chave;
  - progresso do objetivo.
- **O que não trafega:** a geometria dos props sai da seed, então o cliente recria igual a hoje.
- **Previsão local:** o movimento previsto já usa `stepPlayerMovement`, que vai considerar plataformas e pontes. Depois, um teste de reconciliação sobre a plataforma.
- **Teste:** o servidor roda as mecânicas e dois clientes veem o mesmo estado no mesmo tick (o teste atual, estendido).

### 3.7 Testes

- **Gerador:** solucionabilidade em 500 seeds; nenhum item crítico em local inalcançável; celas e baús fora do caminho obrigatório.
- **Cada mecânica:** baú, chave (incluindo cair na lava e voltar), alavanca, braseiros, ponte frágil, plataforma (carrega e mata ao sair), gêiser (aviso, depois mata e detona), selo (só com cadeia), raiz e espinheiro, capim (espalha e para no limite).
- **Fagulha:** persegue em linha e desiste fora do alcance.
- **Objetivos:** cada tipo abre o portão; os opcionais não bloqueiam.
- **Servidor:** região 3 jogada online com dois clientes sincronizados.
- **Visual:** cada asset novo com prévia no Blender (frente e costas) e cada tela conferida em 844×390.

### 3.8 Balanceamento de 1 a 4 jogadores

- **Inimigos:** base vezes 1 / 1,25 / 1,5 / 1,75 (arredondado), nunca o dobro.
- **Chave:** só uma por região. Quem carrega fica 10% mais lento, o que convida o grupo a escoltar.
- **Braseiros e selos:** a mesma quantidade com qualquer número de jogadores.
- **Gêiseres:** o intervalo cai 10% por jogador extra.
- **Renascer no portão:** continua como hoje (aliados voltam ao abrir cada portão).

---

## 4. Marcos de entrega da Tarefa 1

Cada marco tem testes, prévia dos assets, conferência no celular, deploy e playtest seu antes do próximo.

| Marco | Entrega | Detalhe |
|---|---|---|
| **M1 — Fundação infinita** | **Mundo em streaming** (região gerada sob demanda, janela de 3 regiões, portão de trás fechando), **profundidade sem fim** com orçamento de dificuldade, nomes gerados, módulos (bioma, formato, objetivo, mecânicas) com validador, objetivos `clear` e `key`, cartão de capítulo, rastreador no HUD, setas de borda, minimapa, **baú**, **muro rachado**, **chave e fechadura**, ranking de profundidade | Já fica infinito: depois da região 5 o jogo continua, cada vez mais difícil |
| **M2 — Regiões 1 e 2** | Dicas contextuais (tutorial), **Fagulha**, **respiros de cinza**, **rota em anel**, **missão dos braseiros** | Assets: baú, chave, braseiro, Fagulha |
| **M3 — Região 3, Rio de Magma** | Tiles `Lava` e `Bridge`, **ponte frágil**, **plataformas móveis**, **gêiseres**, **alavanca e ponte levadiça**, ilhota secreta | O marco mais pesado: física de plataforma e previsão online |
| **M4 — Regiões 4 e 5** | `Chasm`, **Selos de Obsidiana**, **Raízes Corrompidas**, **espinheiros**, **capim seco**, câmara do guardião reservada, final com gancho | Assets: selo, raiz, espinheiro e capim |
| **M5 — Arcos e variantes** | Arcos de 4 a 6 regiões com bioma dominante e região de transição, variantes visuais por volta do ciclo ("corrompido", noite, névoa), formatos de região extras (ilha dupla, anel, ponte longa), registro de biomas descobertos e ajuste fino da curva de dificuldade com os dados dos playtests | Biomas inéditos (gelo, deserto…) entram depois, com a arte deles |

**Como ficou o M5:**
- **Arcos:** o 1º arco é a introdução (3 regiões vulcânicas + Ponte de Obsidiana). Depois, cada arco tem 4–6 regiões de um bioma dominante (vulcânico e floresta se alternam) e termina numa região de transição, onde o guardião do arco vai morar (Tarefa 2). O cartão mostra "ARCO N · nome" na primeira região e "FIM DO ARCO" na última.
- **Variantes:** a cada volta do ciclo de biomas (2 arcos) o mundo volta com outro clima: 🌙 noite (luz baixa, lanterna sobre o grupo, vagalumes), ☁️ névoa (neblina proporcional ao zoom, bancos de névoa rasteira) ou 🟣 corrompido (chão arroxeado, motas violetas, +1 Magmito e mais raízes). Dois arcos seguidos nunca repetem o clima e, em 3 voltas, cada bioma passa por todos.
- **Formatos novos:** anel (poço de lava/abismo no meio), ilha dupla (vão de 2 casas e uma ponte só) e ponte longa (vão de 6 casas com duas pontes estreitas, a partir da região 9).
- **Ritmo de dificuldade:** a curva por profundidade continua; a 1ª região de cada arco tem 1 Magmito a menos (respiro) e a última 1 a mais.
- **Atlas:** cada paisagem (bioma × clima, 12 no total) vista numa jornada online fica salva na conta; o Perfil mostra o atlas e o recorde. Conquistas novas: Desbravador (região 10) e Cartógrafo (6 paisagens).

Pontos de atenção:
- **M3 é o maior risco técnico:** plataforma em grade, sincronização e previsão.
- Se for preciso, divido M3 em **M3a** (lava, pontes e gêiseres) e **M3b** (plataformas móveis).

---

## 5. Tarefa 2 — Chefes (plano detalhado)

### 5.1 Onde os chefes moram no mundo infinito

- **Toda região de fim de arco vira uma Câmara do Guardião.** O objetivo especial da região (selos, raízes…) continua existindo e, ao cumpri-lo, o portão da câmara se abre. Lá dentro fica o chefe do arco, e o portão de saída só abre quando ele cai.
- **A câmara é um formato de região próprio (`arena`):**
  - chão aberto, para o corpo 3×3 se mover, e 4 pilares de cobertura;
  - alguns blocos com power-ups;
  - o mecanismo de reviver (ver 5.3);
  - bordas de lava ou abismo conforme o bioma, nunca no caminho do chefe.
- **Rotação dos chefes:**
  - Arco 1 (Ponte de Obsidiana) → **Golem Vulcânico**.
  - Arcos de floresta → **Guardião da Floresta**.
  - Arcos vulcânicos → Golem.
  - Novos chefes entram nessa rotação conforme forem desenhados.
- **Mundo infinito:** o chefe volta mais forte a cada vez:
  - mais vida;
  - ataques mais rápidos;
  - ataques extras desbloqueados por volta;
  - um modificador da variante (noite, névoa ou corrompido; ver B5).
  - Nunca há "último chefe".
- **Durante a luta:** o portão de entrada se fecha e nenhum Magmito novo nasce. A câmera abre o zoom para mostrar a arena inteira.

### 5.2 BossController genérico

O `boss.ts` de hoje é uma máquina de estados (andar → preparar → atacar → recuperar) com o Golem e o Guardião do Boss Rush. Ele passa a ser movido por dados:

- **Fases por % de vida.** Cada fase define:
  - pesos dos ataques;
  - velocidade;
  - intervalo entre ataques;
  - um evento de transição, como um rugido, a arena mudando ou um invulnerável curto.
  - O "enfurecido" atual vira só a fase 2.
- **Vulnerabilidade como regra explícita:**
  - `armored`: explosões batem e não ferem;
  - `exposed`: janela de dano depois de um atordoamento;
  - `weakPoints`: partes com vida própria (placas, raízes) que precisam cair antes.
- **Ataques telegrafados por casa:** todo ataque marca no chão as casas que vai atingir antes de acertar. Já existe para raízes e meteoros e passa a valer para todos.
- **Ancorado na região:**
  - O chefe nasce no centro da câmara e não sai dela.
  - Lava, abismo e portões contam como parede para o corpo.
- **Escala por número de jogadores (1 a 4):**
  - vida ×1 / ×1,5 / ×1,9 / ×2,2;
  - com mais gente, ataques com mais alvos (mais meteoros, mais linhas de raiz) em vez de só mais vida.
- **Previsão online:** o chefe é simulado no servidor, como no Boss Rush. O cliente só interpola, e o determinismo e o replay ficam iguais.

### 5.3 Reviver na luta

- **Totem do Retorno:** um ou dois totens na câmara. Quando um aliado está caído, uma explosão no totem o traz de volta, com invulnerabilidade curta.
- Cada totem tem uso limitado: recarrega na troca de fase.
- Se todos caírem, vale a regra de derrota atual da Aventura. A Tarefa 3 muda isso para voltar ao último acampamento.

### 5.4 Clímax e recompensa

- **Golpe final:**
  - O último acerto congela a imagem por um instante.
  - A câmera dá zoom no chefe, e ele se desfaz.
  - É só apresentação: a simulação não desacelera, então o online continua determinístico.
- **Mudança no mundo:**
  - Golem: a lava da câmara esfria e vira chão e uma ponte se forma.
  - Guardião: os espinheiros murcham e abre-se uma trilha.
- **Recompensa em 3 níveis**, por desafios da luta: **sem ninguém morrer**, **dentro do tempo** e **todos vivos no fim**.
  - Bronze: moedas e um baú.
  - Prata: mais moedas e um power-up raro garantido.
  - Ouro: tudo isso e um cosmético exclusivo do chefe na 1ª vez.
- **Conta:**
  - chefes da Aventura contam em `bossKills`;
  - o Perfil ganha um **bestiário** de chefes com o maior nível vencido;
  - conquistas novas.

### 5.5 Marcos

| Marco | Conteúdo | Observação |
|---|---|---|
| **B1 — Base e câmara** | `BossController` movido por dados (fases, vulnerabilidade, telegrafia, âncora na região), formato `arena`, Câmara do Guardião no fim de cada arco (objetivo → portão → chefe → saída), Totem do Retorno, escala 1–4 jogadores, zoom da câmera, golpe final. Golem e Guardião atuais já funcionando dentro da Aventura | O Boss Rush tem que continuar igual (testes de regressão) |
| **B2 — Golem refeito** | 4 placas de armadura (uma por lado; explosão naquele lado quebra a placa), núcleo exposto depois de investida contra a parede, fase 2 com chuva de meteoros e lava subindo pelas bordas, fase 3 com pulo que racha o chão, a lava esfriando no fim | Modelo novo com placas que caem |
| **B3 — Guardião da Floresta refeito** | 3 raízes de sustentação pela arena (com vida própria); enquanto uma viver, ele se regenera e fica preso no chão. Sem raízes, entra na fase móvel (anda, mergulha, invoca brotos), os espinheiros murchando no fim | Usa a arte de raiz do M4 |
| **B4 — Elites e Baú Mimético** | Elites na exploração a partir do arco 2 (Magmito grande com 3 de vida, Fagulha que se divide), e o **Baú Mimético** secreto: alguns baús mordem quem abre, pulam, engolem bombas e cospem de volta; vencido, solta baú duplo | Mais comum em arcos corrompidos |
| **B5 — Infinito e variantes** | Nível do chefe por arco (vida, velocidade, ataques extras por volta), modificadores por variante (🌙 noite: o chefe só aparece pela própria luz e pelos ataques telegrafados; ☁️ névoa: ataques vindos da neblina; 🟣 corrompido: invoca motas violetas e ganha uma fase extra), recompensas em 3 níveis, bestiário no Perfil, conquistas, os chefes novos também no Boss Rush | Fecha a Tarefa 2 |

**Como ficou o B1:**
- **Arcos com câmara:** cada arco agora tem 5–7 regiões: as terras do bioma, a transição (com o aviso "algo desperta…") e a **Câmara do Guardião** no fim. O 1º arco termina na Câmara do Golem (região 5), e o Bosque Chamuscado passou a ser a região 6.
- **A câmara:** salão aberto (cantos arredondados), 4 pilares de cobertura (2 são **Totens do Retorno**), poucos blocos com power-ups e nenhum Magmito. O chefe dorme no meio e acorda quando o grupo inteiro entra e o portão de trás se fecha. A saída só abre quando ele cai, e aí os aliados caídos voltam como em qualquer portão.
- **Controlador:** fases por % de vida (Golem e Guardião: 50%; nas voltas seguintes também 25%, com ataques mais frequentes), troca de fase com 1 s de respiro e recarga dos totens, regra de armadura (`exposedDuring`, pronta para o B2), corpo preso à câmara (lava, abismo e borda contam como parede), só o fogo dos jogadores fere (não meteoros, gêiseres ou capim).
- **Escala:** vida × 1 / 1,5 / 1,9 / 2,2 por número de jogadores; o 1º encontro é mais leve (×0,8) e cada volta soma +30% de vida (até ×3) e +6% de velocidade (até ×1,4). Com 3+ jogadores, as raízes do Guardião cruzam dois alvos.
- **Totem do Retorno:** com um aliado caído, explodir ao lado do totem o traz de volta (com proteção). 1 uso por fase.
- **Apresentação:** barra do chefe na Aventura ("Guardião do Arco N · Nv."), a câmera abre para mostrar o chefe e aproxima no golpe final, cartão com a etiqueta "CHEFE", ☠️ no mapa, dicas novas (chefe e totem) e, no celular, o painel de objetivo some durante a luta para não cobrir a arena.
- **Fica para depois:** o congelamento de imagem no golpe final (hoje é só o zoom), a recompensa em 3 níveis e a mudança no mundo (B5), os "pilares que caem" da Ponte de Obsidiana.

**Como ficou o B2 (o Golem da Aventura):**
- **Placas de armadura:** 4 placas de pedra, uma por lado do corpo (peito, costas e as duas ombreiras), em relação a para onde ele olha. Uma explosão num lado com placa só arranca a placa (ela voa com lascas); num lado sem placa, ele perde vida. O HUD mostra os 🛡️ que restam.
- **Núcleo exposto:** quando a investida bate na parede, ele fica atordoado por mais tempo (≈2,6 s) com o núcleo inchado e brilhando. Nessa janela cada acerto vale **2** e ignora as placas ("NÚCLEO EXPOSTO! ATAQUE!"). Na Aventura ele prefere investir.
- **3 fases (66% e 33%), desde o 1º encontro:** cada troca de fase refaz as placas do peito e das costas e chama uma chuva de meteoros.
  - **Fase 2:** a lava sobe pelas bordas. O anel de fora do salão pisca em vermelho por 2,5 s ("A LAVA ESTÁ SUBINDO!") e vira lava; quem estiver nele cai.
  - **Fase 3:** o **pulo**. Ele se agacha, salta (intocável no ar) e cai num 3×3 em cima ou ao lado do jogador. O pouso racha o chão num anel e em quatro fendas. Tudo é marcado no chão antes.
- **A lava esfria no fim:** quando ele cai, a lava das bordas vira chão de novo, com vapor (é a "mudança no mundo" do Golem).
- **Boss Rush:** continua com o Golem clássico, sem placas nem lava. O novo entra lá no B5.


**Como ficou o B3 (o Guardião da Aventura):**
- **Raízes de sustentação:** a câmara da floresta nasce com 3 raízes (a arte de raiz do M4, 3 explosões cada) espalhadas longe da cama do chefe, e as caixas viram espinheiros que voltam a crescer enquanto uma raiz viver.
- **Enraizado:** enquanto uma raiz estiver de pé, ele não anda nem mergulha, e se cura 1 a cada 2,5 s quando não leva um golpe há 2 s. Cipós com uma gota de luz verde ligam cada raiz aos pés dele. O HUD mostra 🌿 por raiz e "ENRAIZADO · SE CURA". Dica nova explica o que fazer.
- **Solto:** quando a última raiz cai, ele se arranca do chão ("ELE SE SOLTOU DO CHÃO!"), cambaleia por 2 s (aberto a golpes), recarrega os totens e entra na fase móvel: enfurecido, anda, mergulha, invoca brotos e cruza raízes por ele mesmo.
- **Último fôlego aos 35%:** ataques mais frequentes. O evento de fase agora diz qual é a última, então a faixa "ÚLTIMO FÔLEGO!" vale para os dois chefes.
- **Fim:** os espinheiros (e qualquer raiz que sobrar) murcham de vez, abrindo o salão.
- **Boss Rush:** continua com o Guardião clássico até o B5.


**Como ficou o B4 (elites e o Baú Mimético):**
- **Elites:** a partir do segundo arco, cada região comum tem 1 elite (2 a partir da região 18 ou sob a corrupção, nunca mais). Elas ocupam vagas dos inimigos normais e usam a coroa dourada para serem reconhecidas.
  - **Magmito grande:** maior, um pouco mais lento, aguenta 3 explosões. Depois de cada uma fica 0,6 s imune e pisca, e bolinhas vermelhas sobre a cabeça mostram a vida.
  - **Fagulha grande (violeta):** morre com uma explosão, mas se divide em duas Fagulhas pequenas que nascem atordoadas por um instante. A meta de "exploda todos" sobe junto.
- **Baú Mimético:** a partir do segundo arco, um dos baús da região pode ser um Mímico (22% de chance, 55% sob a corrupção). A tampa às vezes treme sozinha, como dica para quem presta atenção.
  - **Ao abrir:** ele morde e tira o escudo de quem abriu (sem escudo, é só o susto). Fica 1,1 s se revelando, sem causar dano. Uma explosão no baú também o acorda, sem mordida.
  - **Caçada:** persegue o jogador mais perto. De tempos em tempos se agacha (0,6 s de aviso, com um anel vermelho onde vai cair) e pula por cima de tudo. No ar não leva dano nem morde.
  - **Bombas:** engole bombas que estejam ao lado ou no caminho, mastiga e cospe de volta rolando na direção do jogador, com pavio curto.
  - **Vida:** 4 explosões. Vencido, deixa um **baú duplo** dourado onde caiu, que só abre com a mão e dá 3 itens (um raro garantido). Não conta para a meta de "exploda todos".
- **Dicas e avisos:** dicas novas para elites e para o Mímico; faixas "É UM BAÚ MIMÉTICO!" e "MÍMICO VENCIDO! BAÚ DUPLO!".
- **Fica para depois:** o modelo do Mímico é feito de peças simples (sem GLB), como os outros inimigos.


**Como ficou o B5 (infinito, variantes e medalhas — fecha a Tarefa 2):**
- **Boss Rush com os chefes novos:** o Golem com placas, núcleo, lava e pulo; o Guardião com 3 raízes próprias (cotocos com seiva, 3 explosões cada) e a fase móvel. Os clássicos continuam no código só para testes (`classicBosses`).
- **Volta mais forte a cada vez (infinito):** além de vida (+30% por volta) e velocidade (+6%), cada volta encurta a pausa entre ataques (−6%, até 65%), soma meteoros (+1 por volta, até +4), e a partir da 3ª vez o Golem já pula desde a fase 2.
- **Modificador da variante do arco** (ícone na barra do chefe e dica na 1ª vez):
  - 🌙 **Noite:** o corpo afunda no escuro; só o que brilha (rachaduras, olhos, núcleo) e as marcas no chão mostram onde ele está.
  - ☁️ **Névoa:** a cada 4–7 s caem golpes da neblina (meteoros marcados em cima dos jogadores).
  - 🟣 **Corrompido:** aura violeta, uma fase a mais aos 15% e **motas violetas** que nascem longe dos jogadores e os perseguem (uma explosão desfaz; somem quando ele cai).
- **Medalhas:** três desafios por luta — ninguém cair, dentro do tempo (95 s Golem / 105 s Guardião, +20 s por volta) e todos de pé no fim. Bronze por vencer, prata com 2, ouro com os 3. A faixa mostra a medalha e o que faltou.
  - No jogo: 1 power-up, +1 raro por medalha acima do bronze.
  - Na conta: XP por medalha (50 / 110 / 200), bestiário e conquistas.
- **Bestiário no Perfil:** Golem e Guardião (vitórias, nível mais forte vencido e melhor medalha), Baús Miméticos e elites vencidos.
- **Conquistas novas:** Forjado na Lava (ouro no Golem), Coração da Floresta (ouro no Guardião), Domador de Mímicos (5), Caça-Coroas (20 elites) e Implacável (vencer um chefe que já voltou duas vezes). Cada uma dá um título novo.
- **Golpe final:** a imagem congela por um instante (só o desenho para; a simulação segue).
- **Fica para depois:** os "pilares que caem" da Ponte de Obsidiana e um cosmético visual (chapéu) exclusivo por chefe; por enquanto o ouro dá títulos.


Pontos de atenção:
- **B1 é o maior marco:** mexe no `boss.ts`, no formato de região e no fluxo de portões ao mesmo tempo.
- **A câmara precisa caber na janela de 3 regiões ao vivo.** O chefe tem que ficar estável quando a região anterior é descartada.
- **Mini-chefes a cada 2–3 regiões** ficam de fora deste pacote: as elites (B4) cumprem esse papel. Volto nisso se os testes pedirem.

## 6. Tarefa 3 — Acampamentos e progressão (plano detalhado)

> Status: **aprovado** com as recomendações (corações no A4, perda de 50%, um acampamento por arco, save online na conta do anfitrião). **A1 e A2 concluídos.**

### 6.1 A ideia em uma frase

A Aventura vira uma **expedição**: você atravessa arcos, para num **acampamento** depois de cada chefe,
gasta e guarda o que juntou, troca de herói, e decide se **arrisca o próximo arco ou encerra**
garantindo o que ganhou. Se o grupo cair, volta ao último acampamento e perde parte do que carregava.

### 6.2 Onde o acampamento fica no mundo infinito

- **Um acampamento por arco:** a região logo depois de cada Câmara do Guardião vira o acampamento
  (região segura, sem inimigos). O primeiro aparece depois do Golem do Arco 1 (região 6), depois a
  cada 5–7 regiões, sempre depois de um chefe.
- **Começo da expedição:** a região 0 ganha uma fogueira simples (o "acampamento zero"), para a
  regra de voltar ao último acampamento valer desde o início.
- **Formato `camp`:** uma clareira pequena, gerada pela seed como as outras regiões. Tem:
  - a fogueira no meio (salvar);
  - as tendas dos moradores em volta (serviços, ver 6.5);
  - o mural da jornada;
  - o portão de saída ("Continuar a expedição").
- **Sem pressa no acampamento:** o portão de trás fecha como sempre, mas lá não nasce nada. No
  online, ninguém fica preso esperando: o portão de saída abre quando todos marcam "pronto" ou
  depois de 60 s com a maioria pronta.

### 6.3 O que é salvo e quando

**Progresso da expedição** (vale só para esta jornada):
- seed, último acampamento alcançado e profundidade;
- moedas da expedição (as que você carrega);
- por jogador: herói, power-ups e habilidades (uma "foto" tirada na fogueira);
- heróis resgatados nesta expedição;
- chefes vencidos e medalhas;
- relíquias encontradas (6.6).

**Quando salva:** ao acender a fogueira de um acampamento, o que é automático assim que o grupo
inteiro chega a ela.

**Onde fica:**
- **Online:** no servidor, na conta do **anfitrião da sala**. No lobby, o anfitrião vê
  "Continuar expedição · Acampamento 3 · Região 18". Os outros entram como convidados, com o
  progresso de expedição do anfitrião e a própria conta para XP e moedas.
- **Local (solo ou sofá):** no aparelho (localStorage), um espaço para cada modo.
- **Uma expedição salva por conta.** Começar outra pergunta se pode apagar a atual.

### 6.4 Moedas da expedição, derrota e "arriscar ou garantir"

- **Moedas da expedição (🪙):** caem de baús, elites, Mímicos, medalhas de chefe e regiões
  atravessadas, cada vez mais quanto mais fundo. Aparecem no HUD ao lado do objetivo.
- **Gastar:** na loja e nos serviços do acampamento.
- **Guardar:** no cofre da fogueira. O que vai para o cofre vira moeda da conta na hora e não se
  perde mais.
- **Derrota (todos caíram):**
  - o grupo volta ao último acampamento;
  - perde **50% das moedas que carregava** (o cofre não é tocado);
  - os power-ups voltam à "foto" da fogueira;
  - a seed é a mesma, então o arco que derrotou o grupo é **o mesmo mapa**: dá para aprender e tentar de novo.
- **Encerrar a expedição** (na fogueira): tudo o que carrega vai para o cofre e o jogo termina com o
  resumo (XP, moedas, profundidade, chefes, medalhas). É a escolha de garantir.
- **Sem acampamento ainda** (caiu antes do primeiro): volta à fogueira da região 0, como hoje.

### 6.5 Os moradores (heróis resgatados) e os serviços

Os heróis desbloqueados na conta passam a **morar no acampamento**: aparecem andando entre as tendas
e cada um abre um serviço. No online, vale se **qualquer pessoa do grupo** já tiver aquele herói. Até
lá, a tenda fica fechada, com uma silhueta e a dica "resgate alguém para abrir".

| Morador | Serviço | O que faz |
|---|---|---|
| (sempre) | **Fogueira** | Salva, cofre de moedas, encerrar ou continuar |
| (sempre) | **Mural da jornada** | Mapa da jornada, chefes, medalhas, relíquias desta expedição |
| (sempre) | **Barraca de troca** | Troca de herói entre os desbloqueados, e cosméticos (abre o Ateliê) |
| Silvio Bombos | **Lojinha** | Power-ups com moedas da expedição: bomba+, fogo+, velocidade, escudo, "Pena do Retorno" (reviver na hora, 1 uso). Preço sobe com a profundidade |
| Bombião | **Ferreiro** | Melhorias para a expedição inteira: +1 no limite de bombas ou de alcance, pavio um pouco mais curto. Caro, 1 de cada por acampamento |
| Luiz Bombzaga | **Cozinha** | Uma refeição por acampamento, que vale para o próximo arco: começar com escudo, +velocidade ou uma vida extra (ver 6.7) |
| Ayrton Senha | **Batedor** | Revela no mapa o próximo arco: baús, segredos e se há Mímico |
| Rei Pelota | **Contratos** | 1 desafio opcional para o próximo arco (ex.: "vença o chefe com ouro", "abra 3 baús", "nenhuma queda"), com prêmio em moedas |
| Tiringão | **Animador** | Uma vez por acampamento, a "Roleta do Tiringão": aposta moedas por uma relíquia ou um power-up raro |

### 6.6 Relíquias

- Achados raros que mudam a expedição até o fim. Vêm de:
  - baús raros e secretos (chance pequena);
  - medalha de ouro no chefe (garantida na 1ª vez de cada chefe);
  - a roleta do Tiringão.
- **Exemplos (8 na primeira leva):**
  - Coração de Magma: a 1ª queda na lava de cada arco não mata.
  - Pavio Duplo: a cada 5 bombas, uma sai com +1 de alcance.
  - Bota de Obsidiana: imune ao chão rachando por 1 s a mais.
  - Semente do Guardião: totens recarregam mais rápido.
  - Ímã de Moedas: +25% moedas da expedição.
  - Olho do Mímico: Mímicos piscam antes de você chegar perto.
  - Coroa Partida: elites dão o dobro de moedas.
  - Lanterna: na noite, o chefe fica um pouco mais visível.
- **Conta:** cada relíquia achada fica registrada para sempre num **códice** no Perfil, ao lado do
  bestiário. O códice tem conquistas próprias.

### 6.7 Decisão pendente: vida (corações) ou golpe único

Hoje qualquer golpe mata, e só o escudo e os totens salvam. Com acampamentos, há duas opções:

- **A) Manter o golpe único.** O acampamento "cura" dando escudo e a cozinha dá uma vida extra para
  o próximo arco.
  - A favor: muda menos o equilíbrio e mantém a tensão do jogo.
  - Contra: no celular, e jogando sozinho, um erro custa o arco inteiro.
- **B) Corações só na Aventura** (3 por jogador). Um golpe tira 1 coração e dá 2 s de proteção.
  O acampamento enche os corações e a cozinha dá um coração extra.
  - A favor: mais acessível, combina com expedição longa e com voltar ao acampamento.
  - Contra: os chefes e as medalhas precisam de uma nova passada de equilíbrio. "Ninguém cair"
    passa a ser "ninguém perder todos os corações".
- **Recomendação:** **B**. A Aventura é longa e infinita, e o acampamento ganha sentido como lugar
  de recuperar.
  - Versus e Boss Rush continuam com o golpe único.
  - O escudo vira "coração azul": absorve 1 golpe e não volta no acampamento.

### 6.8 Progresso permanente da conta

Já existe: personagens, cosméticos, conquistas, moedas, atlas e bestiário.

Entram:
- o códice de relíquias;
- o recorde de acampamentos alcançados;
- o histórico de expedições (profundidade, chefes, medalhas e motivo do fim);
- conquistas novas (exemplos):
  - "Primeiro acampamento";
  - "5 acampamentos numa expedição";
  - "Encerrar com 1.000 moedas guardadas";
  - "Contrato cumprido ×10";
  - "Códice com 8 relíquias".

### 6.9 Parte técnica (como encaixa no que já existe)

- **Começar de um acampamento:** `createAdventure(seed, fromRegion)` cria a janela ao vivo a partir
  do acampamento. A geração já é determinística por região (`seed + id`), então o mapa é o mesmo,
  não precisa salvar geometria. A cadeia de direções (`dirs`) é refeita até a região pedida.
- **Novo objetivo `camp`** e formato de região `camp` no gerador. Os props novos (fogueira, tendas,
  mural, NPCs) entram no `PropState`, como os do M2–M4.
- **Derrota vira "voltar ao acampamento"** em vez de fim de jogo (`modes.ts`): no local, a partida
  reinicia do save; no online, o servidor recria o jogo a partir do save da sala, sem derrubar ninguém.
- **Menus do acampamento:** painéis de tela no modo paisagem, um por serviço, com toque e controle.
  Abrem ao encostar na tenda. No online, a compra é um comando para o servidor; o jogo não pausa no
  online, mas o acampamento é seguro.
- **Servidor:** `AccountStore` ganha `expedition` (o save) e `codex`. O protocolo ganha os comandos
  `campBuy`, `campBank`, `campEnd`, `campReady` e `heroSwap`. Tudo é validado no servidor (preço,
  saldo, 1 por acampamento).
- **Arte:** fogueira, tendas, mural e o cofre num `tools/blender/camp_props.py` (GLB, como os outros
  props). Os moradores usam os modelos de herói que já existem, com animação de "idle". Música própria
  do acampamento (mais calma).

### 6.10 Marcos

| Marco | Conteúdo | Observação |
|---|---|---|
| **A1 — Acampamento e checkpoint** | Região `camp` depois de cada chefe e a fogueira da região 0. Fogueira salva a "foto". Derrota volta ao último acampamento (mesma seed, power-ups da foto). Moedas da expedição (queda, HUD, perda de 50%). Encerrar na fogueira com o resumo. Save local | Testes de determinismo: recomeçar do acampamento gera o mesmo mundo |
| **A2 — Online e conta** | Save no servidor (conta do anfitrião), "Continuar expedição" no lobby, cofre que vira moeda da conta, voltar ao acampamento sem derrubar a sala, histórico de expedições | Migração das contas existentes |
| **A3 — Serviços e moradores** | Lojinha, Barraca de troca (herói e Ateliê), Mural, e os 6 moradores com seus serviços (ferreiro, cozinha, batedor, contratos, roleta). NPCs andando no acampamento | Menus em paisagem com toque e controle |
| **A4 — Relíquias e corações** | 8 relíquias, códice no Perfil, conquistas novas e, se aprovado, os corações da Aventura (6.7), com uma passada de equilíbrio nos chefes e medalhas | Depende da decisão 6.7 |
| **A5 — Arte e acabamento** | GLBs do acampamento, música, dicas de tutorial, cartão "ACAMPAMENTO", ajustes de celular | Fecha a Tarefa 3 |

**Como ficou o A1 (acampamento e checkpoint):**
- **Onde:** todo arco depois do primeiro abre com um acampamento, logo depois da Câmara do Guardião. Por isso os arcos agora têm 6–8 regiões. O primeiro é o **Pouso da Fogueira** (região 6). O Bosque Chamuscado passou para a região 7.
- **A clareira:** sem inimigos, com algumas árvores, a fogueira no meio (um anel dourado pulsa no chão chamando o grupo) e o portão de saída fechado.
- **Fogueira:**
  - quando todo o grupo vivo chega perto dela, ela acende ("ACAMPAMENTO! EXPEDIÇÃO SALVA");
  - salva a "foto" dos heróis (herói, bombas, alcance, velocidade, escudo, chute, luva, especial);
  - abre o portão e traz de volta quem tinha caído.
- **Moedas da expedição (🪙 no painel do objetivo):**
  - cada região vencida: 5 + 2 × número da região (até 65);
  - baús: 5, 15 para o raro e 30 para o duplo do Mímico, mais metade do número da região;
  - elites: 6; Mímico: 20;
  - chefe: 30 por medalha + 15 por volta.
- **Queda do grupo:**
  - quando todos caem, aparece "O GRUPO CAIU…" e um aviso "Voltando ao acampamento em N s";
  - 2,5 s depois todos acordam no último acampamento, no mesmo mundo, com os heróis como estavam na fogueira e metade das moedas ("DE VOLTA AO ACAMPAMENTO · −N 🪙");
  - a Aventura não termina mais em derrota; antes do primeiro acampamento, volta à região 1.
- **Encerrar:**
  - perto de uma fogueira acesa, aparece o botão "🏕️ Encerrar expedição", que pede confirmação com um segundo toque;
  - a mesma opção está no menu de pausa, para controle e teclado;
  - termina com "EXPEDIÇÃO ENCERRADA" e as moedas carregadas; no online, elas vão para a conta de cada jogador.
- **Save local:**
  - toda fogueira grava a expedição no aparelho;
  - no lobby local, a Aventura oferece "🏕️ Continuar" (acampamento, região e moedas) ou "Nova expedição";
  - "Jogar de novo" continua do último acampamento;
  - encerrar apaga o save.
- **Online:** o snapshot leva a expedição, e o espelho refaz o mundo a partir do acampamento quando o grupo volta. O comando de encerrar vai junto com o input. O save no servidor (conta do anfitrião) é o A2.
- **Fica para o A2+:** cofre (guardar sem encerrar), save online e "Continuar expedição" no lobby da sala, a fogueira simples na região 1, moradores e lojinha (A3).

**Como ficou o A2 (online e conta):**
- **Save na conta do anfitrião:** numa sala online de Aventura, cada fogueira acesa grava a expedição na conta de quem é o anfitrião (seed, acampamento, moedas, cofre, a foto dos heróis).
- **Continuar na sala:** nas opções da partida, o anfitrião vê "🏕️ Continuar · Acampamento N · Região R · nome · 🪙" ou "Nova expedição". "Nova" apaga a salva ao começar. Continuar recria o mesmo mundo a partir do acampamento.
- **Cofre:** perto de uma fogueira acesa, "🔒 Guardar 🪙 N" põe as moedas carregadas no cofre. No online, o cofre paga na hora a cada jogador logado na sala. O que está no cofre não se perde numa queda. A mesma opção está no menu de pausa. O painel mostra "🔒 Cofre 🪙 N".
- **Encerrar:** paga o que ainda estiver carregado e apaga o save do anfitrião.
- **Histórico:** cada partida online de Aventura entra no histórico da conta (região mais funda, acampamentos e moedas guardadas). O Perfil ganhou o painel "Expedições", com a expedição em andamento e as últimas 5.
- **Acampamento seguro:** nenhum inimigo entra numa região de acampamento, nem pelo portão aberto (antes, um Magmito da região seguinte podia entrar).
- **Voltar sem derrubar a sala:** o servidor recria o mundo a partir do acampamento e os clientes acompanham (A1).
- **Migração:** contas antigas ganham os campos novos vazios.

**Decisões aprovadas (12/11/2026):** corações (B, no A4), 50% de perda, um acampamento por arco, save online na conta do anfitrião.
