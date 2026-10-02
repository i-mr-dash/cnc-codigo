/* =========================================================================
   PAINEL DO SIMULADOR — estilo SSCNC (SwanSoft) · comando Fanuc 0i
   Modos EDIT · MEM · MDI · JOG · INC · HNDL · REF, teclado MDI com buffer,
   softkeys, páginas POS / PROG / OFFSET-SETTING / MESSAGE, zero-peça (WORK)
   e corretores medidos com [MEASURE] — o mesmo procedimento do simulador.
   ========================================================================= */
const TOOL_TYPES = {
  torno:{ desb:{n:'Desbaste externo (pastilha 80°)', dim:'r', def:0.8, tip:3},
          acab:{n:'Acabamento externo (pastilha 35°)', dim:'r', def:0.4, tip:3},
          bedame:{n:'Bedame (canal / corte)', dim:'w', def:3, tip:8},
          broca:{n:'Broca helicoidal', dim:'d', def:4, tip:0},
          centro:{n:'Broca de centro', dim:'d', def:3, tip:0},
          rosca:{n:'Ferramenta de rosca 60°', dim:'r', def:0.1, tip:8},
          interno:{n:'Barra de mandrilar (interno)', dim:'r', def:0.4, tip:2} },
  fresa:{ topo:{n:'Fresa de topo', dim:'d', def:10}, esferica:{n:'Fresa esférica', dim:'d', def:10}, facear:{n:'Cabeçote de facear', dim:'d', def:50},
          broca:{n:'Broca', dim:'d', def:8}, macho:{n:'Macho (rosca)', dim:'d', def:10}, escareador:{n:'Escareador', dim:'d', def:16},
          alargador:{n:'Alargador / mandril', dim:'d', def:12} }
};
const DIM_LBL={r:'raio da ponta (mm)', w:'largura (mm)', d:'diâmetro Ø (mm)'};
const NPOS = m => m==='torno'?8:12;
const posKey = (code, m) => m==='torno' ? String(Math.round(code)).padStart(4,'0').slice(0,2) : String(Math.round(code)).padStart(2,'0').slice(-2);
const pad2 = n => String(Math.round(n)).padStart(2,'0');

function inferTools(lines, machine, part){
  const tools={}; let cur=null, curDefault=false;
  lines.forEach(l=>{
    if(l.raw) return;
    const p=CNC.parse(l.text||''), t=p.words.find(w=>w.L==='T');
    if(!t){
      // fresa: ferramenta sem comentário usada num ciclo de furação vira broca / macho
      if(machine==='fresa' && cur && curDefault){ const gs=CNC.group(p.words).G;
        if(gs.some(G=>G>=81&&G<=86)){ const hd=part&&part.holes&&part.holes[0]?part.holes[0][2]:8;
          tools[cur]= gs.includes(84)?{type:'macho',v:10}:{type:'broca',v:hd}; curDefault=false; } }
      return;
    }
    const pos=posKey(t.v, machine); if(tools[pos]){ cur=pos; curDefault=false; return; }
    const c=(p.comment||'').toUpperCase();
    let type;
    if(machine==='torno'){
      type = /BEDAME|CANAL|CORTE|SANGR/.test(c)?'bedame' : /CENTRO/.test(c)?'centro' : /BROCA|FURA/.test(c)?'broca'
           : /ROSCA/.test(c)?'rosca' : /INTERN|MANDRIL/.test(c)?'interno' : /ACAB/.test(c)?'acab' : 'desb';
    }else{
      type = /ESFER/.test(c)?'esferica' : /MACHO/.test(c)?'macho' : /ESCAR/.test(c)?'escareador' : /MANDRIL|ALARG/.test(c)?'alargador'
           : /BROCA/.test(c)?'broca' : /FACE/.test(c)?'facear' : 'topo';
    }
    const T=TOOL_TYPES[machine][type];
    const m=c.match(/[DMØ]\s*(\d+(?:\.\d+)?)/);
    tools[pos]={type, v: T.dim==='d' && m ? +m[1] : T.def};
    cur=pos; curDefault = machine==='fresa' && !c.trim();
  });
  return tools;
}
function fullTurret(machine, base){
  const std = machine==='torno'
    ? {'01':['desb',0.8],'02':['acab',0.4],'03':['broca',4],'04':['bedame',3],'05':['rosca',0.1],'06':['centro',3],'07':['interno',0.4],'08':['broca',10]}
    : {'01':['topo',10],'02':['broca',8],'03':['macho',10],'04':['esferica',10],'05':['escareador',16],'06':['alargador',12],'07':['facear',50],'08':['topo',6]};
  const t=JSON.parse(JSON.stringify(base||{}));
  Object.entries(std).forEach(([k,[type,v]])=>{ if(!t[k]) t[k]={type,v}; });
  return t;
}
function toolLookup(tools, machine){
  return code=>{
    if(code==null||code==='') return null;
    const t=tools[posKey(+code, machine)]; if(!t||!t.type) return null;
    const T=TOOL_TYPES[machine][t.type]; if(!T) return null;
    const o={type:t.type}; o[T.dim]=+t.v||T.def; return o;
  };
}

/* =========================================================================
   FÍSICA DA MÁQUINA: onde a ferramenta REAL está × onde o comando ACHA que ela está
   posição de máquina m  =  posição física da ponta  +  T (constante de cada ferramenta)
   o comando mostra  ABS = m − zero-peça (WORK) − corretor        (Fanuc)
   erro de posição   = (WORK + corretor) − T                      (zero quando tudo foi medido certo)
   ========================================================================= */
const TT = {
  torno:{ dx:[0,-3.2,0,8.4,4.1,0,-12.6,5.3], dz:[0,2.1,40,10.4,6.2,12,25,15.5], hx:100, hz:45 },
  fresa:{ dz:[0,25,18,32,12,40,-10,0,0,0,0,0], hx:120, hy:90, hz:60 }
};
function trueTip(machine, slot){
  const i=Math.max(0,(slot||1)-1);
  if(machine==='torno') return {x:-(TT.torno.hx+(TT.torno.dx[i]||0)), z:-(TT.torno.hz+(TT.torno.dz[i]||0))};
  return {x:-TT.fresa.hx, y:-TT.fresa.hy, z:-(TT.fresa.hz+(TT.fresa.dz[i]||0))};
}
const freshSetup = m => {
  const rowsN=NPOS(m), geo={}, wear={}, work={};
  for(let i=1;i<=rowsN;i++){ geo[pad2(i)] = m==='torno' ? {x:0,z:0,r:0,t:0} : {h:0,d:0}; if(m==='torno') wear[pad2(i)]={x:0,z:0,r:0,t:0}; }
  for(let g=54;g<=59;g++) work[g] = m==='torno' ? {x:0,z:0} : {x:0,y:0,z:0};
  return {geo, wear, work};
};
const SIM = { lines:[], res:null, machine:'torno', part:null, tools:{}, rowText:r=>'', rowN:r=>'', rowEl:null, focus:-1, alarms:[], errs:[], ctx:null };
const MACH = {
  mode:'MEM', page:'POS', sub:{POS:'ABS', PROG:'PRG', OFS:'GEOM', SYS:'PARAM', MSG:'ALARM'}, oprt:false, cur:{row:0,col:0}, shift:false,
  setup:{torno:freshSetup('torno'), fresa:freshSetup('fresa')},
  m:{torno:{x:-8,z:-6}, fresa:{x:-6,y:-5,z:-4}},
  ref:{torno:{X:false,Z:false}, fresa:{X:false,Y:false,Z:false}},
  tool:{torno:1, fresa:1}, offIdx:0, wcs:54, hlen:false, hidx:null, didx:null, pendT:null,
  spin:5, cool:false, emg:false, axis:'X', rapid:false, incIdx:1, jogOvr:20, spinOvr:100,
  mdi:[], relOrigin:{torno:{x:0,z:0}, fresa:{x:0,y:0,z:0}}, almList:[], runRow:-1, runPos:null, feeler:{torno:0, fresa:1}, moving:false, holdMove:false,
  bdt:false, runCarved0:0
};
let has3D=false;
const mm = () => MACH.m[SIM.machine];
const setup = () => MACH.setup[SIM.machine];
const refOf = () => MACH.ref[SIM.machine];
const allRef = () => Object.values(refOf()).every(Boolean);
const slotNow = () => MACH.tool[SIM.machine];
const AXES = () => SIM.machine==='torno' ? ['x','z'] : ['x','y','z'];
function physOf(m, slot){ const T=trueTip(SIM.machine, slot||slotNow());
  return SIM.machine==='torno' ? {x:m.x-T.x, y:0, z:m.z-T.z} : {x:m.x-T.x, y:m.y-T.y, z:m.z-T.z}; }
function machOf(ph, slot){ const T=trueTip(SIM.machine, slot||slotNow());
  return SIM.machine==='torno' ? {x:ph.x+T.x, z:ph.z+T.z} : {x:ph.x+T.x, y:(ph.y||0)+T.y, z:ph.z+T.z}; }
/* offsets que o comando está usando agora (zero-peça + corretor) */
function offsetsNow(){
  const su=setup(), W=su.work[MACH.wcs]||su.work[54];
  if(SIM.machine==='torno'){ const oi=MACH.offIdx, g=oi&&su.geo[pad2(oi)]||{x:0,z:0}, w=oi&&su.wear[pad2(oi)]||{x:0,z:0}; return {x:W.x+g.x+w.x, z:W.z+g.z+w.z}; }
  const h = MACH.hlen && MACH.hidx && su.geo[pad2(MACH.hidx)] ? su.geo[pad2(MACH.hidx)].h : 0;
  return {x:W.x, y:W.y, z:W.z+h};
}
function absOf(m){ const o=offsetsNow(), r={x:m.x-o.x, z:m.z-o.z}; if(SIM.machine==='fresa') r.y=m.y-o.y; return r; }
/* erro físico de um trecho do programa: quanto a ponta real fica longe do que foi comandado */
function shiftFor(seg){
  const su=setup(), m=SIM.machine, W=su.work[seg.wcs||54]||su.work[54];
  if(m==='torno'){
    const code=String(seg.tool||'0000').padStart(4,'0'), pos=+code.slice(0,2)||1, oi=+code.slice(2,4)||0;
    const T=trueTip('torno',pos), g=oi&&su.geo[pad2(oi)]||{x:0,z:0}, w=oi&&su.wear[pad2(oi)]||{x:0,z:0};
    return {x:W.x+g.x+w.x-T.x, y:0, z:W.z+g.z+w.z-T.z};
  }
  const pos=+seg.tool||1, T=trueTip('fresa',pos);
  const h = seg.hlen && seg.hidx && su.geo[pad2(seg.hidx)] ? su.geo[pad2(seg.hidx)].h : 0;
  return {x:W.x-T.x, y:W.y-T.y, z:W.z+h-T.z};
}
function compFor(seg){ if(SIM.machine!=='fresa') return null; const g=seg.didx&&setup().geo[pad2(seg.didx)]; return g ? g.d : 0; }
function homeFor(code){
  const slot = SIM.machine==='torno' ? (+String(code||'0100').padStart(4,'0').slice(0,2)||1) : (+code||1);
  return physOf(SIM.machine==='torno'?{x:0,z:0}:{x:0,y:0,z:0}, slot);
}
const toolCodeNow = () => SIM.machine==='torno' ? pad2(slotNow())+'00' : pad2(slotNow());

/* corretores "certos" (atalho Preparar máquina): é o que o aluno obteria medindo com cuidado */
function perfectSetup(){
  const m=SIM.machine, su=setup(), tools=SIM.tools||{};
  if(m==='torno'){
    for(let g=54;g<=59;g++) su.work[g]={x:0,z:0};
    for(let i=1;i<=8;i++){ const T=trueTip('torno',i), t=tools[pad2(i)], T0=t&&TOOL_TYPES.torno[t.type];
      su.geo[pad2(i)]={x:T.x, z:T.z, r:T0&&T0.dim==='r'?+t.v:0, t:T0?T0.tip:0}; }
  }else{
    const T1=trueTip('fresa',1);
    su.work[54]={x:T1.x, y:T1.y, z:T1.z};
    for(let i=1;i<=12;i++){ const T=trueTip('fresa',i), t=tools[pad2(i)], T0=t&&TOOL_TYPES.fresa[t.type];
      su.geo[pad2(i)]={h:T.z-T1.z, d:T0?(+t.v||T0.def)/2:0}; }
  }
  Object.keys(refOf()).forEach(a=>refOf()[a]=true);
  const home = m==='torno'?{x:0,z:0}:{x:0,y:0,z:0}; Object.assign(mm(), home);
}


/* =========================================================================
   LAYOUT: abas Programa / Máquina (tela estreita), montagem do painel
   ========================================================================= */
function mountSim(sel){ const slot=$(sel); if(slot && $('#simPanel').parentNode!==slot) slot.appendChild($('#simPanel')); requestAnimationFrame(()=>draw2d()); }
function setView(scr, v){
  const sc=typeof scr==='string'?$(scr):scr, g=sc&&sc.querySelector('.play-grid'); if(!g||g.dataset.view===v) return;
  g.dataset.view=v;
  sc.querySelectorAll('.vt').forEach(b=>{ const on=b.dataset.view===v; b.classList.toggle('on',on); b.setAttribute('aria-selected',on?'true':'false'); });
  if(v==='sim') requestAnimationFrame(()=>{ CC=null; draw2d(); });
}
$$('.viewtabs .vt').forEach(b=>b.addEventListener('click',()=>setView(b.closest('.screen'), b.dataset.view)));
$('#benchRun').addEventListener('click',()=>setView('#screen-bench','sim'));
(function vtLed(){   /* luz na aba Máquina: verde rodando, vermelha com alarme */
  const upd=()=>{ const run=$('#opStart').classList.contains('lit'), alm=!!$('#crtAlm').textContent.trim();
    $$('.vt-led').forEach(i=>{ i.classList.toggle('run',run&&!alm); i.classList.toggle('alm',alm); }); };
  const mo=new MutationObserver(upd);
  mo.observe($('#opStart'),{attributes:true,attributeFilter:['class']});
  mo.observe($('#crtAlm'),{childList:true,characterData:true,subtree:true});
})();
function lastRow(){ return SIM.res && SIM.res.order.length ? SIM.res.order[SIM.res.order.length-1] : -1; }

/* =========================================================================
   TELA DO COMANDO (CRT)
   ========================================================================= */
const PAGE_TITLE={POS:'POSIÇÃO', PROG:'PROGRAMA', OFS:'CORRETOR / AJUSTE', SYS:'SISTEMA', MSG:'MENSAGEM', GRF:'GRÁFICO'};
const fnum = v => v==null||isNaN(v) ? '    ------' : ((v<0?'-':'')+Math.abs(v).toFixed(3)).padStart(10,' ');
const e2 = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
function idleState(){
  const T=SIM.machine==='torno';
  return {F:null, S:null, spin:MACH.spin, cool:MACH.cool, tool:toolCodeNow(), comp:40, mot:MACH.mot||0, css:false, unit:21, wcs:MACH.wcs, abs:true,
    fmode:T?95:94, plane:17, hlen:MACH.hlen, cyc:null, polar:false, manual:true};
}
function modalState(){
  if(MACH.runState && (Sim3D.active()||MACH.afterRun)) return MACH.runState;
  const r=SIM.res; if(r && SIM.focus>=0 && r.states[SIM.focus] && !Sim3D.active()) return {...r.states[SIM.focus], preview:true};
  return idleState();
}
function modalLine(st){
  const T=SIM.machine==='torno', pad=n=>'G'+String(n??0).padStart(2,'0');
  return T ? [pad(st.mot), st.css?'G96':'G97', 'G'+st.unit, 'G'+st.comp, 'G'+(st.wcs||54), st.abs?'G90':'G91', 'G'+st.fmode].join(' ')
           : [pad(st.mot), 'G'+st.plane, 'G'+st.unit, 'G'+st.comp, 'G'+(st.wcs||54), st.cyc?'G'+st.cyc:'G80', st.abs?'G90':'G91', 'G'+st.fmode, st.hlen?'G43':'G49', st.polar?'G16':'G15'].join(' ');
}
function absNow(){
  if(Sim3D.active() && MACH.runPos && !MACH.holdMove){ const p=MACH.runPos; const o=absOf(mm()); return {x:p.x??o.x, y:p.y??o.y, z:p.z??o.z}; }
  return absOf(mm());
}
function posBlock(title, vals, labels){
  return `<div class="ss-blk"><div class="ss-bt">${title}</div>`+labels.map((l,i)=>`<div class="ss-ax"><b>${l}</b><span>${fnum(vals[i])}</span></div>`).join('')+`</div>`;
}
function renderBody(){
  const T=SIM.machine==='torno', page=MACH.page, sub=MACH.sub[page], st=modalState(), m=mm(), su=setup();
  let h='';
  const ax=T?['x','z']:['x','y','z'], AX=ax.map(a=>a.toUpperCase());
  if(page==='POS'){
    const abs=absNow(), ro=MACH.relOrigin[SIM.machine];
    const A=ax.map(a=>abs[a]), R=ax.map(a=>abs[a]-ro[a]), Mc=ax.map(a=>m[a]);
    if(sub==='ABS') h=`<div class="ss-sub">COORDENADA ABSOLUTA</div><div class="ss-big">`+ax.map((a,i)=>`<div class="ss-ax big"><b>${AX[i]}</b><span>${fnum(A[i])}</span></div>`).join('')+`</div>`;
    else if(sub==='REL') h=`<div class="ss-sub">COORDENADA RELATIVA</div><div class="ss-big">`+ax.map((a,i)=>`<div class="ss-ax big"><b>${T?(a==='x'?'U':'W'):AX[i]}</b><span>${fnum(R[i])}</span></div>`).join('')+`</div>`;
    else h=`<div class="ss-grid">`+posBlock('RELATIVA',R,T?['U','W']:AX)+posBlock('ABSOLUTA',A,AX)+posBlock('MÁQUINA',Mc,AX)+posBlock('DIST. A PERCORRER',ax.map(()=>0),AX)+`</div>`;
    const fu = st.fmode===95?'MM/ROT':'MM/MIN', su2=T?(st.css?'M/MIN':'RPM'):'RPM';
    h+=`<div class="ss-act">F <b>${st.F!=null?fmt(st.F):'0'}</b> ${fu} &nbsp; S <b>${st.S!=null?fmt(st.S):'0'}</b> ${su2}${T&&st.smax?' · MÁX '+fmt(st.smax):''} &nbsp; T <b>${e2(st.tool||'—')}</b></div>`;
    h+=`<div class="ss-lamps">${lampsHtml(st)}</div>`;
  }else if(page==='PROG'){
    if(MACH.mode==='MDI'){
      h=`<div class="ss-sub">MDI</div><div class="ss-prog">`+(MACH.mdi.length?MACH.mdi.map(l=>`<div>${e2(l)};</div>`).join(''):'<div class="dim">(digite o bloco, INSERT; depois CYCLE START)</div>')+`</div>`;
    }else if(sub==='DIR'){
      const first=SIM.lines.find(l=>/^\s*O\d+/i.test(SIM.rowText(l.row)||l.text||''));
      const pr=first?((SIM.rowText(first.row)||first.text).trim()):'O0000';
      h=`<div class="ss-sub">LISTA DE PROGRAMAS</div><div class="ss-prog"><div>${e2(pr)}</div><div class="dim">PROGRAMAS: 1 · MEMÓRIA LIVRE: 99%</div></div>`;
    }else h=`<div class="ss-sub">${MACH.mode==='EDIT'?'EDIÇÃO':'PROGRAMA'}</div><div class="ss-prog" id="progList">${progListHtml(MACH.runRow>=0&&Sim3D.active()?MACH.runRow:SIM.focus)}</div>`;
  }else if(page==='OFS'){
    h=ofsHtml(sub);
  }else if(page==='SYS'){
    h=`<div class="ss-sub">SISTEMA</div><div class="ss-prog"><div>SÉRIE 0i-${T?'TC':'MC'}  (SIMULADA)</div><div>EIXOS: ${AX.join(' ')}</div><div>ENTRADA: ${T?'DIÂMETRO (X)':'MM'}</div><div class="dim">${sub==='DGNOS'?'DIAGNÓSTICO: SEM ALARMES DE SERVO':'PARÂMETROS: FIXOS NESTE SIMULADOR'}</div></div>`;
  }else if(page==='MSG'){
    const L=MACH.almList;
    h=`<div class="ss-sub">${sub==='MSG'?'MENSAGENS':'ALARMES'}</div><div class="ss-prog">`+(L.length?L.map(a=>`<div class="alm">ALM — ${e2(a.msg)}${a.row!=null&&a.row>=0?` [${e2(SIM.rowN(a.row))}]`:''}</div>`).join(''):'<div class="okm">SEM ALARMES</div>')+`</div>`;
  }else if(page==='GRF'){
    h=`<div class="ss-sub">GRÁFICO</div><div class="ss-prog"><div>A trajetória aparece na aba <b>DESENHO</b> (e em amarelo/azul no 3D).</div></div>`;
  }
  $('#crtBody').innerHTML=h;
  $('#crtModal').textContent=modalLine(st)+(st.preview?'  (após este bloco)':'');
}
function progListHtml(cur){
  const L=SIM.lines; if(!L.length) return '<div class="dim">(sem programa)</div>';
  const idx=Math.max(0, L.findIndex(l=>l.row===cur));
  const a=Math.max(0, idx-3), b=Math.min(L.length, a+9);
  return L.slice(a,b).map(l=>{
    const t=(SIM.rowText(l.row)||'').trim(), n=SIM.rowN(l.row);
    const txt=(/^N/i.test(t)||!/^N/.test(n)? t : n+' '+t) || '';
    return `<div class="${l.row===cur?'cur':''}">${e2(txt)};</div>`; }).join('');
}
const OFS_COLS = () => SIM.machine==='torno' ? (MACH.sub.OFS==='WORK'?['x','z']:['x','z','r','t']) : (MACH.sub.OFS==='WORK'?['x','y','z']:['h','d']);
const OFS_ROWS = () => MACH.sub.OFS==='WORK' ? 6 : NPOS(SIM.machine);
function ofsHtml(sub){
  const T=SIM.machine==='torno', su=setup(), tools=SIM.tools||{}, cols=OFS_COLS(), cur=MACH.cur;
  if(sub==='SET'){
    return `<div class="ss-sub">AJUSTE (SETTING)</div><div class="ss-prog"><div>ESCRITA DE PARÂMETRO ...... 0 (BLOQUEADA)</div><div>UNIDADE DE ENTRADA ........ 0 (MM)</div><div>CONFERÊNCIA TV ........... 0</div><div>CÓDIGO DE SAÍDA .......... 1 (ISO)</div><div>NÚMERO DE SEQUÊNCIA ...... 0 (OFF)</div><div class="dim">${T?'Torno: ajuste os corretores em GEOM; o zero-peça em WORK.':'Fresa: o zero-peça (G54) fica em WORK; H e D em OFFSET.'}</div></div>`;
  }
  const rowsN=OFS_ROWS();
  let th, body='';
  if(sub==='WORK'){
    th='<tr><th>Nº</th>'+cols.map(c=>`<th>${c.toUpperCase()}</th>`).join('')+'<th></th></tr>';
    for(let r=0;r<rowsN;r++){ const g=54+r, w=su.work[g];
      body+=`<tr class="${MACH.wcs===g?'act':''}"><td>G${g}</td>`+cols.map((c,ci)=>`<td class="v ${cur.row===r&&cur.col===ci?'cur':''}">${fnum(w[c])}</td>`).join('')+`<td class="dim">${MACH.wcs===g?'◀ ATIVO':''}</td></tr>`; }
    return `<div class="ss-sub">ZERO-PEÇA (WORK)</div><table class="ss-tab">${th}${body}</table><div class="ss-hint">${T?'X em diâmetro':'X Y Z'}: toque a peça, digite o valor e use [MEASURE]</div>`;
  }
  if(T){
    const tb = sub==='WEAR' ? su.wear : su.geo;
    th='<tr><th>Nº</th><th>X</th><th>Z</th><th>R</th><th>T</th><th>FERRAMENTA</th></tr>';
    for(let r=0;r<rowsN;r++){ const k=pad2(r+1), v=tb[k], t=tools[k], T0=t&&TOOL_TYPES.torno[t.type];
      const zero = sub==='GEOM' && v.x===0 && v.z===0;
      body+=`<tr class="${zero&&T0?'nm':''}"><td>${sub==='WEAR'?'W':'G'} ${k}</td>`+cols.map((c,ci)=>`<td class="v ${cur.row===r&&cur.col===ci?'cur':''}">${c==='t'?v[c]:fnum(v[c]).trim().padStart(c==='r'?6:9,' ')}</td>`).join('')+`<td class="tp">${T0?e2(T0.n.split(' (')[0]):'— vazio'}</td></tr>`; }
    return `<div class="ss-sub">${sub==='WEAR'?'DESGASTE':'GEOMETRIA'}</div><table class="ss-tab">${th}${body}</table>`;
  }
  th='<tr><th>Nº</th><th>H (COMPR.)</th><th>D (RAIO)</th><th>FERRAMENTA</th></tr>';
  for(let r=0;r<rowsN;r++){ const k=pad2(r+1), v=su.geo[k], t=tools[k], T0=t&&TOOL_TYPES.fresa[t.type];
    body+=`<tr><td>${k}</td>`+cols.map((c,ci)=>`<td class="v ${cur.row===r&&cur.col===ci?'cur':''}">${fnum(v[c])}</td>`).join('')+`<td class="tp">${T0?e2(T0.n)+' Ø'+fmt(+t.v):'— vazio'}</td></tr>`; }
  return `<div class="ss-sub">CORRETOR (GEOM)</div><table class="ss-tab">${th}${body}</table>`;
}
function lampsHtml(st){
  const spin=st.spin===3?'FUSO ↻ M3':st.spin===4?'FUSO ↺ M4':'FUSO M5';
  return `<span class="lamp spin ${st.spin===3||st.spin===4?'on':''}"><i></i>${spin}</span>`+
    `<span class="lamp cool ${st.cool?'on':''}"><i></i>${st.cool?'REFRIG M8':'REFRIG M9'}</span>`+
    `<span class="lamp ${st.comp&&st.comp!==40?'on':''}"><i></i>${st.comp&&st.comp!==40?'COMP G'+st.comp:'COMP G40'}</span>`+
    (st.stop?`<span class="lamp on"><i></i>PARADA ${st.stop}</span>`:'');
}
function renderCRT(){
  $('#crtPage').textContent = PAGE_TITLE[MACH.page]+(MACH.page==='OFS'&&MACH.sub.OFS==='WORK'?'':'');
  const first=SIM.lines.find(l=>/^\s*O\d+/i.test(SIM.rowText(l.row)||l.text||''));
  const prog=first?((SIM.rowText(first.row)||first.text).match(/O\d+/i)||['O0000'])[0].toUpperCase():'O0000';
  const row=(Sim3D.active()||MACH.afterRun)&&MACH.runRow>=0?MACH.runRow:SIM.focus;
  const nTxt=row>=0?SIM.rowN(row):'';
  $('#crtProg').textContent=`${prog} ${/^N/.test(nTxt)?nTxt:''}`;
  renderBody(); renderSoftkeys(); renderRefLamps(); updateGap();
}
const fanucHud = () => renderCRT();    /* compatibilidade com o game.js */

/* ---------- softkeys ---------- */
function skDefs(){
  const p=MACH.page, s=MACH.sub[p], T=SIM.machine==='torno';
  const K=(l,id)=>({l,id});
  if(p==='POS') return [K('ABS','pos:ABS'),K('REL','pos:REL'),K('ALL','pos:ALL'), s==='REL'?K('ORIGIN','origin'):K('',''), K('','')];
  if(p==='PROG') return [K('PRGRM','prog:PRG'),K('DIR','prog:DIR'),K('CHECK','prog:CHK'),K('',''),K('','')];
  if(p==='OFS'){
    if(MACH.oprt) return [K('NO.SRH','srh'),K('MEASURE','measure'),K('+INPUT','plus'),K('INPUT','input'),K('◀ VOLTAR','oprt0')];
    return T ? [K('WEAR','ofs:WEAR'),K('GEOM','ofs:GEOM'),K('SETTING','ofs:SET'),K('WORK','ofs:WORK'),K('(OPRT)','oprt1')]
             : [K('OFFSET','ofs:GEOM'),K('SETTING','ofs:SET'),K('WORK','ofs:WORK'),K('',''),K('(OPRT)','oprt1')];
  }
  if(p==='MSG') return [K('ALARM','msg:ALARM'),K('MSG','msg:MSG'),K('HISTRY','msg:HIS'),K('',''),K('','')];
  if(p==='SYS') return [K('PARAM','sys:PARAM'),K('DGNOS','sys:DGNOS'),K('SYSTEM','sys:SYS'),K('',''),K('','')];
  return [K('GRAPH','graph'),K('',''),K('',''),K('',''),K('','')];
}
function renderSoftkeys(){
  const d=skDefs(), act=MACH.sub[MACH.page];
  $('#softkeys').innerHTML = d.map((k,i)=>`<button class="sk ${k.l&&(k.id==='pos:'+act||k.id==='ofs:'+act||k.id==='prog:'+act||k.id==='msg:'+act||k.id==='sys:'+act)?'on':''}" data-sk="${k.id}" ${k.id?'':'disabled'}>${k.l}</button>`).join('');
  $$('#softkeys .sk').forEach(b=>b.onclick=()=>softKey(b.dataset.sk));
}
function softKey(id){
  if(!id) return; beep(700,.03,'square',.03);
  const [a,b]=id.split(':');
  if(a==='pos'||a==='prog'||a==='ofs'||a==='msg'||a==='sys'){ MACH.sub[{pos:'POS',prog:'PROG',ofs:'OFS',msg:'MSG',sys:'SYS'}[a]]=b; MACH.cur={row:0,col:0}; renderCRT(); return; }
  if(id==='origin'){ const m=absNow(), ro=MACH.relOrigin[SIM.machine]; AXES().forEach(k=>ro[k]=m[k]); renderCRT(); return; }
  if(id==='oprt1'){ MACH.oprt=true; renderCRT(); return; }
  if(id==='oprt0'){ MACH.oprt=false; renderCRT(); return; }
  if(id==='input'){ ofsInput(false); return; }
  if(id==='plus'){ ofsInput(true); return; }
  if(id==='measure'){ ofsMeasure(); return; }
  if(id==='srh'){ const v=parseAddr(bufEl().value); if(v&&!v.a){ MACH.cur.row=Math.max(0,Math.min(OFS_ROWS()-1,Math.round(v.v)-1)); bufEl().value=''; renderCRT(); } else toast('Digite o número da linha e use [NO.SRH].'); return; }
  if(id==='graph'){ $('#tab2d').click(); return; }
}
function setPage(pg){
  MACH.page=pg; MACH.oprt=false; if(pg==='OFS') MACH.cur={row:Math.min(MACH.cur.row,OFS_ROWS()-1),col:0};
  $$('.fk').forEach(b=>b.classList.toggle('on', b.dataset.pg===pg));
  renderCRT();
}

/* =========================================================================
   TECLADO MDI
   ========================================================================= */
const KEYROWS = [
  [['O','P'],['N','Q'],['G','R'],['7','A'],['8','B'],['9','C']],
  [['X','U'],['Y','V'],['Z','W'],['4','('],['5',')'],['6','/']],
  [['M','I'],['S','J'],['T','K'],['1',','],['2','#'],['3','=']],
  [['F','L'],['H','D'],['EOB','E'],['-','+'],['0','*'],['.','[']]
];
const bufEl = () => $('#kbBuf');
function buildKeyboard(){
  const rows=KEYROWS.map(r=>`<div class="kb-row">`+r.map(([a,b])=>`<button class="kk ${a.length>1?'eob':''}" data-k="${a}" data-s="${b}"><b>${a}</b><i>${b}</i></button>`).join('')+`</div>`).join('');
  $('#kbd').innerHTML = `<div class="kb-keys">${rows}</div>
   <div class="kb-ctl">
     <button class="kk ctl shift" id="kShift">SHIFT</button><button class="kk ctl" data-c="CAN">CAN</button><button class="kk ctl" data-c="INPUT">INPUT</button>
     <button class="kk ctl" data-c="ALTER">ALTER</button><button class="kk ctl" data-c="INSERT">INSERT</button><button class="kk ctl" data-c="DELETE">DELETE</button>
   </div>
   <div class="kb-fn">
     <button class="fk on" data-pg="POS">POS</button><button class="fk" data-pg="PROG">PROG</button>
     <button class="fk" data-pg="OFS">OFFSET<br>SETTING</button><button class="fk" data-pg="SYS">SYSTEM</button>
     <button class="fk" data-pg="MSG">MESSAGE</button><button class="fk" data-pg="GRF">CUSTOM<br>GRAPH</button>
   </div>
   <div class="kb-nav">
     <button class="kk ctl rst" data-c="RESET">RESET</button><button class="kk ctl" data-c="HELP">HELP</button>
     <span class="sp"></span>
     <button class="kk ctl" data-c="PGUP">PAGE ▲</button><button class="kk ctl" data-c="PGDN">PAGE ▼</button>
     <span class="sp"></span>
     <button class="kk ctl" data-c="LEFT">◀</button><button class="kk ctl" data-c="UP">▲</button><button class="kk ctl" data-c="DOWN">▼</button><button class="kk ctl" data-c="RIGHT">▶</button>
   </div>`;
  $$('#kbd .kk[data-k]').forEach(b=>b.onclick=()=>{ keyChar(MACH.shift ? b.dataset.s : b.dataset.k); if(MACH.shift) setShift(false); });
  $$('#kbd .kk[data-c]').forEach(b=>b.onclick=()=>keyCtl(b.dataset.c));
  $('#kShift').onclick=()=>setShift(!MACH.shift);
  $$('#kbd .fk').forEach(b=>b.onclick=()=>{ beep(640,.03,'square',.03); setPage(b.dataset.pg); });
  bufEl().addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); defaultEnter(); } });
  bufEl().addEventListener('input',()=>{ bufEl().value=bufEl().value.toUpperCase(); });
}
function setShift(on){ MACH.shift=on; $('#kShift').classList.toggle('on',on); $('#kbd').classList.toggle('shifted',on); }
function keyChar(c){ beep(900,.025,'square',.025); const b=bufEl(); b.value += (c==='EOB'?';':c); b.scrollLeft=b.scrollWidth; }
function defaultEnter(){
  if(MACH.mode==='MDI'||MACH.mode==='EDIT') keyCtl('INSERT');
  else if(MACH.page==='OFS') ofsInput(false);
}
function keyCtl(c){
  beep(640,.03,'square',.03);
  const b=bufEl();
  if(c==='CAN'){ b.value=b.value.slice(0,-1); return; }
  if(c==='INPUT'){ if(MACH.page==='OFS') ofsInput(false); else if(MACH.mode==='MDI') progEdit('INSERT'); else toast('INPUT grava valores nas páginas OFFSET/SETTING (corretores e zero-peça).'); return; }
  if(c==='ALTER'||c==='INSERT'||c==='DELETE'){ progEdit(c); return; }
  if(c==='RESET'){ $('#opReset').click(); b.value=''; return; }
  if(c==='HELP'){ showHelp(); return; }
  if(c==='UP'||c==='DOWN'||c==='LEFT'||c==='RIGHT'||c==='PGUP'||c==='PGDN'){ navKey(c); return; }
}
function navKey(c){
  const dr=c==='UP'?-1:c==='DOWN'?1:0, dc=c==='LEFT'?-1:c==='RIGHT'?1:0;
  if(MACH.page==='OFS' && MACH.sub.OFS!=='SET'){
    const rows=OFS_ROWS(), cols=OFS_COLS().length, cu=MACH.cur;
    if(c==='PGUP'||c==='PGDN'){ MACH.sub.OFS = (SIM.machine==='torno') ? (c==='PGDN'?(MACH.sub.OFS==='WEAR'?'GEOM':MACH.sub.OFS==='GEOM'?'WORK':'WEAR'):(MACH.sub.OFS==='WORK'?'GEOM':MACH.sub.OFS==='GEOM'?'WEAR':'WORK')) : (MACH.sub.OFS==='GEOM'?'WORK':'GEOM'); MACH.cur={row:0,col:0}; }
    else{ cu.row=Math.max(0,Math.min(rows-1,cu.row+dr)); cu.col=Math.max(0,Math.min(cols-1,cu.col+dc)); }
    renderCRT(); return;
  }
  if(MACH.page==='POS' && (c==='PGUP'||c==='PGDN')){ const o=['ABS','REL','ALL'], i=o.indexOf(MACH.sub.POS); MACH.sub.POS=o[(i+(c==='PGDN'?1:2))%3]; renderCRT(); return; }
  if(MACH.page==='PROG' || MACH.page==='POS'){
    const api=progAPI(); if(!api||!dr) return;
    const n=api.count(); let r=SIM.focus<0?0:SIM.focus; r=Math.max(0,Math.min(n-1,r+dr)); api.focus(r); renderCRT();
  }
}
function showHelp(){
  const m=SIM.machine==='torno';
  const steps = m
   ? ['<b>1.</b> Modo <b>REF</b> → aperte <b>+X</b> e <b>+Z</b> (as luzes REF acendem).',
      '<b>2.</b> <b>JOG</b>: ligue o fuso (<b>CW</b>) e encoste a ferramenta na face; modo <b>INC/HNDL</b> para chegar devagar.',
      '<b>3.</b> <b>OFFSET</b> → <b>GEOM</b> → cursor na linha da ferramenta → digite <b>Z0</b> → <b>(OPRT)</b> → <b>MEASURE</b>.',
      '<b>4.</b> Faça um corte de teste no diâmetro, meça com o <b>Paquímetro</b>, digite <b>X</b>+valor → <b>MEASURE</b>.',
      '<b>5.</b> Modo <b>MEM</b> → <b>CYCLE START</b>.']
   : ['<b>1.</b> Modo <b>REF</b> → <b>+X</b> <b>+Y</b> <b>+Z</b>.',
      '<b>2.</b> <b>JOG</b>/<b>INC</b>/<b>HNDL</b>: encoste a ferramenta na lateral da peça com o calibrador (folga ideal = <b>APROPRIADO</b>).',
      '<b>3.</b> <b>OFFSET</b> → <b>WORK</b> → cursor em G54 → digite <b>X</b>(−raio−calibrador) → <b>(OPRT)</b> → <b>MEASURE</b>. Idem para <b>Y</b>.',
      '<b>4.</b> Z: encoste no topo, digite <b>Z</b>(calibrador) → <b>MEASURE</b> (G54 Z). Outras ferramentas: <b>H</b> em OFFSET.',
      '<b>5.</b> Digite <b>D</b>(raio) em OFFSET → <b>INPUT</b>. Modo <b>MEM</b> → <b>CYCLE START</b>.'];
  $('#unTitle').textContent='Ajuda — preparar a máquina';
  $('#modalUnlock').classList.remove('finish');
  $('#unBody').innerHTML=`<div class="exrow">${steps.join('<br>')}</div><div class="exrow">Pressa? Em <b>Ferramentas</b> há o atalho <b>Preparar máquina</b>, que faz tudo isso de uma vez.</div>`;
  $('#unClose').textContent='Fechar'; $('#unClose').onclick=()=>closeModal('#modalUnlock'); openModal('#modalUnlock');
}

/* ---------- OFFSET / WORK: INPUT, +INPUT e MEASURE ---------- */
function parseAddr(s){ const m=/^([A-Z])?([+-]?(?:\d+\.?\d*|\.\d+))$/.exec(String(s||'').replace(/\s|;/g,'').toUpperCase()); return m?{a:m[1]||null, v:+m[2]}:null; }
function ofsCell(pa){
  const cols=OFS_COLS(); let ci=MACH.cur.col;
  if(pa.a){ const k=cols.indexOf(pa.a.toLowerCase()); if(k<0) return null; ci=k; }
  return {row:MACH.cur.row, col:ci, key:cols[ci]};
}
function ofsTable(){ const su=setup(), s=MACH.sub.OFS;
  if(s==='WORK') return {tbl:su.work, rk:r=>54+r};
  if(s==='WEAR') return {tbl:su.wear, rk:r=>pad2(r+1)};
  return {tbl:su.geo, rk:r=>pad2(r+1)}; }
function ofsInput(add){
  if(MACH.page!=='OFS'||MACH.sub.OFS==='SET'){ toast('Vá em <b>OFFSET/SETTING</b> → GEOM ou WORK para gravar valores.'); return; }
  const pa=parseAddr(bufEl().value); if(!pa){ toast('Digite um valor (ex.: <b>X-20.5</b> ou <b>0.8</b>) antes de apertar INPUT.'); return; }
  const c=ofsCell(pa); if(!c){ toast(`A coluna <b>${pa.a}</b> não existe nesta página.`); return; }
  const {tbl,rk}=ofsTable(), cell=tbl[rk(c.row)];
  cell[c.key]= add ? Math.round((cell[c.key]+pa.v)*1000)/1000 : pa.v;
  bufEl().value=''; beep(1000,.05); renderCRT();
}
function ofsMeasure(){
  const s=MACH.sub.OFS; if(MACH.page!=='OFS'||(s!=='GEOM'&&s!=='WORK')){ toast('[MEASURE] funciona nas páginas <b>GEOM</b> (corretor) e <b>WORK</b> (zero-peça).'); return; }
  const pa=parseAddr(bufEl().value);
  if(!pa||!pa.a){ toast('Digite o eixo e o valor da posição onde a ferramenta está (ex.: <b>Z0</b>) e use [MEASURE].'); return; }
  const axis=pa.a.toLowerCase(), T=SIM.machine==='torno';
  if(!AXES().includes(axis)){ toast(`Eixo <b>${pa.a}</b> não existe nesta máquina.`); return; }
  const su=setup(), m=mm(), W=su.work[MACH.wcs]||su.work[54], {tbl,rk}=ofsTable();
  if(s==='WORK'){
    const cell=tbl[rk(MACH.cur.row)]; if(!(axis in cell)){ toast('Eixo inválido para o zero-peça.'); return; }
    let sub=0;
    if(T){ const oi=MACH.offIdx, g=oi&&su.geo[pad2(oi)]||{x:0,z:0}, w=oi&&su.wear[pad2(oi)]||{x:0,z:0}; sub=g[axis]+w[axis]; }
    else if(axis==='z' && MACH.hlen && MACH.hidx) sub=su.geo[pad2(MACH.hidx)].h;
    cell[axis]=Math.round((m[axis]-sub-pa.v)*1000)/1000;
  }else{
    const cell=tbl[rk(MACH.cur.row)];
    if(T){ if(axis!=='x'&&axis!=='z'){ toast('No torno meça X ou Z.'); return; } cell[axis]=Math.round((m[axis]-W[axis]-pa.v)*1000)/1000; }
    else { if(axis!=='z'){ toast('Na fresa o comprimento (H) se mede em <b>Z</b>.'); return; } cell.h=Math.round((m.z-W.z-pa.v)*1000)/1000; }
  }
  bufEl().value=''; beep(1200,.06); toast('Medido: valor gravado pela posição atual da máquina.'); renderCRT();
}

/* ---------- edição do programa (EDIT / MDI) ---------- */
function progAPI(){
  if($('#screen-bench').classList.contains('active')){
    return { count:()=>benchLinesArr.length, focus:r=>{ SIM.focus=r; const d=$(`.bl[data-r="${r}"]`); if(d) d.click(); },
      set:(r,t)=>{ const L=$('#benchCode').value.split('\n'); L[r]=t; $('#benchCode').value=L.join('\n'); benchRun(); return true; },
      ins:(r,t)=>{ const L=$('#benchCode').value.split('\n'); L.splice((r<0?L.length-1:r)+1,0,t); $('#benchCode').value=L.join('\n'); benchRun(); return true; },
      del:r=>{ const L=$('#benchCode').value.split('\n'); L.splice(r,1); $('#benchCode').value=L.join('\n'); benchRun(); return true; } };
  }
  if(!P) return null;
  const inp=r=>$(`#progTable input[data-r="${r}"]`);
  return { count:()=>P.lv.rows.length, focus:r=>setFocus(r),
    set:(r,t)=>{ const e=inp(r); if(!e){ toast('Esta linha já vem pronta — só as linhas com campo podem ser editadas.'); return false; } e.value=t; e.dispatchEvent(new Event('input')); return true; },
    ins:(r,t)=>{ let k=Math.max(r,0); const n=P.lv.rows.length; for(let i=0;i<n;i++){ const e=inp((k+i)%n); if(e && !e.value.trim()){ e.value=t; e.dispatchEvent(new Event('input')); return true; } } toast('Todas as linhas editáveis já estão preenchidas — use ALTER para trocar uma.'); return false; },
    del:r=>{ const e=inp(r); if(!e){ toast('Esta linha já vem pronta.'); return false; } e.value=''; e.dispatchEvent(new Event('input')); return true; } };
}
function progEdit(op){
  const buf=bufEl().value.replace(/;+\s*$/,'').trim();
  if(MACH.mode==='MDI'){
    if(op==='INSERT'){ if(!buf){ toast('Digite o bloco (ex.: <b>T0101</b>) e aperte INSERT.'); return; } MACH.mdi.push(buf); bufEl().value=''; renderCRT(); }
    else if(op==='DELETE'){ MACH.mdi.pop(); renderCRT(); }
    else if(op==='ALTER'){ if(buf){ MACH.mdi[Math.max(0,MACH.mdi.length-1)]=buf; bufEl().value=''; renderCRT(); } }
    return;
  }
  if(MACH.mode!=='EDIT'){ toast(`${op} só funciona no modo <b>EDIT</b> (ou <b>MDI</b>). Selecione EDIT no painel.`); return; }
  const api=progAPI(); if(!api){ toast('Abra uma fase ou o Simulador livre para editar o programa.'); return; }
  const r=SIM.focus;
  if(op==='DELETE'){ if(r<0){ toast('Selecione uma linha com ▲/▼.'); return; } if(api.del(r)){ setTimeout(renderCRT,50); } return; }
  if(!buf){ toast('Digite o bloco no teclado e aperte '+op+'.'); return; }
  if(op==='ALTER'){ if(r<0){ toast('Selecione a linha com ▲/▼ e use ALTER.'); return; } if(api.set(r,buf)){ bufEl().value=''; setTimeout(renderCRT,50); } }
  else{ if(api.ins(r<0?0:r,buf)){ bufEl().value=''; setTimeout(renderCRT,50); } }
}


/* =========================================================================
   PAINEL DE OPERAÇÃO: modos, eixos, manivela, fuso, opções, CYCLE START…
   ========================================================================= */
const MODES=['EDIT','MEM','MDI','JOG','INC','HND','REF'];
function setMode(m){
  MACH.mode=m; jogH=null;
  $$('#opPanel [data-mode]').forEach(k=>{ const on=k.dataset.mode===m; k.classList.toggle('on',on); k.setAttribute('aria-pressed',on); });
  MODES.forEach(x=>$('#simPanel').classList.toggle('m-'+x, x===m));
  $('#crtMode').textContent = {HND:'HND',INC:'INC',REF:'ZRN'}[m]||m;
  // preparar a máquina (JOG/INC/HNDL/MDI/REF) trabalha na BARRA BRUTA; EDIT/MEM mostram a prévia do programa
  const machMode=['JOG','INC','HND','MDI','REF'].includes(m);
  if(SIM.res||SIM.part){
    if(machMode && MACH.view!=='stock'){ Sim3D.resetStock(); MACH.view='stock'; MACH.afterRun=false; MACH.runState=null; syncTool(); }
    else if(!machMode && MACH.view==='stock' && !MACH.afterRun){ rerunCurrent(); }
  }
  if(m==='MDI'||m==='EDIT') setPage('PROG'); else renderCRT();
  if(m==='MDI') setTimeout(()=>{ try{ bufEl().focus({preventScroll:true}); }catch(e){} },30);
}
$$('#opPanel [data-mode]').forEach(k=>k.onclick=()=>{
  if(Sim3D.running()||MACH.moving){ toast('Programa rodando: aperte <b>FEED HOLD</b> ou <b>RESET</b> antes de mudar o modo.'); return; }
  beep(560,.04,'square',.04); setMode(k.dataset.mode); });

let hudQ=0; const schedHud=()=>{ if(!hudQ) hudQ=requestAnimationFrame(()=>{ hudQ=0; renderCRT(); }); };
function addAlarm(msg,row){ if(!MACH.almList.some(a=>a.msg===msg&&a.row===row)){ MACH.almList.push({msg,row:row??null}); $('#crtAlm').textContent='ALM'; sndErr(); if(MACH.page==='MSG') renderCRT(); } }
function machineAlarm(msg){ MACH.almList=[{msg,row:null}]; $('#crtAlm').textContent='ALM'; setPage('MSG'); sndErr(); toast(msg,4600); }

/* ---------- limites e colisões (posição FÍSICA da ponta) ---------- */
function limitsP(){
  const part=SIM.part||{}, L=(part.stock&&part.stock[1])||50, th=part.thick||20;
  return SIM.machine==='torno' ? {x:[-12,240], z:[-(L+30),130]} : {x:[-160,420], y:[-130,320], z:[-th-30,220]};
}
function collisionAt(p){
  const part=SIM.part||{};
  if(SIM.machine==='torno'){
    const L=(part.stock&&part.stock[1])||50, D=(part.stock&&part.stock[0])||40, f=part.face||0;
    if(p.z <= -(L-f)+6 && p.x/2 < D/2+20) return 'COLISÃO: A FERRAMENTA BATEU NA PLACA (GARRAS)';
  }else{
    const th=part.thick||20;
    if(p.z < -th-0.3) return 'COLISÃO: A FERRAMENTA BATEU NA MESA';
  }
  return null;
}
function moveMachine(to, rapid){      // to = posição de máquina; devolve false se travou
  if(MACH.emg) return false;
  const slot=slotNow(), from=physOf(mm(),slot); let toP=physOf(to,slot);
  const lim=limitsP(); let hitLim=false;
  Object.keys(lim).forEach(k=>{ const v=toP[k]; if(v<lim[k][0]){ toP[k]=lim[k][0]; hitLim=true; } else if(v>lim[k][1]){ toP[k]=lim[k][1]; hitLim=true; } });
  const col=collisionAt(toP);
  if(col){ addAlarm(col); setPage('MSG'); toast(col,4200); return false; }
  const al=Sim3D.manualMove(from,toP,{rapid, tool:toolCodeNow(), spin:MACH.spin});
  Object.assign(mm(), machOf(toP,slot));
  al.forEach(a=>addAlarm(a.msg));
  if(hitLim){ addAlarm('FIM DE CURSO (OVERTRAVEL) — o eixo parou no limite'); schedHud(); return false; }
  schedHud(); return true;
}
function syncTool(){ if(!has3D) return; Sim3D.placePhys(physOf(mm()), toolCodeNow()); }

/* ---------- movimento animado (REF, MDI, G28) ---------- */
let animCancel=0;
function animateTo(target, speed, rapid){      // target parcial em coordenadas de máquina
  return new Promise(res=>{
    const tok=++animCancel; MACH.moving=true; MACH.holdMove=false;
    const m0={...mm()}, tgt={...m0, ...target};
    const dist=Math.hypot(...AXES().map(a=>(tgt[a]-m0[a])/(SIM.machine==='torno'&&a==='x'?2:1)));
    if(dist<1e-6){ MACH.moving=false; res(true); return; }
    let done=0, last=performance.now();
    const step=t=>{
      if(tok!==animCancel){ MACH.moving=false; res(false); return; }
      const dt=Math.min(0.05,(t-last)/1000); last=t;
      if(MACH.holdMove){ requestAnimationFrame(step); return; }
      done=Math.min(dist, done+speed*dt*(rapid?(+$('#ovRapidV').dataset.v||1):1)); const k=done/dist;
      const to={...m0}; AXES().forEach(a=>to[a]=m0[a]+(tgt[a]-m0[a])*k);
      const ok=moveMachine(to,rapid);
      if(!ok){ MACH.moving=false; res(false); return; }
      if(done>=dist){ MACH.moving=false; res(true); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ---------- eixos: JOG contínuo, INC por passo, HNDL (manivela), REF ---------- */
let jogH=null;
const INC_STEPS=[0.001,0.01,0.1,1];
function buildAxisKeys(){
  const T=SIM.machine==='torno', axes=AXES();
  $('#axisKeys').innerHTML = axes.map(a=>{ const A=a.toUpperCase();
    return `<span class="axpair"><button class="ssk ax" data-jog="${a}:-1" aria-label="Eixo ${A} negativo">−${A}</button><button class="ssk ax" data-jog="${a}:1" aria-label="Eixo ${A} positivo">+${A}</button></span>`; }).join('')+
    `<button class="ssk tg" id="kRapid" aria-pressed="${MACH.rapid}">RAPID</button>`;
  $$('#axisKeys [data-jog]').forEach(b=>{
    const [a,d]=b.dataset.jog.split(':'), dir=+d;
    b.addEventListener('pointerdown',e=>{ e.preventDefault(); b.setPointerCapture&&b.setPointerCapture(e.pointerId); jogStart(a,dir); });
    const up=()=>jogStop(); b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('lostpointercapture',up);
    b.addEventListener('click',e=>{ if(e.detail===0){ jogStart(a,dir); setTimeout(jogStop,120); } });   // teclado / leitor de tela (o mouse já agiu no pointerdown)
  });
  $('#kRapid').onclick=()=>{ MACH.rapid=!MACH.rapid; $('#kRapid').setAttribute('aria-pressed',MACH.rapid); };
  $('#hAxis').innerHTML = axes.map(a=>`<button class="ssk ${MACH.axis.toLowerCase()===a?'on':''}" data-hax="${a}">${a.toUpperCase()}</button>`).join('');
  $$('#hAxis [data-hax]').forEach(b=>b.onclick=()=>{ MACH.axis=b.dataset.hax.toUpperCase(); $$('#hAxis [data-hax]').forEach(x=>x.classList.toggle('on',x===b)); updateGap(); });
  if(!axes.includes(MACH.axis.toLowerCase())) MACH.axis='X';
  renderRefLamps();
  $('#mTitle').textContent = T?'TORNO · FANUC 0i':'FRESA · FANUC 0i';
}
function renderRefLamps(){
  const r=refOf(); $('#refLamps').innerHTML=Object.keys(r).map(a=>`<span class="${r[a]?'on':''}" title="Retorno à referência ${a}">REF ${a}</span>`).join('');
}
function guardMove(){
  if(MACH.emg){ toast('EMERGÊNCIA acionada — solte o botão vermelho primeiro.'); return true; }
  if(Sim3D.running()||MACH.moving){ toast('A máquina está em movimento — use FEED HOLD ou RESET.'); return true; }
  return false;
}
function jogStart(axis,dir){
  const mode=MACH.mode;
  MACH.axis=axis.toUpperCase(); $$('#hAxis [data-hax]').forEach(x=>x.classList.toggle('on',x.dataset.hax===axis));
  if(mode==='REF'){ refAxis(axis,dir); return; }
  if(mode==='INC'){ if(guardMove()) return; stepAxis(axis, dir*INC_STEPS[MACH.incIdx], false); return; }
  if(mode!=='JOG'){ toast('Para mover os eixos selecione <b>JOG</b> (contínuo), <b>INC</b> (passo) ou <b>HNDL</b> (manivela).'); return; }
  if(guardMove()) return;
  jogH={axis,dir,last:performance.now()}; requestAnimationFrame(jogLoop);
}
function jogStop(){ jogH=null; }
function jogLoop(t){
  if(!jogH) return;
  const dt=Math.min(0.05,(t-jogH.last)/1000); jogH.last=t;
  const rapid=MACH.rapid, v = rapid ? 160*(+$('#ovRapidV').dataset.v||1) : 60*MACH.jogOvr/100;
  if(!stepAxis(jogH.axis, jogH.dir*v*dt, rapid)){ jogH=null; return; }
  requestAnimationFrame(jogLoop);
}
function stepAxis(axis,d,rapid){       // d = deslocamento da ponta (no torno X: raio)
  const m=mm(), to={...m}; to[axis]+=d*(SIM.machine==='torno'&&axis==='x'?2:1);
  return moveMachine(to,rapid);
}
function pulse(n){
  if(MACH.mode!=='HND'){ toast('Selecione o modo <b>HNDL</b> para usar a manivela.'); return; }
  if(guardMove()) return;
  stepAxis(MACH.axis.toLowerCase(), n*INC_STEPS[Math.min(MACH.incIdx,2)], false);
}
function refAxis(axis,dir){
  if(MACH.emg){ toast('Solte a EMERGÊNCIA primeiro.'); return; }
  if(dir<0){ toast('No modo <b>REF</b> use as teclas <b>+</b> (sentido positivo) para ir ao ponto de referência.'); return; }
  const A=axis.toUpperCase(); if(MACH.moving) return;
  if(refOf()[A]){ toast(`Eixo ${A} já está no ponto de referência.`); return; }
  animateTo({[axis]:0}, 90, true).then(ok=>{ if(!ok) return; refOf()[A]=true; beep(980,.08); renderCRT();
    if(allRef()) toast('Máquina referenciada ✓ — próximo passo: medir o zero-peça e as ferramentas (OFFSET), ou use o atalho em <b>Ferramentas</b>.',4800); });
}
/* manivela (dial) */
(function(){
  const d=$('#handDial'); let ang0=null, acc=0;
  const pt=e=>{ const r=d.getBoundingClientRect(); return Math.atan2(e.clientY-(r.top+r.height/2), e.clientX-(r.left+r.width/2))*180/Math.PI; };
  d.addEventListener('pointerdown',e=>{ d.setPointerCapture(e.pointerId); ang0=pt(e); acc=0; });
  d.addEventListener('pointermove',e=>{ if(ang0==null) return; const a=pt(e); let da=a-ang0; if(da>180) da-=360; if(da<-180) da+=360; ang0=a; acc+=da;
    const n=Math.trunc(acc/14); if(n){ acc-=n*14; d.style.setProperty('--rot', (parseFloat(d.style.getPropertyValue('--rot'))||0)+n*14+'deg'); pulse(n); } });
  const up=()=>{ ang0=null; }; d.addEventListener('pointerup',up); d.addEventListener('pointercancel',up);
  d.addEventListener('wheel',e=>{ e.preventDefault(); pulse(e.deltaY<0?1:-1); },{passive:false});
  $('#hMinus').onclick=()=>pulse(-1); $('#hPlus').onclick=()=>pulse(1);
})();
$$('#incRow [data-inc]').forEach(b=>b.onclick=()=>{ MACH.incIdx=+b.dataset.inc; $$('#incRow [data-inc]').forEach(x=>x.classList.toggle('on',x===b)); });

/* ---------- fuso, refrigeração, torre ---------- */
function manualSpin(sp){
  if(['EDIT','MEM'].includes(MACH.mode)){ toast('O fuso manual funciona em <b>JOG</b>, <b>INC</b>, <b>HNDL</b> ou <b>MDI</b> (M3 S500).'); return; }
  if(MACH.emg) return;
  MACH.spin=sp; Sim3D.setSpin({spin:sp, cool:MACH.cool}); renderCRT();
}
$('#kCW').onclick=()=>manualSpin(3); $('#kCCW').onclick=()=>manualSpin(4); $('#kStop').onclick=()=>manualSpin(5);
$('#kCool').onclick=()=>{ MACH.cool=!MACH.cool; $('#kCool').classList.toggle('lit',MACH.cool); Sim3D.setSpin({spin:MACH.spin, cool:MACH.cool}); renderCRT(); };
$('#kTurret').onclick=()=>{
  if(SIM.machine!=='torno'){ toast('No centro de usinagem a troca é por programa/MDI: <b>T02 M6</b>.'); return; }
  if(!['JOG','INC','HND'].includes(MACH.mode)){ toast('A torre gira à mão nos modos <b>JOG/INC/HNDL</b> (ou por MDI: T0202).'); return; }
  if(guardMove()) return;
  MACH.tool.torno=MACH.tool.torno%8+1; syncTool(); renderCRT();
  const t=(SIM.tools||{})[pad2(MACH.tool.torno)], T=t&&TOOL_TYPES.torno[t.type];
  toast(`Torre → posição <b>${pad2(MACH.tool.torno)}</b>: ${T?T.n:'vazia'}`,2200);
};
/* opções */
const tg=(id,fn)=>{ $(id).onclick=()=>{ const on=$(id).getAttribute('aria-pressed')!=='true'; $(id).setAttribute('aria-pressed',on); fn(on); }; };
tg('#kSBK', on=>Sim3D.setOpts({single:on}));
tg('#kDRN', on=>Sim3D.setOpts({dry:on}));
tg('#kOPT', on=>Sim3D.setOpts({optStop:on}));
tg('#kBDT', on=>{ MACH.bdt=on; rerunCurrent(); });
/* overrides: − valor + */
function stepper(id, list, init, on){
  const el=$(id); let i=list.indexOf(init); el.dataset.v=on(list[i],true)??'';
  const out=el.querySelector('output'); const upd=()=>{ out.textContent=(list[i]===5&&id==='#ovRapid'?'F0':list[i]+'%'); on(list[i]); };
  el.querySelector('[data-d="-1"]').onclick=()=>{ i=Math.max(0,i-1); upd(); beep(500,.02,'square',.02); };
  el.querySelector('[data-d="1"]').onclick=()=>{ i=Math.min(list.length-1,i+1); upd(); beep(600,.02,'square',.02); };
  upd();
}
function buildOverrides(){
  stepper('#ovFeed',[0,10,20,30,50,70,100,120,150],100,(v,init)=>{ Sim3D.setOpts({feedOvr:Math.max(0.02,v/100)}); });
  stepper('#ovRapid',[5,25,50,100],100,(v,init)=>{ $('#ovRapidV').dataset.v=v/100; Sim3D.setOpts({rapidOvr:Math.max(0.02,v/100)}); });
  stepper('#ovJog',[1,2,5,10,20,50,100],20,(v)=>{ MACH.jogOvr=v; });
  stepper('#ovSpin',[50,60,70,80,90,100,110,120],100,(v)=>{ MACH.spinOvr=v; });
}

/* ---------- CYCLE START / FEED HOLD / RESET / EMERGÊNCIA ---------- */
$('#opStart').onclick=()=>{
  if(MACH.emg){ machineAlarm('EMERGÊNCIA acionada — solte o botão e refaça o retorno à referência.'); return; }
  if(MACH.holdMove){ MACH.holdMove=false; $('#opHold').classList.remove('lit'); $('#opStart').classList.add('lit'); return; }
  if(MACH.mode==='MDI'){ runMDI(); return; }
  if(MACH.mode!=='MEM'){ machineAlarm(`CYCLE START: no modo ${MACH.mode} não roda programa. Selecione <b>MEM</b> (AUTO) para o programa ou <b>MDI</b> para um bloco.`.replace(/<[^>]+>/g,'')); return; }
  if(!allRef()){ machineAlarm('ALM 224 — RETORNO À REFERÊNCIA NÃO FEITO. Modo REF: aperte '+(SIM.machine==='torno'?'+X e +Z':'+X, +Y e +Z')+'.'); return; }
  if(!SIM.res){ toast('Esta fase não tem simulação.'); return; }
  if(!has3D){ toast('O 3D não carregou neste navegador (WebGL desligado?). O DESENHO 2D continua valendo.',4000); return; }
  $('#simPanel').classList.remove('mode2d'); $('#tab3d').classList.add('on'); $('#tab2d').classList.remove('on');
  if(!Sim3D.active()){ MACH.almList=[]; $('#crtAlm').textContent=''; $$('#progTable tr.alm,.bl.alm').forEach(t=>t.classList.remove('alm')); $('#crtAlarm').classList.remove('on'); MACH.afterRun=false; }
  Sim3D.setOpts({single:$('#kSBK').getAttribute('aria-pressed')==='true'});
  Sim3D.play();
  $('#opStart').classList.add('lit'); $('#opHold').classList.remove('lit'); $('#crtRun').textContent='STRT';
  setPage(MACH.page==='OFS'||MACH.page==='MSG'||MACH.page==='SYS'?'POS':MACH.page);
};
$('#opHold').onclick=()=>{
  if(MACH.moving){ MACH.holdMove=true; $('#opHold').classList.add('lit'); $('#opStart').classList.remove('lit'); return; }
  if(!Sim3D.active()) return; Sim3D.hold(); $('#opHold').classList.add('lit'); $('#opStart').classList.remove('lit'); $('#crtRun').textContent='HOLD';
};
$('#opReset').onclick=()=>{
  animCancel++; MACH.moving=false; MACH.holdMove=false; jogH=null;
  Sim3D.stop(); markRun(-1); MACH.runRow=-1; MACH.runPos=null; MACH.runState=null; MACH.afterRun=false;
  MACH.spin=5; MACH.cool=false; $('#kCool').classList.remove('lit'); Sim3D.setSpin({spin:5,cool:false});
  $('#opStart').classList.remove('lit'); $('#opHold').classList.remove('lit'); $('#crtRun').textContent='****';
  MACH.almList=[]; $('#crtAlm').textContent=''; $('#crtAlarm').classList.remove('on'); $$('#progTable tr.alm,.bl.alm').forEach(t=>t.classList.remove('alm'));
  syncTool(); renderCRT();
};
$('#opEmg').onclick=()=>{
  MACH.emg=!MACH.emg; $('#opEmg').classList.toggle('on',MACH.emg);
  if(MACH.emg){
    animCancel++; MACH.moving=false; jogH=null; Sim3D.stop(); markRun(-1);
    Object.keys(refOf()).forEach(a=>refOf()[a]=false);
    MACH.spin=5; MACH.cool=false; Sim3D.setSpin({spin:5,cool:false});
    $('#opStart').classList.remove('lit'); $('#opHold').classList.remove('lit');
    machineAlarm('EMERGÊNCIA — tudo parado. Solte o botão e refaça o retorno à referência (modo REF).');
  }else{ MACH.almList=[]; $('#crtAlm').textContent=''; renderCRT(); toast('Emergência liberada. Faça o retorno à referência no modo <b>REF</b>.'); }
};

/* ---------- MDI: executa os blocos digitados ---------- */
async function runMDI(){
  if(!MACH.mdi.length){ const b=bufEl().value.replace(/;+\s*$/,'').trim(); if(b){ MACH.mdi.push(b); bufEl().value=''; } }
  if(!MACH.mdi.length){ toast('Digite um bloco no MDI (ex.: <b>T0101</b>), aperte <b>INSERT</b> e depois <b>CYCLE START</b>.'); return; }
  if(guardMove()) return;
  const lines=[...MACH.mdi]; MACH.mdi=[]; renderCRT();
  $('#opStart').classList.add('lit'); $('#crtRun').textContent='STRT';
  for(const l of lines){ const ok=await execMDIBlock(l); if(!ok) break; }
  $('#opStart').classList.remove('lit'); $('#crtRun').textContent='****'; renderCRT();
}
async function execMDIBlock(text){
  const p=CNC.parse(text); if(p.err){ machineAlarm('MDI: '+p.err.replace(/<[^>]+>/g,'')); return false; }
  const g=CNC.group(p.words), o=g.o, m=SIM.machine, T=m==='torno';
  for(const G of g.G) if(!gInfo(G,m)){ machineAlarm(`G${G} não existe neste comando.`); return false; }
  for(const M of g.M){
    if(M===3||M===4||M===5) MACH.spin=M; else if(M===8) MACH.cool=true; else if(M===9) MACH.cool=false;
    else if(M===6 && !T && MACH.pendT){ MACH.tool.fresa=MACH.pendT; syncTool(); }
  }
  if('T' in o){
    if(T){ const c=String(Math.round(o.T)).padStart(4,'0'), slot=+c.slice(0,2), oi=+c.slice(2,4);
      if(!toolLookup(SIM.tools,m)(c)){ machineAlarm(`Ferramenta T${pad2(slot)} não está montada. Abra FERRAMENTAS.`); return false; }
      MACH.tool.torno=slot; MACH.offIdx=oi; syncTool(); toast(`T${c}: ${TOOL_TYPES.torno[SIM.tools[pad2(slot)].type].n}`,2000); }
    else{ const slot=Math.round(o.T); if(!SIM.tools[pad2(slot)]){ machineAlarm(`Ferramenta T${pad2(slot)} não está montada. Abra FERRAMENTAS.`); return false; } MACH.pendT=slot;
      if(g.M.includes(6)){ MACH.tool.fresa=slot; syncTool(); } }
  }
  g.G.forEach(G=>{ if(G>=54&&G<=59) MACH.wcs=G; if(G===43){ MACH.hlen=true; if('H' in o) MACH.hidx=Math.round(o.H); } if(G===49) MACH.hlen=false; if(G===0||G===1) MACH.mot=G; if(G===90) MACH.mdiAbs=true; if(G===91) MACH.mdiAbs=false; });
  Sim3D.setSpin({spin:MACH.spin, cool:MACH.cool});
  const ax=T?['X','Z','U','W']:['X','Y','Z'];
  if(g.G.includes(28)){
    if(!allRef()){ machineAlarm('Referencie a máquina antes (modo REF).'); return false; }
    const want=AXES().filter(a=>a.toUpperCase() in o || (T&&((a==='x'&&'U' in o)||(a==='z'&&'W' in o))));
    const tg2={}; (want.length?want:AXES()).forEach(a=>tg2[a]=0);
    return await animateTo(tg2,160,true);
  }
  if(g.G.includes(4)) { await new Promise(r=>setTimeout(r,Math.min(2,(o.X??o.P/1000??1))*1000)); return true; }
  if(ax.some(a=>a in o)){
    if(!allRef()){ machineAlarm('ALM 224 — referencie a máquina antes de mover pelo MDI (modo REF).'); return false; }
    const abs=absOf(mm()), inc=MACH.mdiAbs===false, off=offsetsNow(), to={...mm()};
    const mach53=g.G.includes(53);
    AXES().forEach(a=>{ const A=a.toUpperCase(); let v=null;
      if(A in o) v = inc ? abs[a]+o[A] : o[A];
      else if(T&&a==='x'&&'U' in o) v=abs.x+o.U; else if(T&&a==='z'&&'W' in o) v=abs.z+o.W;
      if(v!=null) to[a]= mach53 ? o[A] : v+off[a]; });
    const rapid=MACH.mot!==1;
    return await animateTo(to, rapid?160:Math.max(4,Math.min(60,(o.F??20)/(T?1:60)*(T?30:1))), rapid);
  }
  renderCRT(); return true;
}

/* ---------- medição: calibrador (folga) e paquímetro ---------- */
function updateGap(){
  const el=$('#gapBadge'); if(!el) return;
  if(!has3D||!SIM.part||!['JOG','INC','HND'].includes(MACH.mode)){ el.hidden=true; return; }
  const ph=physOf(mm()), g=Sim3D.gaps(ph, toolCodeNow()); const a=MACH.axis.toLowerCase();
  const v=g&&g[a]; if(v==null||Math.abs(v)>12){ el.hidden=true; return; }
  const f=MACH.feeler[SIM.machine]||0; let cls='', txt;
  if(f>0){ const d=v-f; txt = Math.abs(d)<=0.06 ? 'APROPRIADO' : d<0 ? 'APERTADO' : 'FROUXO'; cls = Math.abs(d)<=0.06?'ok':d<0?'tight':'loose'; }
  else { txt = Math.abs(v)<0.03 ? 'ENCOSTOU' : v<0 ? 'DENTRO DA PEÇA' : ''; cls = Math.abs(v)<0.03?'ok':v<0?'tight':''; }
  el.hidden=false; el.className='gap '+cls;
  el.innerHTML=`<span>FOLGA ${a.toUpperCase()}</span> <b>${v.toFixed(3)}</b> mm${f>0?` <small>calibrador ${f.toFixed(2)}</small>`:''} ${txt?`<em>${txt}</em>`:''}`;
}
$('#btnCaliper').onclick=()=>{
  if(!has3D||!SIM.part) return; const ph=physOf(mm());
  if(SIM.machine==='torno'){ const d=Sim3D.diameterAt(ph.z); toast(d==null?'Posicione a ferramenta sobre o comprimento da peça (Z negativo) para medir o diâmetro.':`Paquímetro: <b>Ø ${d.toFixed(3)} mm</b> em Z${ph.z.toFixed(1)}`,5200); }
  else{ const g=Sim3D.gaps(ph,toolCodeNow()); if(!g||g.z==null) toast('Posicione a ferramenta sobre a peça para medir a altura.'); else toast(`Altura da peça sob a ferramenta: <b>Z ${(ph.z-g.z).toFixed(3)}</b> mm`,4200); }
};

/* =========================================================================
   INICIALIZAÇÃO
   ========================================================================= */
function initSim(){
  has3D = Sim3D.init($('#view3d'));
  if(!has3D) $('#simPanel').classList.add('no3d');
  Sim3D.onTick = info => {
    MACH.runRow=info.row; MACH.runPos=info.pos; MACH.runState=info.state; MACH.afterRun=true;
    const st=info.state||{};
    if(st.tool){ if(SIM.machine==='torno'){ const c=String(st.tool).padStart(4,'0'); MACH.tool.torno=+c.slice(0,2)||MACH.tool.torno; MACH.offIdx=+c.slice(2,4)||0; } else MACH.tool.fresa=+st.tool||MACH.tool.fresa; }
    MACH.wcs=st.wcs||54; MACH.hlen=!!st.hlen; MACH.hidx=st.hidx||null; MACH.didx=st.didx||null; MACH.spin=st.spin??MACH.spin; MACH.cool=!!st.cool;
    if(info.phys) Object.assign(mm(), machOf(info.phys));
    schedHud(); markRun(info.row);
  };
  Sim3D.onStop = (why,row) => { $('#opStart').classList.remove('lit'); $('#opHold').classList.add('lit'); $('#crtRun').textContent='STOP';
    toast(why==='SBK'?'Bloco a bloco: aperte <b>CYCLE START</b> para o próximo bloco.':why==='M0'?'<b>M0</b> — parada obrigatória. CYCLE START continua.':'<b>M1</b> — parada opcional (OPT STOP ligado). CYCLE START continua.',3200); };
  Sim3D.onDone = alarms => {
    $('#opStart').classList.remove('lit'); $('#opHold').classList.remove('lit'); $('#crtRun').textContent='****';
    markRun(-1); MACH.runRow=-1; MACH.runPos=null; if(MACH.runState){ MACH.spin=MACH.runState.spin; MACH.cool=MACH.runState.cool; }
    alarms.forEach(a=>addAlarm(a.msg,a.row));
    const cut = SIM.res && SIM.res.segs.some(s=>s.kind!=='rapid');
    if(cut && Sim3D.carved()===0) addAlarm('NADA FOI USINADO — a ferramenta trabalhou longe da peça: confira o zero-peça (WORK) e os corretores (GEOM)');
    showAlarmBox(); renderCRT();
    toast(MACH.almList.length?'Programa terminou <b>com alarme</b> — veja MESSAGE.':'Programa terminado — <b>M30</b>. Peça pronta!',4200);
  };
  buildKeyboard(); buildAxisKeys(); buildOverrides(); setMode('MEM'); setPage('POS');
  setInterval(()=>{ $('#crtClock').textContent=new Date().toTimeString().slice(0,8); },1000);
}

/* ---------- rodar o programa (prévia ideal) e alarmes ---------- */
function runSim({lines, machine, part, sim=true, tools}){
  const changed = SIM.machine!==machine;
  SIM.lines=lines; SIM.machine=machine; SIM.part=part; SIM.tools=tools||{};
  if(changed){ buildAxisKeys(); }
  MACH.runState=null; MACH.afterRun=false; MACH.runRow=-1; MACH.runPos=null;
  $('#simPanel').classList.toggle('nosim', !sim);
  if(!sim){ SIM.res=null; showAlarms([]); renderCRT(); return; }
  const L = MACH.bdt ? lines.map(l=>/^\s*\//.test(l.text||'')?{...l,text:''}:l) : lines;
  const res=CNC.simulate(L, machine);
  SIM.res=res; SIM.errs=res.errs;
  Sim3D.load({machine, part, res, getTool:toolLookup(SIM.tools, machine), shift:shiftFor, comp:compFor, home:homeFor});
  let al=[];
  if(has3D){
    if(['MEM','EDIT'].includes(MACH.mode)){ al=Sim3D.showFinal(); MACH.view='preview'; }   // prévia IDEAL: o que o código faz, sem erro de zero-peça
    else { Sim3D.resetStock(); MACH.view='stock'; }                                          // preparando a máquina: barra bruta
  }
  SIM.alarms=al; syncTool();
  showAlarms(al);
  renderCRT(); draw2d();
  return res;
}
function rerunCurrent(){ if($('#screen-bench').classList.contains('active')) benchRun(); else if(P) rerun(); }
function showAlarmBox(){
  const all=MACH.almList, box=$('#crtAlarm');
  $$('#progTable tr.alm,.bl.alm').forEach(t=>t.classList.remove('alm'));
  if(!all.length){ box.classList.remove('on'); box.innerHTML=''; return; }
  box.innerHTML = all.slice(0,3).map(a=>`ALM — ${esc(a.msg)}${a.row!=null&&a.row>=0?` <span style="opacity:.8">[${esc(SIM.rowN(a.row))}]</span>`:''}`).join('<br>');
  box.classList.remove('on'); void box.offsetWidth; box.classList.add('on');
  all.forEach(a=>{ const tr=SIM.rowEl && a.row!=null && a.row>=0 && SIM.rowEl(a.row); if(tr) tr.classList.add('alm'); });
}
function showAlarms(al){
  const errs=(SIM.errs||[]).map(e=>({row:e.row, msg:e.msg.replace(/<[^>]+>/g,'')}));
  MACH.almList=[...al.map(a=>({row:a.row,msg:a.msg})), ...errs];
  $('#crtAlm').textContent = MACH.almList.length?'ALM':'';
  showAlarmBox();
}
function markRun(row){
  $$('#progTable tr.run,.bl.run').forEach(t=>t.classList.remove('run'));
  if(row<0) return;
  const tr=SIM.rowEl && SIM.rowEl(row); if(!tr) return;
  tr.classList.add('run');
  const wrap=tr.closest('.tablewrap,.benchlines');
  if(wrap){ const r=tr.getBoundingClientRect(), w=wrap.getBoundingClientRect();
    if(r.top<w.top+30 || r.bottom>w.bottom-10) wrap.scrollTop += (r.top-w.top) - w.height/2; }
}
function stateBefore(row){ if(!SIM.res) return null; const o=SIM.res.order, i=o.indexOf(row); return i>0 ? SIM.res.states[o[i-1]] : null; }

/* ---------- janelas: FERRAMENTAS e PEÇA BRUTA ---------- */
function setupCtx(){
  if($('#screen-bench').classList.contains('active')){
    const b=benchState(), m=b.machine;
    return { machine:m, tools:b.tools[m], setTools:t=>{ b.tools[m]=t; save(); benchRun(); },
      defTools:()=>fullTurret(m, inferTools(benchLinesArr, m)), part:benchPart(), setStock:s=>{ b.stock[m]=s; save(); benchRun(); },
      defStock:()=>BENCH_STOCK[m], used:benchLinesArr };
  }
  if(!P) return null;
  return { machine:P.lv.machine, tools:P.tools, setTools:t=>{ P.tools=t; rerun(); },
    defTools:()=>fullTurret(P.lv.machine, inferTools(progLines(false), P.lv.machine, P.lv.part)), part:P.part,
    setStock:s=>{ P.part={...P.part, ...s}; rerun(); }, defStock:()=>levelPart(P.lv), used:progLines(false) };
}
$('#btnTools').onclick=()=>openTools();
function openTools(){
  const c=setupCtx(); if(!c) return;
  const m=c.machine, types=TOOL_TYPES[m];
  const used=new Set(); c.used.forEach(l=>{ const p=CNC.parse(l.text||''); const t=p.words.find(w=>w.L==='T'); if(t) used.add(posKey(t.v,m)); });
  let tools=JSON.parse(JSON.stringify(c.tools||{}));
  $('#toolsTitle').textContent = m==='torno'?'Ferramentas — torre do torno':'Ferramentas — magazine do centro de usinagem';
  $('#toolsSub').innerHTML = m==='torno'
    ? 'Aqui você <b>monta</b> as ferramentas na torre. No programa, <b>T0303</b> chama a posição <b>03</b> com o corretor <b>03</b>. Depois é preciso <b>medir</b> cada uma na página OFFSET do comando.'
    : 'Aqui você <b>monta</b> o magazine. No programa, <b>T03 M6</b> troca para a ferramenta 03; o comprimento vem do <b>G43 H03</b> e o raio do <b>D03</b> (gravados em OFFSET).';
  const draw=()=>{
    let h=`<tr><th>Pos.</th><th>Tipo</th><th>Medida</th><th></th></tr>`;
    for(let i=1;i<=NPOS(m);i++){
      const k=pad2(i), t=tools[k]||{}, T=types[t.type];
      h+=`<tr><td>${m==='torno'?'T'+k+k:'T'+k}</td><td><select data-k="${k}" class="tt"><option value="">— vazio —</option>${Object.entries(types).map(([id,x])=>`<option value="${id}" ${t.type===id?'selected':''}>${x.n}</option>`).join('')}</select></td>
        <td>${T?`<label>${DIM_LBL[T.dim]} <input type="number" step="0.1" min="0" data-k="${k}" class="tv" value="${t.v??T.def}"></label>`:''}</td>
        <td>${used.has(k)?'<span class="used">usada no programa</span>':'<span class="unused">—</span>'}</td></tr>`;
    }
    $('#toolTable').innerHTML=h;
    $$('#toolTable .tt').forEach(s=>s.onchange=()=>{ const k=s.dataset.k; if(!s.value) delete tools[k]; else tools[k]={type:s.value, v:types[s.value].def}; draw(); });
    $$('#toolTable .tv').forEach(s=>s.onchange=()=>{ tools[s.dataset.k].v=+s.value||types[tools[s.dataset.k].type].def; });
  };
  draw();
  $('#toolsDefault').onclick=()=>{ tools=c.defTools(); draw(); };
  $('#toolsMeasure').onclick=()=>{
    SIM.tools=tools; SIM.machine=m; perfectSetup(); buildAxisKeys(); closeModal('#modalTools'); c.setTools(tools); MACH.afterRun=false; renderCRT();
    toast('Máquina preparada: referenciada, zero-peça e corretores medidos. Modo <b>MEM</b> → <b>CYCLE START</b>.',4800); };
  $('#toolsOk').onclick=()=>{ closeModal('#modalTools'); c.setTools(tools); renderCRT(); };
  openModal('#modalTools');
}
$('#btnStock').onclick=()=>openStock();
function openStock(){
  const c=setupCtx(); if(!c) return;
  const m=c.machine, p=c.part||{};
  const fill=pp=>{
    const s=pp.stock||(m==='torno'?[40,50]:[0,0,100,60]);
    $('#stockBody').innerHTML = (m==='torno'
      ? `<label for="s0">Diâmetro do bruto (Ø)</label><input id="s0" type="number" step="0.5" value="${s[0]}">
         <label for="s1">Comprimento fora da placa</label><input id="s1" type="number" step="1" value="${s[1]}">
         <label for="s2">Sobremetal na face</label><input id="s2" type="number" step="0.5" value="${pp.face||0}">`
      : `<label for="s0">X inicial</label><input id="s0" type="number" value="${s[0]}">
         <label for="s1">Y inicial</label><input id="s1" type="number" value="${s[1]}">
         <label for="s2">X final</label><input id="s2" type="number" value="${s[2]}">
         <label for="s3">Y final</label><input id="s3" type="number" value="${s[3]}">
         <label for="s4">Espessura</label><input id="s4" type="number" value="${pp.thick||20}">`)+
      `<label for="smat">Material</label><select id="smat"><option value="aco" ${pp.mat!=='alu'?'selected':''}>Aço 1045</option><option value="alu" ${pp.mat==='alu'?'selected':''}>Alumínio</option></select>
       <label for="sfeel">Calibrador (folga)</label><select id="sfeel">${(m==='torno'?[0,0.05,0.1,0.5,1]:[0,0.05,0.1,0.5,1]).map(v=>`<option value="${v}" ${(MACH.feeler[m]||0)===v?'selected':''}>${v===0?'sem calibrador':v.toFixed(2)+' mm'}</option>`).join('')}</select>
       <div class="note">${m==='torno'?'O zero-peça (W) fica na face acabada. Com sobremetal, o bruto começa à direita do Z0 — por isso se faceia.':'O zero-peça fica no canto/topo da peça (Z0 = topo).'} Polegadas: 2" = 50,8 mm · 3 1/4" = 82,55 mm. O calibrador mostra a folga ideal ao encostar a ferramenta (APROPRIADO / APERTADO / FROUXO).</div>`;
  };
  fill(p);
  $('#stockDefault').onclick=()=>fill(c.defStock());
  $('#stockOk').onclick=()=>{
    const n=id=>+(($('#'+id)||{}).value||0);
    const s = m==='torno' ? {stock:[Math.max(2,n('s0')), Math.max(5,n('s1'))], face:Math.max(0,n('s2'))}
                          : {stock:[n('s0'),n('s1'),Math.max(n('s0')+5,n('s2')),Math.max(n('s1')+5,n('s3'))], thick:Math.max(2,n('s4'))};
    s.mat=$('#smat').value; MACH.feeler[m]=+$('#sfeel').value;
    closeModal('#modalStock'); c.setStock(s);
  };
  openModal('#modalStock');
}

/* ---------- abas 3D / desenho e percurso ---------- */
$('#tab3d').onclick=()=>{ $('#simPanel').classList.remove('mode2d'); $('#tab3d').classList.add('on'); $('#tab2d').classList.remove('on'); };
$('#tab2d').onclick=()=>{ $('#simPanel').classList.add('mode2d'); $('#tab2d').classList.add('on'); $('#tab3d').classList.remove('on'); draw2d(); };
$('#opPath').onclick=()=>{ const on=$('#opPath').getAttribute('aria-pressed')!=='true'; $('#opPath').setAttribute('aria-pressed',on); Sim3D.setPathVisible(on); view2d.path=on; draw2d(); };
$('#opView').onclick=()=>Sim3D.resetView();
