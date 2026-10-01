/* =========================================================================
   CNC CÓDIGO — fases
   Linha do programa:  g(...) = bloco pronto (cinza)   w(...) = você escreve
   w(n, código-gabarito, enunciado, {alt:[outras respostas aceitas], opt:[palavras opcionais], raw:true})
   ========================================================================= */
'use strict';

const g = (n, code, say='') => ({n, code, say, given:true});
const w = (n, code, say, extra={}) => ({n, code, say, ...extra});
const W = rows => rows.map(r => r.keep ? r : ({...r, given:false}));   // tudo vira "escrever"

/* ---------------- blocos que se repetem (padrão Fanuc da escola) ---------------- */
const T_HDR = (o, tool='T0101 (DESBASTE)', vc=200, smax=2500) => [
  g('', o, 'Número do programa'),
  g('N10','G21 G40 G54 G90 G95','Bloco de segurança: mm, sem compensação, zero-peça, absoluto, mm/rot'),
  g('N20','G92 S4000','Limite geral de rotação'),
  g('N30','M5','Fuso parado'), g('N40','M9','Refrigeração desligada'),
  g('N50','G28 U0.','Recolhe X para a referência'), g('N60','G28 W0.','Recolhe Z para a referência'),
  g('N70', tool, 'Chama a ferramenta'),
  g('N80','G96 S'+vc, 'Velocidade de corte constante'),
  g('N90',`G92 S${smax} M3`, 'Limite de rotação e liga o fuso')
];
const T_END = (n0=500) => [
  g('N'+n0,'M5','Desliga o fuso'), g('N'+(n0+10),'M9','Desliga a refrigeração'),
  g('N'+(n0+20),'G28 U0.','Recolhe X'), g('N'+(n0+30),'G28 W0.','Recolhe Z'),
  g('N'+(n0+40),'M30','Fim de programa')
];
/* perfil da peça do instrutor (O7044) */
const O7044_PROF = [
  g('N200','G0 X14. Z1. (PONTO A)','Ponto de ataque A, alinhado com o chanfro'),
  g('N210','G1 X20. Z-2. F0.1 (B)','Chanfro até B'),
  g('N220','G1 Z-15. (C)','Cilindro ø20 até C'),
  g('N230','G1 X30. Z-35. (D)','Cone até D'),
  g('N240','G2 X40. Z-40. R5. (E)','Arco côncavo R5 até E'),
  g('N250','G1 X45. (F)','Degrau até F'),
  g('N260','G3 X50. Z-42.5 R2.5 (G)','Arco convexo R2.5 até G'),
  g('N270','G1 Z-53. (H)','Cilindro ø50 até H'),
  g('N280','G1 X54.','Sai da peça')
];
const PART_7044 = {
  stock:[52,70], face:1,
  prof:'G1 X0 Z0\nX16.\nX20. Z-2.\nZ-15.\nX30. Z-35.\nG2 X40. Z-40. R5.\nG1 X45.\nG3 X50. Z-42.5 R2.5\nG1 Z-53.\nX52.\nZ-70.',
  pts:[['A',14,1],['B',20,-2],['C',20,-15],['D',30,-35],['E',40,-40],['F',45,-40],['G',50,-42.5],['H',50,-53]]
};

/* =========================================================================
   TRILHA DO TORNO (Fanuc — o mesmo estilo dos programas da escola)
   ========================================================================= */
const LEVELS_TORNO = [
{
  id:1, name:'Liga, Desliga', sub:'M3, M4 e M5 — o fuso', boss:false,
  brief:'Seu primeiro programa: ligar e desligar o eixo-árvore.',
  tip:'Cada linha é uma ordem. M3 liga horário, M4 anti-horário, M5 desliga.',
  aula:{
    intro:'Um programa CNC é uma <b>lista de blocos</b> (linhas) que a máquina executa de cima para baixo, um por vez. Cada bloco é feito de <b>palavras</b>: uma <b>letra</b> + um <b>número</b>. A letra diz o assunto, o número diz o quê.',
    codes:['O','N','M3','M4','M5'],
    tips:['M03 e M3 são a mesma coisa — o comando ignora zeros à esquerda.',
          'O número do bloco (N10, N20…) é opcional, mas ajuda a se achar. Use de 10 em 10 para poder inserir linhas depois.',
          'O que estiver entre parênteses é <b>comentário</b>: a máquina ignora. Ex.: O1001 (LIGA DESLIGA).']
  },
  part:null,
  rows:[
    g('','O1001 (LIGA DESLIGA)','Número do programa + comentário'),
    g('N10','G97 S500','Rotação fixa de 500 rpm (você aprende o S na fase 3)'),
    w('N20','M3','Ligue o fuso girando no sentido HORÁRIO'),
    g('N30','G4 X3.','Pausa de 3 segundos com o fuso girando'),
    w('N40','M5','Desligue o fuso'),
    w('N50','M4','Agora ligue o fuso no sentido ANTI-HORÁRIO'),
    g('N60','G4 X3.','Pausa de 3 segundos'),
    w('N70','M5','Desligue o fuso de novo'),
    g('N80','M30','Fim de programa')
  ]
},
{
  id:2, name:'Água e Paradas', sub:'M8, M9, M0, M1, G4, M30', boss:false,
  brief:'Refrigeração, pausas e paradas do programa.',
  tip:'Um M por bloco no torno: M5 numa linha, M9 em outra.',
  aula:{
    intro:'Além do fuso, a máquina liga e desliga a <b>refrigeração</b> (fluido de corte) e pode <b>parar</b> o programa para o operador. Tudo isso são funções <b>M</b>. A pausa com tempo é a função <b>G4</b>.',
    codes:['M8','M9','G4','M0','M1','M30','M2'],
    tips:['No Fanuc de torno da escola, programe <b>um M por bloco</b> (M5 numa linha, M9 na outra) — é o que o seu programa O7044 faz.',
          'G4 X5. = espera 5 segundos. G4 P5000 é o mesmo (P em milésimos de segundo).',
          'M30 termina e volta ao início do programa. É sempre a última linha.']
  },
  part:null,
  rows:[
    g('','O1002 (REFRIGERACAO)','Número do programa'),
    g('N10','G97 S800 M3','Fuso a 800 rpm, horário'),
    w('N20','M8','Ligue a refrigeração'),
    w('N30','G4 X5.','Pausa de 5 segundos (G4, tempo no X)',{alt:['G4 P5000']}),
    w('N40','M9','Desligue a refrigeração'),
    w('N50','M5','Desligue o fuso'),
    w('N60','M0','Parada OBRIGATÓRIA: o operador vai virar a peça na placa'),
    g('N70','G97 S800 M3','Liga o fuso de novo'),
    w('N80','M8','Refrigeração ligada'),
    w('N90','M1','Parada OPCIONAL (só para se o botão do painel estiver ligado)'),
    w('N100','M9','Desligue a refrigeração'),
    w('N110','M5','Desligue o fuso'),
    w('N120','M30','Fim de programa e volta ao início')
  ]
},
{
  id:3, name:'Quantas Voltas?', sub:'S, G97, G96 e G92 S', boss:false,
  brief:'Rotação fixa ou velocidade de corte constante — e o limite de segurança.',
  tip:'G97 = rpm fixo. G96 = m/min constante. G92 S = limite de rpm.',
  aula:{
    intro:'O <b>S</b> diz a rotação, mas o significado depende do G: com <b>G97</b> o S é rpm fixo; com <b>G96</b> o S é a velocidade de corte (m/min) e a rotação muda sozinha conforme o diâmetro. Por isso, antes de ligar com G96, se programa um <b>limite</b>: G92 S2500.',
    codes:['S','G97','G96','G92'],
    tips:['Fórmula do livro: <b>N = Vc × 1000 ÷ (π × D)</b>. Com Vc 200 m/min num ø20: N ≈ 3183 rpm. No ø0 daria infinito — daí o limite G92.',
          'Pode juntar no mesmo bloco: <b>G97 S1200 M3</b> (rotação + liga o fuso).',
          'Na máquina da escola o limite é <b>G92 S</b>. Em outros Fanuc o mesmo limite é <b>G50 S</b>.']
  },
  part:null,
  rows:[
    g('','O1003 (ROTACAO)','Número do programa'),
    w('N10','G97 S1200 M3','Rotação FIXA de 1200 rpm e ligue o fuso horário — tudo no mesmo bloco'),
    g('N20','G4 X3.','Pausa'),
    w('N30','M5','Desligue o fuso'),
    w('N40','G96 S200','Velocidade de corte CONSTANTE de 200 m/min'),
    w('N50','G92 S2500 M3','Limite máximo de 2500 rpm e ligue o fuso horário',{alt:['G50 S2500 M3']}),
    g('N60','G4 X3.','Pausa'),
    w('N70','M5','Desligue o fuso'),
    w('N80','G97 S800 M4','Rotação fixa de 800 rpm, sentido ANTI-HORÁRIO'),
    g('N90','G4 X3.','Pausa'),
    w('N100','M5','Desligue o fuso'),
    g('N110','M30','Fim de programa')
  ]
},
{
  id:4, name:'Troca de Ferramenta', sub:'T0101 e G28 U0. / W0.', boss:false,
  brief:'Recolher para a referência e chamar a ferramenta certa.',
  tip:'T0101 = posição 01 da torre + corretor 01. Recolha X antes de Z.',
  aula:{
    intro:'Antes de girar a torre, a ferramenta precisa estar <b>longe da peça</b>: o <b>G28</b> manda o eixo para a referência da máquina. Depois o <b>T</b> chama a ferramenta pela posição na torre e pelo número do corretor.',
    codes:['G28','T','U','W'],
    tips:['<b>G28 U0.</b> recolhe o X; <b>G28 W0.</b> recolhe o Z. U e W aqui significam "andar 0 a partir de onde está" antes de ir para a referência — ou seja, vai direto.',
          'Recolha o <b>X primeiro</b> (sai de perto da peça), depois o Z.',
          'T0202 = ferramenta da posição 02 usando o corretor 02. Os 2 últimos dígitos guardam o desgaste/geometria daquela ferramenta.']
  },
  part:null,
  rows:[
    g('','O1004 (FERRAMENTAS)','Número do programa'),
    g('N10','G21 G40 G54 G90 G95','Bloco de segurança (fase 5)'),
    w('N20','G28 U0.','Recolha o eixo X até a referência'),
    w('N30','G28 W0.','Agora recolha o eixo Z'),
    w('N40','T0101 (DESBASTE)','Chame a ferramenta da posição 01 com o corretor 01 (o comentário é opcional)'),
    g('N50','G96 S200','Vc 200 m/min'),
    g('N60','G92 S2500 M3','Limite 2500 rpm e liga o fuso'),
    g('N70','G4 X3.','(aqui a ferramenta usinaria…)'),
    w('N80','M5','Desligue o fuso antes de trocar'),
    w('N90','G28 U0.','Recolha X'),
    w('N100','G28 W0.','Recolha Z'),
    w('N110','T0202 (ACABAMENTO)','Chame a ferramenta 02 com o corretor 02'),
    g('N120','G96 S300','Vc 300 m/min'),
    g('N130','G92 S3500 M3','Limite 3500 rpm e liga o fuso'),
    g('N140','G4 X3.','(usinando…)'),
    w('N150','M5','Desligue o fuso'),
    w('N160','G28 U0.','Recolha X'),
    w('N170','G28 W0.','Recolha Z'),
    g('N180','M30','Fim de programa')
  ]
},
{
  id:5, name:'Bloco de Segurança', sub:'G21 G40 G54 G90 G95', boss:false,
  brief:'O cabeçalho que abre todo programa de torno.',
  tip:'A ordem dos G dentro do bloco não importa.',
  aula:{
    intro:'Todo programa começa "zerando" o comando, para não herdar nada do programa anterior. É o <b>bloco de segurança</b>: unidade, compensação, zero-peça, tipo de coordenada e tipo de avanço. Depois vem o resto do cabeçalho que você já conhece.',
    codes:['G21','G20','G40','G54','G90','G91','G95','G94'],
    tips:['Funções <b>modais</b> ficam valendo até outra do mesmo grupo mudar. Por isso o bloco de segurança diz tudo explicitamente no começo.',
          'No torno o avanço é por rotação (<b>G95</b>): F0.2 = 0,2 mm a cada volta. Na fresa é por minuto (G94).',
          'Esta é exatamente a abertura do seu programa O7044 (N10 a N90).']
  },
  part:null,
  rows:[
    g('','O1005 (CABECALHO)','Número do programa'),
    w('N10','G21 G40 G54 G90 G95','Bloco de segurança: milímetros, cancela compensação, zero-peça nº 1, coordenadas absolutas, avanço por rotação'),
    w('N20','G92 S4000','Limite geral de rotação: 4000 rpm'),
    w('N30','M5','Garanta o fuso parado'),
    w('N40','M9','Garanta a refrigeração desligada'),
    w('N50','G28 U0.','Recolha X'),
    w('N60','G28 W0.','Recolha Z'),
    w('N70','T0101 (DESBASTE)','Ferramenta 01, corretor 01 — desbaste'),
    w('N80','G96 S200','Velocidade de corte constante 200 m/min'),
    w('N90','G92 S2500 M3','Limite 2500 rpm e ligue o fuso horário'),
    g('N100','G4 X2.','(usinagem…)'),
    ...T_END(110)
  ]
},
{
  id:6, name:'Rápido!', sub:'G0 — aproximar e afastar', boss:false,
  brief:'Leve a ferramenta até perto da peça e tire de lá — em rápido.',
  tip:'X é diâmetro. Z positivo = antes da face (no ar).',
  aula:{
    intro:'<b>G0</b> move na velocidade máxima. Serve para chegar perto da peça e para sair dela — <b>nunca</b> para cortar. É <b>modal</b>: depois de um G0, a próxima linha só com X ou Z continua em rápido.',
    codes:['G0','X','Z'],
    tips:['<b>Z3.</b> = 3 mm antes da face, no ar. Z negativo já é dentro da peça.',
          'Aproxime em duas etapas seguras: primeiro Z (G0 Z3.), depois X acima do bruto (X54.). Assim não bate.',
          'Fanuc: escreva o ponto em números inteiros (<b>X54.</b>). Em algumas máquinas X54 sem ponto vira 0,054 mm!']
  },
  part:{ stock:[40,50], face:0, prof:'G1 X0 Z0\nX40.\nZ-50.', pts:[['A',36,1],['S',100,50]] },
  rows:[
    ...T_HDR('O1006 (RAPIDO)'),
    w('N100','G0 Z3. M8','Rápido até 3 mm ANTES da face e ligue a refrigeração'),
    w('N110','G0 X44.','Rápido até ø44 (acima do bruto de ø40)'),
    w('N120','G0 X36. Z1.','Rápido até o ponto A: ø36, 1 mm antes da face'),
    g('N130','G4 X1.','(aqui começaria o corte)'),
    w('N140','G0 X44.','Suba em rápido para fora do material (ø44), sem mexer no Z'),
    w('N150','G0 X100. Z50.','Afaste até o ponto de segurança S: X100 Z50'),
    ...T_END(160)
  ]
},
{
  id:7, name:'Primeiro Cavaco', sub:'G1 e F — facear e tornear', boss:false,
  brief:'Faceie a ponta e tire 2 mm do diâmetro em dois passes de 1 mm.',
  tip:'G1 corta com avanço F (mm/rot). F e G1 são modais.',
  aula:{
    intro:'<b>G1</b> é o movimento de corte em linha reta, com o avanço <b>F</b>. No torno com G95, F é em <b>mm por rotação</b> (0.1, 0.2, 0.3…). Para <b>facear</b>, a ferramenta desce na face até passar um pouco do centro.',
    codes:['G1','F'],
    tips:['Facear até <b>X-1.6</b> (passa do centro) garante que não fica "biquinho" no meio — é o que o O7044 faz no N150.',
          'Regra da escola: <b>1 mm por passe</b> (no raio). Do ø34 ao ø30: passe em ø32 e depois em ø30.',
          'Ao terminar um passe dentro do material, saia em <b>G1</b> subindo o X (a ponta ainda raspa no ombro). Só depois volte em G0.']
  },
  part:{ stock:[34,45], face:1, prof:'G1 X0 Z0\nX30.\nZ-20.\nX34.\nZ-45.', pts:[['A',30,0],['B',30,-20],['C',34,-20]] },
  rows:[
    ...T_HDR('O1007 (FACE E CILINDRO)'),
    g('N100','G0 Z3. M8','Aproxima'),
    g('N110','X38.','Acima do bruto'),
    w('N120','G0 Z0.','Rápido até a linha da face (Z0) — ainda fora do diâmetro'),
    w('N130','G1 X-1.6 F0.1','FACEAR: corte descendo até passar do centro (X-1.6), avanço 0,1 mm/rot'),
    w('N140','G0 Z1.','Afaste 1 mm da face',{alt:['G1 Z1.']}),
    w('N150','G0 X32.','Rápido até ø32 (1º passe)'),
    w('N160','G1 Z-20. F0.2','Corte até Z-20 com avanço 0,2 mm/rot'),
    w('N170','G1 X36.','Suba EM AVANÇO até ø36 (a ferramenta ainda encosta no ombro)'),
    w('N180','G0 Z1.','Volte em rápido para antes da face'),
    w('N190','G0 X30.','2º passe: ø30'),
    w('N200','G1 Z-20.','Corte até Z-20 (o F0.2 continua valendo — é modal)'),
    w('N210','G1 X36.','Suba em avanço'),
    w('N220','G0 X100. Z50.','Afaste para a segurança'),
    ...T_END(230)
  ]
},
{
  id:8, name:'Chanfro e Cone', sub:'Linhas inclinadas e incremental U / W', boss:false,
  brief:'Percorra o perfil de acabamento ponto a ponto.',
  tip:'Linha inclinada = X e Z no mesmo bloco. U/W = quanto andar.',
  aula:{
    intro:'Quando X e Z mudam <b>no mesmo bloco</b>, a ferramenta anda em diagonal: assim saem <b>chanfros</b> e <b>cones</b>. E no torno existe um atalho incremental sem precisar de G91: <b>U</b> anda em X (no diâmetro) e <b>W</b> anda em Z, a partir de onde a ferramenta está.',
    codes:['U','W'],
    tips:['Ponto de ataque alinhado com o chanfro: o chanfro 2x45° termina em X20 Z-2; recuando 1 mm em Z ele começa em X14 Z1 — por isso o O7044 começa em <b>X14. Z1.</b>',
          '<b>W-10.</b> = anda 10 mm para a esquerda. <b>U10.</b> = aumenta 10 mm no diâmetro.',
          'Misturar é permitido: G1 X40. W-5. (X absoluto, Z incremental).']
  },
  part:{ stock:[44,70], face:0, prof:'G1 X0 Z0\nX16.\nX20. Z-2.\nZ-15.\nX30. Z-35.\nZ-45.\nX40.\nZ-55.\nX44.\nZ-70.',
         pts:[['A',14,1],['B',20,-2],['C',20,-15],['D',30,-35],['E',30,-45],['F',40,-45],['G',40,-55]] },
  rows:[
    ...T_HDR('O1008 (CHANFRO E CONE)','T0202 (ACABAMENTO)',300,3500),
    g('N100','G0 Z3. M8','Aproxima'),
    g('N110','X48.','Acima do bruto'),
    w('N120','G0 X14. Z1.','Rápido até o ponto de ataque A'),
    w('N130','G1 X20. Z-2. F0.1','Corte o chanfro até B, avanço 0,1'),
    w('N140','G1 Z-15.','Cilindro até C'),
    w('N150','G1 X30. Z-35.','Cone até D'),
    w('N160','G1 W-10.','Use INCREMENTAL: ande 10 mm para a esquerda (até E) com W'),
    w('N170','G1 U10.','Use INCREMENTAL: suba 10 mm no DIÂMETRO (de ø30 para ø40, ponto F) com U'),
    w('N180','G1 Z-55.','Cilindro ø40 até G (absoluto: Z-55)'),
    w('N190','G1 X44.','Saia da peça subindo até ø44'),
    w('N200','G0 X100. Z50.','Afaste para a segurança'),
    ...T_END(210)
  ]
},
{
  id:9, name:'Arcos com R', sub:'G2 e G3 com raio', boss:false,
  brief:'A peça do instrutor (O7044): escreva os arcos e o resto do perfil.',
  tip:'Desenho com Z → direita e X ↑: horário = G2, anti-horário = G3.',
  aula:{
    intro:'Arcos usam <b>G2</b> (horário) ou <b>G3</b> (anti-horário). O bloco leva o <b>ponto final</b> (X Z) e o <b>raio R</b>. O ponto inicial é onde a ferramenta já está.',
    codes:['G2','G3','R'],
    tips:['Olhe o desenho como ele está na tela (Z para a direita, X para cima) e siga a ferramenta indo para a esquerda.',
          'Arco <b>côncavo</b> (a "concha" de um ombro, ex.: E) neste perfil sai <b>G2</b>. Arco <b>convexo</b> (canto arredondado para fora, ex.: G) sai <b>G3</b>.',
          'R positivo = arco menor que meia-volta (o normal). R negativo só para arcos maiores que 180°.']
  },
  part:{...PART_7044, face:0},
  rows:[
    ...T_HDR('O1009 (ARCOS R)','T0202 (ACABAMENTO)',300,3500),
    g('N100','G0 Z3. M8','Aproxima'), g('N110','X54.','Acima do bruto'),
    O7044_PROF[0], O7044_PROF[1], O7044_PROF[2],
    w('N230','G1 X30. Z-35.','Cone até D (ø30 Z-35)'),
    w('N240','G2 X40. Z-40. R5.','Arco R5 até E (ø40 Z-40). Horário ou anti-horário?'),
    w('N250','G1 X45.','Degrau até F (ø45)'),
    w('N260','G3 X50. Z-42.5 R2.5','Arco R2.5 até G (ø50 Z-42.5) arredondando o canto'),
    w('N270','G1 Z-53.','Cilindro até H'),
    w('N280','G1 X54.','Saia da peça'),
    w('N290','G0 X100. Z50.','Afaste para a segurança'),
    ...T_END(300)
  ]
},
{
  id:10, name:'Centro do Arco', sub:'G2 / G3 com I e K', boss:false,
  brief:'Os mesmos arcos, agora dizendo onde fica o centro.',
  tip:'I e K = distância do INÍCIO do arco até o CENTRO. I é no raio.',
  aula:{
    intro:'Em vez do raio, o arco pode ser dado pelo <b>centro</b>. No Fanuc, <b>I</b> e <b>K</b> são a distância <b>incremental</b> do ponto inicial do arco até o centro: I na direção X (em <b>raio</b>, não diâmetro) e K na direção Z.',
    codes:['I','K'],
    tips:['Arco D→E: começa em ø30 (raio 15) Z-35; o centro está em raio 20, Z-35. Então <b>I5. K0</b>.',
          'Arco F→G: começa em ø45 (raio 22,5) Z-40; centro em raio 22,5, Z-42,5. Então <b>I0 K-2.5</b>.',
          'I0 ou K0 podem ser omitidos — valem zero. No Mach 9, ao contrário, I/J/K são absolutos (a partir do zero-peça).']
  },
  part:{...PART_7044, face:0},
  rows:[
    ...T_HDR('O1010 (ARCOS IK)','T0202 (ACABAMENTO)',300,3500),
    g('N100','G0 Z3. M8','Aproxima'), g('N110','X54.','Acima do bruto'),
    w('N200','G0 X14. Z1.','Rápido até o ponto de ataque A'),
    w('N210','G1 X20. Z-2. F0.1','Chanfro até B, avanço 0,1'),
    w('N220','G1 Z-15.','Cilindro até C'),
    w('N230','G1 X30. Z-35.','Cone até D'),
    w('N240','G2 X40. Z-40. I5. K0','Arco até E dando o CENTRO com I e K',{alt:['G2 X40. Z-40. I5.']}),
    w('N250','G1 X45.','Degrau até F'),
    w('N260','G3 X50. Z-42.5 I0 K-2.5','Arco até G dando o CENTRO com I e K',{alt:['G3 X50. Z-42.5 K-2.5']}),
    w('N270','G1 Z-53.','Cilindro até H'),
    w('N280','G1 X54.','Saia da peça'),
    w('N290','G0 X100. Z50.','Segurança'),
    ...T_END(300)
  ]
},
{
  id:11, name:'Faceamento em Ciclo', sub:'G72 — dois blocos + perfil', boss:false,
  brief:'Deixe a máquina calcular os passes da face.',
  tip:'1º bloco: G72 W R. 2º bloco: G72 P Q U W F. P e Q apontam para os N do perfil.',
  aula:{
    intro:'Ciclos fazem vários passes sozinhos. O <b>G72</b> desbasta a <b>face</b>, descendo em X a cada passe. Ele tem <b>dois blocos</b>: o primeiro diz a profundidade (W) e o recuo (R); o segundo diz <b>onde está o perfil</b> (P = primeiro bloco, Q = último), o sobremetal (U, W) e o avanço (F).',
    codes:['G72','P','Q'],
    tips:['O perfil é escrito normalmente (G0/G1) nos blocos de N140 a N160 — o ciclo lê de lá.',
          'No O7044 original estava <b>G72N140Q170</b> — o certo é <b>P140</b> (o N ali é erro de digitação).',
          'U0. W0. = não deixar sobremetal (a face já sai na medida).']
  },
  part:{ stock:[52,70], face:1, prof:'G1 X0 Z0\nX52.\nZ-70.', pts:[['W',0,0]] },
  rows:[
    ...T_HDR('O1011 (G72)'),
    w('N100','G0 Z3. M8','Aproxime a 3 mm da face e ligue a refrigeração'),
    w('N110','X54.','Rápido até ø54, acima do bruto',{alt:['G0 X54.']}),
    w('N120','G72 W1. R1.','1º bloco do faceamento: 1 mm por passe (W) e recuo de 1 mm (R)'),
    w('N130','G72 P140 Q160 U0. W0. F0.3','2º bloco: perfil de N140 até N160, sem sobremetal, avanço 0,3'),
    w('N140','G0 Z0.','Perfil: rápido até a linha da face (Z0)'),
    w('N150','G1 X-1.6 F0.1','Perfil: corte até passar do centro, avanço 0,1'),
    w('N160','G1 Z1.','Perfil: afaste 1 mm da face'),
    g('N170','G0 X54. Z3.','Volta ao ponto de partida'),
    ...T_END(500)
  ]
},
{
  id:12, name:'Desbaste em Ciclo', sub:'G71 — de 1 em 1 mm', boss:false,
  brief:'O G71 lê o perfil N200–N280 e tira o material em passes de 1 mm.',
  tip:'G71 U1. R1. = 1 mm por passe. 2º bloco: P Q U(sobra X) W(sobra Z) F.',
  aula:{
    intro:'O <b>G71</b> é o desbaste longitudinal: passes ao longo do Z, descendo o diâmetro a cada passe, até chegar perto do perfil. No 1º bloco o <b>U</b> é a profundidade por passe (no raio) e o <b>R</b> o recuo. No 2º bloco o U/W viram o <b>sobremetal</b> que fica para o acabamento.',
    codes:['G71'],
    tips:['A regra da escola é <b>usinar de 1 em 1 mm</b>: G71 <b>U1.</b> R1. (no O7044 original estava U2).',
          'Comece o ciclo de um ponto <b>fora do bruto</b>: X54. Z3. — é de lá que os passes saem e para lá o ciclo volta.',
          'Sobremetal típico: U0.5 (0,5 mm no diâmetro) e W0.05.']
  },
  part:PART_7044,
  rows:[
    ...T_HDR('O1012 (G71)'),
    g('N100','G0 Z3. M8','Aproxima'), g('N110','X54.','Acima do bruto'),
    g('N120','G72 W1. R1.','Faceamento — 1º bloco'), g('N130','G72 P140 Q160 U0. W0. F0.3','Faceamento — 2º bloco'),
    g('N140','G0 Z0.','Perfil da face'), g('N150','G1 X-1.6 F0.1','Perfil da face'), g('N160','G1 Z1.','Perfil da face'),
    w('N175','G0 X54. Z3.','Volte ao ponto de partida do ciclo: ø54, Z3'),
    w('N180','G71 U1. R1.','1º bloco do DESBASTE: 1 mm por passe e recuo de 1 mm'),
    w('N190','G71 P200 Q280 U0.5 W0.05 F0.3','2º bloco: perfil N200 a N280, sobra 0,5 em X e 0,05 em Z, avanço 0,3'),
    ...O7044_PROF,
    ...T_END(500)
  ]
},
{
  id:13, name:'Acabamento', sub:'G70 com G42 / G40', boss:false,
  brief:'Troque para a ferramenta de acabamento e passe no perfil final.',
  tip:'G42 antes do G70, G40 depois. G70 P Q usa o mesmo perfil do G71.',
  aula:{
    intro:'O <b>G70 P Q</b> passa uma vez no perfil, na medida final. A ponta da ferramenta é arredondada, então liga-se a <b>compensação de raio da ponta</b>: <b>G42</b> (ferramenta à direita do perfil, cortando da direita para a esquerda) — e <b>G40</b> desliga ao terminar.',
    codes:['G70','G42','G40'],
    tips:['Sem compensação, cones e arcos saem errados: o desenho é da peça, mas o comando mede pela ponta "teórica".',
          'Acabamento costuma ter Vc maior (G96 S300) e limite maior (G92 S3500).',
          'Esta é a segunda metade do seu O7044: N300 até N460.']
  },
  part:PART_7044,
  rows:[
    ...T_HDR('O1013 (G70)'),
    g('N100','G0 Z3. M8',''), g('N110','X54.',''),
    g('N175','G0 X54. Z3.','Ponto de partida'),
    g('N180','G71 U1. R1.','Desbaste — 1º bloco'), g('N190','G71 P200 Q280 U0.5 W0.05 F0.3','Desbaste — 2º bloco'),
    ...O7044_PROF,
    w('N300','M5','Desligue o fuso'),
    w('N310','M9','Desligue a refrigeração'),
    w('N320','G28 U0.','Recolha X'),
    w('N330','G28 W0.','Recolha Z'),
    w('N340','T0404 (ACABAMENTO)','Ferramenta de acabamento: posição 04, corretor 04'),
    w('N350','G96 S300','Vc constante de 300 m/min'),
    w('N360','G92 S3500 M3','Limite 3500 rpm e ligue o fuso'),
    w('N370','G0 Z3. M8','Aproxime a 3 mm da face, refrigeração ligada'),
    w('N380','X54.','Rápido até ø54',{alt:['G0 X54.']}),
    w('N390','G42','Ligue a compensação do raio da ponta (ferramenta à DIREITA do perfil)'),
    w('N400','G70 P200 Q280','Acabamento: percorra o perfil N200 a N280'),
    w('N410','G40','Desligue a compensação'),
    w('N415','G0 X60.','Afaste em rápido para ø60'),
    ...T_END(420)
  ]
},
{
  id:14, name:'Furo e Canal', sub:'G74 (furação) e G75 (canal)', boss:false,
  brief:'Broca no centro com bicadas e bedame fazendo um canal.',
  tip:'Q do G74 e P do G75 são em MÍCRONS: 3 mm = 3000.',
  aula:{
    intro:'O <b>G74</b> fura no centro em bicadas (entra, volta um pouco, entra de novo) para quebrar o cavaco. O <b>G75</b> faz o mesmo em X, para canais com bedame. Os dois têm 2 blocos: o 1º só com o recuo <b>R</b>; o 2º com o fundo, a bicada e o avanço.',
    codes:['G74','G75'],
    tips:['Broca no centro usa <b>G97</b> (rpm fixo): em X0 o G96 mandaria a rotação para o máximo.',
          'Bicadas em mícrons, sem ponto: <b>Q3000</b> = 3 mm, <b>P1000</b> = 1 mm.',
          'No seu O7046 a furação foi feita "na mão" (G0/G1 em vários blocos). O G74 faz a mesma coisa em 2 linhas.']
  },
  part:{ stock:[32,50], face:0, prof:'G1 X0 Z0\nX8.\nX9. Z-0.5\nZ-1.\nG3 X21. Z-22. R40.\nG1 Z-28.\nX32.\nZ-50.', pts:[['A',0,0],['C',32,-34]] },
  rows:[
    g('','O1014 (FURO E CANAL)','Número do programa'),
    g('N10','G21 G40 G54 G90 G95','Segurança'), g('N20','G92 S4000',''), g('N30','M5',''), g('N40','M9',''),
    g('N50','G28 U0.',''), g('N60','G28 W0.',''),
    w('N70','T0303 (BROCA D4)','Chame a broca: posição 03, corretor 03'),
    w('N80','G97 S1500 M3','Rotação FIXA de 1500 rpm e ligue o fuso'),
    w('N90','G0 X0. Z5. M8','Rápido até o CENTRO (X0), 5 mm antes da face, refrigeração ligada'),
    w('N100','G74 R1.','1º bloco da furação: recuo de 1 mm a cada bicada'),
    w('N110','G74 Z-14. Q3000 F0.1','2º bloco: fure até Z-14, bicadas de 3 mm, avanço 0,1'),
    w('N120','G0 Z5.','Saia do furo em rápido'),
    g('N130','M5',''), g('N140','M9',''), g('N150','G28 U0.',''), g('N160','G28 W0.',''),
    g('N170','T0404 (BEDAME)','Bedame (ferramenta de canal)'),
    g('N180','G96 S100','Vc baixa para canal'), g('N190','G92 S1500 M3','Limite e liga'),
    w('N200','G0 X35. Z-34. M8','Rápido até ø35 (acima do bruto ø32) na posição do canal, Z-34, refrigeração'),
    w('N210','G75 R0.5','1º bloco do canal: recuo de 0,5 mm'),
    w('N220','G75 X24. P1000 F0.05','2º bloco: mergulhe até ø24, bicadas de 1 mm, avanço 0,05'),
    w('N230','G0 X40.','Suba em rápido para fora'),
    ...T_END(240)
  ]
},
{
  id:15, name:'Rosca', sub:'G76 — rosca M20 x 1,5', boss:false,
  brief:'Uma rosca externa M20 com passo 1,5 mm, até Z-18.',
  tip:'Rosca: G97 sempre. No 2º bloco do G76 o F é o PASSO.',
  aula:{
    intro:'O <b>G76</b> faz a rosca em vários passes cada vez mais rasos. 1º bloco: <b>P</b> com 6 dígitos (passes de acabamento, saída em chanfro, ângulo) + <b>Q</b> passe mínimo + <b>R</b> sobremetal. 2º bloco: <b>X</b> diâmetro do fundo, <b>Z</b> fim da rosca, <b>P</b> altura do filete, <b>Q</b> 1º passe (os dois em mícrons) e <b>F = passo</b>.',
    codes:['G76'],
    tips:['Altura do filete (externa métrica) ≈ 0,6134 × passo = 0,92 mm → fundo = 20 − 2 × 0,92 = <b>ø18,16</b>.',
          '<b>P010060</b> = 01 passe de acabamento, 00 sem chanfro de saída, 60 graus.',
          'Comece afastado da face (Z5.) para o carro acelerar antes de entrar na rosca.']
  },
  part:{ stock:[30,40], face:0, prof:'G1 X0 Z0\nX18.\nX20. Z-1.\nZ-20.\nX30.\nZ-40.', pts:[['A',20,0],['B',20,-18]] },
  rows:[
    g('','O1015 (ROSCA M20X1.5)','Número do programa'),
    g('N10','G21 G40 G54 G90 G95',''), g('N20','G92 S4000',''), g('N30','M5',''), g('N40','M9',''),
    g('N50','G28 U0.',''), g('N60','G28 W0.',''),
    w('N70','T0505 (ROSCA)','Ferramenta de rosca: posição 05, corretor 05'),
    w('N80','G97 S800 M3','Rosca usa rotação FIXA: 800 rpm, liga o fuso'),
    w('N90','G0 X24. Z5. M8','Rápido até ø24, 5 mm antes da face, refrigeração'),
    w('N100','G76 P010060 Q100 R0.05','1º bloco: 1 passe de acabamento, sem chanfro de saída, 60°; passe mínimo 0,1 mm (Q100); sobremetal 0,05'),
    w('N110','G76 X18.16 Z-18. P920 Q300 F1.5','2º bloco: fundo ø18,16 até Z-18, filete 0,92 mm (P920), 1º passe 0,3 mm (Q300), passo 1,5'),
    w('N120','G0 X40. Z10.','Afaste em rápido'),
    ...T_END(130)
  ]
},
{
  id:16, name:'A Peça do Instrutor', sub:'Programa O7044 inteiro', boss:true,
  brief:'Sem blocos prontos: escreva o programa completo da peça, do O ao M30.',
  tip:'Cabeçalho → face G72 → desbaste G71 → troca → acabamento G70 → fim.',
  aula:{
    intro:'Chegou a hora: o <b>programa inteiro</b>, como você faria na escola. Use tudo que aprendeu. O enunciado de cada linha diz o que ela faz — você escreve o código.',
    codes:[],
    tips:['Siga a ordem do fluxo: segurança → limite → desliga → recolhe → ferramenta → rotação → aproxima → ciclos → troca → acabamento → fim.',
          'Desbaste com T0202, acabamento com T0404 (como no O7044).',
          'Travou? O Manual tem o fluxo completo do torno.']
  },
  part:PART_7044,
  rows: W([
    w('','O7044','Número do programa: 7044'),
    w('N10','G21 G40 G54 G90 G95','Bloco de segurança (mm, sem compensação, G54, absoluto, mm/rot)'),
    w('N20','G92 S4000','Limite geral 4000 rpm'),
    w('N30','M5','Fuso parado'), w('N40','M9','Refrigeração desligada'),
    w('N50','G28 U0.','Recolhe X'), w('N60','G28 W0.','Recolhe Z'),
    w('N70','T0202 (DESBASTE)','Ferramenta 02, corretor 02 — desbaste'),
    w('N80','G96 S200','Vc 200 m/min'),
    w('N90','G92 S2500 M3','Limite 2500 rpm, liga horário'),
    w('N100','G0 Z3. M8','Aproxima a 3 mm da face com refrigeração'),
    w('N110','X54.','Rápido até ø54',{alt:['G0 X54.']}),
    w('N120','G72 W1. R1.','Faceamento: 1 mm por passe, recuo 1'),
    w('N130','G72 P140 Q160 U0. W0. F0.3','Faceamento: perfil N140–N160, sem sobra, F0.3'),
    w('N140','G0 Z0.','Perfil da face: até Z0'),
    w('N150','G1 X-1.6 F0.1','Perfil da face: corta passando do centro, F0.1'),
    w('N160','G1 Z1.','Perfil da face: sai 1 mm'),
    w('N175','G0 X54. Z3.','Ponto de partida do desbaste'),
    w('N180','G71 U1. R1.','Desbaste: 1 mm por passe, recuo 1'),
    w('N190','G71 P200 Q280 U0.5 W0.05 F0.3','Desbaste: perfil N200–N280, sobra 0,5 / 0,05, F0.3'),
    w('N200','G0 X14. Z1.','Ponto de ataque A'),
    w('N210','G1 X20. Z-2. F0.1','Chanfro até B, F0.1'),
    w('N220','G1 Z-15.','Cilindro até C'),
    w('N230','G1 X30. Z-35.','Cone até D'),
    w('N240','G2 X40. Z-40. R5.','Arco R5 até E',{alt:['G2 X40. Z-40. I5. K0','G2 X40. Z-40. I5.']}),
    w('N250','G1 X45.','Degrau até F'),
    w('N260','G3 X50. Z-42.5 R2.5','Arco R2.5 até G',{alt:['G3 X50. Z-42.5 I0 K-2.5','G3 X50. Z-42.5 K-2.5']}),
    w('N270','G1 Z-53.','Cilindro até H'),
    w('N280','G1 X54.','Sai da peça'),
    w('N300','M5','Desliga fuso'), w('N310','M9','Desliga refrigeração'),
    w('N320','G28 U0.','Recolhe X'), w('N330','G28 W0.','Recolhe Z'),
    w('N340','T0404 (ACABAMENTO)','Ferramenta 04, corretor 04 — acabamento'),
    w('N350','G96 S300','Vc 300 m/min'),
    w('N360','G92 S3500 M3','Limite 3500, liga horário'),
    w('N370','G0 Z3. M8','Aproxima com refrigeração'),
    w('N380','X54.','Rápido até ø54',{alt:['G0 X54.']}),
    w('N390','G42','Liga compensação do raio da ponta'),
    w('N400','G70 P200 Q280','Acabamento no perfil N200–N280'),
    w('N410','G40','Desliga compensação'),
    w('N415','G0 X60.','Afasta'),
    w('N420','M5','Desliga fuso'), w('N430','M9','Desliga refrigeração'),
    w('N440','G28 U0.','Recolhe X'), w('N450','G28 W0.','Recolhe Z'),
    w('N460','M30','Fim de programa')
  ])
}
];

/* =========================================================================
   TRILHA DO CENTRO DE USINAGEM (livro SENAI — comando Fanuc + Mach 9/Siemens)
   ========================================================================= */
const F_HDR = (o, T='01', S=1500, H='01') => [
  g('', o, 'Número do programa'),
  g('N10','G17 G21 G40 G54 G80 G90','Bloco de segurança'),
  g('N20','G0 G53 Z-110. H00 M5','Sobe para a troca, cancela corretor, para o fuso'),
  g('N30',`T${T} M6`,'Troca de ferramenta'),
  g('N40','G54','Zero-peça'),
  g('N50',`S${S} M3`,'Rotação e sentido')
];
const F_END = n0 => [
  g('N'+n0,'G0 Z10. M9','Afasta e desliga a refrigeração'),
  g('N'+(n0+10),'G0 G53 Z-110. H00 M5','Volta para a troca e para o fuso'),
  g('N'+(n0+20),'M30','Fim de programa')
];
const FIG1 = { stock:[0,0,100,60], prof:'G1 X0 Y0\nX70. Y0\nX100. Y30.\nX70. Y60.\nX50. Y60.\nX0 Y30.\nX0 Y0',
  pts:[['A',0,0],['B',70,0],['C',100,30],['D',70,60],['E',50,60],['F',0,30]] };
const FIG2 = { stock:[0,0,150,120], prof:'G1 X0 Y0\nX30. Y0\nG2 X60. Y0 R15.\nG1 X140. Y0\nG3 X150. Y10. R10.\nG1 X150. Y100.\nG2 X130. Y120. R20.\nG1 X15. Y120.\nG3 X0 Y105. R15.\nG1 X0 Y0',
  pts:[['A',0,0],['B',30,0],['C',60,0],['D',140,0],['E',150,10],['F',150,100],['G',130,120],['H',15,120],['I',0,105]] };

const LEVELS_FRESA = [
{
  id:1, name:'Três Eixos', sub:'Bloco de segurança da fresa', boss:false, machine:'fresa',
  brief:'X e Y no plano da mesa, Z no eixo da ferramenta. E o cabeçalho Fanuc.',
  tip:'G17 plano XY · G21 mm · G40 sem compensação · G54 zero · G80 sem ciclo · G90 absoluto.',
  aula:{
    intro:'No centro de usinagem (livro, cap. 1) a <b>regra da mão direita</b> dá os eixos: polegar = X+, indicador = Y+, dedo médio = Z+ (eixo da ferramenta). <b>Z negativo entra na peça.</b> O programa Fanuc começa com o bloco de segurança, que inclui <b>G80</b> (cancela qualquer ciclo de furação esquecido) e <b>G17</b> (plano XY).',
    codes:['G17','G18','G19','G21','G40','G54','G80','G90','G91','G94'],
    tips:['Funções <b>modais</b> (G0, G1, G41…) ficam ativas até outra do grupo mudar. <b>Não modais</b> (G4, ciclos de alguns comandos) valem só no bloco.',
          'O Fanuc aceita vários G no mesmo bloco. O Mach 9 não (um G por bloco).',
          'Ao ligar, o Fanuc 0MB assume: G90, G01, G17, G40, G21.']
  },
  part:null,
  rows:[
    g('','O0001 (SEGURANCA)','Número do programa'),
    w('N10','G17 G21 G40 G54 G80 G90','Bloco de segurança: plano XY, mm, sem compensação de raio, zero-peça nº 1, cancela ciclo fixo, absoluto'),
    w('N20','G94','Avanço em milímetros por MINUTO'),
    w('N30','G91','Mude para coordenadas INCREMENTAIS'),
    g('N40','G0 X10. Y10.','(anda 10 mm em X e em Y a partir de onde está)'),
    w('N50','G90','Volte para coordenadas ABSOLUTAS'),
    w('N60','G18','Selecione o plano XZ'),
    w('N70','G19','Selecione o plano YZ'),
    w('N80','G17','Volte ao plano XY'),
    w('N90','M30','Fim de programa')
  ]
},
{
  id:2, name:'Troca de Ferramenta', sub:'G53, H00, T01 M6, S M3', boss:false, machine:'fresa',
  brief:'Subir até a posição de troca, trocar a ferramenta e ligar o fuso.',
  tip:'Na fresa a troca precisa de M6: T01 M6.',
  aula:{
    intro:'Antes de trocar, o Z sobe até perto do trocador. Isso usa <b>G53</b> (coordenada de <b>máquina</b>, não da peça) com <b>H00</b> (cancela o corretor de comprimento). A troca é <b>T01 M6</b>. Depois: <b>G54</b> (zero-peça) e <b>S1500 M3</b>.',
    codes:['G53','H','T','M6','M3','M4','M5','S'],
    tips:['No livro: <b>N020 G0 G53 Z___ H00 M05</b> — o valor de Z depende da máquina; aqui usamos Z-110.',
          'M6 não precisa estar no mesmo bloco do T, mas costuma.',
          'Na fresa o S é sempre rpm (não existe G96 de velocidade constante como no torno).']
  },
  part:null,
  rows:[
    g('','O0002 (TROCA)','Número do programa'),
    g('N10','G17 G21 G40 G54 G80 G90','Segurança'),
    w('N20','G0 G53 Z-110. H00 M5','Suba o Z em rápido até a troca (coordenada de MÁQUINA Z-110), cancele o corretor (H00) e pare o fuso'),
    w('N30','T01 M6','Troque para a ferramenta 01'),
    w('N40','G54','Busque o zero-peça nº 1'),
    w('N50','S1500 M3','1500 rpm, sentido horário'),
    g('N60','G4 X3.','(usinagem…)'),
    w('N70','G0 G53 Z-110. H00 M5','Volte à posição de troca e pare o fuso'),
    w('N80','T02 M6','Troque para a ferramenta 02'),
    g('N90','G54','Zero-peça'),
    w('N100','S800 M4','800 rpm, sentido ANTI-HORÁRIO'),
    g('N110','G4 X3.','(usinagem…)'),
    w('N120','G0 G53 Z-110. H00 M5','Volte à troca e pare o fuso'),
    w('N130','M30','Fim de programa')
  ]
},
{
  id:3, name:'Descendo com Cuidado', sub:'G0, G43 H e M8', boss:false, machine:'fresa',
  brief:'Posicione fora da peça e desça usando o corretor de comprimento.',
  tip:'G43 H01 Z10. = liga o corretor 01 e desce até Z10.',
  aula:{
    intro:'Cada ferramenta tem um comprimento diferente. O <b>G43 H01</b> soma o comprimento gravado no corretor 01, para que <b>Z0 seja o topo da peça</b> com qualquer ferramenta. Ele vai na primeira descida em Z, depois de posicionar X e Y.',
    codes:['G0','G43','H','M8','M9'],
    tips:['Ordem do livro: posiciona X Y → <b>G43 H Z</b> → G0 Z5. M8 (aproximação de segurança) → G1 Z (penetração).',
          'Posicione sempre FORA da peça (X-15. Y-15.) para descer sem bater.',
          'Esquecer o G43 é batida certa: a máquina acha que a ferramenta é mais curta do que é.']
  },
  part:FIG1,
  rows:[
    ...F_HDR('O0003 (APROXIMACAO)'),
    w('N60','G0 X-15. Y-15.','Posicione em rápido FORA da peça, em X-15 Y-15'),
    w('N70','G43 H01 Z10.','Ative o corretor de comprimento nº 01 e desça até Z10'),
    w('N80','G0 Z5. M8','Aproxime até 5 mm do topo e ligue a refrigeração'),
    g('N90','G4 X2.','(aqui começaria o corte)'),
    w('N100','G0 Z10. M9','Afaste para Z10 e desligue a refrigeração'),
    w('N110','G0 G53 Z-110. H00 M5','Volte para a troca e pare o fuso'),
    w('N120','M30','Fim de programa')
  ]
},
{
  id:4, name:'Contorno Reto', sub:'G1 com F em mm/min', boss:false, machine:'fresa',
  brief:'O exemplo do livro (fig. 1): contorno de 6 lados, 5 mm de profundidade.',
  tip:'Na fresa F300 = 300 mm por minuto. G1 é modal.',
  aula:{
    intro:'Com <b>G1</b> a ferramenta corta em linha reta até o ponto X Y. O avanço <b>F</b> na fresa é em <b>mm/min</b>: F300 anda 300 mm a cada minuto. Primeiro se penetra em Z (G1 Z-5.), depois se contorna.',
    codes:['G1','F'],
    tips:['Fórmula do livro: <b>Vf = fz × z × rpm</b> (avanço por dente × nº de dentes × rotação).',
          'Como G1 é modal, depois do primeiro G1 as linhas podem ter só X e Y.',
          'Aqui o percurso é o do centro da ferramenta (ainda sem compensação de raio — isso é a fase 8).']
  },
  part:FIG1,
  rows:[
    ...F_HDR('O0004 (CONTORNO)'),
    g('N60','G0 X-15. Y-15.','Fora da peça'), g('N70','G43 H01 Z10.','Corretor'), g('N80','G0 Z5. M8','Aproxima'),
    w('N90','G1 Z-5. F300','Penetre 5 mm na peça CORTANDO, avanço 300 mm/min'),
    w('N100','G1 X70. Y0','Corte até o ponto B'),
    w('N110','G1 X100. Y30.','Até C'),
    w('N120','G1 X70. Y60.','Até D'),
    w('N130','G1 X50. Y60.','Até E'),
    w('N140','G1 X0 Y30.','Até F'),
    w('N150','G1 X0 Y0','Até A'),
    w('N160','G1 X-15. Y-15.','Saia da peça'),
    ...F_END(170)
  ]
},
{
  id:5, name:'Arcos com R', sub:'G2 / G3 com raio (fig. 2)', boss:false, machine:'fresa',
  brief:'O contorno com 4 arcos do livro. Escreva os arcos.',
  tip:'Vista de cima, X → direita, Y ↑: horário = G2, anti-horário = G3.',
  aula:{
    intro:'No Fanuc o arco pode ser dado pelo <b>raio R</b>: G2/G3 X Y (ponto final) R (raio). R positivo = arco até 180°; R negativo = maior que 180°. No Siemens o mesmo é <b>CR=</b>.',
    codes:['G2','G3','R'],
    tips:['Imagine-se olhando a mesa de cima e seguindo a ferramenta: o arco gira como o relógio (G2) ou ao contrário (G3)?',
          'Canto arredondado "para fora" percorrido no sentido anti-horário → G3. Canto "para dentro" (côncavo) → G2.',
          'Comando Mach 9 não tem R: só I e J absolutos.']
  },
  part:FIG2,
  rows:[
    ...F_HDR('O0005 (ARCOS R)'),
    g('N60','G0 X-15. Y-15.',''), g('N70','G43 H01 Z10.',''), g('N80','G0 Z5. M8',''),
    g('N90','G1 Z-5. F800','Penetra'), g('N100','G1 X0 Y0 F400','Até A'), g('N110','G1 X30. Y0','Até B'),
    w('N120','G2 X60. Y0 R15.','Meia-lua R15 de B até C (X60 Y0)'),
    g('N130','G1 X140. Y0','Até D'),
    w('N140','G3 X150. Y10. R10.','Arco R10 de D até E (X150 Y10)'),
    g('N150','G1 X150. Y100.','Até F'),
    w('N160','G2 X130. Y120. R20.','Arco R20 de F até G (X130 Y120)'),
    g('N170','G1 X15. Y120.','Até H'),
    w('N180','G3 X0 Y105. R15.','Arco R15 de H até I (X0 Y105)'),
    w('N190','G1 X0 Y0','Desça até A fechando o contorno'),
    w('N200','G1 X-15. Y-15.','Saia da peça'),
    ...F_END(210)
  ]
},
{
  id:6, name:'Centro do Arco', sub:'G2 / G3 com I e J', boss:false, machine:'fresa',
  brief:'Os mesmos arcos da fig. 2, agora com o centro.',
  tip:'Fanuc: I e J = do INÍCIO do arco até o CENTRO.',
  aula:{
    intro:'Com <b>I</b> (direção X) e <b>J</b> (direção Y) se informa o <b>centro</b>. No Fanuc e no Siemens eles são <b>incrementais</b>: distância do ponto inicial do arco até o centro. No Mach 9 são absolutos (do zero-peça até o centro).',
    codes:['I','J','K'],
    tips:['B→C: início X30 Y0, centro X45 Y0 → <b>I15. J0</b>.',
          'D→E: início X140 Y0, centro X140 Y10 → <b>I0 J10.</b> (o livro traz "J15." — erro de digitação; o raio é 10).',
          'Com G18 (plano XZ) usa-se I e K; com G19 (YZ), J e K.']
  },
  part:FIG2,
  rows:[
    ...F_HDR('O0006 (ARCOS IJ)'),
    g('N60','G0 X-15. Y-15.',''), g('N70','G43 H01 Z10.',''), g('N80','G0 Z5. M8',''),
    g('N90','G1 Z-5. F800','Penetra'), g('N100','G1 X0 Y0 F400','Até A'), g('N110','G1 X30. Y0','Até B'),
    w('N120','G2 X60. Y0 I15. J0','Meia-lua até C com centro (I J)',{alt:['G2 X60. Y0 I15.']}),
    g('N130','G1 X140. Y0','Até D'),
    w('N140','G3 X150. Y10. I0 J10.','Arco até E com centro',{alt:['G3 X150. Y10. J10.']}),
    g('N150','G1 X150. Y100.','Até F'),
    w('N160','G2 X130. Y120. I0 J20.','Arco até G com centro',{alt:['G2 X130. Y120. J20.']}),
    g('N170','G1 X15. Y120.','Até H'),
    w('N180','G3 X0 Y105. I0 J-15.','Arco até I com centro',{alt:['G3 X0 Y105. J-15.']}),
    g('N190','G1 X0 Y0','Até A'), g('N200','G1 X-15. Y-15.','Sai'),
    ...F_END(210)
  ]
},
{
  id:7, name:'Cantos Automáticos', sub:',R e ,C — arredondar e chanfrar', boss:false, machine:'fresa',
  brief:'Deixe o comando fazer o raio e o chanfro dos cantos (fig. 4 do livro).',
  tip:'Fanuc: VÍRGULA antes do R e do C → G1 X60.,R10.',
  aula:{
    intro:'Em vez de calcular o arco, você só diz: "neste canto, arredonde com R10" ou "chanfre 5 mm". No Fanuc é <b>,R</b> e <b>,C</b> (com vírgula!) no bloco que <b>chega</b> no canto. O próximo bloco precisa ter movimento, para o comando saber para onde o canto vira.',
    codes:[',R',',C'],
    tips:['Mach 9: Q+ (raio) e Q– (chanfro). Siemens: RND= e CHF=.',
          'Sem a vírgula, o R vira "raio de arco" e o comando dá alarme ou faz outra coisa.',
          'O canto é entre o bloco que tem o ,R/,C e o bloco seguinte.']
  },
  part:{ stock:[0,0,60,60], prof:'G1 X0 Y0\nX50.\nG3 X60. Y10. R10.\nG1 Y55.\nX55. Y60.\nX15.\nG3 X0 Y45. R15.\nG1 Y0', pts:[['A',0,0],['B',60,0],['C',60,60],['D',0,60]] },
  rows:[
    ...F_HDR('O0007 (CANTOS)'),
    g('N60','G0 X-15. Y0',''), g('N70','G43 H01 Z10.',''), g('N80','G0 Z5. M8',''),
    g('N90','G1 Z-5. F200','Penetra'),
    g('N100','G1 X0 Y0','Até A'),
    w('N110','G1 X60.,R10.','Vá até B (X60) arredondando o canto com R10'),
    w('N120','G1 Y60.,C5.','Suba até C (Y60) com chanfro de 5 mm no canto'),
    w('N130','G1 X0,R15.','Volte até D (X0) com arredondamento R15'),
    w('N140','G1 Y0','Feche descendo até A (Y0)'),
    w('N150','G1 X-15.','Saia da peça'),
    ...F_END(160)
  ]
},
{
  id:8, name:'Compensação', sub:'G41 / G42 com D, e G40', boss:false, machine:'fresa',
  brief:'Programe a medida da PEÇA e deixe o comando desviar o raio da fresa.',
  tip:'Externo anti-horário = G42. Externo horário = G41.',
  aula:{
    intro:'A fresa tem raio. Sem compensação, o centro dela anda no desenho e a peça sai menor. Com <b>G41</b> (fresa à esquerda do percurso) ou <b>G42</b> (à direita) + <b>D</b> (corretor com o raio), você programa a medida da peça e o comando desloca o centro. <b>G40</b> desliga — sempre num movimento saindo da peça.',
    codes:['G41','G42','G40','D'],
    tips:['Tabela do livro: <b>G41</b> = externo horário / interno anti-horário. <b>G42</b> = externo anti-horário / interno horário.',
          'Ligue a compensação num movimento G1 entrando na peça, e desligue (G40) num G1 saindo.',
          'No Fanuc o G40 pode ir junto do movimento: G40 G1 X-15. Y-15.']
  },
  part:FIG1,
  rows:[
    ...F_HDR('O0008 (COMPENSACAO)'),
    g('N60','G0 X-15. Y-15.',''), g('N70','G43 H01 Z10.',''), g('N80','G0 Z5. M8',''),
    g('N90','G1 Z-5. F300','Penetra fora da peça'),
    w('N100','G42 D01 G1 X0 Y0','Ligue a compensação (corretor D01) entrando em A. O contorno vai no sentido ANTI-HORÁRIO (A→B→C…), perfil externo.'),
    g('N110','G1 X70. Y0','B'), g('N120','X100. Y30.','C'), g('N130','X70. Y60.','D'), g('N140','X50. Y60.','E'), g('N150','X0 Y30.','F'), g('N160','X0 Y0','A'),
    w('N170','G40 G1 X-15. Y-15.','Desligue a compensação saindo até X-15 Y-15'),
    g('N180','G1 Z-10.','2º passe, 10 mm de profundidade'),
    w('N190','G41 D01 G1 X0 Y0','Ligue a compensação entrando em A. Agora o contorno vai no sentido HORÁRIO (A→F→E…).'),
    g('N200','G1 X0 Y30.','F'), g('N210','X50. Y60.','E'), g('N220','X70. Y60.','D'), g('N230','X100. Y30.','C'), g('N240','X70. Y0','B'), g('N250','X0 Y0','A'),
    w('N260','G40 G1 X-15. Y-15.','Desligue a compensação saindo da peça'),
    ...F_END(270)
  ]
},
{
  id:9, name:'Pausas e Paradas', sub:'G4, M0, M1, M2, M30', boss:false, machine:'fresa',
  brief:'Esperar no fundo do rebaixo, parar para medir e terminar.',
  tip:'Fanuc: G4 X2. = 2 segundos. Mach 9 usa D, Siemens usa F.',
  aula:{
    intro:'O <b>G4</b> segura a ferramenta parada por um tempo (no Fanuc em X, segundos). <b>M0</b> para o programa até o operador apertar Cycle Start; <b>M1</b> só para se a "parada opcional" estiver ligada no painel. <b>M2</b> e <b>M30</b> terminam o programa.',
    codes:['G4','M0','M1','M2','M30','M5','M9'],
    tips:['Na primeira vez que o G4 aparece, o tempo tem que vir no mesmo bloco.',
          'M0 é para virar a peça, trocar ferramenta à mão, medir. M1 é para inspeção "se quiser".',
          'M30 rebobina o programa (volta ao início). M2 só termina.']
  },
  part:{ stock:[0,0,60,40], prof:'G1 X0 Y0\nX60.\nY40.\nX0\nY0', holes:[[20,20,10]], pts:[['P',20,20]] },
  rows:[
    ...F_HDR('O0009 (PAUSAS)'),
    g('N60','G0 X20. Y20.','Sobre o ponto P'), g('N70','G43 H01 Z5.',''), g('N80','M8',''),
    g('N90','G1 Z-3. F100','Desce 3 mm cortando (rebaixo)'),
    w('N100','G4 X2.','Fique 2 segundos parado no fundo',{alt:['G4 P2000']}),
    w('N110','G0 Z10.','Suba em rápido'),
    w('N120','M9','Desligue a refrigeração'),
    w('N130','M5','Desligue o fuso'),
    w('N140','M0','Parada OBRIGATÓRIA para o operador medir a peça'),
    g('N150','S1500 M3','Religa o fuso'),
    w('N160','M1','Parada OPCIONAL (só para se o botão do painel estiver ligado)'),
    w('N170','G0 G53 Z-110. H00 M5','Volte para a troca e pare o fuso'),
    w('N180','M30','Fim de programa com retorno ao início')
  ]
},
{
  id:10, name:'Furação', sub:'G81, G82 e G80', boss:false, machine:'fresa',
  brief:'Dois furos com G81 e escareado com permanência G82.',
  tip:'G81 X Y Z(fundo) R(aproximação) F. Linhas seguintes com X/Y = mais furos. G80 cancela.',
  aula:{
    intro:'Ciclos fixos fazem a furação inteira numa linha: desce rápido até o plano <b>R</b>, fura em avanço até <b>Z</b>, volta. Enquanto o ciclo estiver ativo, <b>cada linha com X/Y faz outro furo</b>. <b>G80</b> cancela. O <b>G82</b> é igual, mas espera <b>P</b> segundos no fundo.',
    codes:['G81','G82','G80','R','P'],
    tips:['R3. = o ciclo começa a furar 3 mm acima do topo da peça.',
          'Esquecer o G80 = o próximo movimento vira furo!',
          'O livro escreve P .5 (meio segundo). Muitos Fanuc pedem em milésimos: P500.']
  },
  part:{ stock:[0,0,70,45], prof:'G1 X0 Y0\nX70.\nY45.\nX0\nY0', holes:[[20,30,8],[50,15,8]], thick:30, pts:[['F1',20,30],['F2',50,15]] },
  rows:[
    ...F_HDR('O0010 (FURACAO)'),
    w('N60','G0 X20. Y30. M8','Posicione sobre o 1º furo e ligue a refrigeração'),
    w('N70','G43 H01 Z10.','Ative o corretor 01 e desça até Z10'),
    w('N80','G81 X20. Y30. Z-25. R3. F150','Furação simples: furo F1 (X20 Y30), fundo Z-25, plano R a 3 mm, avanço 150'),
    w('N90','X50. Y15.','Segundo furo, em F2 (o ciclo continua ativo)'),
    w('N100','G80','Cancele o ciclo'),
    g('N110','G0 G53 Z-110. H00 M5','Troca'), g('N120','T02 M6 (ESCAREADOR)',''), g('N130','G54',''), g('N140','S1500 M3',''),
    g('N150','G0 X20. Y30. M8',''), g('N160','G43 H02 Z10.','Corretor da ferramenta 02'),
    w('N170','G82 X20. Y30. Z-25. R3. P.5 F150','Furação com PERMANÊNCIA de 0,5 s no fundo, mesmo furo F1',{alt:['G82 X20. Y30. Z-25. R3. P500 F150']}),
    w('N180','X50. Y15.','Mesmo ciclo em F2'),
    w('N190','G80','Cancele o ciclo'),
    ...F_END(200)
  ]
},
{
  id:11, name:'Furo Fundo e Rosca', sub:'G83 (bicadas) e G84 (macho)', boss:false, machine:'fresa',
  brief:'Furo de 60 mm em bicadas de 15 mm e rosca com macho M10x1,5.',
  tip:'G83 … Q15. = bicadas de 15 mm. G84: F = rpm × passo.',
  aula:{
    intro:'Furo fundo entope de cavaco: o <b>G83</b> fura em etapas de <b>Q</b> mm e volta para limpar. O <b>G84</b> rosqueia com macho: desce, inverte o fuso no fundo e sobe. O avanço tem que casar com a rosca: <b>F = rpm × passo</b>.',
    codes:['G83','G84','Q','M29'],
    tips:['Exemplo do livro: 318 rpm × passo 1,5 = <b>F477</b>.',
          'Macho rígido: programe <b>M29 S318</b> antes do G84. Com mandril flutuante, não precisa.',
          'Siemens chama os mesmos ciclos de CYCLE81 a CYCLE86, com MCALL.']
  },
  part:{ stock:[0,0,60,45], prof:'G1 X0 Y0\nX60.\nY45.\nX0\nY0', holes:[[30,15,8],[30,30,8],[25,20,10],[40,30,10]], thick:65, pts:[['F1',30,15],['F2',30,30],['R1',25,20],['R2',40,30]] },
  rows:[
    ...F_HDR('O0011 (FURO E MACHO)'),
    g('N60','G0 X30. Y15. M8',''), g('N70','G43 H01 Z10.',''),
    w('N80','G83 X30. Y15. Z-60. R3. F100 Q15.','Furo F1 com descarga: fundo Z-60, R3, avanço 100, bicadas de 15 mm'),
    w('N90','Y30.','Furo F2 (só muda o Y)'),
    w('N100','G80','Cancele o ciclo'),
    g('N110','G0 G53 Z-110. H00 M5',''), g('N120','T02 M6 (MACHO M10X1.5)',''), g('N130','G54',''),
    w('N140','S318 M3','Rotação do macho: 318 rpm, horário'),
    g('N150','G0 X25. Y20. M8',''), g('N160','G43 H02 Z10.',''),
    w('N170','G84 X25. Y20. Z-15. R5. F477','Rosca com macho em R1: fundo Z-15, R5, F = 318 × 1,5'),
    w('N180','X40. Y30.','Rosca em R2'),
    w('N190','G80','Cancele o ciclo'),
    ...F_END(200)
  ]
},
{
  id:12, name:'Mandrilar e Planos', sub:'G85, G86 e G17 / G18 / G19', boss:false, machine:'fresa',
  brief:'Acabamento de furo com alargador/mandril e troca de plano.',
  tip:'G85 volta em avanço. G86 volta com o fuso parado.',
  aula:{
    intro:'<b>G85</b> desce e <b>sobe em avanço</b> (alargador): o furo sai mais liso que no G81. <b>G86</b> sobe com o fuso parado, para não riscar a parede. E os planos: <b>G17</b> XY, <b>G18</b> XZ, <b>G19</b> YZ — eles dizem em que plano ficam os arcos e a compensação.',
    codes:['G85','G86','G17','G18','G19'],
    tips:['O comando assume G17 ao ligar e depois do M30.',
          'Em G18 os sentidos de G2/G3 e G41/G42 ficam invertidos em relação ao que você vê de cima.',
          'Os ciclos de furação trabalham sempre no eixo Z.']
  },
  part:{ stock:[0,0,60,50], prof:'G1 X0 Y0\nX60.\nY50.\nX0\nY0', holes:[[30,15,12],[30,35,12]], thick:35, pts:[['F1',30,15],['F2',30,35]] },
  rows:[
    ...F_HDR('O0012 (MANDRILAR)'),
    g('N60','G0 X30. Y15. M8',''), g('N70','G43 H01 Z10.',''),
    w('N80','G85 X30. Y15. Z-30. R3. F100','Alargue o furo F1 (volta em avanço): fundo Z-30, R3, avanço 100'),
    w('N90','Y35.','Alargue F2 (X30 Y35)'),
    w('N100','G80','Cancele o ciclo'),
    g('N110','G0 G53 Z-110. H00 M5',''), g('N120','T02 M6 (MANDRIL)',''), g('N130','G54',''), g('N140','S800 M3',''),
    g('N150','G0 X30. Y15. M8',''), g('N160','G43 H02 Z10.',''),
    w('N170','G86 X30. Y15. Z-20. R2. F100','Mandrile F1 (volta com fuso parado): fundo Z-20, R2, avanço 100'),
    w('N180','Y35.','Mandrile F2'),
    w('N190','G80','Cancele o ciclo'),
    w('N200','G18','Selecione o plano XZ (para um perfil visto de frente)'),
    w('N210','G17','Volte para o plano XY'),
    ...F_END(220)
  ]
},
{
  id:13, name:'Subprograma', sub:'M98 P / M99', boss:false, machine:'fresa',
  brief:'Repita 25 vezes um passe de perfil, andando 2 mm em Y a cada vez (exemplo do livro).',
  tip:'M98 P250002 = 25 vezes o O0002. Subprograma termina em M99.',
  aula:{
    intro:'Quando um trecho se repete, ele vira um <b>subprograma</b>: um programa com seu próprio número <b>O</b>, que termina em <b>M99</b>. O principal chama com <b>M98 P</b>: os <b>4 últimos dígitos</b> são o número do subprograma e os da frente, quantas vezes repetir.',
    codes:['M98','M99','G91','G90','G18'],
    tips:['M98 P250002 → 25 repetições do O0002. M98 P0002 → uma vez só.',
          'O truque do livro: o subprograma começa com <b>G91 G1 Y2.</b> (anda 2 mm a mais em Y, incremental) e logo volta para <b>G90</b>.',
          'Mach 9 faz isso com H (início) E (fim) L (repetições). Siemens com REPEAT AAA BBB P25.']
  },
  part:{ stock:[-5,0,150,52], prof:'G1 X-5. Y0\nX150.\nY52.\nX-5.\nY0', pts:[] },
  rows:[
    g('','O0013 (PRINCIPAL)','Programa principal'),
    g('N10','G18 G21 G90 G94','Plano XZ, mm, absoluto, mm/min'),
    g('N20','G53 G0 Z-110. H00','Troca'),
    w('N30','T01 M6 (FRESA ESFERICA D10)','Troque para a ferramenta 01'),
    g('N40','G54 S2000 M3','Zero-peça e fuso'),
    g('N50','G0 X-15. Y0 M8','Posiciona'),
    g('N60','G43 G0 Z10. H01 D01','Corretores'),
    w('N70','M98 P250002','Chame o subprograma O0002 vinte e cinco vezes'),
    w('N80','G53 G0 Z-110. H00 M5 M9','Volte à troca, pare o fuso e a refrigeração'),
    w('N90','M30','Fim do programa principal'),
    g('','O0002 (SUBPROGRAMA)','Subprograma'),
    w('N10','G91 G1 Y2. F1000','INCREMENTAL: avance 2 mm em Y, avanço 1000'),
    w('N20','G90 G42 X-5. Z0 F500','Volte para ABSOLUTO, ligue a compensação à direita e vá até X-5 Z0, avanço 500'),
    g('N30','G1 X20.',''), g('N40','G3 X40. Z-20. R20.',''), g('N50','G1 Z-25.',''), g('N60','G2 X50. Z-35. R10.',''),
    g('N70','G1 X90.',''), g('N80','G2 X100. Z-25. R10.',''), g('N90','G1 Z-20.',''), g('N100','G3 X120. Z0 R20.',''), g('N110','G1 X145.',''),
    w('N120','G40','Desligue a compensação'),
    g('N130','G0 X155. Z10.',''), g('N140','G0 X-15.',''),
    w('N150','M99','Fim do subprograma (volta ao principal)')
  ]
},
{
  id:14, name:'Coordenada Polar', sub:'G16, G15 e G52', boss:false, machine:'fresa',
  brief:'O exemplo polar do livro (fig. 8): raio + ângulo em vez de X e Y.',
  tip:'Com G16: X = raio, Y = ângulo. G52 muda o centro provisoriamente.',
  aula:{
    intro:'Quando o desenho dá <b>raio e ângulo</b>, use polar. No Fanuc: <b>G16</b> liga (X vira raio, Y vira ângulo em graus, + anti-horário), <b>G15</b> desliga. O centro polar é o zero atual; para mudar, use <b>G52 X Y</b> (zero provisório) e desfaça com <b>G52 X0 Y0</b>.',
    codes:['G16','G15','G52'],
    tips:['Ponto a 53,574 mm do zero num ângulo de 37° = X42,786 Y32,242 em cartesiano. O comando faz a conta.',
          'Ao sair do polar (G15), desligue e religue a compensação de raio, como no exemplo do livro.',
          'Siemens: G111 X Y define o centro, AP= ângulo, RP= raio.']
  },
  part:{ stock:[0,0,70,60], prof:'G1 X0 Y0\nX42.786 Y32.242\nG3 X46.227 Y56.641 R20.\nG1 X0\nY0', pts:[['A',0,0],['B',42.786,32.242],['C',46.227,56.641]] },
  rows:[
    ...F_HDR('O0014 (POLAR)'),
    g('N60','G0 X-15. Y-15.',''), g('N70','G43 H01 Z10.',''),
    g('N80','G1 Z-2. F1000','Penetra'),
    g('N90','G1 G42 X0 Y0 F500','Compensação, até A'),
    w('N100','G16 G90 G1 X53.574 Y37.','Ligue a POLAR e vá até B: raio 53,574, ângulo 37°'),
    w('N110','G52 X28.906 Y46.641','Desloque o zero provisoriamente para o CENTRO do arco (X28,906 Y46,641)'),
    w('N120','G3 X20. Y30. R20.','Arco anti-horário R20 até C: em polar, raio 20 e ângulo 30° a partir do novo centro'),
    w('N130','G52 X0 Y0','Desfaça o deslocamento de zero'),
    w('N140','G15 G40','Desligue a polar e a compensação'),
    g('N150','G1 G42 X0 Y56.641','Religa a compensação'), g('N160','G1 Y0',''), g('N170','G1 G40 X-20. Y-20.',''),
    ...F_END(180)
  ]
},
{
  id:15, name:'Bolsas', sub:'G71/G72 retangular e G12/G13 circular', boss:false, machine:'fresa',
  brief:'Uma bolsa 80 x 45 e uma bolsa redonda de raio 40, desbaste + acabamento.',
  tip:'Bolsa retangular: G71 X(compr.) Y(larg.) Q D F, a partir do CENTRO.',
  aula:{
    intro:'Bolsa (alojamento) é um rebaixo fechado. No Fanuc do livro: <b>G71</b>/<b>G72</b> = bolsa retangular (horário/anti-horário) e <b>G12</b>/<b>G13</b> = bolsa circular. A ferramenta começa no <b>centro</b> da bolsa. Primeiro um desbaste deixando sobra, depois o acabamento na medida.',
    codes:['G71','G72','G12','G13','Q','D'],
    tips:['Retangular: <b>G71 X79. Y44. Q5. D1 F300</b> = 79 × 44, passo de 5 mm, corretor D1. Acabamento: X80. Y45.',
          'Circular desbaste: <b>G12 I5. K39.5 Q5. D1 F300</b> (do raio 5 ao 39,5). Acabamento: <b>G12 I40. R28. D1 F300</b>.',
          'Como a fresa entra pelo topo, o livro recomenda pré-furar o centro.']
  },
  part:{ stock:[0,0,230,120], prof:'G1 X0 Y0\nX230.\nY120.\nX0\nY0', pockets:[{rect:[60,42.5,80,45]},{circle:[170,70,40]}], pts:[['C1',60,42.5],['C2',170,70]] },
  rows:[
    ...F_HDR('O0015 (BOLSAS)','01',2000),
    w('N60','G0 X60. Y42.5 M8','Posicione no CENTRO da bolsa retangular (C1)'),
    g('N70','G43 Z10. H01',''), g('N80','G0 Z5.',''),
    g('N90','G1 Z-5. F200','Penetração de desbaste'),
    w('N100','G71 X79. Y44. Q5. D1 F300','Desbaste: 79 x 44 (deixa 0,5 por lado), passo 5, corretor D1, avanço 300'),
    g('N110','G0 X60. Y42.5 Z0',''), g('N120','G1 Z-5. F200','Penetração de acabamento'),
    w('N130','G71 X80. Y45. Q5. D1 F300','Acabamento na medida final 80 x 45'),
    g('N140','G0 Z5.',''),
    w('N150','G0 X170. Y70.','Posicione no centro da bolsa circular (C2)'),
    g('N160','G1 Z-5. F200','Penetração'),
    w('N170','G12 I5. K39.5 Q5. D1 F300','Desbaste circular horário do raio 5 até o raio 39,5, passo 5, D1, F300'),
    g('N180','G0 X170. Y70. Z0',''), g('N190','G1 Z-5. F200',''),
    w('N200','G12 I40. R28. D1 F300','Acabamento no raio 40, aproximação R28'),
    ...F_END(210)
  ]
},
{
  id:16, name:'Tradutor', sub:'Mach 9 e Siemens', boss:false, machine:'fresa', ctrl:'multi', sim:false,
  brief:'O livro ensina três comandos. Escreva o mesmo pedido em cada um.',
  tip:'Siemens usa NOME=valor (CR=, RND=, CHF=, AP=, RP=).',
  aula:{
    intro:'Os comandos fazem as mesmas coisas com palavras diferentes. <b>Siemens</b>: raio do arco <b>CR=</b>, arredondar <b>RND=</b>, chanfrar <b>CHF=</b>, pausa <b>G4 F</b>, polar <b>G111</b> + <b>AP=</b>/<b>RP=</b>, ciclos com <b>MCALL</b>, repetição <b>REPEAT</b>. <b>Mach 9</b>: I/J absolutos, pausa <b>G4 D</b>, repetição <b>H E L</b>, milímetros <b>G71</b>.',
    codes:[],
    tips:['Veja a tabela comparativa completa no Manual.',
          'No Siemens e no Mach 9, G71 = milímetros (no Fanuc é G21).',
          'MCALL sozinho cancela o ciclo no Siemens (equivale ao G80).']
  },
  part:null,
  rows:[
    w('1','G2 X60. Y0 CR=15.','SIEMENS — arco horário até X60 Y0 com raio 15'),
    w('2','G1 X60. RND=10.','SIEMENS — linha até X60 arredondando o canto com raio 10'),
    w('3','G1 Y60. CHF=5.','SIEMENS — linha até Y60 com chanfro de 5 mm'),
    w('4','G4 F5.','SIEMENS — pausa de 5 segundos'),
    w('5','G4 D5.','MACH 9 — pausa de 5 segundos'),
    w('6','G4 X5.','FANUC — pausa de 5 segundos',{alt:['G4 P5000']}),
    w('7','G2 X60. Y0 I45. J0','MACH 9 — arco horário até X60 Y0; o centro está em X45 Y0 (I/J ABSOLUTOS)'),
    w('8','G1 X35. Q5.','MACH 9 — linha até X35 arredondando o canto com raio 5 (Q+)'),
    w('9','G111 X0 Y0','SIEMENS — defina o centro polar em X0 Y0'),
    w('10','G1 AP=37. RP=53.574','SIEMENS — linha polar: ângulo 37°, raio 53,574'),
    w('11','MCALL','SIEMENS — cancele o ciclo de furação (equivale ao G80)',{raw:true}),
    w('12','REPEAT AAA BBB P25','SIEMENS — repita do rótulo AAA até BBB, 25 vezes',{raw:true}),
    w('13','H90 E240 L25','MACH 9 — repita do bloco N90 até o N240, 25 vezes'),
    w('14','G71','MACH 9 ou SIEMENS — coordenadas em milímetros')
  ]
},
{
  id:17, name:'Placa do Livro', sub:'Programa completo do centro de usinagem', boss:true, machine:'fresa',
  brief:'Contorno da fig. 2 com compensação + dois furos. Do O ao M30.',
  tip:'Segurança → troca → zero → fuso → posiciona → G43 → desce → G42 → perfil → G40 → furos → fim.',
  aula:{
    intro:'O <b>fluxograma Fanuc</b> do livro, inteiro: duas ferramentas (fresa de topo e broca), contorno compensado com arcos e dois furos com G81.',
    codes:[],
    tips:['Use o fluxo do Manual como roteiro.', 'Os arcos podem ser com R ou com I/J.', 'Não esqueça o G80 depois dos furos.']
  },
  part:{ ...FIG2, holes:[[40,60,10],[110,60,10]] },
  rows: W([
    w('','O0017 (PLACA)','Número do programa 0017, comentário PLACA (opcional)'),
    w('N10','G17 G21 G40 G54 G80 G90','Bloco de segurança'),
    w('N20','G0 G53 Z-110. H00 M5','Sobe para a troca, cancela corretor, para o fuso'),
    w('N30','T01 M6','Ferramenta 01 (fresa de topo)'),
    w('N40','G54','Zero-peça'),
    w('N50','S1500 M3','1500 rpm horário'),
    w('N60','G0 X-15. Y-15.','Posiciona fora da peça'),
    w('N70','G43 H01 Z10.','Corretor de comprimento 01, Z10'),
    w('N80','G0 Z5. M8','Aproxima com refrigeração'),
    w('N90','G1 Z-5. F800','Penetra 5 mm, F800'),
    w('N100','G42 D01 G1 X0 Y0 F400','Liga compensação (D01) entrando em A, F400 (contorno anti-horário)'),
    w('N110','G1 X30. Y0','Até B'),
    w('N120','G2 X60. Y0 R15.','Arco R15 até C',{alt:['G2 X60. Y0 I15. J0','G2 X60. Y0 I15.']}),
    w('N130','G1 X140. Y0','Até D'),
    w('N140','G3 X150. Y10. R10.','Arco R10 até E',{alt:['G3 X150. Y10. I0 J10.','G3 X150. Y10. J10.']}),
    w('N150','G1 X150. Y100.','Até F'),
    w('N160','G2 X130. Y120. R20.','Arco R20 até G',{alt:['G2 X130. Y120. I0 J20.','G2 X130. Y120. J20.']}),
    w('N170','G1 X15. Y120.','Até H'),
    w('N180','G3 X0 Y105. R15.','Arco R15 até I',{alt:['G3 X0 Y105. I0 J-15.','G3 X0 Y105. J-15.']}),
    w('N190','G1 X0 Y0','Até A'),
    w('N200','G40 G1 X-15. Y-15.','Desliga a compensação saindo'),
    w('N210','G0 Z10. M9','Afasta e desliga refrigeração'),
    w('N220','G0 G53 Z-110. H00 M5','Volta para a troca'),
    w('N230','T02 M6','Ferramenta 02 (broca)'),
    w('N240','G54','Zero-peça'),
    w('N250','S1200 M3','1200 rpm horário'),
    w('N260','G0 X40. Y60. M8','Sobre o 1º furo (X40 Y60), refrigeração'),
    w('N270','G43 H02 Z10.','Corretor 02, Z10'),
    w('N280','G81 X40. Y60. Z-20. R3. F120','Furo 1: fundo Z-20, R3, F120'),
    w('N290','X110. Y60.','Furo 2 em X110 Y60',{alt:['X110.']}),
    w('N300','G80','Cancela o ciclo'),
    w('N310','G0 Z10. M9','Afasta e desliga refrigeração'),
    w('N320','G0 G53 Z-110. H00 M5','Volta para a troca'),
    w('N330','M30','Fim de programa')
  ])
}
];
LEVELS_FRESA.forEach(l=>l.machine='fresa');
LEVELS_TORNO.forEach(l=>l.machine='torno');

/* =========================================================================
   MODO INFINITO — peças aleatórias
   ========================================================================= */
function rnd(a,b){ return a+Math.floor(Math.random()*(b-a+1)); }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
const f1 = v => { const s=String(+v.toFixed(3)); return s.includes('.')?s:s+'.'; };

function makeEndlessLevel(run){
  const D=pick([40,44,50,52,56,60]);
  const nSteps=rnd(2,3), ch=pick([1,2]);
  let d=D-pick([4,6,8]); const diam=[];
  for(let i=0;i<nSteps;i++){ diam.unshift(d); d-=pick([6,8,10]); if(d<12) break; }
  const ds=diam.slice(-nSteps);
  let z=0; const segs=[];
  ds.forEach((dd,i)=>{ z-=pick([10,12,15,18,20]); segs.push({d:dd, z}); });
  const tool=pick(['T0202 (ACABAMENTO)','T0404 (ACABAMENTO)']);
  const vc=pick([250,280,300]);
  const rows=[...T_HDR(`O${8000+run}`, tool, vc, 3500)];
  rows[7]=w('N70',tool,`Chame a ferramenta ${tool.slice(1,3)} com corretor ${tool.slice(3,5)} (acabamento)`);
  rows[8]=w('N80','G96 S'+vc,`Velocidade de corte constante de ${vc} m/min`);
  rows.push(w('N100','G0 Z3. M8','Aproxime a 3 mm da face com refrigeração'));
  rows.push(w('N110',`X${f1(D+4)}`,`Rápido até ø${D+4} (acima do bruto)`,{alt:[`G0 X${f1(D+4)}`]}));
  const d0=ds[0], ax=d0-2*ch-2;
  rows.push(w('N120',`G0 X${f1(ax)} Z1.`,`Ponto de ataque: ø${ax}, Z1 (alinhado com o chanfro ${ch}x45°)`));
  rows.push(w('N130',`G1 X${f1(d0)} Z${f1(-ch)} F0.1`,`Chanfro até ø${d0} Z-${ch}, avanço 0,1`));
  let n=140, prof=`G1 X0 Z0\nX${d0-2*ch}\nX${d0} Z-${ch}`;
  const pts=[['A',ax,1],['B',d0,-ch]];
  let L='C';
  segs.forEach((s,i)=>{
    rows.push(w('N'+n,`G1 Z${f1(s.z)}`,`Cilindro ø${s.d} até Z${s.z} (ponto ${L})`)); n+=10;
    pts.push([L,s.d,s.z]); prof+=`\nZ${s.z}`; L=String.fromCharCode(L.charCodeAt(0)+1);
    const nx=segs[i+1];
    if(nx){
      const cone=Math.random()<.4;
      if(cone){ const zz=s.z-4; rows.push(w('N'+n,`G1 X${f1(nx.d)} Z${f1(zz)}`,`Cone até ø${nx.d} Z${zz} (ponto ${L})`)); pts.push([L,nx.d,zz]); prof+=`\nX${nx.d} Z${zz}`; }
      else { rows.push(w('N'+n,`G1 X${f1(nx.d)}`,`Degrau até ø${nx.d} (ponto ${L})`)); pts.push([L,nx.d,s.z]); prof+=`\nX${nx.d}`; }
      n+=10; L=String.fromCharCode(L.charCodeAt(0)+1);
    }
  });
  rows.push(w('N'+n,`G1 X${f1(D+4)}`,'Saia da peça subindo')); n+=10;
  rows.push(w('N'+n,'G0 X100. Z50.','Afaste para a segurança')); n+=10;
  rows.push(...T_END(n));
  const last=segs[segs.length-1];
  prof+=`\nX${D}\nZ${last.z-15}`;
  return { id:'∞', endless:true, machine:'torno', name:`Peça aleatória #${run}`, sub:'Modo Infinito',
    brief:'Peça gerada na hora: cabeçalho de acabamento + perfil ponto a ponto.',
    tip:'Chanfro: o ataque fica 1 mm antes da face, alinhado a 45°.', aula:null,
    part:{stock:[D, -(last.z-15)], face:0, prof, pts}, rows };
}

function makeEndlessLevelFresa(run){
  const Wd=pick([60,70,80,90,100]), H=pick([40,50,60]);
  const r=pick([5,8,10]), c=pick([3,5]);
  const T=pick(['01','02','03']), S=pick([1200,1500,1800,2000]), F=pick([200,250,300,400]);
  const rows=[
    g('',`O${String(8000+run).slice(-4)}`,'Número do programa'),
    g('N10','G17 G21 G40 G54 G80 G90','Segurança'),
    g('N20','G0 G53 Z-110. H00 M5','Troca'),
    w('N30',`T${T} M6`,`Troque para a ferramenta ${T}`),
    g('N40','G54',''),
    w('N50',`S${S} M3`,`${S} rpm, horário`),
    g('N60','G0 X-15. Y-15.',''),
    w('N70',`G43 H${T} Z10.`,`Corretor de comprimento ${T}, desça até Z10`),
    g('N80','G0 Z5. M8',''),
    w('N90',`G1 Z-5. F${F}`,`Penetre 5 mm, avanço ${F}`),
    w('N100','G42 D01 G1 X0 Y0',`Compensação D01 entrando em A — contorno anti-horário, externo`),
    w('N110',`G1 X${f1(Wd)},R${f1(r)}`,`Até B (X${Wd}) arredondando o canto com R${r}`),
    w('N120',`G1 Y${f1(H)},C${f1(c)}`,`Até C (Y${H}) com chanfro de ${c} mm`),
    w('N130','G1 X0',`Até D (X0)`),
    w('N140','G1 Y0','Até A (Y0)'),
    w('N150','G40 G1 X-15. Y-15.','Desliga a compensação saindo'),
    g('N160','G0 Z10.','')
  ];
  const cyc=pick([81,83]), hx=[Math.round(Wd*0.3), Math.round(Wd*0.7)], hy=Math.round(H/2), Z=-pick([10,15,20]);
  const q= cyc===83 ? ` Q${f1(pick([3,5]))}` : '';
  rows.push(w('N170',`G${cyc} X${f1(hx[0])} Y${f1(hy)} Z${f1(Z)} R3. F100${q}`,
    `Furo 1 em X${hx[0]} Y${hy}: ${cyc===83?'com DESCARGA (bicadas'+q.replace(' Q',' de ')+' mm)':'furação simples'}, fundo Z${Z}, R3, F100`));
  rows.push(w('N180',`X${f1(hx[1])}`,`Furo 2 em X${hx[1]} (mesmo Y)`));
  rows.push(w('N190','G80','Cancele o ciclo'));
  rows.push(...F_END(200));
  return { id:'∞', endless:true, machine:'fresa', name:`Placa aleatória #${run}`, sub:'Modo Infinito',
    brief:'Contorno com canto arredondado e chanfro + dois furos.', tip:'Fanuc: ,R e ,C com vírgula.', aula:null,
    part:{stock:[0,0,Wd,H], prof:`G1 X0 Y0\nX${Wd-r}\nG3 X${Wd} Y${r} R${r}\nG1 Y${H-c}\nX${Wd-c} Y${H}\nX0\nY0`, holes:[[hx[0],hy,8],[hx[1],hy,8]],
      pts:[['A',0,0],['B',Wd,0],['C',Wd,H],['D',0,H]]}, rows };
}
