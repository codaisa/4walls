# 4Walls — Plano da Aventura

A Aventura foi dividida em **3 grandes tarefas**, feitas em ordem e cada uma entregue por completo
antes da próxima:

| # | Tarefa | Depende de | Status |
|---|---|---|---|
| 1 | **Mapa**: regiões viram fases, objetivos, mecânicas de ambiente, segredos, navegação, arcos | — | **M1 concluído** (fundação infinita); M2–M5 a seguir |
| 2 | **Chefes**: elites, mini-chefes, chefes de bioma, lendários e secretos | Mapa (arenas, gatilhos, recompensas) | Esboço (seção 5) |
| 3 | **Acampamentos**: checkpoints, hub, progresso da expedição e da conta | Mapa + Chefes | Esboço (seção 6) |

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

Pontos de atenção:
- **M3 é o maior risco técnico:** plataforma em grade, sincronização e previsão.
- Se for preciso, divido M3 em **M3a** (lava, pontes e gêiseres) e **M3b** (plataformas móveis).

---

## 5. Tarefa 2 — Chefes (esboço; detalhamos depois da Tarefa 1)

- **Base que já existe:** `boss.ts` (máquina de estados, aviso no chão, fúria) com o **Golem Vulcânico** e o **Guardião Ancião** do Boss Rush. A Tarefa 2 evolui isso para um `BossController` genérico com:
  - fases configuráveis;
  - ataques telegrafados com hitbox por casa;
  - pontos fracos e condições de vulnerabilidade;
  - personalidade (provocações, fuga, fúria).
- **Quatro categorias:** elites (na exploração), mini-chefes (a cada 2–3 regiões), chefes de bioma (fim de arco) e lendários ou secretos.
- **Primeiro pacote:**
  - **Golem Vulcânico** refeito: armadura que bloqueia explosões, placas destrutíveis, núcleo exposto e câmera lenta no acerto. Vira o mini-chefe da Ponte de Obsidiana ou o chefe do Arco 1.
  - **Baú Mimético:** secreto, usa o baú da Tarefa 1.
  - **Guardião da Floresta** refeito: pontos de sustentação nas raízes e fase móvel. Chefe do Bosque Chamuscado.
- **Estrutura de cada luta:** descoberta (pistas no mapa) → introdução com câmera → fases → aberturas → clímax com câmera lenta → recompensa em 3 níveis e mudança no mundo (a lava esfria, uma passagem surge).
- **Escala de 1 a 4 jogadores:**
  - vida não linear e padrões de ataque diferentes por número de jogadores;
  - uma forma de **reviver durante a luta** (ativar um mecanismo da arena).
- **Desafios opcionais:** sem morrer, por tempo, todos vivos. Desbloqueiam cosméticos do chefe.

## 6. Tarefa 3 — Acampamentos e progressão (esboço)

- **Progresso da expedição:** região alcançada, power-ups, heróis resgatados nesta expedição, missões, chefes e relíquias. Fica salvo no servidor por grupo e sala.
- **Progresso permanente da conta:** já existe em parte (personagens, cosméticos, conquistas, moedas). Entram as relíquias registradas, os biomas descobertos e o histórico de chefes.
- **Acampamento (checkpoint e hub)** entre marcos:
  - fogueira para salvar;
  - lojinha com as moedas da expedição;
  - troca de personagem entre os já desbloqueados;
  - customização;
  - NPCs, que são os **heróis resgatados morando no acampamento**: ferreiro, comerciante, explorador e cozinheiro, cada um abrindo um serviço;
  - registro da jornada;
  - escolha entre continuar ou encerrar.
- **Derrota:** o grupo volta ao último acampamento e perde parte das moedas da expedição. É a decisão "arriscar ou garantir".
- **Decisão pendente para essa fase:** hoje qualquer golpe mata (sem vida). "Recuperar vida" no acampamento exige criar um sistema de corações; isso será decidido no plano detalhado da Tarefa 3.
