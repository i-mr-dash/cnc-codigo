# CNC Código — O Jogo

Jogo para aprender a **escrever programas CNC** (Fanuc), com a mesma progressão do *CNC Coordenadas*:
fases com estrelas, XP, patentes, moedas, loja, tutorial, dicas adaptativas, explicação depois de 3 tentativas,
CHEFE e Modo Infinito. Base: livro SENAI *Programação e Operação de Centro de Usinagem* + os programas Fanuc
de torno da escola (O7044 / O7046).

## Como rodar

Duplo clique em `servidor.bat` e abra **http://localhost:8124**.
O 3D usa a biblioteca three.js, que já vem na pasta `js/vendor` — funciona offline.

## Simulador (estilo SSCNC / Fanuc 0i)

O painel segue o procedimento do SSCNC (SwanSoft), o simulador da escola:

- **Tela do comando** com softkeys e **teclado MDI** de verdade (buffer de entrada, SHIFT, CAN, INPUT, ALTER, INSERT, DELETE, cursor, PAGE, HELP).
  Páginas **POS** (ABS/REL/ALL), **PROG**, **OFFSET/SETTING** (WEAR, GEOM, SETTING, WORK, (OPRT) → NO.SRH, **MEASURE**, +INPUT, INPUT), **SYSTEM**, **MESSAGE**, **GRAPH**.
- **Painel do torno Romi G260 (SSCNC "FANUC 0i Mate-TB")**: grade 6×5 de teclas com lâmpadas (AUTO, EDIT, MDI, HOME, JOG, DRY RUN, PROG TEST, TRVS, MPG X1/X10/X100, SINGL BLOCK, BLOCK DELET, OPT STOP, TURRET POS, JOG TURRET, CLNT ON/OFF/AUTO, SPDL CW/STOP…), botões giratórios de rotação (50–120 %) e avanço (0–120 %), emergência, MACHINE ON / CNC ON / LOCK-SETUP / porta / placa / contraponto, CYCLE START/STOP e manivela (MPG).
- **Sequência igual à da máquina**: CNC ON → soltar emergência → fechar a porta → MACHINE ON → RESET; **HOME** + eixo (+X/+Z) + **CYCLE START** para cada eixo; MPG com o eixo escolhido por ±X/±Z; torre com JOG TURRET + TURRET POS; geometria em **OFS/SET → CORRET → GEOM** (Z0 → INS. C, X+diâmetro → MEDIR), desgaste em **DESG**, zero-peça em **TRAB**.
- O botão **HELP** do teclado e o **Manual** trazem o passo a passo completo (ligar, referenciar, zerar ferramentas, zero-peça, testar com PROG TEST/DRY RUN, executar, corrigir desgaste).
- **3D**: torre giratória de 8 estações que indexa a ferramenta, refrigerante em jato de partículas, cavacos e faíscas durante o corte.
- **Zero-peça e ferramentas medidos de verdade**: a ferramenta real só fica no lugar certo se o aluno medir (corte de teste + paquímetro no torno; calibrador de 1 mm e `X-6` na fresa)
  e gravar com **MEASURE** (ou digitar com INPUT). Zerado/errado → o 3D mostra a ferramenta fora do lugar (**FORA DO LUGAR**, **NADA FOI USINADO**).
  Atalho para quem tem pressa: **Ferramentas → Preparar máquina**.
- **3D** com remoção de material, ferramentas realistas (pastilhas CNMG/VNMG, brocas 118°, bedame, rosca, fresas, macho…), **calibrador** (APROPRIADO / APERTADO / FROUXO) e **paquímetro**.
- **Peça bruta** (Ø, comprimento, sobremetal, material, calibrador) e **Ferramentas** (torre de 8 / magazine de 12).
- Alarmes: G0 dentro do material, corte com fuso parado, ferramenta não montada, colisão com a placa/mesa, fim de curso, arco impossível, perfil P/Q inexistente.
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
- `js/sim3d.js` — simulador 3D (three.js) com remoção de material e ferramentas
- `js/panel.js` — painel SSCNC: tela do comando, teclado MDI, modos, HOME/JOG/MPG, MEDIR, física de zero-peça/corretores
- `js/game.js` — interface do jogo, progressão, dicas, tutorial, loja, manual
- `js/main.js` — inicialização
- `css/style.css` (temas, herdado do CNC Coordenadas) e `css/code.css`

Progresso salvo no navegador (`localStorage`, chave `cnccodigo_v1`); backup em Manual → Exportar save.
Modo desenvolvedor: 7 cliques no logo (libera tudo).
