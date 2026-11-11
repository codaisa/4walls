# 4Walls — Game Design Document (vivo)

> Nome anterior de trabalho: Blast Arena. Nome oficial: **4Walls**.

## Pilares

Diversão imediata · caos controlado · estratégia de posicionamento · multiplayer social ·
progressão cosmética (nunca pay-to-win) · identidade visual própria.

## Estado atual — Fase 1 (+ base da Fase 2)

### Arena "Caldeira" (tema Vulcão)
- Grade 15×13: borda de colunas de basalto hexagonais, pilares indestrutíveis nas células par/par e blocos de argila vulcânica destrutíveis (~70% das células livres).
- Plataforma sobre um mar de lava animado (shader procedural). O magma brilha pelas frestas do piso, há braseiros nos cantos, brasas flutuando e vulcões ao fundo.
- Spawns nos 4 cantos, cada um com um bolsão seguro em L.

### Personagem — Bombito (equilibrado)
- Capacete-bomba na cor do jogador com pavio faiscante, rosto expressivo, luvas e botas.
- Animações procedurais: idle (respiração), corrida (passada, balanço, inclinação), giro suave de direção, piscar de invulnerabilidade, bolha de escudo, derrota (tomba, gira e encolhe) e comemoração (pula e acena).

### Bombas e explosões
- Pavio de 2,6 s. A bomba pulsa mais rápido e esquenta (emissivo vermelho) perto de explodir.
- Explosão em cruz com alcance inicial 2. Blocos destrutíveis param a chama e são destruídos. Pilares e paredes param a chama. Bombas atingidas explodem em cadeia no mesmo tick.
- Chamas duram 0,6 s. O VFX é procedural, feito em shaders:
  - **labaredas:** sprites que se mexem com ruído e acompanham a câmera (`Flames.tsx`), com um "rio de fogo" no chão ao longo dos raios e uma onda de choque no centro;
  - **fogo extra:** bolas de fogo, faíscas, fumaça macia e marcas de queimado no chão (`SoftParticles.ts`);
  - **outros efeitos:** detritos, luz pontual e tremor de câmera;
  - **variantes:** a bomba infernal deixa labaredas que continuam ardendo, e a bomba de gelo usa a mesma técnica em versão névoa congelante azul.
- O dono pode sair de cima da bomba recém-colocada, mas não pode voltar a atravessá-la.

### Power-ups (drop de 38% por bloco)
| Item     | Raridade | Efeito                                         |
| -------- | -------- | ---------------------------------------------- |
| Bomb Up  | Comum    | +1 bomba simultânea (máx. 8)                   |
| Fire Up  | Comum    | +1 alcance (máx. 9)                            |
| Speed Up | Incomum  | +0,45 célula/s (máx. 6,6)                      |
| Escudo   | Raro     | Absorve 1 golpe + 1,4 s de invulnerabilidade  |

Uma explosão nova queima os power-ups que já estavam no chão.

### Inimigos — Magmitos
Bolhas de magma que andam pela arena célula a célula, preferindo seguir em frente. Matam ao toque, morrem com a explosão e dão a volta quando uma bomba bloqueia o caminho.

### Chefões (Boss Rush)
- Arena 17×15 aberta, com 4 pilares e poucos blocos. O chefe começa no centro e ocupa 3×3 casas: encostar no corpo mata.
- **Golem Vulcânico** (`packages/game-core/src/boss.ts`, ajustes em `BOSSES` no `game-shared`). Uma máquina de estados determinística: andar → preparar → atacar → recuperar.
  - **Pancada:** levanta os braços (as casas do anel ficam vermelhas) e solta um anel de fogo de raio 2–3 (2–4 enfurecido).
  - **Chuva de Lava:** ruge e chama meteoros sobre os jogadores, com o aviso de sempre.
  - **Investida:** se agacha, mostra a faixa no chão e corre em linha reta até a parede. Lá solta um anel menor e fica **atordoado**, que é a hora de bater.
- Leva 1 de dano por explosão do jogador, com recarga de 0,7 s. Fogo do próprio chefe e meteoros não o ferem, e gelo o congela por 1,6 s.
- Abaixo de 50% de vida ele **enfurece**: anda mais rápido, ataca com mais frequência, chama mais meteoros e as rachaduras brilham mais.
- **Guardião Ancião** (2º da fila, 16 de vida). Quando ele entra, a arena vira Floresta Encantada.
  - **Raízes:** ergue os galhos, marca no chão a linha e a coluna do jogador e faz brotar raízes com espinhos que matam como fogo. Enfurecido, também marca a cruz em volta de si.
  - **Esporos:** sacode a copa e invoca 3 Brotinhos (5 enfurecido, no máximo 6 vivos). Eles andam como Magmitos e murcham quando o Guardião cai.
  - **Enterrar:** afunda no chão, fica intocável por 1,2 s e ressurge num ponto marcado com um círculo. Não causa dano por contato enquanto está enterrado.
- Vitória quando a fila de chefes acaba. Derrota se todos caírem ou se o tempo de 5 min acabar.

### Modos
- **Solo / Caçada co-op (1–4):** exploda os 5 Magmitos em 3 minutos. Só é derrota se todos caírem ou o tempo acabar.
- **Versus Local (2–4):** o último de pé vence. Se todos morrerem ou o tempo acabar, é empate.
- **Aventura (1–4, local):** mundo não retangular de 5 regiões numa grade de chunks 16×14, num passeio aleatório para o leste (`packages/game-core/src/adventure.ts`).
  - Cada região é uma ilha de elipse ruidosa com corredores até as bordas.
  - O portão selado entre as regiões A e B abre quando A fica sem Magmitos (`regionCleared` → `gateOpened`).
  - A simulação ainda registra as células exploradas (`explored`). A névoa visual foi removida a pedido do usuário.
  - A câmera segue os jogadores e a luz principal acompanha a câmera para as sombras continuarem certas.
  - Ajustes em `ADVENTURE` (`game-shared`).

## Tunáveis
Todos ficam em `packages/game-shared/src/index.ts` (`RULES`, `POWERUPS`, `CHARACTERS`).

## Roadmap
1. ✅ Protótipo 3D jogável (solo).
2. ✅ Multiplayer local: lobby com entrada por botão, 2–4 jogadores (teclado ×2 + controles), cores, prontidão, Versus e Caçada co-op, pausa/reconexão de controle, fluxo de resultado pelo controle.
3. ✅ Online com Colyseus: servidor autoritativo, sala privada por código ou convite, partida pública, até 4 jogadores, previsão e reconciliação, reconexão automática. Ranking fica para a Fase 7.
4. ✅ Híbrido: vários jogadores locais de um mesmo computador entram na sala online como participantes independentes.
   - Todo o jogo é navegável por controle: menus, lobbies, entrada de código, pausa e resultado.
5. ✅ Conteúdo:
   - 3 personagens com habilidades: Bombito / Bomba Extra, Ninja / Investida e Engenheiro / Mina.
   - 2 arenas: Caldeira e Floresta Encantada.
   - 10 coletáveis, entre eles 3 bombas especiais (Infernal, Gelo e Remota).
   - 2 eventos: Chuva de Meteoros e Piso Congelado.
   - VFX novos e música procedural por arena.
6. ✅ Bosses e Boss Rush:
   - ✅ Modo **Chefões / Boss Rush** (1–4 jogadores, co-op, local e online), com arena própria e heróis começando com +1 bomba e +1 alcance. Fila: Golem → Guardião.
   - ✅ **Golem Vulcânico**:
     - 14 de vida; ataques Pancada, Chuva de Lava e Investida, todos avisados antes;
     - fica enfurecido abaixo de metade da vida;
     - leva 1 dano por explosão e congela com gelo.
   - ✅ **Guardião Ancião**:
     - 16 de vida; ataques Raízes, Esporos (Brotinhos) e Enterrar;
     - a arena troca para a Floresta quando ele entra.
   - ⏳ Depois: intro/cutscene de cada chefe.
7. ✅ Progressão e cosméticos:
   - **Conta** de convidado no servidor (arquivo JSON, gravação atômica).
     - O navegador guarda só a credencial `id.token`; o servidor guarda o hash do token.
     - Regras em `packages/game-shared/src/progression.ts`, store em `apps/game-server/src/accounts.ts`, API em `apps/game-server/src/api.ts`.
   - **XP, níveis e moedas** por partida online, calculados pelo servidor a partir dos eventos da simulação.
     - A participação escala com o tempo jogado (sem farm de XP).
     - Uma vitória no Versus só conta com rivais.
     - Cada nível dá moedas; o máximo é o nível 50.
   - **Estatísticas**, **histórico** (últimas 20 partidas) e **10 conquistas**, cada uma com moedas e algumas com cosméticos.
   - **Inventário e loja**, só com cosméticos:
     - chapéus procedurais presos ao osso da cabeça;
     - skins de bomba e paletas de explosão (bombas especiais mantêm o visual, para continuarem legíveis);
     - títulos.
   - **Ranking** por XP, vitórias e temporada.
   - **Temporadas:** Vulcânica, Congelante, Monstros e Cyberpunk, com XP próprio e um item de recompensa.
8. ✅ Polimento e deploy:
   - **Otimização:**
     - telas carregadas sob demanda;
     - bibliotecas em pedaços separados (o maior caiu de 1,8 MB para 746 kB, e o JS da tela inicial do jogo para 100 kB);
     - fontes só com o alfabeto latino;
     - qualidade gráfica configurável (Baixo desliga sombras e pós-processamento).
   - **Tela de Configurações:** qualidade, FPS, volumes, tremor da câmera e transferência de conta entre aparelhos.
   - **Correções:**
     - botões do menu com conteúdo centralizado;
     - chave duplicada entre arena e lava ao trocar de tema;
     - aviso de GLSL nas paletas de explosão.
   - **Balanceamento:** testes de recompensa (sem farm, limites por categoria, ritmo de nível) e do catálogo (todo item tem como ser obtido).
   - **Produção:**
     - o servidor serve o site, a API e o websocket na mesma origem;
     - `/healthz`;
     - `Dockerfile`, `docker-compose.yml` e Caddy com HTTPS automático.
