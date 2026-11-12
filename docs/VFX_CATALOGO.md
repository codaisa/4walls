# 4Walls — Catálogo de efeitos (VFX)

Biblioteca em `apps/web/src/vfx/`. Prévia ao vivo de cada efeito em **`/vfx`**, só em desenvolvimento (`pnpm dev` → http://localhost:5173/vfx). Também dá para abrir um efeito direto: `/vfx?id=boss.slam`.

## Peças

| Arquivo | O que faz |
|---|---|
| `atlas.ts` | Atlas 8×8 pintado em código (1024 px; 512 no "baixo"). Sprites brancos: a cor vem da partícula. Flipbooks: `smoke` (4 quadros), `burst` (8), `flame` (4). |
| `SpritePool.ts` | Uma chamada de desenho por modo de mistura. Partículas vivas ficam juntas no começo do buffer: a GPU só desenha o que existe. Modos: `billboard`, `ground` (deitado no chão), `streak` (esticado pela velocidade), `upright` (em pé, girando só no eixo Y, para chamas). |
| `presets.ts` | O catálogo, como dados. Cada efeito tem camadas (emissores) com sprite, quantidade, vida, tamanho, velocidade, cores de início e fim, gravidade, arrasto, quique, giro e atraso. |
| `vfx.ts` | `vfx.emit(id, x, y, z, { scale, tint, dir, amount, delay })`. Aplica a densidade da qualidade gráfica e esconde as camadas com `minTier` acima da qualidade atual. |
| `VfxLayer.tsx` | Monta as duas pools (aditiva + misturada) na cena: 300 / 600 / 1200 sprites cada (baixo / médio / alto). |
| `VfxEvents.tsx` | Liga os eventos do jogo aos efeitos e mantém os contínuos (poeira de corrida, runas e aura dos chefes, rastro das motas, fagulhas de fogueira, ambiente do bioma). Também aplica a micro-pausa (só no jogo local), o flash branco e o zoom de impacto. |
| `hitFlash.ts` | Flash branco do herói ao levar dano (140 ms). |
| `scene/materialStyle.ts` | V5: luz de contorno em todo material iluminado e variação de cor por posição no cenário. Médio e alto. |

## Como usar

```ts
import { vfx } from '../vfx/vfx';

vfx.emit('block.wood', x, 0, z);                       // efeito pronto
vfx.emit('explosion.core', x, 0, z, { tint: '#bff4ff' }); // mesma forma, outra cor (gelo)
vfx.emit('explosion.arm', x, 0, z, { delay: 0.03 });  // atrasado (ao longo do braço)
const p = vfx.emit('boss.slam', x, 0, z);             // devolve o preset: p.shake = tremor sugerido
```

Para um efeito novo: adicione uma entrada em `presets.ts`, confira em `/vfx` nas três qualidades e só então chame no jogo. Regra para o celular: camadas caras (muitas partículas, sprites grandes) levam `minTier: 1`.

## Efeitos

| Grupo | id | Onde aparece |
|---|---|---|
| Combate | `explosion.core` | Centro de toda explosão (gelo e fogo infernal mudam a cor) |
| Combate | `explosion.arm` | Cada casa do braço da explosão, atrasada pela distância |
| Combate | `bomb.place` | Bomba posta |
| Combate | `bomb.fuse` | Faíscas de pavio (catálogo, para uso futuro) |
| Combate | `block.wood` / `block.stone` | Bloco quebrando |
| Combate | `hit.player` | Herói levou dano, perdeu o escudo ou foi mordido pelo Mímico |
| Combate | `heart.lost` | Coração perdido (Aventura) |
| Combate | `dust.step` / `dust.land` | Correndo; pousando de um pulo e rolando |
| Combate | `powerup.pickup` / `powerup.burn` | Power-up coletado; power-up destruído pela explosão |
| Combate | `enemy.hit` / `enemy.poof` | Inimigo atingido; inimigo derrotado |
| Interface | `coins.pop` / `heal` | Moedas; reviver, totem e corações restaurados |
| Chefes | `boss.telegraph` | Runa no chão durante a preparação de golpe |
| Chefes | `boss.slam` / `boss.land` | Pancada (rachadura, onda, pedras); pouso e saída do chão |
| Chefes | `boss.trail` | Investida |
| Chefes | `boss.phase` | Troca de fase e fúria |
| Chefes | `boss.rage` | Aura de chamas e brasas do chefe furioso (médio e alto) |
| Chefes | `boss.roots` / `boss.spores` | Rajada de raízes; esporos |
| Chefes | `lava.bubble` | Lava subindo |
| Chefes | `mist.strike` / `mote.trail` | Golpe da névoa e motas da corrupção |
| Chefes | `boss.defeat` | Chefe ou Mímico derrotado |
| Mundo | `amb.embers` / `amb.pollen` | Ambiente do vulcão / da floresta (a transição mistura os dois) |
| Mundo | `amb.night` / `amb.mist` / `amb.snow` | Variantes de noite e névoa; neve fica no catálogo |
| Mundo | `camp.sparks` | Fogueiras, braseiros e capim em chamas |
| Mundo | `portal.swirl` / `gate.open` | Portão abrindo; placas da armadura do chefe |
