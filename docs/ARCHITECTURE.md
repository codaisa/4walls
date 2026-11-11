# 4Walls — Arquitetura

## Princípio central

**A grade lógica é a fonte da verdade.** Toda regra de gameplay vive em `@4walls/core`,
um pacote TypeScript puro (sem React, sem DOM, sem Three.js) que roda igual no navegador e,
no futuro, no servidor Colyseus. O cliente 3D apenas *lê* o estado e reage a eventos.

```
 Dispositivos (teclado kb1/kb2, gamepads gp0..3)
        │  InputManager — estado separado por dispositivo, slots ligados a dispositivos
        ▼
 GameController (apps/web) — loop de passo fixo 60 Hz, acumulador, pausa
        │  step(state, inputs por jogador)
        ▼
 @4walls/core — simulação determinística (RNG com estado serializável)
        │  state + events[] (bombPlaced, explosion, blockDestroyed, playerDied, ...)
        ▼
 Cena R3F — lê o estado a cada frame (interpolado), dispara VFX/SFX pelos eventos
```

## @4walls/core

| Arquivo         | Responsabilidade                                                                         |
| --------------- | ---------------------------------------------------------------------------------------- |
| `grid.ts`       | Grade, geração da arena (borda, pilares, blocos, bolsões seguros nos spawns)             |
| `movement.ts`   | Movimento travado na grade com assistência de quina; passagem pela própria bomba recém-colocada |
| `bombs.ts`      | Registro `BOMB_BEHAVIORS` (bombas extensíveis), explosão em cruz, reação em cadeia, drops |
| `combat.ts`     | Dano (escudo + invulnerabilidade = dano único por evento), coleta e efeitos de power-ups |
| `enemies.ts`    | Magmitos: IA errante célula a célula                                                     |
| `modes.ts`      | Regras de fim por modo (`solo`, `versus`), registro extensível (`MODES`)                |
| `simulation.ts` | `createGame` e `step` — ordem: jogadores → inimigos → bombas → dano → coleta → regras    |

Decisões importantes:

- **Passo fixo de 60 ticks/s.** Os tempos são em ticks (`secToTicks`). O render interpola `px/py → x/y`.
- **Determinismo.** O RNG mulberry32 guarda seu estado em `GameState.rng`, então a mesma seed e os mesmos inputs reproduzem a partida. É a base para servidor autoritativo, replays e testes.
- **Input como intenção.** `PlayerInput { move, bomb, ability }` por jogador e por tick. O núcleo nunca recebe "acertei" ou "coletei".
- **Jogadores ≠ conexões.** O estado é indexado por `playerId`/`slot`. Uma conexão (ou um teclado) pode controlar vários slots, o que prepara o couch co-op online.

## Cliente (`apps/web`)

- `input/InputManager.ts`: teclado com 2 perfis + Gamepad API (polling, borda de subida, reconexão). Cada slot é ligado a uma lista de dispositivos.
- `game/GameController.ts`: o loop, a ponte para o HUD (Zustand, atualizado só quando muda) e o barramento de eventos.
- `scene/*`: renderização. Objetos dinâmicos (bombas, power-ups, inimigos, partículas, chamas) usam **pools** ou **InstancedMesh**, sem re-render do React durante a partida.
- `audio/Sfx.ts`: efeitos sintetizados com a Web Audio API, em barramentos separados (sfx/ui/música).

## Conteúdo extensível (Fase 5)

| Para adicionar…       | Onde                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Personagem            | `CHARACTERS` em `game-shared` (atributos + `ability`) e, se for nova, uma entrada em `ABILITIES` (`game-core/abilities.ts`) |
| Tipo de bomba         | `BombKind` + `BOMB_KINDS` (`game-core/bombs.ts`) + a regra de contato em `combat.ts`              |
| Coletável             | `POWERUPS` (raridade e peso) + `applyPowerup` + um ícone em `scene/Powerups.tsx`                  |
| Evento aleatório      | `GAME_EVENTS` + `ARENA_EVENTS` (`game-core/arenaEvents.ts`)                                        |
| Arena                 | `ARENAS` (tamanho) + `THEMES` (`scene/themes.ts`: luz, piso, pilares, blocos, arredores, música)  |

- **`stepPlayerMovement`** (`movement.ts`) é a única função de locomoção (gelo, congelamento, chute). O servidor a usa na simulação e o cliente online a usa na previsão, então os dois sempre concordam.
- **O botão de habilidade** detona primeiro uma bomba remota, se houver. Só depois usa a habilidade do personagem, que tem recarga.
- **Snapshot online:** usa objetos com chaves explícitas (jogadores, bombas, chamas, minas, meteoros, evento). O teste `game-protocol/test/snapshot.test.ts` garante que o espelho do cliente reproduz o estado do servidor.

## Multiplayer local

- **Dispositivos ≠ jogadores.** O `InputManager` mantém um estado por dispositivo (`kb1`, `kb2`, `gp0..`). Cada slot de jogador é ligado a uma lista de dispositivos (`bind(slot, devices)`). Nunca há uma entrada compartilhada.
- **Dois canais de input:** (1) `read(slot)`, a intenção por tick para a simulação; (2) `drainUi()`, eventos de menu por dispositivo (`confirm`, `back`, `pause`, direções), usados pelo lobby, pela pausa e pelo resultado.
- **Lobby (`screens/LocalLobby.tsx`):** entrar, ficar pronto, trocar cor, sair, com início automático. O resultado é guardado em `store/useMatchSetup.ts` (só memória). Não há conta, servidor ou rede.
- **Cor ≠ slot:** `colorIndex` é cosmético e o `slot` define o canto de spawn. As regras nunca leem a cor.
- **Desconexão:** `GameController.mount()` assina `onDeviceChange`. Um slot sem nenhum dispositivo conectado pausa a partida até o controle voltar ou outro dispositivo livre assumir (`onRebind` atualiza o elenco para os próximos reinícios).
- **Câmera compartilhada:** enquadra a arena inteira (`MIN_FRAME = 1` em `CameraRig.tsx`), então ninguém sai da tela. Para arenas maiores, reduzir `MIN_FRAME` ativa o zoom dinâmico sobre os jogadores.

## Controle em todas as telas

- `ui/uiInput.ts`: um único laço (`startUiInput`) consulta teclado e gamepads e entrega eventos de menu (`confirm`, `back`, `pause`, direções) a uma **pilha de handlers**. O do topo recebe primeiro e, se devolver `false`, o evento desce para o próximo.
- `ui/useMenuNav.ts`: navegação espacial entre elementos `[data-nav]`, com destaque `.nav-focus`, A clicando o item focado e B chamando `onBack`. `armDelayMs` evita pular a tela de resultado apertando sem querer. Usado no menu principal, no hub online, na pausa e no resultado.
- Lobbies (local e online) e a entrada de código usam handlers próprios: cada dispositivo tem um significado, como entrar, ficar pronto ou trocar cor.
- Teclas digitadas em `<input>` são ignoradas pelo jogo, e o keyup de Espaço/Enter é bloqueado para não haver clique duplo.

## Multiplayer online (Colyseus 0.18)

```
 Navegador (1..4 jogadores locais)              apps/game-server (ArenaRoom)
 OnlineController                                createGame/step do @4walls/core a 60 Hz
   ├─ envia 'input' {seq, [slot,dir,bomba]×N} ──►  fila por slot (dono validado, máx. 8)
   ├─ prevê o próprio movimento (movePlayer)      consome 1 input por tick, ack[slot] = seq
   └─ aplica 'snap' (30/s) + reconcilia  ◄──────  snapshot compacto + eventos do intervalo
```

- **Autoridade:** só o servidor roda `step()`. O cliente envia intenção (direção, bomba) e nunca resultado. Colisões, bombas, dano, coleta, eventos e vitória são decididos no servidor.
- **Conexão ≠ jogador:** cada `LobbySlot` tem `owner` (sessionId) e `localId` (dispositivo do dono). Uma conexão pode ter vários slots, e o servidor recusa inputs e pedidos para slots que não são dela.
- **Previsão + reconciliação:** os jogadores locais andam na hora com o mesmo `movePlayer` do núcleo. A cada snapshot, o cliente volta à posição autoritativa e reaplica os inputs ainda não confirmados (`seq > ack`). Os jogadores remotos e os inimigos são interpolados entre snapshots.
- **Mensagens** (`@4walls/protocol`): `join_slot`, `leave_slot`, `ready`, `color`, `mode`, `start` e `input` (cliente → servidor); `lobby`, `start` e `snap` (servidor → cliente). Não há Schema: tudo vai em mensagens explícitas, codificadas em msgpack pelo Colyseus.
- **Segurança básica:** códigos de sala gerados com `crypto.randomBytes` (31⁶ ≈ 887 milhões), salas privadas fora do matchmaking, sala trancada durante a partida, `parseInputBatch` descartando payload malformado, `seq` monotônico, fila limitada e no máximo 150 mensagens/s por conexão.
- **Queda de conexão:** `onDrop` → `allowReconnection(20 s)`. O SDK reconecta sozinho e os slots ficam "reconectando". Se não voltar, no lobby os slots são removidos; na partida os jogadores daquela conexão são eliminados.
- **Ciclo da sala:** `lobby` → (todos prontos: 3 s, ou Start do anfitrião) → `playing` → `results` (6 s) → `lobby`.

## Próximas fases (preparação já feita)

- **Contas (Fase 7):** o `AccountStore` grava um arquivo JSON. A interface dele (`create`, `auth`, `recordMatch`, `buy`, `ranking`) permite trocar por PostgreSQL no deploy sem mexer nas salas.
  - A sala liga cada slot a uma conta pela credencial enviada em `join_slot` e conta os eventos da partida.
  - No fim, ela manda `rewards` só para o dono do slot.
  - O visual (`loadout`) vai no `PlayerSlotConfig` e chega aos clientes pelo `start`; as regras nunca o leem.
- **Online, pendências:** o deploy (Docker, TLS/wss, banco de dados) fica para a Fase 8.
- **Bombas especiais:** basta registrar um novo `BombBehavior` em `BOMB_BEHAVIORS`.
- **Modos novos:** basta registrar `ModeRules` em `MODES`.
