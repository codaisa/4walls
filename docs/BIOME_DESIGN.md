# 4Walls — Biomas

## Terras Vulcânicas (Fase 1 de arte: kit inicial pronto)

- **Paleta:** basalto lilás-acinzentado (`#5b4c66`), laranja de magma (`#ff5a0a`), pedra
  terrosa (`#a38877`).
- **Chão:** basalto A e B (com seixos), basalto rachado com veios incandescentes, cinzas e lava.
- **Sólidos:** coluna hexagonal de basalto com um veio de brasa, e rochas.
- **Destrutíveis:** caixote de madeira (intacto, danificado e fragmentos) e bloco de pedra com
  runa (intacto e danificado com rachaduras de magma).
- **Props:** cristais de obsidiana e rochas.
- **Perigo:** respiradouro de fogo (desligado, ocioso, alerta e ativo).
- **Já existentes no jogo:** inimigos Magmitos e o evento Chuva de Meteoros.
- **Chefe planejado:** Golem Vulcânico, cuja arena é a caldeira.

## Floresta Encantada (peças de transição prontas)

- **Paleta:** grama (`#6fae3e`), cogumelo vermelho (`#d83a52`), folhagem clara (`#7cc24a`).
- **Prontos:** tile de grama com tufos, árvore de copa redonda, arbusto, cogumelo gigante e placa.
- **Próximos:** raízes, ruínas, flores mágicas, cristais e o chefe.

## Transição Vulcão → Floresta

O basalto vai sendo tomado por musgo (`trans_ground_mossy`), as árvores mortas ainda guardam
brasas na ponta dos galhos (`trans_dead_tree`) e o portal mistura os dois materiais.

## Biblioteca futura (ordem sugerida)

| Bioma | Transição de entrada sugerida |
|---|---|
| Reino Congelado | Floresta → neve fina sobre a grama, pinheiros |
| Laboratório Cyber | Reino Congelado → estação de pesquisa no gelo |
| Deserto dos Reis Esquecidos | Vulcão → cinzas viram areia |
| Cavernas de Cristal | Deserto → ruínas descendo para o subsolo |
| Reino Medieval, Reino Doce, Fábrica de Brinquedos, Ilhas Tropicais, Fronteira Espacial | — |
| Cemitério Assombrado, Reino Submerso, Parque de Diversões, Cidade Cyberpunk | — |

Ideias originais para depois:

- **Pântano de Pólvora:** lama que propaga explosões.
- **Observatório Celeste:** plataformas sobre as nuvens, com gravidade variável.
