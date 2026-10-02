/* =========================================================================
   CNC CÓDIGO — dicionário de códigos (base: livro SENAI "Programação e
   Operação de Centro de Usinagem" + padrão Fanuc de torno usado nas aulas)
   Cada entrada: n = nome curto, d = explicação, ex = exemplo de bloco,
   g = grupo (para comparar "trocou por outro do mesmo grupo"), m = máquina
   ('torno' | 'fresa' | ambos quando omitido)
   ========================================================================= */
'use strict';

const GROUPS = {
  mot:'tipo de movimento (G0 / G1 / G2 / G3)', plane:'plano de trabalho', unit:'unidade',
  abs:'absoluto / incremental', feed:'modo de avanço', comp:'compensação de raio', css:'controle de rotação',
  cyc:'ciclo', polar:'coordenada polar', wcs:'zero-peça', spin:'eixo-árvore (fuso)', cool:'refrigeração',
  stop:'parada / fim', sub:'subprograma', tool:'troca de ferramenta', hlen:'corretor de comprimento', misc:'função especial'
};

const G_COMMON = {
  0:{n:'Avanço rápido', g:'mot', d:'Posiciona a ferramenta na velocidade MÁXIMA da máquina. Só para aproximar e afastar — nunca para cortar material.', ex:'G0 X54. Z3.'},
  1:{n:'Interpolação linear (corte em reta)', g:'mot', d:'Move em linha reta CORTANDO, na velocidade de avanço F. É o movimento de usinagem.', ex:'G1 Z-20. F0.2'},
  2:{n:'Interpolação circular HORÁRIA', g:'mot', d:'Corta um arco no sentido horário. Precisa do ponto final e do raio (R) ou do centro (I/J/K).', ex:'G2 X40. Z-40. R5.'},
  3:{n:'Interpolação circular ANTI-HORÁRIA', g:'mot', d:'Corta um arco no sentido anti-horário. Precisa do ponto final e do raio (R) ou do centro (I/J/K).', ex:'G3 X50. Z-42.5 R2.5'},
  4:{n:'Tempo de permanência (pausa)', g:'misc', d:'A ferramenta fica parada no lugar por um tempo. No Fanuc o tempo vai em X (segundos) ou P (milésimos): G4 X2. = 2 s = G4 P2000. Não é modal: só vale naquele bloco.', ex:'G4 X2.'},
  20:{n:'Unidade em polegadas', g:'unit', d:'Todas as medidas passam a ser em polegadas. No Brasil quase não se usa.', ex:'G20'},
  21:{n:'Unidade em milímetros', g:'unit', d:'Todas as medidas em milímetros. Vai no bloco de segurança do início.', ex:'G21'},
  28:{n:'Retorno à referência da máquina', g:'misc', d:'Manda o eixo voltar ao ponto de referência (a "casa" da máquina). No torno: G28 U0. recolhe o X e G28 W0. recolhe o Z — U0/W0 quer dizer "sem ponto intermediário".', ex:'G28 U0.'},
  40:{n:'Cancela a compensação de raio', g:'comp', d:'Desliga o G41/G42. Vai no bloco de segurança e logo depois de terminar o perfil compensado.', ex:'G40'},
  41:{n:'Compensação de raio à ESQUERDA', g:'comp', d:'A ferramenta anda à ESQUERDA do perfil (olhando no sentido do movimento). O comando desloca o centro da ferramenta pelo valor do raio.', ex:'G41 D01'},
  42:{n:'Compensação de raio à DIREITA', g:'comp', d:'A ferramenta anda à DIREITA do perfil (olhando no sentido do movimento). No torno externo (corte da direita para a esquerda) é o G42.', ex:'G42'},
  54:{n:'Zero-peça nº 1', g:'wcs', d:'Usa o zero-peça gravado na posição G54 (o ponto 0 das medidas do desenho). Existem G54 a G59.', ex:'G54'},
  55:{n:'Zero-peça nº 2', g:'wcs', d:'Segundo zero-peça (para uma segunda fixação).', ex:'G55'},
  56:{n:'Zero-peça nº 3', g:'wcs', d:'Terceiro zero-peça.', ex:'G56'},
  57:{n:'Zero-peça nº 4', g:'wcs', d:'Quarto zero-peça.', ex:'G57'},
  58:{n:'Zero-peça nº 5', g:'wcs', d:'Quinto zero-peça.', ex:'G58'},
  59:{n:'Zero-peça nº 6', g:'wcs', d:'Sexto zero-peça.', ex:'G59'},
  90:{n:'Coordenadas ABSOLUTAS', g:'abs', d:'Toda medida é contada a partir do zero-peça. É o padrão.', ex:'G90'},
  91:{n:'Coordenadas INCREMENTAIS', g:'abs', d:'Toda medida é contada a partir de onde a ferramenta está agora (quanto andar).', ex:'G91 G1 Y2. F1000'}
};

const G_TORNO = {
  70:{n:'Ciclo de ACABAMENTO', g:'cyc', d:'Passa uma vez pelo perfil final que está entre os blocos P e Q (o mesmo perfil do G71/G72), tirando o sobremetal que sobrou.', ex:'G70 P200 Q280'},
  71:{n:'Ciclo de DESBASTE longitudinal', g:'cyc', d:'Tira o material em passes paralelos ao eixo Z (ao longo da peça). São DOIS blocos: G71 U(prof. por passe) R(recuo) e G71 P(1º bloco do perfil) Q(último) U(sobremetal em X) W(sobremetal em Z) F(avanço).', ex:'G71 U1. R1.'},
  72:{n:'Ciclo de DESBASTE TRANSVERSAL (faceamento)', g:'cyc', d:'Tira material em passes paralelos à face (descendo em X). DOIS blocos: G72 W(prof. por passe) R(recuo) e G72 P Q U W F.', ex:'G72 W1. R1.'},
  74:{n:'Ciclo de FURAÇÃO com bicadas (eixo Z)', g:'cyc', d:'Fura no centro dando bicadas para quebrar o cavaco. DOIS blocos: G74 R(recuo) e G74 Z(fundo) Q(bicada em MÍCRONS: 3000 = 3 mm) F.', ex:'G74 Z-14. Q3000 F0.1'},
  75:{n:'Ciclo de CANAL com bicadas (eixo X)', g:'cyc', d:'Mergulha o bedame em X dando bicadas. DOIS blocos: G75 R(recuo) e G75 X(fundo do canal) P(bicada em MÍCRONS: 1000 = 1 mm) F.', ex:'G75 X17. P1000 F0.05'},
  76:{n:'Ciclo de ROSCA', g:'cyc', d:'Faz a rosca em vários passes. DOIS blocos: G76 P(acab./saída/ângulo) Q(passe mínimo) R(sobremetal) e G76 X(diâmetro do fundo) Z(fim) P(altura do filete em mícrons) Q(1º passe em mícrons) F(PASSO).', ex:'G76 X18.16 Z-18. P920 Q300 F1.5'},
  92:{n:'Limite de rotação máxima (com S)', g:'misc', d:'G92 S2500 = o fuso NUNCA passa de 2500 rpm. Obrigatório antes de usar G96, senão no centro da peça a rotação dispara. (Em alguns Fanuc esse código é o G50.)', ex:'G92 S2500 M3'},
  50:{n:'Limite de rotação máxima (outros Fanuc)', g:'misc', d:'Mesma função do G92 S em comandos Fanuc "sistema A". Na máquina da escola usa-se G92.', ex:'G50 S2500'},
  94:{n:'Avanço em mm por MINUTO', g:'feed', d:'F passa a valer milímetros por minuto (padrão da fresa).', ex:'G94'},
  95:{n:'Avanço em mm por ROTAÇÃO', g:'feed', d:'F passa a valer milímetros por volta da peça (padrão do torno). F0.1 = 0,1 mm a cada volta.', ex:'G95'},
  96:{n:'Velocidade de corte CONSTANTE', g:'css', d:'S vira velocidade de corte em m/min. O comando aumenta a rotação sozinho quando o diâmetro diminui. Use com G92 S (limite).', ex:'G96 S200'},
  97:{n:'Rotação FIXA (rpm)', g:'css', d:'S vira rotação em rpm, fixa. Use para furar no centro (X0) e para rosquear.', ex:'G97 S1500 M3'}
};

const G_FRESA = {
  12:{n:'Bolsa circular, sentido HORÁRIO', g:'cyc', d:'Usina uma bolsa redonda a partir do centro (posição atual). Desbaste: G12 I(raio inicial) K(raio final) Q(passo) D F. Acabamento: G12 I(raio final) R(aproximação) D F.', ex:'G12 I5. K39.5 Q5. D1 F300'},
  13:{n:'Bolsa circular, sentido ANTI-HORÁRIO', g:'cyc', d:'Igual ao G12, girando no sentido anti-horário.', ex:'G13 I40. R28. D1 F300'},
  15:{n:'Cancela coordenada polar', g:'polar', d:'Volta X e Y a serem coordenadas normais (cartesianas).', ex:'G15 G40'},
  16:{n:'Ativa coordenada polar', g:'polar', d:'No plano G17, X vira o RAIO e Y vira o ÂNGULO (graus, + anti-horário).', ex:'G16 G90 G1 X53.574 Y37.'},
  17:{n:'Plano XY', g:'plane', d:'Arcos e compensação no plano XY (visto de cima). É o padrão da fresa.', ex:'G17'},
  18:{n:'Plano XZ', g:'plane', d:'Arcos no plano XZ (perfil visto de frente). Atenção: G2/G3 e G41/G42 ficam ao contrário do G17.', ex:'G18'},
  19:{n:'Plano YZ', g:'plane', d:'Arcos no plano YZ (visto de lado).', ex:'G19'},
  43:{n:'Ativa o corretor de COMPRIMENTO da ferramenta', g:'hlen', d:'Soma o comprimento da ferramenta guardado no corretor H. Vai junto da primeira descida em Z: G43 H01 Z10.', ex:'G43 H01 Z10.'},
  49:{n:'Cancela o corretor de comprimento', g:'hlen', d:'Desliga o G43 (alguns usam H00 no lugar).', ex:'G49'},
  52:{n:'Deslocamento temporário do zero', g:'misc', d:'Cria um zero provisório em X Y. G52 X0 Y0 desfaz. Usado com polar para "fingir" o centro de um arco.', ex:'G52 X28.906 Y46.641'},
  53:{n:'Coordenada de MÁQUINA', g:'misc', d:'Aquele bloco usa o zero da MÁQUINA, não o da peça. G0 G53 Z-110. sobe o Z até perto da troca de ferramenta.', ex:'G0 G53 Z-110. H00 M5'},
  71:{n:'Bolsa RETANGULAR, sentido horário', g:'cyc', d:'(Fanuc do livro) Usina uma bolsa retangular centrada na posição atual: G71 X(comprimento) Y(largura) Q(passo, raio) D(corretor) F.', ex:'G71 X79. Y44. Q5. D1 F300'},
  72:{n:'Bolsa RETANGULAR, sentido anti-horário', g:'cyc', d:'Igual ao G71 de bolsa, girando no sentido anti-horário.', ex:'G72 X80. Y45. Q5. D1 F300'},
  80:{n:'Cancela ciclo fixo', g:'cyc', d:'Desliga o ciclo de furação ativo. Sem ele, todo movimento seguinte faria um furo!', ex:'G80'},
  81:{n:'Ciclo de FURAÇÃO simples', g:'cyc', d:'G81 X Y Z(fundo) R(plano de aproximação) F. Fura e volta em rápido. Cada linha seguinte com X/Y faz outro furo.', ex:'G81 X20. Y30. Z-25. R3. F150'},
  82:{n:'Furação com PERMANÊNCIA no fundo', g:'cyc', d:'Igual ao G81, mas espera P segundos no fundo (bom para rebaixos e escareados).', ex:'G82 X20. Y30. Z-25. R3. P.5 F150'},
  83:{n:'Furação com DESCARGA de cavaco (bicadas)', g:'cyc', d:'Fura em etapas de Q mm, voltando para tirar o cavaco. Para furos fundos.', ex:'G83 X30. Y15. Z-60. R3. F100 Q15.'},
  84:{n:'Ciclo de ROSCAR com macho', g:'cyc', d:'Rosca à direita com macho. F = rpm × passo. Para macho rígido programe antes M29 S___.', ex:'G84 X25. Y20. Z-15. R5. F477'},
  85:{n:'MANDRILAR / alargar', g:'cyc', d:'Desce em avanço e VOLTA em avanço (acabamento melhor que o G81).', ex:'G85 X30. Y15. Z-30. R3. F100'},
  86:{n:'MANDRILAR (melhor acabamento)', g:'cyc', d:'Desce em avanço e volta com o fuso parado, para não riscar a parede.', ex:'G86 X30. Y15. Z-20. R2. F100'},
  94:{n:'Avanço em mm por MINUTO', g:'feed', d:'F em mm/min — padrão da fresa. F300 = 300 mm a cada minuto.', ex:'G94'},
  95:{n:'Avanço em mm por ROTAÇÃO', g:'feed', d:'F em mm por volta do fuso.', ex:'G95'}
};

const M_CODES = {
  0:{n:'Parada OBRIGATÓRIA do programa', g:'stop', d:'Para tudo (avanço, fuso e refrigeração) até o operador apertar Cycle Start. Usado para virar a peça, limpar cavaco, medir.', ex:'M0'},
  1:{n:'Parada OPCIONAL', g:'stop', d:'Só para se o operador ligar o botão "parada opcional" no painel. Senão o programa passa direto.', ex:'M1'},
  2:{n:'Fim de programa', g:'stop', d:'Termina o programa (sem voltar ao início em alguns comandos).', ex:'M2'},
  3:{n:'Liga o fuso — sentido HORÁRIO', g:'spin', d:'Faz o eixo-árvore girar no sentido horário, na rotação S. É o sentido normal de corte.', ex:'M3'},
  4:{n:'Liga o fuso — sentido ANTI-HORÁRIO', g:'spin', d:'Gira ao contrário (ferramentas invertidas, algumas roscas à esquerda).', ex:'M4'},
  5:{n:'DESLIGA o fuso', g:'spin', d:'Para a rotação do eixo-árvore. Cancela M3 e M4.', ex:'M5'},
  6:{n:'TROCA de ferramenta', g:'tool', d:'(Fresa) Libera a troca: T01 M6 coloca a ferramenta 1 no fuso.', ex:'T01 M6', m:'fresa'},
  8:{n:'LIGA a refrigeração', g:'cool', d:'Liga a bomba do fluido de corte.', ex:'G0 Z3. M8'},
  9:{n:'DESLIGA a refrigeração', g:'cool', d:'Desliga a bomba do fluido de corte.', ex:'M9'},
  13:{n:'Fuso horário + refrigeração', g:'spin', d:'Em algumas máquinas, liga M3 e M8 juntos.', ex:'M13'},
  14:{n:'Fuso anti-horário + refrigeração', g:'spin', d:'Em algumas máquinas, liga M4 e M8 juntos.', ex:'M14'},
  29:{n:'Macho RÍGIDO', g:'misc', d:'(Fresa) Sincroniza fuso e avanço para roscar com macho rígido. Vai antes do G84: M29 S318.', ex:'M29 S318', m:'fresa'},
  30:{n:'FIM de programa e volta ao início', g:'stop', d:'Termina o programa, desliga tudo e volta o cursor para o começo — pronto para a próxima peça.', ex:'M30'},
  98:{n:'CHAMA um subprograma', g:'sub', d:'M98 P250002 = executa o subprograma O0002 vinte e cinco vezes (4 últimos dígitos = número; os da frente = repetições).', ex:'M98 P250002'},
  99:{n:'FIM do subprograma', g:'sub', d:'Última linha do subprograma: volta para o programa principal.', ex:'M99'}
};

/* endereços (letras) — o texto pode depender da máquina */
const ADDR = {
  O:{n:'número do programa', d:'O seguido de 4 dígitos identifica o programa: O7044.'},
  N:{n:'número do bloco', d:'Etiqueta da linha (N10, N20…). É opcional, mas os ciclos (P/Q) apontam para ela.'},
  G:{n:'função preparatória', d:'Diz COMO a máquina vai se mover ou se comportar.'},
  M:{n:'função auxiliar (miscelânea)', d:'Liga/desliga coisas da máquina: fuso, refrigeração, fim de programa.'},
  X:{t:'diâmetro (torno: X é SEMPRE diâmetro)', f:'posição no eixo X'},
  Y:{t:'(o torno não tem Y)', f:'posição no eixo Y'},
  Z:{t:'posição no comprimento (negativo = para dentro da peça)', f:'altura (negativo = dentro da peça)'},
  U:{t:'movimento incremental em X (diâmetro) — ou parâmetro do ciclo', f:'eixo secundário'},
  W:{t:'movimento incremental em Z — ou parâmetro do ciclo', f:'eixo secundário'},
  I:{t:'centro do arco em X, medido do início (no RAIO)', f:'centro do arco em X, medido do início do arco'},
  J:{t:'(não usado no torno)', f:'centro do arco em Y, medido do início do arco'},
  K:{t:'centro do arco em Z, medido do início', f:'centro do arco em Z / raio final da bolsa (G12)'},
  R:{t:'raio do arco (G2/G3) ou recuo do ciclo', f:'raio do arco (G2/G3) ou plano R de aproximação do ciclo'},
  F:{t:'avanço (mm por rotação, com G95) — no G76 é o passo da rosca', f:'avanço (mm por minuto, com G94)'},
  S:{t:'rotação (rpm com G97) ou velocidade de corte (m/min com G96)', f:'rotação do fuso (rpm)'},
  T:{t:'ferramenta: T0101 = posição 01 da torre + corretor 01', f:'número da ferramenta (T01)'},
  H:{t:'—', f:'número do corretor de COMPRIMENTO (com G43); H00 cancela'},
  D:{t:'—', f:'número do corretor de RAIO (com G41/G42)'},
  P:{t:'primeiro bloco do perfil (ciclos) / tempo em ms (G4) / parâmetro do G75–G76', f:'tempo de permanência (G82) / número do subprograma (M98)'},
  Q:{t:'último bloco do perfil (ciclos) / bicada em mícrons (G74/G76)', f:'profundidade por bicada (G83) / passo da bolsa'},
  ',R':{t:'arredondamento automático no canto', f:'arredondamento (raio) automático no canto — Fanuc usa VÍRGULA'},
  ',C':{t:'chanfro automático no canto', f:'chanfro automático no canto — Fanuc usa VÍRGULA'},
  CR:{f:'(Siemens) raio do arco: CR=15.'}, RND:{f:'(Siemens) arredondamento: RND=10.'}, CHF:{f:'(Siemens) chanfro: CHF=5.'},
  AP:{f:'(Siemens) ângulo polar'}, RP:{f:'(Siemens) raio polar'},
  E:{f:'(Mach 9) bloco final da repetição'}, L:{f:'(Mach 9) número de repetições'}
};

function gInfo(n, machine){
  return (machine==='fresa' ? G_FRESA[n] : G_TORNO[n]) || G_COMMON[n] || null;
}
function mInfo(n, machine){
  const e=M_CODES[n]; if(!e) return null;
  if(e.m && e.m!==machine) return null;
  return e;
}
function addrInfo(L, machine){
  const a=ADDR[L]; if(!a) return null;
  if(a.n) return a.n;
  return (machine==='fresa'?a.f:a.t)||a.f||a.t||'';
}

/* ---------- tabelas do Manual (conteúdo do livro) ---------- */
const OTHER_CONTROLS = [
  ['Arco por raio', 'G02 X60. Y0 R15.', 'G02 X60. Y0 CR=15.', 'G02 X60. Y0 I45. J0 (I/J ABSOLUTOS, a partir do zero-peça)'],
  ['Centro do arco I/J', 'incremental: do INÍCIO do arco até o centro', 'incremental: do INÍCIO do arco até o centro', 'absoluto: do ZERO-PEÇA até o centro'],
  ['Arredondamento', 'G01 X60.,R10.', 'G01 X60. RND=10.', 'G01 X60. Q10.'],
  ['Chanfro', 'G01 Y60.,C5.', 'G01 Y60. CHF=5.', 'G01 Y60. Q-5. (no livro: O–)'],
  ['Pausa de 5 s', 'G04 X5.', 'G04 F5.', 'G04 D5.'],
  ['Polar', 'G16 (X=raio, Y=ângulo) / G15 cancela / G52 centro', 'G111 X Y (centro) + AP= (ângulo) RP= (raio)', 'G01 R C I J (R raio, C ângulo, I/J centro)'],
  ['Milímetros', 'G21', 'G71', 'G71'],
  ['Ciclo de furação', 'G81 X Y Z R F … G80', 'MCALL CYCLE81(…) … MCALL', 'G81 … G80'],
  ['Repetição', 'M98 P250002 / M99', 'REPEAT AAA BBB P25', 'H90 E240 L25'],
  ['Corretor', 'G43 H01 / D01', 'D01 (junto do G54)', 'O01 (corretor)'],
  ['Mais de um G por bloco', 'pode', 'pode', 'NÃO pode — um G por bloco, sempre com ponto decimal']
];

const FLOW_FANUC_FRESA = [
  ['O0001 (COMENTARIO)','número do programa'],
  ['N010 G17 G21 G40 G54 G80 G90','bloco de segurança (só no início)'],
  ['N020 G0 G53 Z-110. H00 M5','sobe até perto da troca, cancela corretor, para o fuso'],
  ['N030 T01 M6','troca de ferramenta'],
  ['N040 G54','busca o zero-peça'],
  ['N050 S1500 M3','rotação e sentido de giro'],
  ['N060 G0 X-15. Y-15.','posicionamento fora da peça'],
  ['N070 G43 H01 Z10.','liga o corretor de comprimento e aproxima'],
  ['N080 G0 Z5. M8','aproximação de segurança, refrigeração'],
  ['N090 G1 Z-5. F300','penetração'],
  ['N100 G42 D01 X0 Y0','liga compensação de raio'],
  ['… perfil …',''],
  ['N200 G40 G1 X-15. Y-15.','desliga compensação saindo da peça'],
  ['N220 G0 Z10. M9','afasta, desliga refrigeração'],
  ['N230 G0 G53 Z-110. H00 M5','volta para a troca, para o fuso'],
  ['N240 M30','fim de programa']
];

const FLOW_FANUC_TORNO = [
  ['O7044','número do programa'],
  ['N10 G21 G40 G54 G90 G95','bloco de segurança: mm, sem compensação, zero-peça, absoluto, mm/rot'],
  ['N20 G92 S4000','limite geral de rotação'],
  ['N30 M5 / N40 M9','garante fuso e refrigeração desligados'],
  ['N50 G28 U0. / N60 G28 W0.','recolhe X e depois Z para a referência'],
  ['N70 T0202 (DESBASTE)','chama ferramenta 02 com corretor 02'],
  ['N80 G96 S200','velocidade de corte constante 200 m/min'],
  ['N90 G92 S2500 M3','limite 2500 rpm e liga o fuso horário'],
  ['N100 G0 Z3. M8','aproxima a 3 mm da face e liga refrigeração'],
  ['N110 X54.','rápido até acima do material bruto'],
  ['N120 G72 W1. R1. / N130 G72 P140 Q160…','faceamento em ciclo'],
  ['N180 G71 U1. R1. / N190 G71 P200 Q280 U0.5 W0.05 F0.3','desbaste em ciclo, 1 mm por passe'],
  ['N200 … N280','perfil final (G0 / G1 / G2 / G3)'],
  ['N300 M5 … N330 G28 W0.','desliga e recolhe para trocar'],
  ['N340 T0404 (ACABAMENTO) … N400 G70 P200 Q280','acabamento com compensação G42'],
  ['N420 M5 … N460 M30','desliga, recolhe e fim']
];
