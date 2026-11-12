# 4Walls

Jogo 3D de batalha com bombas em arena, para navegador: solo, multiplayer local (2–4 no mesmo
computador) e online (servidor autoritativo Colyseus, inclusive vários jogadores do mesmo computador
na mesma sala). **Todo o jogo pode ser jogado só com controle.**

## Requisitos

- Node.js 20+ (testado com 26.13)
- pnpm 10 (`npm install -g pnpm@10`)

## Rodar

```bash
pnpm install
pnpm dev          # cliente em http://localhost:5173 + servidor em ws://localhost:2567
pnpm test         # regras do jogo, input e integração do servidor (Vitest)
pnpm typecheck    # TypeScript em todos os pacotes
pnpm build        # build de produção do cliente em apps/web/dist
pnpm start        # produção: o servidor de jogo serve o site, a API e o websocket numa porta só
```

`pnpm dev:web` e `pnpm dev:server` sobem cada um separadamente. Solo e multiplayer local
**não precisam do servidor**, nem de internet ou conta.

Para jogar online com outra pessoa na mesma rede, abra `http://<IP-do-seu-PC>:5173`. O cliente
procura o servidor no mesmo host, na porta 2567. Para um servidor em outro endereço, defina
`VITE_SERVER_URL` (por exemplo `wss://jogo.exemplo.com`) antes do build.

## Publicar (deploy)

Em produção, **um único processo** serve o site já compilado, a API de contas e o websocket do jogo,
todos na mesma origem (sem CORS, e o `wss` sai junto com o `https`).

**Sem Docker**, numa máquina com Node e pnpm:

```bash
pnpm install && pnpm build && PORT=8080 pnpm start
```

- Abra `http://<servidor>:8080`.
- O servidor responde em `/healthz`.
- As contas ficam em `apps/game-server/data/accounts.json` (mude com `DATA_FILE`).

**Com Docker e HTTPS automático (Caddy + Let's Encrypt):**

1. Aponte o DNS do domínio para o servidor e libere as portas 80 e 443.
2. Suba os serviços:

   ```bash
   DOMAIN=jogo.seudominio.com docker compose up -d --build
   ```

3. Abra `https://jogo.seudominio.com`.

O que vem pronto:
- O `Dockerfile` gera uma imagem só, com o servidor e o site, e o healthcheck em `/healthz`.
- As contas ficam no volume `game-data`.
- O Caddy (`deploy/Caddyfile`) cuida do certificado, da compressão (gzip/zstd) e do proxy do websocket.

Limites desta versão:
- **Uma instância só.** As salas vivem na memória do processo e as contas num arquivo JSON.
- Para escalar, troque o `AccountStore` por PostgreSQL. A interface já está isolada.
- Para várias instâncias, use o presence/driver Redis do Colyseus.

**Configurações** (⚙️ na tela inicial):
- qualidade gráfica: Automático, Baixo, Médio ou Alto (resolução, sombras, brilho e antisserrilhado);
- mostrar FPS;
- volumes de música, efeitos e interface;
- tremor da câmera;
- **código de transferência**, para usar a mesma conta no PC e no celular.

## Controles

| Ação     | Teclado A | Teclado B       | Controle (Xbox/PS)  |
| -------- | --------- | --------------- | ------------------- |
| Mover    | WASD      | Setas           | D-pad / analógico   |
| Bomba    | Espaço    | Enter           | A / ✕               |
| Habilidade / detonar remota | Shift esq. | Ctrl dir. | B / ○ |
| Rolar (esquiva) | E | Shift dir. | X / □ ou RB |
| Pular   | Q         | Num0 ou /       | Y / △ ou LB         |
| Pausa    | Esc       | Backspace       | Start / Options     |

## Conteúdo

- **Personagens:**
  - **Bombito**, equilibrado. Habilidade *Bomba Extra*: mini-bomba que não conta no limite.
  - **Ninja**, mais rápido, até 5 bombas. Habilidade *Investida*: avança 3 casas num instante.
  - **Engenheiro**, mais lento. Habilidade *Mina*: até 2 minas que explodem ao serem pisadas.
- **Heróis resgatáveis** (homenagens bem-humoradas a lendas brasileiras; só se ganham resgatando na Aventura):
  - **Luiz Bombzaga** (chapéu de couro, sanfona). *Forró Sísmico*: empurra para longe as bombas a até 2 casas e atordoa Magmitos.
  - **Tiringão** (chapéu de palha, sorriso banguela). *Gargalhada*: congela de rir quem estiver a até 3 casas (Magmitos e, no Versus, rivais).
  - **Bombião** (chapéu de cangaceiro, óculos redondos, cartucheiras). *Bacamarte*: explosão até 3 casas à frente, que estoura bombas no caminho. Começa com +1 de alcance.
  - **Rei Pelota** (coroa, camisa 10, bola). *Bicicleta*: põe uma bomba já chutada para a frente. Rápido e já começa chutando bombas.
  - **Ayrton Senha** (capacete amarelo com faixas verde e azul). *Turbo*: dobra a velocidade por 2,5 s.
  - **Silvio Bombos** (smoking, microfone no peito). *Quem quer bomba?*: faz aparecer um power-up ao lado dele.
- **Arenas:** **Caldeira** (vulcão, 15×13) e **Floresta Encantada** (bosque, 17×13).
- **Movimentos:**
  - **Rolar:** esquiva de 2 casas, com um instante de invulnerabilidade e recarga de 0,9 s.
  - **Pular:** salta 2 casas, passando por cima de uma bomba, e no ar escapa do fogo no chão e dos inimigos.
  - **Deslizar:** carrinho ao chutar uma bomba e no piso congelado.
- **11 coletáveis** (inclui a nova **Luva**: aperte bomba de novo em cima da sua bomba para arremessá-la 3 ou mais casas, por cima de paredes e blocos):
  - Bomb Up, Fire Up, Speed Up, Escudo;
  - Chute (empurra bombas), Botas (atravessa bombas), Fantasma (atravessa blocos por 8 s);
  - Controle Remoto (bombas só explodem com Habilidade);
  - Bomba Infernal (fogo que fica no chão) e Bomba de Gelo (congela em vez de matar).
- **Eventos aleatórios**, anunciados 3 s antes e com duração de 18 s:
  - **Chuva de Meteoros:** casas marcadas são atingidas.
  - **Piso Congelado:** você desliza até bater.
- **Áudio:** efeitos e música sintetizados no navegador, uma trilha por arena. Música e efeitos podem ser desligados no menu de pausa.

- **Modo Aventura: jornada infinita** (na sala, o anfitrião escolhe *Aventura*; 1–4 jogadores):
  - **Não termina:** só acaba quando o grupo inteiro cai. O placar é a **profundidade** (região alcançada), que dá XP crescente e vale para o ranking **Aventura**.
  - **Regiões sem fim:** cada região é gerada na hora a partir da seed (bioma, formato, objetivo, nome). As 5 primeiras formam a introdução roteirizada; depois tudo é sorteado e a dificuldade sobe sem parar: mais Magmitos, mais rápidos e mais blocos, até um teto.
  - **Mundo em streaming:** só ficam vivas a região anterior, a atual e a próxima. Quando todos passam pelo portão, **o portão de trás se fecha** (em 15 s, quem ficar para trás é puxado) e a região antiga é descartada.
  - **Objetivos por região:** explodir todos os Magmitos, ou **achar a chave** e levá-la até o cadeado do portão. Quem carrega a chave anda 10% mais devagar; se morrer, a chave cai ali.
  - **Fagulhas:** brasas rápidas que, ao ver você em linha reta (até 5 casas, sem obstáculo), **brilham e incham** por meio segundo e então **investem** pela linha até bater em algo. Saia da mira! Aparecem a partir da região 2 e ficam mais comuns com a profundidade.
  - **Respiros de cinza:** grelhas no chão que, a cada 9 s, soltam uma nuvem que esconde o chão e as bombas por 4 s (o respiro avermelha 1 s antes).
  - **Missão dos braseiros (opcional):** três braseiros apagados na borda da ilha; acenda os três com explosões ao lado e um **baú raro** surge do chão.
  - **Rio de lava** (região 3, "A travessia", e sorteado depois): um rio corta a ilha antes do portão. Ninguém anda na lava (as explosões passam por cima) e cair é fatal, até com escudo. Para cruzar:
    - **Ponte frágil:** range, treme e desaba 1 s depois que alguém pisa; volta depois de 6 s.
    - **Plataforma de obsidiana:** vai e volta entre as margens e leva quem estiver em cima.
    - **Pulo (Y):** salta 1 casa de lava; uma **ilhota secreta** com baú raro só se alcança assim.
    - **Ponte levadiça:** baixa quando se explode a **alavanca** da outra margem; isso também cumpre o objetivo e abre o portão.
    - **Gêiseres** nas margens borbulham em vermelho e jorram lava como uma chama (matam e detonam bombas).
  - **Ponte de Obsidiana** (região 4, "O guardião", e regiões de transição sorteadas): uma passarela estreita sobre um **abismo** (cair é fatal; pula-se 1 casa) com **3 Selos de Obsidiana**. Uma bomba sozinha só faz "plim": os selos racham apenas com **explosões em cadeia** (2+ bombas encostadas explodindo juntas), 3 vezes cada.
  - **Bosque Chamuscado** (região 5, "A corrupção", e florestas sorteadas): **3 Raízes Corrompidas** (3 explosões cada) para purificar. Enquanto alguma vive, os **espinheiros** cortados **voltam a crescer** em 10 s. Purificada, a raiz vira um brotinho. Ao terminar a região 5: "Algo desperta nas profundezas…".
  - **Capim seco** (florestas): pega fogo com uma explosão e o fogo pula de tufo em tufo; mata quem estiver em cima e detona bombas.
  - **Praças:** algumas regiões têm canteiros em volta do centro, criando rotas alternativas e voltas para fugir.
  - **Dicas de tutorial:** na primeira vez de cada coisa (bomba, fuga, power-up, cela, muro rachado, chave, Fagulha, braseiro, cinza, mapa) aparece uma dica curta, uma vez por aparelho, com os botões do controle em uso.
  - **Segredos e baús:** muros rachados com veios brilhantes escondem um baú raro; também há baús comuns. Abrem ao encostar ou com uma explosão.
  - Cada portão aberto **traz de volta os aliados caídos**.
  - **Prisioneiros em celas** (uma por região): resgate heróis brasileiros (veja *Heróis resgatáveis*).
  - **Navegação:**
    - cartão de capítulo ao entrar em cada região;
    - objetivo no HUD;
    - setas na borda da tela apontando para o portão, a chave e a cela;
    - **minimapa** no PC (M ou Select abre o mapa grande);
    - botão 🗺️ no celular, que abre o **mapa da jornada**.

- **Chefões (Boss Rush)** (menu principal → *Chefões*, ou *Chefões* nas opções do lobby local, 1–4 jogadores co-op):
  - Dois chefes em sequência. Todos os ataques são avisados no chão e os chefes enfurecem abaixo de metade da vida.
  - **Golem Vulcânico**, um gigante de basalto com rachaduras de magma. A Pancada solta um anel de fogo, a Chuva de Lava traz meteoros e a Investida o leva até a parede, onde ele fica atordoado.
  - **Guardião Ancião**, a árvore mais velha da floresta. Quando ele entra, a arena vira Floresta. As Raízes brotam na linha e na coluna do jogador, os Esporos invocam Brotinhos e, ao se Enterrar, ele some e ressurge no ponto marcado.
  - A barra de vida aparece no rodapé. Funciona local e online.

**Menus:** D-pad, analógico, WASD ou setas movem o destaque, A/Espaço/Enter confirma e B/Shift volta.
Isso vale para o menu principal, o hub online, a pausa e o resultado. No modo Solo, WASD e as
setas controlam o mesmo personagem. Os mapeamentos ficam em
`apps/web/src/input/InputManager.ts` (`KEY_PROFILES`).

## Multiplayer local (2–4 jogadores)

Menu → **Multiplayer Local**. Cada pessoa entra apertando um botão no **seu** dispositivo:

| Ação no lobby          | Teclado WASD | Teclado setas | Controle  |
| ---------------------- | ------------ | ------------- | --------- |
| Entrar / ficar pronto  | Espaço       | Enter         | A / ✕     |
| Trocar personagem      | A / D        | ← / →         | D-pad ←→  |
| Trocar cor             | W / S        | ↑ / ↓         | D-pad ↑↓  |
| Desfazer / sair        | Shift esq.   | Ctrl dir.     | B / ○     |
| Opções da partida      | Esc          | Backspace     | Start     |

Em **Opções da partida** se escolhe o modo, a arena e "Iniciar partida", tudo pelo D-pad e pelo A.
Com todos prontos, a partida começa em 3 s. Os modos são **Versus** (último de pé vence,
mínimo 2) e **Caçada co-op** (todos contra os Magmitos). Se um controle desconectar no meio da
partida, o jogo pausa: reconecte, ou aperte A/Espaço/Enter num dispositivo livre para assumir.

## Como se joga (fluxo único)

- **Seu personagem é seu:** a tela inicial mostra o seu personagem em 3D, com **Editar personagem** logo abaixo. Ele fica salvo no navegador e vai com você para qualquer sala.
- **Ateliê** (aberto por *Editar personagem*), que funciona com mouse, toque e controle:
  - **Preview grande** do personagem no pedestal, com botões para ver cada animação: parado, correr, pular, rolar, deslizar, arremessar, habilidade, vitória e derrota.
  - **Cards de personagem**, cada um com preview 3D ao vivo, ficha, habilidade e barras de velocidade, bombas e recarga.
  - **Cards de cor** e o **nome**, com um 🎲 para sortear um.
  - Todos os previews usam um único canvas WebGL (drei `View`), o que é leve para celular.
- **Toda partida é uma sala online:**
  - **Jogar** cria a sua sala e você já entra nela com o seu perfil.
  - Amigos entram pelo código ou link, do PC ou do celular. **Partida pública** junta desconhecidos.
- **Mais gente no mesmo PC:** cada pessoa aperta **Enter** (teclado B) ou **A** em outro controle e entra como convidado. O seu teclado (WASD), o primeiro controle e o toque são seus.
- **Modos:** o anfitrião escolhe o modo na sala (**Start** ou clique no quadro da partida): **Versus**, **Caçada co-op**, **Aventura** ou **Chefões**. Todos rodam no servidor.
- **Sem servidor:** se ele não estiver no ar, a tela inicial oferece **Jogar offline neste computador** (o lobby local).

## Celular e tablet

O jogo inteiro funciona no celular, **sempre deitado**. Em pé, aparece a tela "Gire o celular". Todas as telas se adaptam a celulares deitados (altura de até 500 px).

- **Na partida:** um analógico aparece onde o polegar encosta, na metade esquerda da tela. À direita ficam os botões no **estilo Nintendo**: **A** bomba, **B** habilidade, **X** rolar e **Y** pular. O ❚❚ no canto pausa.
- **Na sala online:** dá para tocar em tudo direto: ‹ › para trocar o personagem, a bolinha de cor, **Estou pronto**, e o quadro da partida para escolher o modo.
- **No lobby offline:** uma barra embaixo com D-pad, **A** (entrar/ok), **B** (voltar) e **Start**. Com ela o celular entra na vaga, troca personagem e cor, fica pronto e abre as opções da partida.
- **Como dispositivo:** o toque é um dispositivo próprio, como um teclado ou controle. Um celular pode entrar numa sala online com jogadores de PC, inclusive junto com quem está no teclado e no controle do PC.
- **App instalável (PWA):** o botão **📲 Instalar app** do menu põe o 4Walls na tela inicial. Instalado, ele abre em tela cheia, deitado e sem a barra do navegador. No iPhone o botão explica o caminho: Compartilhar → Adicionar à Tela de Início. No navegador do Android, o primeiro toque já entra em tela cheia e trava a tela deitada.
- **Câmera:** no celular a câmera segue o seu personagem de perto (cerca de 11×7 casas). Em Configurações → Câmera dá para escolher **Auto**, **Perto** ou **Arena toda**.
- **Desempenho:** no celular o jogo reduz o pixel ratio e as sombras e desliga o antisserrilhado do pós-processamento.

**Jogar pelo celular na mesma rede Wi-Fi do PC:**
1. No PC, rode `pnpm dev`. O Vite já escuta na rede e o servidor do jogo usa a porta 2567.
2. No celular, abra `http://<IP-do-PC>:5173` (o IP aparece no terminal do Vite, em "Network"). O jogo se conecta sozinho ao servidor em `<IP-do-PC>:2567`.
3. Se o celular não conseguir abrir a página, libere o Node.js no Firewall do Windows para redes privadas. O próprio Windows costuma perguntar isso na primeira execução.

Para testar os controles de toque no PC, abra qualquer página com `?touch=1`.

## Multiplayer online

Menu → **Multiplayer Online**:

- **Criar sala privada:** gera um código de 6 caracteres e um link de convite (`/online?code=XXXXXX`).
- **Entrar com código:** digite no teclado ou escolha as letras com o controle (↑↓ letra, ←→ posição).
- **Partida pública:** entra numa sala pública aberta ou cria uma.

Na sala, cada pessoa **deste computador** entra com o próprio dispositivo, como no lobby local.
Assim dá para ter, por exemplo, duas pessoas aqui e uma em outra casa na mesma partida. O
anfitrião (👑) escolhe o modo e pode iniciar com Start. Com todos prontos, o servidor inicia em
3 s. No fim, todos voltam à sala. Se a conexão cair (tela bloqueada, troca entre Wi-Fi e 4G), o
cliente reconecta sozinho (até 45 s) e mantém o lugar.

**Rede ruim.** O jogo foi feito para aguentar a internet do celular:
- **Bombas e movimento:** os seus próprios movimentos e bombas aparecem na hora, por previsão local, e o servidor confirma depois.
- **Outros jogadores:** são exibidos com um buffer de cerca de 66 ms, que absorve as rajadas de pacotes. Assim ninguém "teleporta".
- **Fila de comandos:** se os seus comandos chegam acumulados ao servidor, ele os consome mais rápido até alcançar o atraso normal. Nenhum botão apertado se perde.

## Progressão, loja e ranking

- **Conta:** cada navegador ganha uma conta de convidado automaticamente, guardada no servidor de jogo. O navegador guarda só a credencial.
  - Nome, personagem e cor do Ateliê são sincronizados com a conta.
  - Os dados ficam em `apps/game-server/data/accounts.json` (mude com `DATA_FILE`).
- **XP e níveis:** partidas **online** rendem XP e moedas, de acordo com:
  - tempo jogado e vitória;
  - rivais e inimigos explodidos;
  - blocos destruídos e power-ups;
  - chefões derrotados.

  Partidas curtíssimas não rendem nada, para evitar farm. Ao voltar para a sala, o painel **Recompensas** mostra o XP item por item, a subida de nível, as conquistas e os itens desbloqueados.
- **Cosméticos**, que nunca mudam o jogo:
  - 7 chapéus presos à cabeça;
  - 6 skins de bomba;
  - 4 cores de explosão;
  - 10 títulos.

  Eles são obtidos de três jeitos:
  - comprados na **Loja** com moedas;
  - liberados por **nível** ou **conquista**;
  - liberados pela **temporada** (Temporada Vulcânica).

  O **Ateliê** é o inventário: equipe o que você tem e experimente chapéus bloqueados antes de comprar. Os outros jogadores da sala veem seu visual.
- **Perfil:** nível, estatísticas (partidas, vitórias, rivais, chefões e mais), resultados por modo, 10 conquistas com progresso e as últimas 20 partidas.
- **Ranking:** classificações por nível (XP), vitórias e XP da temporada atual, com a sua posição destacada.
- A API REST fica no mesmo servidor e porta do jogo: `POST /api/account`, `GET/PATCH /api/me`, `POST /api/shop/buy` e `GET /api/ranking?board=xp|wins|season`.

## Modelos 3D (Blender)

Os personagens são gerados por script no Blender 5.3 (modo headless), com esqueleto e animações,
e exportados em GLB para `apps/web/public/models/`. Para regerar depois de editar o script:

```bash
"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup --python tools/blender/build_characters.py -- apps/web/public/models tools/blender/previews
```

Só alguns personagens: `ONLY=senha,silvio` antes do comando. Retratos transparentes da tela
"Entra na briga": `PORTRAITS=apps/web/public/heroes` (renderiza todos). Os acessórios dos 6 heróis
ficam em `tools/blender/hero_gear.py`.

Detalhes em [docs/ASSET_CATALOG.md](docs/ASSET_CATALOG.md).

## Estrutura

```
apps/web               cliente React + React Three Fiber (render, input, menus, HUD, áudio, online)
apps/game-server       servidor Colyseus autoritativo (salas, códigos, matchmaking, reconexão)
packages/game-core     simulação pura e determinística (grid, movimento, bombas, dano, modos)
packages/game-shared   tipos, constantes e regras ajustáveis (RULES, POWERUPS, CHARACTERS)
packages/game-protocol mensagens, snapshots, validação de input e códigos de sala
tools/blender/         script que gera os personagens (modelagem, rig, animações, exportação GLB)
docs/                  GDD, arquitetura e catálogo de assets
```

Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e [docs/GDD.md](docs/GDD.md).
