/* =========================================================================
   CLP LADDER — dicionário (aula / cola / manual), fases e Modo Infinito
   Endereços no padrão Siemens S7 (I0.0 entradas, Q0.0 saídas, M0.0 memórias),
   temporizadores T1… e contadores C1… (no Manual tem a tabela para outras marcas).
   ========================================================================= */
'use strict';

/* ---------------- cartões de conceito ---------------- */
const SYM = {
  NO:'<svg viewBox="0 0 60 30"><path d="M0 15h22M38 15h22M22 4v22M38 4v22"/></svg>',
  NC:'<svg viewBox="0 0 60 30"><path d="M0 15h22M38 15h22M22 4v22M38 4v22M25 25l10-20"/></svg>',
  P:'<svg viewBox="0 0 60 30"><path d="M0 15h22M38 15h22M22 4v22M38 4v22"/><text x="30" y="20">P</text></svg>',
  N:'<svg viewBox="0 0 60 30"><path d="M0 15h22M38 15h22M22 4v22M38 4v22"/><text x="30" y="20">N</text></svg>',
  OUT:'<svg viewBox="0 0 60 30"><path d="M0 15h20M40 15h20M24 4q-7 11 0 22M36 4q7 11 0 22"/></svg>',
  S:'<svg viewBox="0 0 60 30"><path d="M0 15h20M40 15h20M24 4q-7 11 0 22M36 4q7 11 0 22"/><text x="30" y="20">S</text></svg>',
  R:'<svg viewBox="0 0 60 30"><path d="M0 15h20M40 15h20M24 4q-7 11 0 22M36 4q7 11 0 22"/><text x="30" y="20">R</text></svg>',
  TON:'<svg viewBox="0 0 60 30"><path d="M0 15h12M48 15h12"/><rect x="12" y="3" width="36" height="24" rx="2"/><text x="30" y="19" style="font-size:9px">TON</text></svg>',
  TOF:'<svg viewBox="0 0 60 30"><path d="M0 15h12M48 15h12"/><rect x="12" y="3" width="36" height="24" rx="2"/><text x="30" y="19" style="font-size:9px">TOF</text></svg>',
  CTU:'<svg viewBox="0 0 60 30"><path d="M0 15h12M48 15h12"/><rect x="12" y="3" width="36" height="24" rx="2"/><text x="30" y="19" style="font-size:9px">CTU</text></svg>',
  W:'<svg viewBox="0 0 60 30"><path d="M0 15h60"/></svg>'
};
const CODES = {
  CLP:{n:'CLP — Controlador Lógico Programável', d:'Um computador industrial. Lê as <b>entradas</b> (botões, sensores), executa o <b>programa</b> e liga as <b>saídas</b> (motores, lâmpadas, válvulas).', ex:'Botão → I0.0 → programa → Q0.0 → contator do motor'},
  SCAN:{n:'Ciclo de varredura (scan)', d:'O CLP repete sem parar: 1) lê todas as entradas, 2) executa as linhas <b>de cima para baixo</b>, 3) atualiza as saídas. Leva poucos milissegundos.', ex:'Ler I → executar linha 1, 2, 3… → escrever Q → repetir'},
  I:{n:'I — entrada (Input)', d:'Endereço de um borne de entrada do CLP. <b>I0.0</b> = byte 0, bit 0. Fica 1 quando chega tensão (24 V) no borne.', ex:'I0.0  I0.1 … I0.7  I1.0'},
  Q:{n:'Q — saída (Output)', d:'Endereço de um borne de saída. Quando a bobina Q0.0 é ligada no programa, o borne Q0.0 manda 24 V para o contator / lâmpada / válvula.', ex:'Q0.0  Q0.1 … Q0.7'},
  M:{n:'M — memória (marcador)', d:'Um "relé auxiliar" que só existe dentro do CLP. Não liga nada lá fora: serve para guardar estados e organizar o programa.', ex:'M0.0 = "ciclo automático ligado"'},
  NO:{n:'Contato NA ( | | )', d:'Normalmente aberto: deixa a energia passar quando o bit está em <b>1</b>.', ex:'| I0.0 |  passa quando o botão I0.0 está apertado', sym:'NO'},
  NC:{n:'Contato NF ( |/| )', d:'Normalmente fechado: deixa a energia passar quando o bit está em <b>0</b>. É o "NÃO" da lógica.', ex:'|/ I0.0 |  passa enquanto o botão NÃO está apertado', sym:'NC'},
  OUT:{n:'Bobina ( )', d:'Fica ligada enquanto chega energia nela e desliga quando a energia some. Sempre na direita da linha.', ex:'( Q0.0 )', sym:'OUT'},
  W:{n:'Fio', d:'Só liga um ponto ao outro. Use para completar a linha até a bobina.', ex:'———', sym:'W'},
  SERIE:{n:'Série = E (AND)', d:'Contatos um depois do outro: a energia só passa se <b>todos</b> fecharem.', ex:'| A | | B | ( Q )  →  Q = A E B'},
  PARALELO:{n:'Paralelo = OU (OR)', d:'Ramos um embaixo do outro, unidos por linhas verticais: passa se <b>qualquer</b> ramo fechar.', ex:'| A | e embaixo | B | → ( Q ) → Q = A OU B'},
  SELO:{n:'Selo (auto-retenção)', d:'Um contato NA da própria saída em paralelo com o botão LIGA. Depois que liga, a saída "se segura" sozinha até o DESLIGA abrir a linha.', ex:'(| LIGA | ou | Q0.0 |) e |/ DESLIGA | → ( Q0.0 )'},
  NFFIS:{n:'Botão NF ligado no CLP', d:'Na indústria, DESLIGA, EMERGÊNCIA e relé TÉRMICO são ligados com contato <b>NF</b> físico: a entrada fica em 1 em repouso e cai para 0 quando aperta (ou quando o fio rompe — falha segura). Por isso no programa eles viram contato <b>NA</b>.', ex:'Botão NF no borne → | I0.0 | (NA) na linha'},
  S:{n:'Bobina SET (S)', d:'Liga a saída e ela <b>fica ligada</b> mesmo depois que a energia some. Só desliga com um RESET.', ex:'( S Q0.0 )', sym:'S'},
  R:{n:'Bobina RESET (R)', d:'Desliga uma saída ligada por SET. Em contador ou temporizador, <b>zera</b>. Se SET e RESET acontecem juntos, vale a linha que está mais embaixo.', ex:'( R Q0.0 )  ( R C1 )', sym:'R'},
  INTER:{n:'Intertravamento', d:'Um contato NF de uma saída na linha da outra, para as duas nunca ligarem juntas (ex.: motor horário × anti-horário = curto-circuito).', ex:'K1: … |/ Q0.1 | ( Q0.0 )'},
  P:{n:'Borda de subida (P)', d:'Fecha durante <b>um único ciclo de varredura</b>, no instante em que o bit passa de 0 para 1. Segurar o botão não adianta: é um pulso.', ex:'| P I0.0 | ( M0.0 )', sym:'P'},
  N:{n:'Borda de descida (N)', d:'Pulso de um ciclo quando o bit passa de 1 para 0 (quando solta o botão).', ex:'| N I0.0 |', sym:'N'},
  TON:{n:'Temporizador TON (retardo para ligar)', d:'Quando a entrada liga, começa a contar. Depois de PT segundos o bit <b>T</b> vai para 1. Se a entrada cair antes, zera.', ex:'| I0.0 | [TON T1 PT=5 s]  …  | T1 | ( Q0.0 )', sym:'TON'},
  TOF:{n:'Temporizador TOF (retardo para desligar)', d:'O bit T liga <b>na hora</b> com a entrada, e quando a entrada desliga ele ainda fica ligado por PT segundos.', ex:'| I0.0 | [TOF T1 PT=5 s]', sym:'TOF'},
  PISCA:{n:'Pisca-pisca (oscilador)', d:'Dois TON que se reiniciam: T1 conta com T2 desligado; T2 conta depois de T1; quando T2 termina, abre a linha do T1 e tudo recomeça.', ex:'|/T2| [TON T1] · |T1| [TON T2] · |T1| (Q)'},
  CTU:{n:'Contador CTU (crescente)', d:'Soma 1 a cada <b>borda de subida</b> da entrada. Quando a contagem chega em PV, o bit C vai a 1. Zera com RESET.', ex:'| sensor | [CTU C1 PV=5]  · | C1 | ( lâmpada )', sym:'CTU'},
  SEQ:{n:'Sequência por tempo', d:'Temporizadores encadeados: um termina e inicia o próximo. O último zera o primeiro e o ciclo se repete.', ex:'T1 → T2 → T3 → zera T1'},
  YD:{n:'Partida estrela-triângulo', d:'Motor parte em <b>estrela</b> (K1+K2, corrente menor) e depois de alguns segundos passa para <b>triângulo</b> (K1+K3). K2 e K3 <b>nunca</b> juntos.', ex:'K1 + K2 (Y) → T1 → K1 + K3 (Δ)'}
};

/* ---------------- helpers das fases ---------------- */
const RG = (rows, extra={}) => ({rows, ...extra});
const ST = (i, t, q, d) => ({i, t, q, d});
const TS = (d, ...steps) => ({d, steps});
const press = (a, q, d, t=120) => ST({[a]:1}, t, q, d);
const free  = (a, q, d, t=120) => ST({[a]:0}, t, q, d);

/* =========================================================================
   TRILHA — 18 fases
   io.k: pb (botão NA) · pbnf (botão NF) · emg (emergência NF com trava) · sw (chave) ·
         sensor · ft (relé térmico NF) · fc (fim de curso)
         saídas: lamp (cor) · motor · buzzer · valve · k (contator) · belt · pump
   ========================================================================= */
const LEVELS_CLP = [
{
  id:1, name:'Acende a Luz', sub:'Contato NA e bobina', types:['NO','OUT'],
  brief:'Botão apertado → lâmpada acesa. Soltou → apaga.',
  tip:'Clique no quadrado tracejado, escolha o símbolo e o endereço.',
  aula:{
    intro:'Um <b>CLP</b> lê as <b>entradas</b> (I), executa o programa e liga as <b>saídas</b> (Q). O programa em <b>Ladder</b> parece um diagrama elétrico de relés: um trilho de energia na esquerda, e cada <b>linha</b> termina numa <b>bobina</b> na direita. A energia "anda" da esquerda para a direita passando pelos <b>contatos</b>.',
    codes:['CLP','SCAN','I','Q','NO','OUT'],
    tips:['<b>I0.0</b> é o borne de entrada 0 do byte 0. <b>Q0.0</b> é o borne de saída 0.',
          'O contato <b>NA</b> ( | | ) fecha quando a entrada está em 1 — botão apertado.',
          'Depois de montar, vá em <b>Máquina</b>, aperte o botão B1 e veja a linha ficar verde: é a energia passando.']
  },
  io:[{a:'I0.0',n:'B1 Botão',k:'pb'},{a:'Q0.0',n:'H1 Lâmpada',k:'lamp',c:'#31d07a'}],
  prog:[ RG([['?NO I0.0','-','-','-','?OUT Q0.0']]) ],
  tests:[ TS('Botão solto → lâmpada apagada; apertado → acesa; solto → apaga',
      ST(null,100,{'Q0.0':0},'Botão B1 solto'), press('I0.0',{'Q0.0':1},'Apertou B1'), free('I0.0',{'Q0.0':0},'Soltou B1')) ]
},
{
  id:2, name:'Ao Contrário', sub:'Contato NF — o "NÃO"', types:['NO','NC','OUT'],
  brief:'Luz da geladeira: acende quando a porta ABRE (o fim de curso é solto).',
  tip:'NF ( |/| ) passa energia quando o bit é 0.',
  aula:{
    intro:'O contato <b>NF</b> ( |/| ) é o contrário do NA: deixa a energia passar quando o bit está em <b>0</b>. Na lógica, é o <b>NÃO</b>. Aqui o fim de curso S1 fica apertado pela porta fechada (I0.0 = 1). Abriu a porta → I0.0 = 0 → a luz tem que acender.',
    codes:['NC','NO'],
    tips:['Pense assim: "a lâmpada acende quando I0.0 <b>NÃO</b> está ativo" → contato NF de I0.0.',
          'A segunda linha é o indicador "porta fechada" no painel: esse é com NA.']
  },
  io:[{a:'I0.0',n:'S1 Porta fechada',k:'sw',rest:1},{a:'Q0.0',n:'H1 Luz interna',k:'lamp',c:'#ffe27a'},{a:'Q0.1',n:'H2 Porta OK',k:'lamp',c:'#31d07a'}],
  prog:[ RG([['?NC I0.0','-','-','-','?OUT Q0.0']]), RG([['?NO I0.0','-','-','-','OUT Q0.1']]) ],
  tests:[ TS('Porta fechada → luz apagada e H2 acesa; abriu → luz acesa e H2 apagada',
      ST(null,100,{'Q0.0':0,'Q0.1':1},'Porta fechada (S1 = 1)'), ST({'I0.0':0},100,{'Q0.0':1,'Q0.1':0},'Abriu a porta (S1 = 0)'), ST({'I0.0':1},100,{'Q0.0':0,'Q0.1':1},'Fechou de novo')) ]
},
{
  id:3, name:'Duas Mãos', sub:'Série = E (AND)', types:['NO','NC','OUT'],
  brief:'A prensa só desce com as DUAS mãos nos botões E a grade de proteção fechada.',
  tip:'Em série, todos precisam fechar.',
  aula:{
    intro:'Contatos <b>em série</b> (um depois do outro) formam a lógica <b>E</b>: a energia só chega na bobina se todos estiverem fechados. É assim que se faz o comando <b>bimanual</b> de prensa: as duas mãos ocupadas = nenhuma mão embaixo da ferramenta.',
    codes:['SERIE'],
    tips:['Três condições → três contatos NA em série.',
          'A ordem dos contatos em série não muda o resultado.']
  },
  io:[{a:'I0.0',n:'B1 Mão esquerda',k:'pb'},{a:'I0.1',n:'B2 Mão direita',k:'pb'},{a:'I0.2',n:'S1 Grade fechada',k:'sw',rest:1},{a:'Q0.0',n:'Y1 Prensa desce',k:'valve'}],
  prog:[ RG([['?NO I0.0','?NO I0.1','?NO I0.2','-','OUT Q0.0']]) ],
  tests:[ TS('Só uma mão → não desce',ST({'I0.0':1},100,{'Q0.0':0},'Só a mão esquerda'),ST({'I0.0':0,'I0.1':1},100,{'Q0.0':0},'Só a mão direita')),
          TS('Duas mãos e grade fechada → desce',ST({'I0.0':1,'I0.1':1},100,{'Q0.0':1},'As duas mãos com a grade fechada')),
          TS('Grade aberta → nunca desce',ST({'I0.2':0,'I0.0':1,'I0.1':1},100,{'Q0.0':0},'Duas mãos, mas grade ABERTA')) ]
},
{
  id:4, name:'Campainha', sub:'Paralelo = OU (OR)', types:['NO','NC','OUT'],
  brief:'Três botões (frente, fundos, lateral) tocam a MESMA campainha.',
  tip:'Ligue os ramos com as linhas verticais (clique entre as linhas).',
  aula:{
    intro:'Ramos <b>em paralelo</b> (um embaixo do outro) formam a lógica <b>OU</b>: se qualquer um fechar, a energia chega na bobina. Os ramos se juntam com uma <b>ligação vertical</b>. Neste editor, clique no espaço entre duas linhas, logo depois do contato, para ligar ou desligar o ramo.',
    codes:['PARALELO'],
    tips:['Cada botão fica numa linha; as linhas de baixo se juntam à de cima <b>depois</b> do contato.',
          'Um ramo sem ligação vertical não leva energia a lugar nenhum.']
  },
  io:[{a:'I0.0',n:'B1 Frente',k:'pb'},{a:'I0.1',n:'B2 Fundos',k:'pb'},{a:'I0.2',n:'B3 Lateral',k:'pb'},{a:'Q0.0',n:'H1 Campainha',k:'buzzer'}],
  prog:[ RG([['?NO I0.0','-','-','-','OUT Q0.0'],['?NO I0.1','','','',''],['?NO I0.2','','','','']],{links:['0,1','1,1'],edLinks:true}) ],
  tests:[ TS('Ninguém aperta → silêncio',ST(null,100,{'Q0.0':0},'Nenhum botão')),
          TS('Qualquer botão toca',press('I0.0',{'Q0.0':1},'B1 Frente'),free('I0.0',{'Q0.0':0},'Soltou'),press('I0.1',{'Q0.0':1},'B2 Fundos'),free('I0.1',{'Q0.0':0},'Soltou'),press('I0.2',{'Q0.0':1},'B3 Lateral')) ]
},
{
  id:5, name:'O Selo', sub:'Auto-retenção (partida de motor)', types:['NO','NC','OUT'],
  brief:'Aperta LIGA e solta: o motor continua. Aperta DESLIGA: para.',
  tip:'Ponha um NA da própria saída Q0.0 em paralelo com o LIGA.',
  aula:{
    intro:'O botão é de pulso (solta sozinho). Para o motor continuar ligado depois de soltar, a saída usa um contato dela mesma em paralelo com o botão LIGA: é o <b>selo</b> (ou auto-retenção). O DESLIGA fica em série, com NF, e "quebra" o selo.',
    codes:['SELO','NC'],
    tips:['Neste exercício o botão DESLIGA é <b>NA</b> no painel, por isso no programa ele vira NF.',
          'Se apertar LIGA e DESLIGA juntos, o motor tem que ficar desligado: o DESLIGA vem depois do paralelo.',
          'A segunda linha acende H1 "motor ligado" com um contato de Q0.0.']
  },
  io:[{a:'I0.0',n:'B1 Liga',k:'pb',c:'#31d07a'},{a:'I0.1',n:'B0 Desliga',k:'pb',c:'#ff5d5d'},{a:'Q0.0',n:'K1 Motor',k:'motor'},{a:'Q0.1',n:'H1 Motor ligado',k:'lamp',c:'#31d07a'}],
  prog:[ RG([['?NO I0.0','?NC I0.1','-','-','OUT Q0.0'],['?NO Q0.0','','','','']],{links:['0,1'],edLinks:true}),
         RG([['?NO Q0.0','-','-','-','?OUT Q0.1']]) ],
  tests:[ TS('Liga e segura sozinho',press('I0.0',{'Q0.0':1,'Q0.1':1},'Apertou LIGA'),free('I0.0',{'Q0.0':1},'Soltou LIGA — tem que continuar')),
          TS('Desliga',press('I0.0',{}),free('I0.0',{'Q0.0':1}),press('I0.1',{'Q0.0':0,'Q0.1':0},'Apertou DESLIGA'),free('I0.1',{'Q0.0':0},'Soltou DESLIGA — continua desligado')),
          TS('Os dois juntos → desligado',ST({'I0.0':1,'I0.1':1},150,{'Q0.0':0},'LIGA e DESLIGA juntos')) ]
},
{
  id:6, name:'Falha Segura', sub:'Emergência, térmico e botões NF', types:['NO','NC','OUT'],
  brief:'Agora do jeito da indústria: DESLIGA, EMERGÊNCIA e TÉRMICO são NF no painel.',
  tip:'Botão NF no painel = entrada em 1 em repouso = contato NA no programa.',
  aula:{
    intro:'Na fábrica, tudo que <b>para</b> a máquina é ligado no CLP com contato <b>NF</b> físico. Em repouso a entrada fica em <b>1</b>. Se apertar — <b>ou se o fio romper</b> — vira 0 e a máquina para. Isso se chama <b>falha segura</b>. Por isso, no programa, esses botões viram contato <b>NA</b>: "passa enquanto está tudo OK".',
    codes:['NFFIS'],
    tips:['Olhe os LEDs do CLP na aba Máquina: I0.0, I0.2 e I0.3 já ficam acesos em repouso.',
          'Relé térmico (F1) desarma quando o motor puxa corrente demais: a entrada cai para 0.',
          'Linha 2: a lâmpada vermelha acende quando o térmico <b>desarmou</b> (I0.2 = 0).']
  },
  io:[{a:'I0.0',n:'B0 Desliga (NF)',k:'pbnf',c:'#ff5d5d'},{a:'I0.1',n:'B1 Liga',k:'pb',c:'#31d07a'},{a:'I0.2',n:'F1 Térmico (NF)',k:'ft'},{a:'I0.3',n:'S0 Emergência',k:'emg'},
      {a:'Q0.0',n:'K1 Motor',k:'motor'},{a:'Q0.1',n:'H2 Falha térmico',k:'lamp',c:'#ff5d5d'}],
  prog:[ RG([['?NO I0.3','?NO I0.2','?NO I0.0','?NO I0.1','OUT Q0.0'],['','','','NO Q0.0','']],{links:['0,3','0,4']}),
         RG([['?NC I0.2','-','-','-','?OUT Q0.1']]) ],
  tests:[ TS('Repouso → desligado; LIGA → liga e sela',ST(null,100,{'Q0.0':0,'Q0.1':0},'Tudo em repouso'),press('I0.1',{'Q0.0':1},'Apertou LIGA'),free('I0.1',{'Q0.0':1},'Soltou LIGA')),
          TS('DESLIGA (NF) para',press('I0.1',{}),free('I0.1',{'Q0.0':1}),ST({'I0.0':0},120,{'Q0.0':0},'Apertou DESLIGA (entrada vai a 0)'),ST({'I0.0':1},120,{'Q0.0':0},'Soltou')),
          TS('Emergência para',press('I0.1',{}),free('I0.1',{'Q0.0':1}),ST({'I0.3':0},120,{'Q0.0':0},'Bateu na EMERGÊNCIA')),
          TS('Térmico desarma → para e acende H2',press('I0.1',{}),free('I0.1',{'Q0.0':1}),ST({'I0.2':0},120,{'Q0.0':0,'Q0.1':1},'Térmico desarmou'),ST({'I0.1':1},120,{'Q0.0':0},'Tentou ligar com o térmico desarmado')) ]
},
{
  id:7, name:'Memória Interna', sub:'Marcadores M', types:['NO','NC','OUT'],
  brief:'Um "modo automático" guardado na memória M0.0 comanda a esteira e a lâmpada.',
  tip:'M0.0 é um relé que só existe dentro do CLP.',
  aula:{
    intro:'Às vezes você precisa guardar um estado que não é uma saída: "o automático está ligado". Para isso existem as <b>memórias M</b> (marcadores). A bobina M0.0 liga e desliga como qualquer bobina, e os contatos dela podem ser usados em quantas linhas quiser.',
    codes:['M'],
    tips:['Linha 1: selo da memória M0.0 (igual ao da fase 5, mas a bobina é M0.0).',
          'Linha 3: a esteira só anda com o automático ligado <b>E</b> com peça presente no sensor.']
  },
  io:[{a:'I0.0',n:'B1 Automático',k:'pb',c:'#31d07a'},{a:'I0.1',n:'B0 Manual',k:'pb',c:'#ff5d5d'},{a:'I0.2',n:'S1 Peça presente',k:'sensor'},
      {a:'Q0.0',n:'H1 Automático',k:'lamp',c:'#43d0ff'},{a:'Q0.1',n:'M1 Esteira',k:'belt'}],
  names:{'M0.0':'Modo automático'},
  prog:[ RG([['?NO I0.0','NC I0.1','-','-','?OUT M0.0'],['?NO M0.0','','','','']],{links:['0,1']}),
         RG([['?NO M0.0','-','-','-','OUT Q0.0']]),
         RG([['?NO M0.0','?NO I0.2','-','-','?OUT Q0.1']]) ],
  tests:[ TS('Automático liga e segura',press('I0.0',{'Q0.0':1}),free('I0.0',{'Q0.0':1,'Q0.1':0},'Soltou: automático ligado, sem peça → esteira parada'),ST({'I0.2':1},120,{'Q0.1':1},'Chegou peça → esteira anda')),
          TS('Sem automático a esteira não anda',ST({'I0.2':1},120,{'Q0.1':0,'Q0.0':0},'Peça presente, mas automático desligado')),
          TS('Manual desliga tudo',press('I0.0',{}),free('I0.0',{}),ST({'I0.2':1},100,{'Q0.1':1}),press('I0.1',{'Q0.0':0,'Q0.1':0},'Apertou MANUAL')) ]
},
{
  id:8, name:'Liga e Trava', sub:'SET e RESET', types:['NO','NC','OUT','S','R'],
  brief:'O mesmo liga/desliga do motor, mas com bobinas SET e RESET.',
  tip:'S liga e trava. R destrava. A linha mais de baixo ganha.',
  aula:{
    intro:'A bobina <b>SET (S)</b> liga a saída e ela <b>continua ligada</b> mesmo depois que a energia some — é um selo pronto. A bobina <b>RESET (R)</b> desliga. Como o CLP executa de cima para baixo, se SET e RESET forem verdadeiros no mesmo ciclo, quem está <b>embaixo</b> vence.',
    codes:['S','R'],
    tips:['Coloque o RESET <b>depois</b> do SET: assim, apertando os dois, o motor fica desligado (segurança).',
          'Linha 3: lâmpada amarela "motor parado" = contato NF de Q0.0.']
  },
  io:[{a:'I0.0',n:'B1 Liga',k:'pb',c:'#31d07a'},{a:'I0.1',n:'B0 Desliga',k:'pb',c:'#ff5d5d'},{a:'Q0.0',n:'K1 Motor',k:'motor'},{a:'Q0.1',n:'H1 Parado',k:'lamp',c:'#ffb020'}],
  prog:[ RG([['?NO I0.0','-','-','-','?S Q0.0']]), RG([['?NO I0.1','-','-','-','?R Q0.0']]), RG([['?NC Q0.0','-','-','-','OUT Q0.1']]) ],
  tests:[ TS('SET trava',ST(null,100,{'Q0.0':0,'Q0.1':1},'Repouso: parado'),press('I0.0',{'Q0.0':1,'Q0.1':0},'LIGA'),free('I0.0',{'Q0.0':1},'Soltou — continua')),
          TS('RESET destrava',press('I0.0',{}),free('I0.0',{}),press('I0.1',{'Q0.0':0,'Q0.1':1},'DESLIGA')),
          TS('Os dois juntos → desligado',ST({'I0.0':1,'I0.1':1},150,{'Q0.0':0},'LIGA e DESLIGA juntos')) ]
},
{
  id:9, name:'Vai e Volta', sub:'Reversão com intertravamento', types:['NO','NC','OUT','S','R'],
  brief:'Motor horário (K1) e anti-horário (K2). Os dois juntos = CURTO-CIRCUITO.',
  tip:'Na linha do K1 coloque NF do K2, e vice-versa.',
  aula:{
    intro:'Para inverter o sentido de um motor trifásico, troca-se duas fases com dois contatores. Se K1 e K2 fecharem juntos dá <b>curto-circuito</b>. O <b>intertravamento</b> evita isso: um contato NF de K2 na linha do K1 e um NF de K1 na linha do K2.',
    codes:['INTER'],
    tips:['Para trocar o sentido, o operador precisa primeiro apertar DESLIGA.',
          'O selo de cada contator fica em paralelo só com o seu botão.',
          'O DESLIGA (B0) é NF no painel → contato NA no programa.']
  },
  io:[{a:'I0.0',n:'B0 Desliga (NF)',k:'pbnf',c:'#ff5d5d'},{a:'I0.1',n:'B1 Horário',k:'pb',c:'#31d07a'},{a:'I0.2',n:'B2 Anti-horário',k:'pb',c:'#43d0ff'},
      {a:'Q0.0',n:'K1 Horário',k:'k'},{a:'Q0.1',n:'K2 Anti-horário',k:'k'}],
  plant:{type:'rev', fw:'Q0.0', rw:'Q0.1'},
  never:[['Q0.0','Q0.1']],
  prog:[ RG([['NO I0.0','?NO I0.1','?NC Q0.1','-','OUT Q0.0'],['','?NO Q0.0','','','']],{links:['0,1','0,2']}),
         RG([['NO I0.0','?NO I0.2','?NC Q0.0','-','OUT Q0.1'],['','?NO Q0.1','','','']],{links:['0,1','0,2']}) ],
  tests:[ TS('Horário liga e não deixa o anti-horário entrar',press('I0.1',{'Q0.0':1}),free('I0.1',{'Q0.0':1}),press('I0.2',{'Q0.0':1,'Q0.1':0},'Apertou anti-horário com o horário ligado'),free('I0.2',{'Q0.0':1,'Q0.1':0})),
          TS('Desliga e inverte',press('I0.1',{}),free('I0.1',{}),ST({'I0.0':0},120,{'Q0.0':0},'DESLIGA'),ST({'I0.0':1},120,{}),press('I0.2',{'Q0.1':1,'Q0.0':0},'Anti-horário'),free('I0.2',{'Q0.1':1},'Soltou — continua')),
          TS('Os dois botões juntos nunca ligam os dois',ST({'I0.1':1,'I0.2':1},200,{},'Horário e anti-horário juntos')) ]
},
{
  id:10, name:'Um Botão Só', sub:'Borda de subida (P) — liga/desliga', types:['NO','NC','OUT','S','R','P'],
  brief:'O mesmo botão acende e apaga a lâmpada, um aperto de cada vez.',
  tip:'Use P para gerar um pulso de um ciclo só; segurar não pode piscar.',
  aula:{
    intro:'O contato de <b>borda de subida (P)</b> só fecha durante <b>um ciclo de varredura</b>, no instante em que o botão é apertado. Com esse pulso dá para fazer um <b>liga/desliga com um botão só</b> (flip-flop): se o pulso chega com a lâmpada apagada, acende; se chega com ela acesa, apaga.',
    codes:['P','N'],
    tips:['Linha 1: o pulso P do botão vira a memória M0.0.',
          'Linha 2, ramo de cima: pulso E lâmpada apagada → acende. Ramo de baixo: SEM pulso E lâmpada acesa → continua acesa.',
          'Sem a borda, segurando o botão a lâmpada ficaria piscando a cada ciclo.']
  },
  io:[{a:'I0.0',n:'B1 Botão',k:'pb'},{a:'Q0.0',n:'H1 Lâmpada',k:'lamp',c:'#ffe27a'}],
  names:{'M0.0':'Pulso do B1'},
  prog:[ RG([['?P I0.0','-','-','-','?OUT M0.0']]),
         RG([['?NO M0.0','?NC Q0.0','-','-','OUT Q0.0'],['?NC M0.0','?NO Q0.0','','','']],{links:['0,2']}) ],
  tests:[ TS('Aperta → acende, segura → continua, solta → continua',press('I0.0',{'Q0.0':1},'1º aperto'),ST(null,600,{'Q0.0':1},'Segurando o botão'),free('I0.0',{'Q0.0':1},'Soltou')),
          TS('2º aperto apaga',press('I0.0',{}),free('I0.0',{'Q0.0':1}),press('I0.0',{'Q0.0':0},'2º aperto'),ST(null,500,{'Q0.0':0},'Segurando'),free('I0.0',{'Q0.0':0},'Soltou'),press('I0.0',{'Q0.0':1},'3º aperto')) ]
},
{
  id:11, name:'Espera Aí', sub:'Temporizador TON', types:['NO','NC','OUT','S','R','P','TON'],
  brief:'Partida com aviso: a sirene toca 5 s e só então o motor liga.',
  tip:'TON T1 PT=5 s. O contato T1 fecha depois do tempo.',
  aula:{
    intro:'O <b>TON</b> (retardo na energização) começa a contar quando a linha dele recebe energia. Quando passar o tempo <b>PT</b>, o bit <b>T1</b> vai para 1 e os contatos de T1 mudam. Se a energia cair antes, ele zera.',
    codes:['TON'],
    tips:['Linha 1 (pronta): selo da memória M0.0 "partida pedida".',
          'Linha 2: M0.0 alimenta o TON T1 com PT = 5 s.',
          'Linha 3: motor = contato T1. Linha 4: sirene = M0.0 E NÃO T1.']
  },
  io:[{a:'I0.0',n:'B0 Desliga (NF)',k:'pbnf',c:'#ff5d5d'},{a:'I0.1',n:'B1 Liga',k:'pb',c:'#31d07a'},{a:'Q0.0',n:'K1 Motor',k:'motor'},{a:'Q0.1',n:'H1 Sirene',k:'buzzer'}],
  names:{'M0.0':'Partida pedida','T1':'Tempo de aviso'},
  prog:[ RG([['NO I0.0','NO I0.1','-','-','OUT M0.0'],['','NO M0.0','','','']],{links:['0,1','0,2']}),
         RG([['?NO M0.0','-','-','-','?TON T1 5']]),
         RG([['?NO T1','-','-','-','OUT Q0.0']]),
         RG([['NO M0.0','?NC T1','-','-','OUT Q0.1']]) ],
  tests:[ TS('Sirene 5 s, depois motor',press('I0.1',{}),free('I0.1',{}),ST(null,800,{'Q0.1':1,'Q0.0':0},'1 s depois: sirene tocando, motor parado'),
            ST(null,3000,{'Q0.0':0},'4 s: motor ainda parado'),ST(null,1300,{'Q0.0':1,'Q0.1':0},'5,3 s: motor ligado, sirene quieta'),ST({'I0.0':0},120,{'Q0.0':0,'Q0.1':0},'DESLIGA')) ]
},
{
  id:12, name:'Exaustor', sub:'Temporizador TOF', types:['NO','NC','OUT','S','R','P','TON','TOF'],
  brief:'Banheiro: apagou a luz, o exaustor ainda roda 5 s.',
  tip:'TOF: liga junto, desliga atrasado.',
  aula:{
    intro:'O <b>TOF</b> (retardo no desligamento) liga o bit T <b>na hora</b> em que a entrada liga. Quando a entrada desliga, ele ainda segura o bit por <b>PT</b> segundos e só então desliga.',
    codes:['TOF','TON'],
    tips:['Linha 1: lâmpada = interruptor.','Linha 2: o interruptor alimenta o TOF T1 de 5 s.','Linha 3: exaustor = contato de T1.']
  },
  io:[{a:'I0.0',n:'S1 Interruptor',k:'sw'},{a:'Q0.0',n:'H1 Luz',k:'lamp',c:'#ffe27a'},{a:'Q0.1',n:'M1 Exaustor',k:'motor'}],
  names:{'T1':'Atraso do exaustor'},
  prog:[ RG([['?NO I0.0','-','-','-','OUT Q0.0']]), RG([['?NO I0.0','-','-','-','?TOF T1 5']]), RG([['?NO T1','-','-','-','?OUT Q0.1']]) ],
  tests:[ TS('Liga junto, desliga 5 s depois',ST({'I0.0':1},200,{'Q0.0':1,'Q0.1':1},'Acendeu a luz'),ST({'I0.0':0},200,{'Q0.0':0,'Q0.1':1},'Apagou a luz: exaustor continua'),
            ST(null,3500,{'Q0.1':1},'4 s depois: ainda rodando'),ST(null,1500,{'Q0.1':0},'5,4 s depois: desligou')) ]
},
{
  id:13, name:'Pisca-Pisca', sub:'Oscilador com dois TON', types:['NO','NC','OUT','S','R','P','TON','TOF'],
  brief:'Chave ligada: a lâmpada pisca 1 s apagada, 1 s acesa.',
  tip:'T2 abre a linha do T1, e tudo recomeça.',
  aula:{
    intro:'Dois temporizadores que se reiniciam formam um <b>oscilador</b>. T1 conta 1 s com a lâmpada apagada. Quando T1 termina, a lâmpada acende e T2 começa. Quando T2 termina, um <b>NF de T2</b> na linha do T1 abre: T1 zera, T2 zera, e o ciclo recomeça.',
    codes:['PISCA'],
    tips:['Linha 1: chave E NÃO T2 → TON T1 1 s.','Linha 2: T1 → TON T2 1 s.','Linha 3: lâmpada = T1.']
  },
  io:[{a:'I0.0',n:'S1 Liga pisca',k:'sw'},{a:'Q0.0',n:'H1 Giroflex',k:'lamp',c:'#ffb020'}],
  names:{'T1':'Tempo apagada','T2':'Tempo acesa'},
  prog:[ RG([['NO I0.0','?NC T2','-','-','TON T1 1']]), RG([['?NO T1','-','-','-','?TON T2 1']]), RG([['?NO T1','-','-','-','?OUT Q0.0']]) ],
  tests:[ TS('Pisca 1 s / 1 s',ST({'I0.0':1},500,{'Q0.0':0},'0,5 s: apagada'),ST(null,1000,{'Q0.0':1},'1,5 s: acesa'),ST(null,1000,{'Q0.0':0},'2,5 s: apagada'),ST(null,1000,{'Q0.0':1},'3,5 s: acesa'),
            ST({'I0.0':0},120,{'Q0.0':0},'Desligou a chave')) ]
},
{
  id:14, name:'Conta Peças', sub:'Contador CTU', types:['NO','NC','OUT','S','R','P','TON','TOF','CTU'],
  brief:'A esteira para quando passam 5 peças pelo sensor. B2 zera para a próxima caixa.',
  tip:'CTU C1 PV=5. O contato C1 fecha quando a contagem chega em 5.',
  aula:{
    intro:'O contador <b>CTU</b> soma 1 a cada vez que a entrada dele <b>sobe</b> (0 → 1). Quando a contagem (CV) chega no valor programado (<b>PV</b>), o bit <b>C1</b> vai para 1. Para zerar, use uma bobina <b>RESET</b> com o endereço do contador.',
    codes:['CTU','R'],
    tips:['Linha 1: esteira = chave E NÃO C1 (para quando a caixa encheu).','Linha 2: sensor → CTU C1 PV = 5.',
          'Linha 3: lâmpada "caixa cheia" = C1. Linha 4: B2 → RESET C1.']
  },
  io:[{a:'I0.0',n:'S1 Liga esteira',k:'sw'},{a:'I0.1',n:'B3 Sensor de peça',k:'sensor'},{a:'I0.2',n:'B2 Zera contagem',k:'pb',c:'#43d0ff'},
      {a:'Q0.0',n:'M1 Esteira',k:'belt'},{a:'Q0.1',n:'H1 Caixa cheia',k:'lamp',c:'#31d07a'}],
  names:{'C1':'Peças na caixa'},
  plant:{type:'belt', motor:'Q0.0', sensor:'I0.1'},
  prog:[ RG([['NO I0.0','?NC C1','-','-','OUT Q0.0']]), RG([['?NO I0.1','-','-','-','?CTU C1 5']]), RG([['?NO C1','-','-','-','?OUT Q0.1']]), RG([['?NO I0.2','-','-','-','?R C1']]) ],
  tests:[ (()=>{ const s=[ST({'I0.0':1},120,{'Q0.0':1},'Esteira ligada')];
      for(let k=1;k<=5;k++){ s.push(ST({'I0.1':1},120,k===5?{'Q0.1':1,'Q0.0':0}:{'Q0.1':0,'Q0.0':1},`${k}ª peça no sensor`)); s.push(ST({'I0.1':0},120,{})); }
      s.push(press('I0.2',{'Q0.1':0},'Zerou')); s.push(free('I0.2',{'Q0.0':1},'Esteira volta a andar'));
      return TS('Conta 5 peças e para',...s); })(),
    TS('Sensor parado em cima conta uma só',ST({'I0.0':1,'I0.1':1},1500,{'Q0.1':0},'Peça parada 1,5 s no sensor')) ]
},
{
  id:15, name:'Semáforo', sub:'Sequência por tempo', types:['NO','NC','OUT','S','R','P','TON','TOF','CTU'],
  brief:'Verde 5 s → amarelo 2 s → vermelho 5 s → repete.',
  tip:'T1, T2 e T3 encadeados; T3 zera tudo.',
  aula:{
    intro:'Uma <b>sequência por tempo</b> usa temporizadores encadeados: o fim de um inicia o próximo. O último, com um NF na linha do primeiro, zera a cadeia e o ciclo recomeça. Cada lâmpada é definida pela "janela" entre dois temporizadores.',
    codes:['SEQ'],
    tips:['Verde: antes do T1 (NÃO T1). Amarelo: depois do T1 E antes do T2. Vermelho: depois do T2.',
          'T2 só começa a contar quando T1 termina — por isso PT do T2 é só o tempo do amarelo.']
  },
  io:[{a:'I0.0',n:'S1 Liga semáforo',k:'sw'},{a:'Q0.0',n:'Verde',k:'lamp',c:'#31d07a'},{a:'Q0.1',n:'Amarelo',k:'lamp',c:'#ffb020'},{a:'Q0.2',n:'Vermelho',k:'lamp',c:'#ff5d5d'}],
  names:{'T1':'Tempo verde','T2':'Tempo amarelo','T3':'Tempo vermelho'},
  plant:{type:'sem', g:'Q0.0', y:'Q0.1', r:'Q0.2'},
  prog:[ RG([['NO I0.0','?NC T3','-','-','TON T1 5']]), RG([['?NO T1','-','-','-','?TON T2 2']]), RG([['?NO T2','-','-','-','TON T3 5']]),
         RG([['NO I0.0','?NC T1','-','-','OUT Q0.0']]), RG([['?NO T1','?NC T2','-','-','OUT Q0.1']]), RG([['?NO T2','-','-','-','?OUT Q0.2']]) ],
  tests:[ TS('Ciclo completo',ST({'I0.0':1},500,{'Q0.0':1,'Q0.1':0,'Q0.2':0},'0,5 s: verde'),ST(null,4300,{'Q0.0':1},'4,8 s: ainda verde'),ST(null,600,{'Q0.0':0,'Q0.1':1,'Q0.2':0},'5,4 s: amarelo'),
      ST(null,2000,{'Q0.1':0,'Q0.2':1},'7,4 s: vermelho'),ST(null,4400,{'Q0.2':1},'11,8 s: ainda vermelho'),ST(null,700,{'Q0.0':1,'Q0.2':0},'12,5 s: verde de novo'),ST({'I0.0':0},120,{'Q0.0':0,'Q0.1':0,'Q0.2':0},'Desligou')) ]
},
{
  id:16, name:'Cilindro Automático', sub:'Fins de curso e ciclo contínuo', types:['NO','NC','OUT','S','R','P','TON','TOF','CTU'],
  brief:'Com o ciclo ligado, o cilindro avança e recua sozinho, sem parar.',
  tip:'SET no recuado, RESET no avançado.',
  aula:{
    intro:'Um cilindro pneumático de simples ação avança quando a válvula Y1 liga e volta pela mola quando desliga. Dois <b>fins de curso</b> dizem onde ele está: S1 recuado e S2 avançado. Ciclo contínuo: <b>se está recuado → avança</b>; <b>chegou no fim → recua</b>.',
    codes:['S','R','M'],
    tips:['Linha 1 (pronta): selo do ciclo em M0.0.','Linha 2: ciclo ligado E S1 recuado → SET Y1.',
          'Linha 3: S2 avançado OU ciclo desligado → RESET Y1 (o cilindro volta e fica parado).',
          'Na aba Máquina os fins de curso são acionados pelo próprio cilindro.']
  },
  io:[{a:'I0.0',n:'B1 Partida',k:'pb',c:'#31d07a'},{a:'I0.1',n:'B0 Parada (NF)',k:'pbnf',c:'#ff5d5d'},{a:'I0.2',n:'S1 Recuado',k:'fc',rest:1},{a:'I0.3',n:'S2 Avançado',k:'fc'},
      {a:'Q0.0',n:'Y1 Avança cilindro',k:'valve'}],
  names:{'M0.0':'Ciclo ligado'},
  plant:{type:'cil', y:'Q0.0', s1:'I0.2', s2:'I0.3'},
  prog:[ RG([['NO I0.1','NO I0.0','-','-','OUT M0.0'],['','NO M0.0','','','']],{links:['0,1','0,2']}),
         RG([['?NO M0.0','?NO I0.2','-','-','?S Q0.0']]),
         RG([['?NO I0.3','-','-','-','?R Q0.0'],['?NC M0.0','','','','']],{links:['0,1']}) ],
  tests:[ TS('Ciclo contínuo',ST(null,100,{'Q0.0':0},'Parado'),press('I0.0',{'Q0.0':1},'Partida: avança'),free('I0.0',{}),ST({'I0.2':0},150,{'Q0.0':1},'Saiu do recuado'),
            ST({'I0.3':1},150,{'Q0.0':0},'Chegou no avançado: recua'),ST({'I0.3':0},150,{'Q0.0':0},'Saiu do avançado'),ST({'I0.2':1},150,{'Q0.0':1},'Chegou no recuado: avança de novo')),
          TS('Parada recolhe o cilindro',press('I0.0',{}),free('I0.0',{}),ST({'I0.2':0},150,{'Q0.0':1}),ST({'I0.1':0},150,{'Q0.0':0},'Parada no meio do curso: recua'),ST({'I0.1':1,'I0.2':1},150,{'Q0.0':0},'Voltou ao recuado: fica parado')) ]
},
{
  id:17, name:"Caixa d'Água", sub:'Controle de nível com histerese', types:['NO','NC','OUT','S','R','P','TON','TOF','CTU'],
  brief:'A bomba liga quando o nível desce do sensor baixo e só desliga no sensor alto.',
  tip:'Selo em volta do NF do nível baixo; o NF do nível alto corta.',
  aula:{
    intro:'Controle "liga embaixo, desliga em cima" se chama <b>histerese</b>: evita a bomba ficar ligando e desligando sem parar. Os sensores ficam em 1 quando a água está <b>acima</b> deles. A bomba liga quando a água fica abaixo do sensor baixo (LB = 0) e se segura (selo) até a água alcançar o sensor alto (LA = 1).',
    codes:['SELO','NC'],
    tips:['O selo da bomba fica em paralelo <b>só</b> com o NF do LB — o NF do LA fica fora do paralelo.',
          'Linha 2: alarme de nível baixo = NÃO LB.']
  },
  io:[{a:'I0.0',n:'LB Nível baixo',k:'sensor'},{a:'I0.1',n:'LA Nível alto',k:'sensor'},{a:'I0.2',n:'S1 Automático',k:'sw',rest:1},
      {a:'Q0.0',n:'M1 Bomba',k:'pump'},{a:'Q0.1',n:'H1 Nível baixo',k:'lamp',c:'#ff5d5d'}],
  plant:{type:'tank', pump:'Q0.0', lb:'I0.0', la:'I0.1'},
  prog:[ RG([['NO I0.2','?NC I0.0','?NC I0.1','-','OUT Q0.0'],['','?NO Q0.0','','','']],{links:['0,1','0,2']}),
         RG([['?NC I0.0','-','-','-','?OUT Q0.1']]) ],
  tests:[ TS('Enche do baixo até o alto',ST(null,120,{'Q0.0':1,'Q0.1':1},'Tanque vazio: bomba liga'),ST({'I0.0':1},120,{'Q0.0':1,'Q0.1':0},'Passou do nível baixo: continua enchendo'),
            ST({'I0.1':1},120,{'Q0.0':0},'Chegou no alto: desliga'),ST({'I0.1':0},120,{'Q0.0':0},'Consumo baixou do alto: continua desligada'),ST({'I0.0':0},120,{'Q0.0':1,'Q0.1':1},'Desceu do baixo: liga de novo')),
          TS('Chave em manual → bomba desligada',ST({'I0.2':0},120,{'Q0.0':0},'Automático desligado')) ]
},
{
  id:18, name:'Estrela-Triângulo', sub:'CHEFE — partida Y-Δ completa', boss:true, types:['NO','NC','OUT','S','R','P','TON','TOF','CTU'],
  brief:'K1 + K2 (estrela) por 5 s, depois K1 + K3 (triângulo). K2 e K3 nunca juntos.',
  tip:'Monte inclusive os ramos paralelos do selo.',
  aula:{
    intro:'A <b>partida estrela-triângulo</b> é clássica no SENAI: o motor parte em estrela (corrente ≈ 1/3) e depois passa para triângulo. K1 é o contator principal, K2 fecha a estrela e K3 fecha o triângulo. Um TON faz a troca. <b>Intertravamento</b> entre K2 e K3 é obrigatório.',
    codes:['YD','SELO','NFFIS','TON','INTER'],
    tips:['Linha 1: térmico (NF) E desliga (NF) E (liga OU selo K1) → K1.','Linha 2: K1 → TON T1 5 s.',
          'Linha 3: K1 E NÃO T1 E NÃO K3 → K2 (estrela).','Linha 4: T1 E NÃO K2 → K3 (triângulo).']
  },
  io:[{a:'I0.0',n:'B0 Desliga (NF)',k:'pbnf',c:'#ff5d5d'},{a:'I0.1',n:'B1 Liga',k:'pb',c:'#31d07a'},{a:'I0.2',n:'F1 Térmico (NF)',k:'ft'},
      {a:'Q0.0',n:'K1 Principal',k:'k'},{a:'Q0.1',n:'K2 Estrela',k:'k'},{a:'Q0.2',n:'K3 Triângulo',k:'k'}],
  names:{'T1':'Tempo em estrela'},
  plant:{type:'yd', k1:'Q0.0', k2:'Q0.1', k3:'Q0.2'},
  never:[['Q0.1','Q0.2']],
  prog:[ RG([['?NO I0.2','?NO I0.0','?NO I0.1','-','OUT Q0.0'],['','','?NO Q0.0','','']],{links:['0,2','0,3'],edLinks:true}),
         RG([['?NO Q0.0','-','-','-','?TON T1 5']]),
         RG([['?NO Q0.0','?NC T1','?NC Q0.2','-','?OUT Q0.1']]),
         RG([['?NO T1','?NC Q0.1','-','-','?OUT Q0.2']]) ],
  tests:[ TS('Partida Y → Δ',ST(null,100,{'Q0.0':0,'Q0.1':0,'Q0.2':0},'Repouso'),press('I0.1',{'Q0.0':1,'Q0.1':1,'Q0.2':0},'LIGA: estrela'),free('I0.1',{'Q0.0':1,'Q0.1':1},'Soltou: continua em estrela'),
            ST(null,4000,{'Q0.1':1,'Q0.2':0},'4 s: ainda estrela'),ST(null,1200,{'Q0.0':1,'Q0.1':0,'Q0.2':1},'5,3 s: triângulo'),ST({'I0.0':0},120,{'Q0.0':0,'Q0.1':0,'Q0.2':0},'DESLIGA')),
          TS('Térmico desarma tudo',press('I0.1',{}),free('I0.1',{}),ST(null,6000,{'Q0.2':1}),ST({'I0.2':0},120,{'Q0.0':0,'Q0.2':0},'Térmico desarmou'),ST({'I0.1':1},120,{'Q0.0':0},'Tenta ligar com térmico desarmado')) ]
}
];
LEVELS_CLP.forEach(l=>l.machine='clp');

/* =========================================================================
   MODO INFINITO — lógica combinacional aleatória (tabela-verdade)
   ========================================================================= */
function makeEndlessLevel(run){
  let seed=run*9301+49297; const rnd=()=>{ seed=(seed*233280+12345)%2147483647; return (seed%10000)/10000; };
  const pick=a=>a[Math.floor(rnd()*a.length)];
  // modelos conferidos; as variáveis são sorteadas e cada uma pode ser invertida (NA ↔ NF)
  const T2=[ {s:[[[0,0],[1,0]]]}, {s:[[[0,0]],[[1,0]]]}, {s:[[[0,0],[1,1]]]}, {s:[[[0,1]],[[1,0]]]}, {s:[[[0,0],[1,1]],[[0,1],[1,0]]]} ];
  const T3=[ {f:[[[0,0],[1,0]],[[2,0]]]}, {s:[[[0,0],[1,0]],[[2,0]]]}, {s:[[[0,0],[1,1]],[[2,0]]]}, {f:[[[0,0],[1,1]],[[2,1]]]},
             {s:[[[0,0],[1,0],[2,1]]]}, {s:[[[0,0],[1,0]],[[0,1],[2,0]]]}, {f:[[[0,0],[1,0],[2,0]]]}, {s:[[[0,0]],[[1,0],[2,0]]]},
             {f:[[[0,0],[1,0]],[[0,1],[2,0]]]}, {s:[[[0,0],[1,0]],[[1,1],[2,0]]]} ];
  const N=run<4?2:3;
  const ins=['I0.0','I0.1','I0.2'].slice(0,N), nm={'I0.0':'S1','I0.1':'S2','I0.2':'S3'};
  const perm=[...ins]; for(let i=perm.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [perm[i],perm[j]]=[perm[j],perm[i]]; }
  const flip=perm.map(()=>rnd()<.3);
  const tpl=pick(N===2?T2:T3);
  const mk=([v,n])=>({a:perm[v], neg:!!(n^flip[v])});
  let rows, links=[], text, f;
  const C=4, lt=l=>`${l.neg?'NC':'NO'} ${l.a}`, ltx=l=>`${nm[l.a]} ${l.neg?'desligada':'ligada'}`, lv=(l,v)=>l.neg?!v[l.a]:!!v[l.a];
  if(tpl.s){
    const terms=tpl.s.map(t=>t.map(mk)), k=terms.length;
    // cada termo numa linha, completado com fio; todos os ramos se juntam no fim (antes da bobina)
    rows=terms.map((t,r)=>{ const row=[]; for(let c=0;c<C;c++) row.push(c<t.length?'?'+lt(t[c]):'?-'); row.push(r===0?'OUT Q0.0':''); return row; });
    for(let r=0;r<k-1;r++) links.push(r+','+C);
    f=v=>terms.some(t=>t.every(l=>lv(l,v)));
    text=terms.map(t=>t.length>1&&k>1?'('+t.map(ltx).join(' E ')+')':t.map(ltx).join(' E ')).join(' OU ');
  }else{
    const groups=tpl.f.map(g=>g.map(mk));
    const R=Math.max(...groups.map(g=>g.length));
    rows=[...Array(R)].map(()=>[]);
    let c=0;
    groups.forEach(gr=>{ for(let r=0;r<R;r++) rows[r][c]= r<gr.length?'?'+lt(gr[r]):''; for(let r=0;r<gr.length-1;r++) links.push(r+','+(c+1)); c++; });
    for(;c<C;c++) for(let r=0;r<R;r++) rows[r][c]= r===0?'?-':'';
    rows.forEach((row,r)=>row.push(r===0?'OUT Q0.0':''));
    f=v=>groups.every(gr=>gr.some(l=>lv(l,v)));
    text=groups.map(gr=>gr.length>1&&groups.length>1?'('+gr.map(ltx).join(' OU ')+')':gr.map(ltx).join(' OU ')).join(' E ');
  }
  const steps=[];
  for(let m=0;m<(1<<N);m++){ const v={}; ins.forEach((a,i)=>v[a]=(m>>i)&1); steps.push(ST({...v},80,{'Q0.0':f(v)?1:0},ins.map(a=>`${nm[a]}=${v[a]}`).join(' · '))); }
  return {
    id:'∞'+run, endless:true, machine:'clp', name:'Rodada '+run, sub:'Lógica combinacional', types:['NO','NC','OUT'],
    brief:'A lâmpada H1 acende quando: '+text+'.', tip:'Monte a linha que faz exatamente essa lógica. Vale qualquer solução que passe na tabela-verdade.',
    io:[...ins.map(a=>({a,n:nm[a]+' Chave',k:'sw'})),{a:'Q0.0',n:'H1 Lâmpada',k:'lamp',c:'#ffe27a'}],
    prog:[RG(rows,{links,edLinks:true})],
    tests:[TS('Tabela-verdade completa', ...steps)]
  };
}
