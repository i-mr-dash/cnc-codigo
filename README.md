# CNC Código — O Jogo

Jogo para aprender a **escrever programas CNC** (Fanuc), com a mesma progressão do *CNC Coordenadas*:
fases com estrelas, XP, patentes, moedas, loja, tutorial, dicas adaptativas, explicação depois de 3 tentativas,
CHEFE e Modo Infinito. Base: livro SENAI *Programação e Operação de Centro de Usinagem* + os programas Fanuc
de torno da escola (O7044 / O7046).

## Como rodar

Duplo clique em `servidor.bat` e abra **http://localhost:8124**.
O 3D usa a biblioteca three.js, que já vem na pasta `js/vendor` — funciona offline.

## Simulador (estilo SwanSoft / Fanuc 0i)

- **Máquina 3D**: a peça é usinada de verdade pelo seu código (torno: sólido de revolução; fresa: bloco).
- **Peça bruta**: diâmetro / comprimento / sobremetal (torno) ou bloco X-Y-espessura (fresa), aço ou alumínio.
- **Ferramentas**: torre de 8 posições (desbaste, acabamento, bedame, broca, broca de centro, rosca, barra interna)
  ou magazine de 12 (fresa de topo, esférica, cabeçote, broca, macho, escareador, alargador).
  Corretor **não medido** = a ferramenta trabalha 25 mm fora do lugar (o problema real da broca/bedame no O7046).
- **Tela do comando**: POS, PROG, OFS/SET, MESSAGE; linha modal; F, S, T; luzes de fuso/refrigeração/compensação.
- **Painel**: modos EDIT · MEM · MDI · JOG · REF, referência de eixos (X→Z no torno, Z→X/Y na fresa), JOG ±/RAPID,
  fuso CW/STOP/CCW, COOL, SBK, DRN, OPT STOP (M1), BDT (/), override de avanço e rápido, CYCLE START, FEED HOLD, RESET, EMERGÊNCIA.
- **Alarmes**: G0 dentro do material (colisão), corte com fuso parado, ferramenta não montada, eixos não referenciados,
  arco impossível, perfil P/Q inexistente.
- **Simulador livre** (desbloqueia na fase 4): cole qualquer programa — cada linha é explicada.

## Trilhas

**Torno (Fanuc)** — 16 fases: M3/M4/M5 → M8/M9/M0/M1/G4/M30 → S/G96/G97/G92 → T/G28 → bloco de segurança →
G0 → G1/F → chanfro, cone, U/W → G2/G3 com R → I/K → G72 → G71 (1 mm por passe) → G70 + G42/G40 →
G74/G75 → G76 → CHEFE: O7044 inteiro.

**Centro de usinagem (livro)** — 17 fases: bloco de segurança/planos → G53/H00/T M6 → G43 H → G1 → G2/G3 R → I/J →
,R ,C → G41/G42 D/G40 → G4/M0/M1/M2 → G81/G82/G80 → G83/G84/M29 → G85/G86 → M98/M99 → G16/G15/G52 →
bolsas G71/G72/G12/G13 → tradutor Mach 9/Siemens → CHEFE: placa completa.

## Arquivos

- `js/codes.js` — dicionário de códigos G/M/endereços, tabelas do Manual
- `js/cnc.js` — parser, simulador do programa (ciclos G70–G76, G81–G86, M98, polar…) e corretor de blocos
- `js/levels.js` — fases + gerador do Modo Infinito
- `js/sim3d.js` — simulador 3D (three.js) com remoção de material
- `js/game.js` — interface, painel Fanuc, progressão, dicas, tutorial, loja, manual
- `css/style.css` (temas, herdado do CNC Coordenadas) e `css/code.css`

Progresso salvo no navegador (`localStorage`, chave `cnccodigo_v1`); backup em Manual → Exportar save.
Modo desenvolvedor: 7 cliques no logo (libera tudo).
