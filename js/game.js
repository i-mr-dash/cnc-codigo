/* =========================================================================
   CNC CÓDIGO — motor do jogo
   ========================================================================= */
'use strict';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'cnccodigo_v1';
const REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
const TOUCH = !matchMedia('(hover:hover) and (pointer:fine)').matches;
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- progressão ---------------- */
const RANKS = [
  [0,'Aprendiz CNC'], [150,'Operador Júnior'], [450,'Operador CNC'],
  [900,'Programador CNC'], [1500,'Programador Sênior'], [2200,'Mestre do G-code']
];
const UNLOCKS = [
  {lvl:2,  id:'shop',        name:'Oficina / Loja',   desc:'Agora você pode gastar moedas.'},
  {lvl:3,  id:'th_blueprint',name:'Tema Blueprint',   desc:'Visual de prancheta azul. Troque na Loja.'},
  {lvl:4,  id:'bench',       name:'Simulador livre',  desc:'Cole qualquer programa (até os que o Claude gera para você) e veja a peça sendo usinada, com cada linha explicada.'},
  {lvl:6,  id:'reveal',      name:'Revelar bloco',    desc:'Compre a resposta de UM bloco por 40 🪙 — a fase passa a valer no máximo 2 ★.'},
  {lvl:10, id:'th_neon',     name:'Tema Neon',        desc:'Oficina cyberpunk. Troque na Loja.'},
  {lvl:'boss', id:'endless', name:'Modo Infinito',    desc:'Peças geradas na hora, para sempre.'}
];
const SHOP = [
  {id:'pack',   name:'Pacote de 3 dicas', price:40,  repeat:true, desc:'Mais três fichas 💡 para usar em qualquer fase.'},
  {id:'safety', name:'Seguro do Novato',  price:200, desc:'A primeira tentativa errada de cada fase não conta para as estrelas.'},
  {id:'xray',   name:'Raio-X do bloco',   price:120, desc:'Ao focar um bloco, o painel Fanuc mostra em amarelo o que muda na máquina depois dele.'}
];
const THEMES = [
  {t:'steel',    name:'Oficina (padrão)', price:0,   desc:'Visual escuro de chão de fábrica.'},
  {t:'blueprint',name:'Blueprint',        price:180, unlock:'th_blueprint', desc:'Prancheta azul. Grátis ao completar a fase 3.'},
  {t:'paper',    name:'Impressão',        price:80,  desc:'Fundo claro, cara de folha de processo.'},
  {t:'neon',     name:'Neon',             price:250, unlock:'th_neon', desc:'Oficina cyberpunk. Grátis na fase 10.'},
  {t:'brasa',    name:'Brasa',            price:150, desc:'Preto e vermelho.'},
  {t:'forja',    name:'Forja',            price:150, desc:'Preto e dourado.'}
];
const REVEAL_COST = 40;
const MACHINES = { torno:{trilha:'Trilha do Torno (Fanuc)'}, fresa:{trilha:'Trilha do Centro de Usinagem'} };

let LEVELS = LEVELS_TORNO;
const levelsFor = m => m==='fresa' ? LEVELS_FRESA : LEVELS_TORNO;
const skey = lv => (lv.machine||S.machine)+'_'+lv.id;
const maxStarsFor  = m => levelsFor(m).length*3;
const bossStarsFor = m => Math.round(maxStarsFor(m)*0.5);
const starsForMachine = m => { let t=0; for(const k in S.stars) if(k.startsWith(m+'_')) t+=(+S.stars[k]||0); return t; };
const makeEndless = run => S.machine==='fresa' ? makeEndlessLevelFresa(run) : makeEndlessLevel(run);

/* ---------------- estado ---------------- */
const DEF = {xp:0, coins:0, hints:3, stars:{}, best:{}, unlocked:[], owned:[], theme:'steel', tutorial:false,
  aula:{}, endlessRun:0, streak:0, bestStreak:0, machine:'torno', dev:false, bench:null};
let S = load();
LEVELS = levelsFor(S.machine);
function load(){
  let raw={}; try{ raw=JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ raw={}; }
  const s={...DEF, ...raw};
  const num=(v,d)=> typeof v==='number'&&isFinite(v)?Math.max(0,Math.floor(v)):d;
  s.xp=num(s.xp,0); s.coins=num(s.coins,0); s.hints=num(s.hints,3);
  ['stars','best','aula'].forEach(k=>{ if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k])) s[k]={}; });
  ['unlocked','owned'].forEach(k=>{ if(!Array.isArray(s[k])) s[k]=[]; });
  if(!THEMES.some(t=>t.t===s.theme)) s.theme='steel';
  s.machine = s.machine==='fresa'?'fresa':'torno';
  if(s.bench && (typeof s.bench!=='object' || !s.bench.stock || !s.bench.tools)) s.bench=null;
  return s;
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }
  catch(e){ if(!save._w){ save._w=1; toast('Não consegui salvar o progresso neste navegador.',5000); } }
}
function switchMachine(m){ S.machine = m==='fresa'?'fresa':'torno'; LEVELS=levelsFor(S.machine); save(); }

let P=null, timer=null;
const HINT_TIER={};

/* ---------------- util ---------------- */
const totalStars = () => Object.values(S.stars).reduce((a,b)=>a+(+b||0),0);
const rankOf = xp => RANKS.filter(r=>xp>=r[0]).pop();
const nextRank = xp => RANKS.find(r=>xp<r[0]);
const has = id => S.dev || S.unlocked.includes(id) || S.owned.includes(id);
const done = k => (S.stars[k]||0) > 0;
const mmss = s => String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const fmt = CNC.fmtN;
function toast(msg, ms=2600){ const t=$('#toast'); t.innerHTML=msg; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),ms); }
function countUp(el,from,to,ms=900){
  if(REDUCED||from===to){ el.textContent=to; return; }
  const t0=performance.now(); (function f(t){ const k=Math.min(1,(t-t0)/ms); el.textContent=Math.round(from+(to-from)*k); if(k<1) requestAnimationFrame(f); })(t0);
}
let AC=null;
function unlockAudio(){ try{ if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); }catch(e){} }
addEventListener('pointerdown',unlockAudio,{once:true}); addEventListener('keydown',unlockAudio,{once:true});
function beep(freq=660, dur=.09, type='sine', vol=.06){
  if(!AC) return; try{ const o=AC.createOscillator(), g=AC.createGain(); o.type=type; o.frequency.value=freq;
  g.gain.setValueAtTime(vol,AC.currentTime); g.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+dur);
  o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime+dur); }catch(e){}
}
const sndOk  = ()=>{beep(880,.08);setTimeout(()=>beep(1320,.12),80);};
const sndErr = ()=>beep(150,.18,'square',.05);
const sndWin = ()=>{[523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,.16,'triangle'),i*110));};
const sndCoin= ()=>{beep(1200,.05,'square',.04);setTimeout(()=>beep(1600,.07,'square',.04),60);};

/* ---------------- HUD ---------------- */
function hud(){
  const [minXp,name]=rankOf(S.xp), nx=nextRank(S.xp);
  $('#rankLabel').textContent=name;
  const pct = nx ? (S.xp-minXp)/(nx[0]-minXp)*100 : 100;
  $('#xpFill').style.width=pct+'%';
  $('#xpBar').setAttribute('aria-valuenow', Math.round(pct));
  $('#xpTxt').textContent = nx ? `${S.xp} / ${nx[0]} XP → ${nx[1]}` : `${S.xp} XP — patente máxima`;
  $('#coinTxt').textContent=S.coins; $('#hintTxt').textContent=S.hints; $('#starTxt').textContent=totalStars();
  document.body.dataset.theme=S.theme; CC=null;
}

/* ---------------- navegação ---------------- */
function closeAllModals(){ document.body.style.overflow=''; setInert(false); $('#overlay').classList.remove('on'); $$('.modal').forEach(m=>m.classList.remove('on')); }
function show(id){
  closeAllModals();
  if(id!=='play' && P && !P.won && !P.pausedAt) P.pausedAt=Date.now();
  $$('.screen').forEach(s=>{ s.classList.remove('active'); s.setAttribute('aria-hidden','true'); });
  const sc=$('#screen-'+id); sc.classList.add('active'); sc.setAttribute('aria-hidden','false');
  if(id!=='play'){ clearInterval(timer); timer=null; }
  if(id==='play') mountSim('#playSimSlot');
  if(id==='bench'){ mountSim('#benchSimSlot'); openBench(); }
  if(id==='map') renderMap();
  if(id==='shop') renderShop();
  if(id==='help') renderHelp();
  if(id==='choose') renderChoose();
  window.scrollTo({top:0,behavior:'auto'});
  const h1=sc.querySelector('h1'); if(h1){ h1.tabIndex=-1; h1.focus({preventScroll:true}); }
}
$('#navChoose').onclick=()=>show('choose');
$('#navMap').onclick=()=>show('map');
$('#navBench').onclick=()=>{ if(!has('bench')){ toast('O Simulador livre abre ao completar a fase 4.'); return; } show('bench'); };
$('#navShop').onclick=()=>{ if(!has('shop')){ toast('A Loja abre ao completar a fase 2.'); return; } show('shop'); };
$('#navHelp').onclick=()=>show('help');
$('#btnBack').onclick=()=>show('map');

(function(){                                   // modo desenvolvedor: 7 cliques no logo
  let clicks=[]; if(S.dev) $('#logoMark').classList.add('dev-on');
  $('#logoMark').addEventListener('click',()=>{
    const now=Date.now(); clicks=clicks.filter(t=>now-t<3000); clicks.push(now);
    if(clicks.length>=7){ clicks=[]; S.dev=!S.dev; save(); $('#logoMark').classList.toggle('dev-on',S.dev);
      toast(S.dev?'Modo desenvolvedor: tudo liberado.':'Modo desenvolvedor desligado.',3000);
      if($('#screen-map').classList.contains('active')) renderMap(); }
  });
})();

/* ---------------- escolha / mapa ---------------- */
const MACH_ICON = {
  torno:`<svg class="mach-ic" viewBox="0 0 120 64" aria-hidden="true"><path class="cl" d="M2 30h116"/><rect x="6" y="8" width="18" height="44" rx="1"/><path d="M24 14h7v32h-7"/><path d="M31 21h50v18H31z"/><path d="M81 25h14v10H81z"/><path d="M95 27.5h8v5h-8"/><path class="tl" d="M66 39l6 0 6 12h-18z"/><path d="M60 51h24v9H60z"/></svg>`,
  fresa:`<svg class="mach-ic" viewBox="0 0 120 64" aria-hidden="true"><path class="cl" d="M60 0v44"/><path d="M48 2h24v14H48z"/><path d="M52 16h16v7H52z"/><path class="tl" d="M56 23h8v17h-8z"/><path d="M56 28l8 4M56 34l8 4"/><path d="M22 44h76v10H22z"/><path d="M50 44v4h20v-4"/><path d="M10 58h100"/></svg>`
};
function renderChoose(){
  $$('#chooseTrack [data-machine]').forEach(d=>{
    const m=d.dataset.machine, on=S.machine===m, ts=starsForMachine(m), max=maxStarsFor(m);
    d.classList.toggle('cur',on);
    if(!d.querySelector('.mach-ic')) d.insertAdjacentHTML('afterbegin',MACH_ICON[m]||'');
    let rec=d.querySelector('.rec'); if(!rec){ rec=document.createElement('div'); rec.className='rec'; d.appendChild(rec); }
    rec.innerHTML=`<span class="ch-prog" aria-hidden="true"><i style="width:${Math.round(ts/max*100)}%"></i></span><span>${ts} / ${max} ★${on?' · trilha atual':''}</span>`;
  });
}
$$('#chooseTrack [data-machine]').forEach(d=>{
  const act=()=>{ switchMachine(d.dataset.machine); show('map'); };
  d.onclick=act; d.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); act(); } });
});
function isUnlocked(lv){
  if(S.dev) return true;
  const i=LEVELS.indexOf(lv);
  if(i<=0) return true;
  if(S.stars[skey(lv)]) return true;
  if(!done(skey(LEVELS[i-1]))) return false;
  if(lv.boss) return starsForMachine(S.machine)>=bossStarsFor(S.machine);
  return true;
}
function nodeEl(html, cls, act, label){
  const d=document.createElement('div'); d.className='node '+cls; d.tabIndex=0; d.setAttribute('role','button');
  if(label) d.setAttribute('aria-label',label);
  d.innerHTML=html; d.onclick=act;
  d.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); act(); } });
  return d;
}
function renderMap(){
  const t=$('#mapTrack'); t.innerHTML='';
  const ts=starsForMachine(S.machine), MAX=maxStarsFor(S.machine), BOSS=bossStarsFor(S.machine);
  $('#mapTitle').textContent=MACHINES[S.machine].trilha;
  const feitas=LEVELS.filter(l=>done(skey(l))).length;
  $('#mapStats').innerHTML=`<b>${ts} / ${MAX} ★</b> · ${feitas} de ${LEVELS.length} fases`;
  const bossLv=LEVELS.find(l=>l.boss && !isUnlocked(l));
  if(bossLv){
    const f=Math.max(0,BOSS-ts);
    $('#mapStats').insertAdjacentHTML('beforeend',`<span class="goal"><i style="width:${Math.min(100,ts/BOSS*100)}%"></i></span>
      <span class="goal-txt">${f>0?`Faltam <b>${f} ★</b> para o CHEFE`:'Estrelas suficientes — complete as fases anteriores para liberar o CHEFE'}</span>`);
  }
  if(P && !P.won && P.lv.machine===S.machine)
    t.appendChild(nodeEl(`<div class="num">EM ANDAMENTO</div><div class="nm">Retomar</div><div class="sb">${esc(P.lv.endless?P.lv.name:'Fase '+P.lv.id+' — '+P.lv.name)}</div><div class="st">▶</div><i class="lampn" aria-hidden="true"></i>`,'cur resume',resumeLevel));
  let curMarked=false;
  const LOCK_IC='<svg class="ic" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
  LEVELS.forEach((lv,i)=>{
    const st=S.stars[skey(lv)]||0, open=isUnlocked(lv), b=S.best[skey(lv)];
    const cur=open&&st===0&&!curMarked; if(cur) curMarked=true;
    const d=nodeEl(`<div class="num">FASE <b>${String(lv.id).padStart(2,'0')}</b></div><div class="nm">${esc(lv.name)}</div>
      <div class="sb">${esc(lv.sub)}</div><div class="st" aria-hidden="true">${[1,2,3].map(k=>k<=st?'<b>★</b>':'☆').join('')}</div>
      ${b?`<div class="rec">recorde ${mmss(b)}</div>`:''}${lv.boss?'<div class="badge">CHEFE</div>':''}
      ${lv.boss&&!open?`<div class="gate">Requer ${BOSS} ★ — você tem ${ts}</div>`:''}${open?'<i class="lampn" aria-hidden="true"></i>':`<div class="lock" aria-hidden="true">${LOCK_IC}</div>`}`,
      (open?'':'locked')+(lv.boss?' boss':'')+(cur?' cur':'')+(st===3?' perfect':st>0?' done':''),
      open?()=>startLevel(lv):()=>toast(lv.boss?`O CHEFE exige ${BOSS} ★ e as fases anteriores completas.`:'Complete a fase anterior primeiro.',3500),
      `Fase ${lv.id}: ${lv.name}. ${st} de 3 estrelas.${open?'':' Bloqueada.'}`);
    d.style.setProperty('--i',i);
    t.appendChild(d);
  });
  if(has('endless'))
    t.appendChild(nodeEl(`<div class="num">EXTRA</div><div class="nm">Modo Infinito</div><div class="sb">Peças aleatórias sem fim. Rodada ${S.endlessRun+1}.</div>
      <div class="st">∞</div><div class="rec">sequência ${S.streak} · recorde ${S.bestStreak}</div><div class="badge">∞</div><i class="lampn" aria-hidden="true"></i>`,'boss endless',()=>startLevel(makeEndless(S.endlessRun+1))));
  const prox=UNLOCKS.find(u=>!has(u.id));
  $('#unlockStrip').innerHTML=UNLOCKS.map(u=>`<span class="uchip ${has(u.id)?'on':(u===prox?'next':'')}"><i class="uc-mk" aria-hidden="true">${has(u.id)?'✓':(u===prox?'▶':LOCK_IC)}</i>${has(u.id)?'<span class="vh">Liberado:</span>':u===prox?'<span class="vh">Próximo:</span>':'<span class="vh">Bloqueado:</span>'} ${u.name} <small>${u.lvl==='boss'?'chefe':'fase '+u.lvl}</small></span>`).join('');
}

/* =========================================================================
   DESENHO 2D (aba DESENHO)
   ========================================================================= */
const cv=$('#cv'), ctx=cv.getContext('2d');
const view2d={path:true};
let CC=null;
function themeColors(){
  if(CC) return CC; const cs=getComputedStyle(document.body), g=v=>cs.getPropertyValue(v).trim();
  CC={paper:g('--paper'),draw:g('--draw'),dim:g('--dim'),pt:g('--pt'),acc:g('--acc'),acc2:g('--acc2'),muted:g('--muted'),line:g('--line'),ok:g('--ok'),err:g('--err')};
  return CC;
}
function profPts(part, machine){
  if(!part||!part.prof) return [];
  const lines=part.prof.split('\n').map((t,i)=>({text:t,row:i}));
  const r=CNC.simulate(lines, machine);
  const pts=[]; r.segs.forEach(s=>s.pts.forEach(p=>pts.push(p)));
  return pts;
}
function draw2d(){
  if(!cv.offsetParent) return;
  const d=window.devicePixelRatio||1, W=cv.clientWidth, H=cv.clientHeight;
  if(!W||!H) return;
  cv.width=W*d; cv.height=H*d; ctx.setTransform(d,0,0,d,0,0);
  const C=themeColors(); ctx.fillStyle=C.paper; ctx.fillRect(0,0,W,H);
  const T=SIM.machine==='torno', part=SIM.part, res=SIM.res;
  const prof=profPts(part, SIM.machine);
  // limites
  let bx=[], by=[];
  const add=(u,v)=>{ if(u!=null&&v!=null&&isFinite(u)&&isFinite(v)){ bx.push(u); by.push(v); } };
  if(T){
    const D=part?part.stock[0]:40, L=part?part.stock[1]:50;
    add(-L,0); add((part&&part.face)||0, D/2); add(4,-D/2);
    prof.forEach(p=>add(p.z,p.x/2));
    (part&&part.pts||[]).forEach(([,x,z])=>{ if(Math.abs(x)<200&&Math.abs(z)<200) add(z,x/2); });
  }else{
    const s=part?part.stock:[0,0,100,60]; add(s[0],s[1]); add(s[2],s[3]);
    (part&&part.pts||[]).forEach(([,x,y])=>add(x,y));
  }
  if(res) res.segs.forEach(s=>s.pts.forEach(p=>{ if(T){ if(Math.abs(p.x)<300&&Math.abs(p.z)<300) add(p.z,p.x/2); } else if(Math.abs(p.x)<400&&Math.abs(p.y)<400) add(p.x,p.y); }));
  let x0=Math.min(...bx), x1=Math.max(...bx), y0=Math.min(...by), y1=Math.max(...by);
  if(!isFinite(x0)){ x0=-50;x1=10;y0=-25;y1=25; }
  if(T){ const m=Math.max(Math.abs(y0),Math.abs(y1)); y0=-m; y1=m; }
  const pad=34, sc=Math.min((W-pad*2)/Math.max(1,x1-x0),(H-pad*2)/Math.max(1,y1-y0));
  const ox=pad+((W-pad*2)-(x1-x0)*sc)/2, oy=pad+((H-pad*2)-(y1-y0)*sc)/2;
  const X=u=>ox+(u-x0)*sc, Y=v=>H-(oy+(v-y0)*sc);
  ctx.lineJoin='round'; ctx.lineCap='round';
  // grade
  ctx.strokeStyle=C.line; ctx.globalAlpha=.35; ctx.lineWidth=1;
  const step=sc>6?5:sc>2?10:20;
  for(let u=Math.ceil(x0/step)*step;u<=x1;u+=step){ ctx.beginPath(); ctx.moveTo(X(u),0); ctx.lineTo(X(u),H); ctx.stroke(); }
  for(let v=Math.ceil(y0/step)*step;v<=y1;v+=step){ ctx.beginPath(); ctx.moveTo(0,Y(v)); ctx.lineTo(W,Y(v)); ctx.stroke(); }
  ctx.globalAlpha=1;
  // bruto
  ctx.setLineDash([5,4]); ctx.strokeStyle=C.muted; ctx.lineWidth=1.2;
  if(T){ const D=part?part.stock[0]:40, L=part?part.stock[1]:50, f=(part&&part.face)||0;
    ctx.strokeRect(X(-L),Y(D/2),(f+L)*sc,D*sc); }
  else { const s=part?part.stock:[0,0,100,60]; ctx.strokeRect(X(s[0]),Y(s[3]),(s[2]-s[0])*sc,(s[3]-s[1])*sc); }
  ctx.setLineDash([]);
  // peça
  if(prof.length){
    ctx.fillStyle=C.dim; ctx.globalAlpha=.16; ctx.strokeStyle=C.draw; ctx.lineWidth=2;
    ctx.beginPath();
    if(T){ prof.forEach((p,i)=>i?ctx.lineTo(X(p.z),Y(p.x/2)):ctx.moveTo(X(p.z),Y(p.x/2)));
      const l=prof[prof.length-1]; ctx.lineTo(X(l.z),Y(0)); ctx.lineTo(X(prof[0].z),Y(0)); ctx.closePath(); ctx.fill();
      ctx.beginPath(); prof.forEach((p,i)=>i?ctx.lineTo(X(p.z),Y(-p.x/2)):ctx.moveTo(X(p.z),Y(-p.x/2)));
      ctx.lineTo(X(l.z),Y(0)); ctx.lineTo(X(prof[0].z),Y(0)); ctx.closePath(); ctx.globalAlpha=.08; ctx.fill(); }
    else { prof.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y))); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha=1; ctx.beginPath();
    if(T){ prof.forEach((p,i)=>i?ctx.lineTo(X(p.z),Y(p.x/2)):ctx.moveTo(X(p.z),Y(p.x/2))); ctx.stroke();
      ctx.globalAlpha=.45; ctx.beginPath(); prof.forEach((p,i)=>i?ctx.lineTo(X(p.z),Y(-p.x/2)):ctx.moveTo(X(p.z),Y(-p.x/2))); ctx.stroke(); ctx.globalAlpha=1; }
    else { prof.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y))); ctx.closePath(); ctx.stroke(); }
  }
  if(!T && part){
    ctx.strokeStyle=C.draw; ctx.lineWidth=1.5;
    (part.holes||[]).forEach(([hx,hy,hd])=>{ ctx.beginPath(); ctx.arc(X(hx),Y(hy),hd/2*sc,0,7); ctx.stroke(); });
    (part.pockets||[]).forEach(pk=>{ ctx.fillStyle=C.dim; ctx.globalAlpha=.22; ctx.beginPath();
      if(pk.rect){ const [cx,cy,w,h]=pk.rect; ctx.rect(X(cx-w/2),Y(cy+h/2),w*sc,h*sc); } else { const [cx,cy,r]=pk.circle; ctx.arc(X(cx),Y(cy),r*sc,0,7); }
      ctx.fill(); ctx.globalAlpha=1; ctx.stroke(); });
  }
  // linha de centro / eixos e zero-peça
  ctx.strokeStyle=C.muted; ctx.lineWidth=1; ctx.setLineDash([10,4,2,4]);
  if(T){ ctx.beginPath(); ctx.moveTo(0,Y(0)); ctx.lineTo(W,Y(0)); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.strokeStyle=C.acc; ctx.lineWidth=1.6; ctx.beginPath(); ctx.arc(X(0),Y(0),6,0,7); ctx.stroke();
  ctx.fillStyle=C.acc; ctx.font='bold 11px '+getComputedStyle(document.body).fontFamily; ctx.fillText('W',X(0)+8,Y(0)-8);
  // percurso do programa
  if(res && view2d.path){
    res.segs.forEach(s=>{
      const hl = SIM.focus>=0 && s.row===SIM.focus;
      ctx.strokeStyle = hl ? C.ok : s.kind==='rapid' ? C.acc : C.acc2;
      ctx.lineWidth = hl?3:(s.kind==='pass'?1:1.8); ctx.globalAlpha = s.kind==='pass'?.45:1;
      ctx.setLineDash(s.kind==='rapid'?[6,5]:[]);
      ctx.beginPath();
      s.pts.forEach((p,i)=>{ const u=T?p.z:p.x, v=T?p.x/2:p.y; i?ctx.lineTo(X(u),Y(v)):ctx.moveTo(X(u),Y(v)); });
      ctx.stroke();
    });
    ctx.setLineDash([]); ctx.globalAlpha=1;
    res.holes.forEach(h=>{ if(T) return; ctx.fillStyle=C.acc2; ctx.beginPath(); ctx.arc(X(h.x),Y(h.y),3,0,7); ctx.fill(); });
  }
  // pontos
  (part&&part.pts||[]).forEach(([id,a,b])=>{
    const u=T?b:a, v=T?a/2:b; if(!isFinite(u)||!isFinite(v)) return;
    ctx.fillStyle=C.pt; ctx.beginPath(); ctx.arc(X(u),Y(v),3.5,0,7); ctx.fill();
    ctx.font='bold 11px '+getComputedStyle(document.body).fontFamily;
    const lbl = T ? `${id}  X${fmt(a)} Z${fmt(b)}` : `${id}  X${fmt(a)} Y${fmt(b)}`;
    ctx.fillStyle=C.draw; ctx.fillText(lbl, Math.min(W-ctx.measureText(lbl).width-4, X(u)+6), Math.max(12,Y(v)-7));
  });
  ctx.fillStyle=C.muted; ctx.font='11px '+getComputedStyle(document.body).fontFamily;
  ctx.fillText(T?'Z → (comprimento)   X ↑ (diâmetro / 2 no desenho)':'X →   Y ↑   (vista de cima)', 8, H-8);
}
addEventListener('resize',()=>{ CC=null; draw2d(); });

/* =========================================================================
   FASE
   ========================================================================= */
const nOf = s => /^N\d+$/i.test(s||'') ? +s.slice(1) : null;
function ctxList(lv){
  let mot=null, F=null;
  return lv.rows.map(r=>{
    const c={mot,F};
    if(!r.raw){
      if(/^\s*O\d+/i.test(r.code)){ mot=null; F=null; }
      const g=CNC.group(CNC.parse(r.code).words);
      const m=g.G.filter(G=>G>=0&&G<=3); if(m.length) mot=m[m.length-1];
      if('F' in g.o && !g.G.includes(76)) F=g.o.F;
    }
    return c;
  });
}
function startLevel(lv){
  lv.machine = lv.machine || S.machine;
  P={lv, tries:0, hints:0, revealed:0, borrowed:false, t0:Date.now(), assisted:false, safetyUsed:false, won:false, ctx:ctxList(lv)};
  P.part=levelPart(lv);
  P.tools=fullTurret(lv.machine, inferTools(lv.rows.map((r,i)=>({row:i,text:r.code,raw:r.raw})), lv.machine, lv.part));
  for(const k in HINT_TIER) delete HINT_TIER[k];
  $('#lvName').textContent = lv.endless ? lv.name : `Fase ${lv.id} — ${lv.name}`;
  $('#lvSub').textContent = lv.brief;
  $('#chipTry').textContent='Tentativas: 0';
  $('#tipLine').textContent=lv.tip||'';
  $('#feedback').textContent=''; $('#feedback').className='feedback';
  $('#hintBox').innerHTML='';
  $('#btnCheck').hidden=false; $('#btnNext').hidden=true;
  $('#btnReveal').style.display = has('reveal')?'':'none';
  $('#btnAula').style.display = lv.aula?'':'none';
  SIM.focus=-1;
  buildTable(lv);
  syncExplainBtn();
  setView('#screen-play','prog');
  show('play');
  SIM.rowText = r => { const row=P.lv.rows[r]; return row ? (row.given?row.code:(valOf(r)||'')) : ''; };
  SIM.rowN = r => (P.lv.rows[r]&&P.lv.rows[r].n)||'';
  SIM.rowEl = r => $(`#progTable tr[data-r="${r}"]`);
  rerun(true);
  clearInterval(timer); $('#chipTime').textContent='00:00';
  timer=setInterval(()=>{ $('#chipTime').textContent=mmss(Math.floor((Date.now()-P.t0)/1000)); },1000);
  const k=skey(lv);
  if(lv.aula && !S.aula[k]){ openAula(lv, ()=>{ S.aula[k]=1; save(); maybeTutorial(); }); }
  else maybeTutorial();
}
function maybeTutorial(){ if(!S.tutorial && P && P.lv.id===1 && !P.lv.endless) setTimeout(startTutorial,350); }
function resumeLevel(){
  if(!P) return;
  if(P.pausedAt){ P.t0+=Date.now()-P.pausedAt; P.pausedAt=0; }
  show('play'); rerun(true);
  clearInterval(timer); timer=setInterval(()=>{ $('#chipTime').textContent=mmss(Math.floor((Date.now()-P.t0)/1000)); },1000);
}
function buildTable(lv){
  const t=$('#progTable');
  let h=`<thead><tr><th>N</th><th>O que o bloco faz</th><th>Código</th></tr></thead><tbody>`;
  lv.rows.forEach((r,i)=>{
    if(/^\s*O\d+/i.test(r.code) && i>0) h+=`<tr class="sep"><td colspan="3">— ${esc(r.code)} —</td></tr>`;
    h+=`<tr data-r="${i}" class="${r.given?'given':'wr'}"><td class="n">${esc(r.n||'')}</td><td class="say">${esc(r.say||'')}</td><td class="code">`+
      (r.given ? `<span class="giv">${esc(r.code)}</span>`
               : `<input type="text" data-r="${i}" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="next" aria-label="${esc((r.n||'')+' — '+r.say)}" placeholder="escreva o bloco">`)+
      `</td></tr>`;
  });
  t.innerHTML=h+'</tbody>';
  $('#btnCheck').classList.remove('ready');
  const inputs=()=>$$('#progTable input');
  inputs().forEach(el=>{
    const r=+el.dataset.r;
    el.addEventListener('focus',()=>setFocus(r));
    el.addEventListener('input',()=>{
      el.classList.remove('ok','err');
      clearTimeout(rerun._t); rerun._t=setTimeout(()=>rerun(false),350);
      const cheia=inputs().every(i=>i.value.trim()!=='');
      if(cheia && !$('#btnCheck').classList.contains('ready')) beep(880,.07);
      $('#btnCheck').classList.toggle('ready',cheia);
    });
    el.addEventListener('keydown',e=>{
      const list=inputs(), i=list.indexOf(el);
      if(e.key==='Enter'){ e.preventDefault(); if(i===list.length-1) check(); else list[i+1].focus(); }
      else if(e.key==='ArrowDown'&&list[i+1]){ e.preventDefault(); list[i+1].focus(); }
      else if(e.key==='ArrowUp'&&list[i-1]){ e.preventDefault(); list[i-1].focus(); }
    });
  });
  $$('#progTable tbody tr[data-r]').forEach(tr=>tr.addEventListener('click',e=>{ if(e.target.tagName!=='INPUT') setFocus(+tr.dataset.r); }));
}
function setFocus(r){
  SIM.focus=r;
  $$('#progTable tr.cur').forEach(t=>t.classList.remove('cur'));
  const tr=$(`#progTable tr[data-r="${r}"]`); if(tr) tr.classList.add('cur');
  if(!Sim3D.running()) fanucHud(r,null,null);
  draw2d();
}
const valOf = r => { const el=$(`#progTable input[data-r="${r}"]`); return el?el.value:''; };
function progLines(useTyped=true){
  return P.lv.rows.map((r,i)=>({row:i, n:nOf(r.n), raw:!!r.raw, text: (r.given||!useTyped)?r.code:valOf(i)}));
}
function rerun(){
  if(!P) return;
  runSim({lines:progLines(true), machine:P.lv.machine, part:P.part, tools:P.tools, sim:P.lv.sim!==false});
}
function levelPart(lv){
  const d = lv.machine==='torno' ? {stock:[40,50], face:0} : {stock:[0,0,100,60]};
  return JSON.parse(JSON.stringify(lv.part||d));
}

/* ---------------- verificação ---------------- */
function rowInfo(r){
  const row=P.lv.rows[r], typed=valOf(r);
  const ctrl = P.lv.ctrl==='multi' ? 'multi' : P.lv.machine;
  const res=CNC.checkRow(row, typed, P.ctx[r], ctrl==='multi'?'fresa':ctrl);
  return {r, row, typed, ...res};
}
function diag(info){
  if(info.row.raw) return {code:'geral', msg: info.blank?`O bloco está vazio. Ele precisa: <i>${esc(info.row.say)}</i>`:'A sintaxe não confere. Releia a aula: essa palavra-chave é escrita do jeito do comando pedido.'};
  const m = P.lv.ctrl==='multi' ? 'multi' : P.lv.machine;
  return diagnoseRow(info.row, info.typed, P.ctx[info.r], m);
}
function diagnoseRow(row, typed, c, m){
  if(m==='multi'){
    const d=CNC.diagnose(row, typed, c, 'fresa');
    if(d.code==='naoexiste') return {code:'geral', msg:'Esse código não é o usado por esse comando. Confira a tabela Fanuc × Siemens × Mach 9 no Manual.'};
    // o dicionário é o da fresa Fanuc: G71 e o F/D do G4 têm outro sentido no Siemens/Mach 9
    const eg=CNC.group(CNC.parse(row.code).words).G;
    if(d.code!=='formato' && d.code!=='vazio' && eg.includes(71)) return {code:'troca', msg:'No Siemens e no Mach 9, <b>milímetros</b> é <b>G71</b> (o G21 é do Fanuc — e no Fanuc o G71 é outra coisa).'};
    if(!['formato','vazio','tempo'].includes(d.code) && eg.includes(4)) return {code:'troca', msg:'A pausa muda de letra em cada comando: Fanuc <b>G4 X</b> (segundos) ou <b>P</b> (milésimos), Siemens <b>G4 F</b> (segundos), Mach 9 <b>G4 D</b> (segundos). Veja qual comando o bloco pede.'};
    return d;
  }
  return CNC.diagnose(row, typed, c, m);   // (absoluto × incremental é tratado no CNC.diagnose)
}
const TYPE_LBL={vazio:'bloco em branco', formato:'erro de digitação', naoexiste:'código que não existe', troca:'código trocado pelo vizinho do grupo',
  sinal:'sinal trocado', raio:'raio no lugar do diâmetro', dobro:'diâmetro dobrado', falta:'faltou uma palavra', sobra:'palavra sobrando',
  virgula:'faltou a vírgula do ,R / ,C', micron:'unidade em mícrons', feed:'avanço na unidade errada', tool:'T com 2 dígitos no torno', valor:'número diferente do pedido', geral:'sintaxe', dup:'letra repetida',
  incr:'absoluto × incremental (X/Z × U/W)', g28:'G28 com X/Z em vez de U0/W0', tempo:'tempo em segundos × milésimos'};
const cellsOf = () => $$('#progTable input');
const firstBad = () => { for(const el of cellsOf()){ const i=rowInfo(+el.dataset.r); if(!i.ok) return i; } return null; };

function check(){
  if(P.won) return;
  const infos=cellsOf().map(el=>({el, ...rowInfo(+el.dataset.r)}));
  infos.forEach(c=>{ c.el.classList.toggle('ok',c.ok); c.el.classList.toggle('err',!c.ok); c.el.setAttribute('aria-invalid',c.ok?'false':'true'); });
  rerun();
  const bad=infos.filter(c=>!c.ok), fb=$('#feedback');
  if(!bad.length){ win(); return; }
  if(bad.length===infos.length && bad.every(c=>c.blank)){
    fb.className='feedback bad'; fb.textContent='Escreva os blocos antes de verificar — esta não conta como tentativa.'; sndErr(); return;
  }
  P.tries++; $('#chipTry').textContent='Tentativas: '+P.tries; sndErr(); syncExplainBtn();
  const byType={}; bad.forEach(c=>{ c._d=diag(c); byType[c._d.code]=(byType[c._d.code]||0)+1; });
  const top=Object.entries(byType).filter(([k])=>k!=='vazio'&&k!=='geral'&&k!=='valor').sort((a,b)=>b[1]-a[1])[0];
  const b0=bad[0];
  fb.className='feedback bad';
  fb.innerHTML=`<b>${bad.length} bloco(s) para revisar.</b>`+(top?` Padrão: <b>${TYPE_LBL[top[0]]}</b> (${top[1]}×).`:'')+
    `<br><b>${esc(b0.row.n||'Bloco')}:</b> ${b0._d.msg}`+
    (SIM.alarms.length?`<br><span style="color:var(--err)">O simulador também acusou alarme — veja o painel.</span>`:'');
  b0.el.focus({preventScroll:true}); setFocus(b0.r);
  b0.el.scrollIntoView({block:'nearest'});
}
$('#btnCheck').onclick=check;
function syncExplainBtn(){
  const b=$('#btnExplain'), f=3-P.tries;
  b.dataset.locked=f>0?'1':''; b.classList.toggle('locked-soft',f>0);
  b.textContent=f>0?`Explicar (${f})`:'Explicar';
  b.title=f>0?`Abre depois de ${f} tentativa(s).`:'Bloco a bloco, com a resposta.';
}

/* ---------------- dicas ---------------- */
$('#btnHint').onclick=()=>{
  const c=firstBad();
  if(!c){ toast('Nada errado — clique em Verificar!'); return; }
  const key=c.r, tier=HINT_TIER[key]||0, row=c.row, m=P.lv.ctrl==='multi'?'multi':P.lv.machine;
  let txt, custa=true, titulo='Dica';
  if(tier===0){ custa=false; titulo=`${row.n||'Bloco'} — o que está errado`; txt=diag(c).msg; }
  else if(tier===1){
    titulo=`${row.n||'Bloco'} — formato`;
    txt = row.raw ? `O formato é: <code>${esc(row.code.replace(/\d/g,'_'))}</code>`
      : `O bloco tem este formato: <code>${esc(CNC.skeleton(row.code, true))}</code><br>`+
        CNC.explainBlock(row.code, m).map(s=>s.replace(/<b>[^<]*<\/b> → /,'• ')).join('<br>').replace(/\d+(\.\d+)?/g, d=>'_'.repeat(Math.min(3,d.length)));
  }else{
    titulo=`${row.n||'Bloco'} — resposta`;
    txt=`<code>${esc(row.code)}</code><br>${CNC.explainBlock(row.code,m).join(' · ')}`;
  }
  if(custa){
    if(S.hints>0){ S.hints--; save(); hud(); P.hints++; }
    else { P.borrowed=true; toast('Dica emprestada: sem ficha 💡, esta fase vale 1 ★. Compre fichas na Loja.',4200); }
  }
  HINT_TIER[key]=tier+1;
  const d=document.createElement('div'); d.className='hint'; d.innerHTML=`<b>${esc(titulo)}:</b> ${txt}`;
  $('#hintBox').appendChild(d); d.scrollIntoView({block:'nearest'}); beep(760,.1);
  setFocus(c.r);
};
$('#btnReveal').onclick=()=>{
  if(S.coins<REVEAL_COST){ toast(`Faltam moedas (custa ${REVEAL_COST} 🪙).`); return; }
  const c=firstBad(); if(!c){ toast('Nada para revelar — clique em Verificar!'); return; }
  const el=$(`#progTable input[data-r="${c.r}"]`); el.value=c.row.code; el.classList.add('given','ok'); el.classList.remove('err');
  S.coins-=REVEAL_COST; P.revealed++; save(); hud(); sndCoin(); rerun();
  toast(`Bloco ${esc(c.row.n)} revelado. −${REVEAL_COST} 🪙 · a fase vale no máximo ${P.revealed>2?1:2} ★`,3400);
};

/* ---------------- explicação ---------------- */
$('#btnExplain').onclick=()=>{
  if($('#btnExplain').dataset.locked){
    toast(`O passo a passo abre depois de 3 tentativas. Enquanto isso: <b>Dica</b> (1º nível grátis) ou <b>Aula</b>.`,4200); return; }
  const m=P.lv.ctrl==='multi'?'multi':P.lv.machine;
  $('#explainBody').innerHTML=P.lv.rows.map((r,i)=>r.given?'':
    `<div class="exrow"><b>${esc(r.n||'')}</b> — ${esc(r.say)}<br><code style="font-size:15px;color:var(--acc)">${esc(r.code)}</code>${r.alt&&r.alt.length?` <small style="color:var(--muted)">(também vale: ${r.alt.map(esc).join(' · ')})</small>`:''}<br>${r.raw?'':CNC.explainBlock(r.code,m).join(' · ')}</div>`).join('');
  openModal('#modalExplain');
};
$('#expClose').onclick=()=>closeModal('#modalExplain');
$('#expFill').onclick=()=>{
  if(!confirm('Isso escreve todos os blocos e a fase fica com 1 ★ (você pode repetir depois). Continuar?')) return;
  cellsOf().forEach(el=>{ el.value=P.lv.rows[+el.dataset.r].code; el.classList.add('given'); });
  P.assisted=true; closeModal('#modalExplain'); rerun();
  toast('Programa preenchido. Rode o CYCLE START para ver usinar e clique em Verificar.',4200);
};

/* ---------------- aula / cola ---------------- */
function codeCard(key, machine){
  let info=null, k=key;
  if(/^G\d+$/.test(key)) info=gInfo(+key.slice(1), machine);
  else if(/^M\d+$/.test(key)) info=mInfo(+key.slice(1), machine) || M_CODES[+key.slice(1)];
  else { const a=ADDR[key]; info={n:addrInfo(key,machine), d:a&&a.d?a.d:'', ex:''}; }
  if(!info) return '';
  return `<div class="acard"><div class="k">${esc(k)}</div><div class="t">${esc(info.n||'')}</div>${info.d?`<div class="d">${info.d}</div>`:''}${info.ex?`<div class="e">${esc(info.ex)}</div>`:''}</div>`;
}
function openAula(lv, after){
  const a=lv.aula; if(!a){ after&&after(); return; }
  $('#aulaTitle').textContent=`Fase ${lv.id} — ${lv.name}`;
  $('#aulaBody').innerHTML=`<p class="aula-intro">${a.intro}</p>`+
    (a.codes&&a.codes.length?`<div class="aula-cards">${a.codes.map(c=>codeCard(c,lv.machine)).join('')}</div>`:'')+
    (a.tips&&a.tips.length?`<h4>Na prática</h4><ul class="aula-tips">${a.tips.map(t=>`<li>${t}</li>`).join('')}</ul>`:'');
  openModal('#modalAula');
  $('#aulaClose').onclick=()=>{ closeModal('#modalAula'); after&&after(); };
}
$('#btnAula').onclick=()=>{ if(P&&P.lv.aula) openAula(P.lv); };
$('#btnCola').onclick=()=>{
  const lv=P.lv, list=levelsFor(lv.machine), idx=lv.endless?list.length-1:list.indexOf(lv);
  const keys=[]; list.slice(0,idx+1).forEach(l=>(l.aula&&l.aula.codes||[]).forEach(c=>{ if(!keys.includes(c)) keys.push(c); }));
  $('#unTitle').textContent='Cola — códigos que você já viu';
  $('#modalUnlock').classList.remove('finish');
  $('#unBody').innerHTML=`<div class="cola-grid">${keys.map(k=>codeCard(k,lv.machine)).join('')}</div>`;
  $('#unClose').textContent='Fechar'; $('#unClose').onclick=()=>closeModal('#modalUnlock');
  openModal('#modalUnlock');
};

/* ---------------- vitória ---------------- */
function starsFor(){
  if(P.assisted) return 1;
  let tries=P.tries;
  if(has('safety') && tries>0 && !P.safetyUsed){ tries--; P.safetyUsed=true; }
  let st=(tries===0&&P.hints===0)?3:(tries<=2&&P.hints<=2)?2:1;
  if(P.revealed>2) st=1; else if(P.revealed>0) st=Math.min(2,st);
  if(P.borrowed) st=1;
  return st;
}
function unlockedNow(){
  const newly=[];
  UNLOCKS.forEach(u=>{
    if(S.unlocked.includes(u.id)) return;
    const okU = u.lvl==='boss'
      ? [...LEVELS_TORNO,...LEVELS_FRESA].some(l=>l.boss && done(l.machine+'_'+l.id))
      : done('torno_'+u.lvl) || done('fresa_'+u.lvl);
    if(!okU) return;
    if(u.id.startsWith('th_') && S.owned.includes(u.id)){
      const th=THEMES.find(t=>'th_'+t.t===u.id); if(th){ S.coins+=th.price; toast(`${th.name} veio de graça — ${th.price} 🪙 devolvidos.`,4200); }
      S.owned=S.owned.filter(x=>x!==u.id);
    }
    S.unlocked.push(u.id); newly.push(u);
  });
  return newly;
}
function win(){
  if(P.won) return;
  P.won=true; clearInterval(timer); timer=null;
  sndWin(); if(!REDUCED) confetti();
  const lv=P.lv, st=starsFor(), secs=Math.floor((Date.now()-P.t0)/1000);
  let coins=20+st*15, xp=40+st*20+(lv.boss?150:0), first=false, recorde=false;
  if(lv.endless){
    if(st===3){ S.streak++; S.bestStreak=Math.max(S.bestStreak,S.streak); } else S.streak=0;
    S.endlessRun++; coins=P.assisted?0:8+6*st+Math.min(S.streak,6)*3; xp=P.assisted?0:15+15*st;
  }else{
    const k=skey(lv), prev=S.stars[k]||0; first=prev===0;
    if(st>prev) S.stars[k]=st;
    if(!first||P.assisted){ coins=Math.round(coins*.3); xp=Math.round(xp*.3); }
    if(!P.assisted && P.revealed===0 && (!S.best[k]||secs<S.best[k])){ recorde=!!S.best[k]; S.best[k]=secs; }
  }
  const coinsAntes=S.coins;
  S.coins+=coins; S.xp+=xp; S.hints+=first?2:0;
  const newly=unlockedNow();
  save(); hud();
  $$('#progTable input').forEach(el=>el.classList.add('ok'));
  // foto da peça pronta
  const img=$('#resShot'); img.style.display='none';
  if(has3D && lv.sim!==false){ $('#simPanel').classList.remove('mode2d'); Sim3D.showFinal(); const shot=Sim3D.snapshot(); if(shot){ img.src=shot; img.style.display=''; img.classList.toggle('perfect',st===3); } }
  $('#resStars').setAttribute('aria-label',st+' de 3 estrelas');
  $$('#resStars span').forEach((s,i)=>{ const on=i<st; s.classList.toggle('on',on); s.textContent=on?'★':'☆'; });
  $('#resLine').textContent = st===3?'PROGRAMA PERFEITO':st===2?'APROVADO':'APROVADO COM RESSALVA';
  $('#resTitle').textContent = st===3?'Programa perfeito!':st===2?'Programa aprovado!':'Passou no controle';
  $('#resText').textContent = `${lv.endless?'Rodada':'Fase'} concluída em ${mmss(secs)} · ` + (P.tries===0&&P.hints===0?'sem erros, sem dicas pagas.':`${P.tries} tentativa(s) · ${P.hints} dica(s) paga(s).`)
    + (has3D&&lv.sim!==false?' Aperte CYCLE START no painel para ver a máquina rodar seu programa.':'');
  $('#resRewards').innerHTML=`<span class="rw">+${xp} XP</span><span class="rw">+${coins} 🪙</span>`+(first?'<span class="rw">+2 💡</span>':'')+
    (recorde?'<span class="rw">⏱ NOVO RECORDE</span>':'')+(lv.endless&&S.streak>1?`<span class="rw">🔥 sequência ${S.streak}</span>`:'')+(!first&&!lv.endless?'<span class="rw dim">30% (repetição)</span>':'');
  const rk=rankOf(S.xp), nxr=nextRank(S.xp), pctR=nxr?Math.round((S.xp-rk[0])/(nxr[0]-rk[0])*100):100;
  const proxU=UNLOCKS.find(u=>!has(u.id));
  $('#resProg').innerHTML=`<div class="rp-rank"><span>${rk[1]}</span><span>${nxr?`faltam ${nxr[0]-S.xp} XP → ${nxr[1]}`:'patente máxima'}</span></div><div class="rp-bar"><i style="width:${pctR}%"></i></div>`+
    (proxU?`<div class="rp-line">Próximo desbloqueio: <b>${proxU.name}</b> ${proxU.lvl==='boss'?'ao vencer um CHEFE':'na fase '+proxU.lvl}.</div>`:'');
  countUp($('#coinTxt'),coinsAntes,S.coins);
  const last=!lv.endless && LEVELS.indexOf(lv)===LEVELS.length-1;
  $('#resNext').textContent=lv.endless?'Próxima peça ›':last?'Ver conclusão ›':'Próxima fase ›';
  openModal('#modalResult');
  const goNext=()=>{ if(newly.length){ const l=newly.splice(0); showUnlocks(l); } else nextLevel(); };
  $('#resNext').onclick=()=>{ closeModal('#modalResult'); goNext(); };
  // depois de vencer, o botão Verificar vira "Próxima fase" (para quem fecha o resultado e fica vendo a usinagem)
  $('#btnCheck').hidden=true; $('#btnNext').hidden=false; $('#btnNext').textContent=$('#resNext').textContent;
  $('#btnNext').onclick=()=>goNext();
  $('#resRepeat').textContent='Ver a peça sendo usinada';
  $('#resRepeat').onclick=()=>{ closeModal('#modalResult'); setView('#screen-play','sim');
    toast(allRef()?'<b>AUTO</b> → <b>CYCLE START</b> para ver a usinagem. Depois use <b>Próxima fase ›</b>.':'Para ver a usinagem: <b>HOME</b> → +X → CYCLE START → +Z → CYCLE START, depois <b>AUTO</b> → <b>CYCLE START</b>. Depois use <b>Próxima fase ›</b>.',6000); };
}
function nextLevel(){
  const lv=P.lv;
  if(lv.endless){ startLevel(makeEndless(S.endlessRun+1)); return; }
  const i=LEVELS.indexOf(lv), nx=LEVELS[i+1];
  if(nx && isUnlocked(nx)) startLevel(nx);
  else if(nx){ show('map'); toast(`O CHEFE exige ${bossStarsFor(S.machine)} ★. Refaça fases para pegar 3 ★.`,4500); }
  else showFinish();
}
function showFinish(){
  const tot=starsForMachine(S.machine), MAX=maxStarsFor(S.machine), pct=Math.round(tot/MAX*100);
  $('#modalUnlock').classList.add('finish');
  $('#unTitle').textContent='Fim da trilha';
  $('#unBody').innerHTML=`<div class="diploma"><div class="dip-seal">G</div><div class="dip-kick">CERTIFICADO DE CONCLUSÃO</div>
    <div class="dip-name">${rankOf(S.xp)[1]}</div><div class="dip-sub">${MACHINES[S.machine].trilha} · ${S.xp} XP</div>
    <div class="dip-bar"><i style="width:${pct}%"></i></div><div class="dip-nums"><span><b>${tot}</b><small>de ${MAX} ★</small></span>
    <span><b>${LEVELS.filter(l=>(S.stars[skey(l)]||0)===3).length}</b><small>programas perfeitos</small></span></div></div>
    <div class="exrow">Agora use o <b>Simulador livre</b> para testar os programas reais da escola, e o <b>Modo Infinito</b> para treinar.</div>`;
  openModal('#modalUnlock'); sndWin(); if(!REDUCED){ confetti(); setTimeout(confetti,700); }
  $('#unClose').textContent='Voltar ao mapa'; $('#unClose').onclick=()=>{ closeModal('#modalUnlock'); show('map'); };
}
function showUnlocks(list){
  $('#modalUnlock').classList.remove('finish'); $('#unClose').textContent='Beleza';
  $('#unTitle').textContent=list.length>1?'Novidades desbloqueadas!':'Desbloqueado!';
  $('#unBody').innerHTML=list.map(u=>`<div class="exrow"><b>${u.name}</b><br>${u.desc}</div>`).join('');
  openModal('#modalUnlock'); sndCoin();
  $('#unClose').onclick=()=>{ closeModal('#modalUnlock'); nextLevel(); };
}

/* ---------------- modais ---------------- */
let lastFocus=null;
function setInert(v){ $('#topbar').inert=v; $('#app').inert=v; const sp=$('#simPanel'); if(sp) sp.inert=false; }
function openModal(sel){
  lastFocus=document.activeElement; document.body.style.overflow='hidden'; setInert(true);
  $('#overlay').classList.add('on'); const m=$(sel); m.classList.add('on');
  (m.querySelector('.btn.primary')||m.querySelector('.btn')||m).focus();
}
function closeModal(sel){
  document.body.style.overflow=''; setInert(false); $('#overlay').classList.remove('on'); $(sel).classList.remove('on');
  if(lastFocus&&document.contains(lastFocus)) lastFocus.focus({preventScroll:true});
}
addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  const m=$('.modal.on'); if(!m) return;
  if(m.id==='modalAula') $('#aulaClose').click();
  else if(m.id==='modalUnlock') $('#unClose').click();
  else closeModal('#'+m.id);
});

/* =========================================================================
   LOJA
   ========================================================================= */
const COIN_IC='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/></svg><span class="vh">Moedas:</span>';
function renderShop(){
  const g=$('#shopGrid'); g.innerHTML='';
  const sec=t=>{ const h=document.createElement('h3'); h.className='shop-sec'; h.textContent=t; g.appendChild(h); };
  sec('Ferramentas');
  SHOP.forEach(it=>{
    const own=!it.repeat && S.owned.includes(it.id);
    const c=document.createElement('div'); c.className='card'+(own?' owned':'')+(!own&&S.coins<it.price?' short':'');
    c.innerHTML=`<h3>${it.name}</h3><p>${it.desc}</p><div class="buy"><div class="price">${own?'✓ Comprado':COIN_IC+it.price}</div></div>`;
    if(!own){ const b=document.createElement('button'); b.className='btn primary sm'; b.textContent='Comprar';
      b.onclick=()=>{ if(S.coins<it.price){ toast('Moedas insuficientes.'); return; }
        S.coins-=it.price; if(it.id==='pack') S.hints+=3; else S.owned.push(it.id); save(); hud(); sndCoin(); renderShop(); toast(it.name+' comprado!'); };
      c.querySelector('.buy').appendChild(b); }
    g.appendChild(c);
  });
  sec('Temas');
  THEMES.forEach(th=>{
    const id='th_'+th.t, own=th.price===0||S.owned.includes(id)||S.unlocked.includes(id), cur=S.theme===th.t;
    const c=document.createElement('div'); c.className='card theme-card'+(cur?' owned':'')+(!own&&S.coins<th.price?' short':'');
    c.innerHTML=`<div class="swatch" data-theme="${th.t}" aria-hidden="true"><i></i><i></i><i></i><i></i></div><h3>${th.name}</h3><p>${th.desc}</p><div class="buy"><div class="price">${cur?'✓ Em uso':own?'Seu':COIN_IC+th.price}</div></div>`;
    const b=document.createElement('button'); b.className='btn sm'+(own?'':' primary'); b.textContent=cur?'Em uso':own?'Usar':'Comprar'; b.disabled=cur;
    b.onclick=()=>{ if(!own){ if(S.coins<th.price){ toast('Moedas insuficientes.'); return; } S.coins-=th.price; S.owned.push(id); sndCoin(); }
      S.theme=th.t; save(); hud(); renderShop(); };
    c.querySelector('.buy').appendChild(b); g.appendChild(c);
  });
}

/* =========================================================================
   MANUAL
   ========================================================================= */
function renderHelp(){
  const g=$('#helpGrid');
  const tbl=(rows,head)=>`<table>${head?`<tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>`:''}${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  const gRows=(obj,m)=>Object.keys(obj).map(Number).sort((a,b)=>a-b).map(k=>['G'+k, `<b>${esc(obj[k].n)}</b><br><span style="color:var(--muted)">${obj[k].d}</span><br><code>${esc(obj[k].ex)}</code>`]);
  g.innerHTML=`
  <div class="card wide"><h3>Como se lê um bloco</h3>
    <p><code style="color:var(--acc);font-size:15px">N210 G1 X20. Z-2. F0.1</code></p>
    <ul><li><b>N210</b> — número do bloco (etiqueta, opcional)</li><li><b>G1</b> — o tipo de movimento (corte em reta)</li>
    <li><b>X20. Z-2.</b> — para onde ir (no torno X é <b>diâmetro</b>; Z negativo é para dentro da peça)</li><li><b>F0.1</b> — avanço (mm/rot no torno)</li></ul>
    <p>Funções <b>modais</b> (G0/G1/G2/G3, G90, G96, F…) continuam valendo até outra do mesmo grupo mudar. Comentários vão entre parênteses.</p></div>
  <div class="card wide"><h3>Fluxo de um programa de TORNO (Fanuc da escola)</h3>${tbl(FLOW_FANUC_TORNO)}</div>
  <div class="card wide"><h3>Fluxo de um programa de CENTRO DE USINAGEM (Fanuc — livro)</h3>${tbl(FLOW_FANUC_FRESA)}</div>
  <div class="card wide"><h3>Fanuc × Siemens × Mach 9 (livro)</h3>${tbl(OTHER_CONTROLS.map(r=>r.map(esc)),['Função','Fanuc','Siemens','Mach 9'])}</div>
  <div class="card"><h3>Códigos G — comuns</h3>${tbl(gRows(G_COMMON))}</div>
  <div class="card"><h3>Códigos G — torno</h3>${tbl(gRows(G_TORNO))}</div>
  <div class="card"><h3>Códigos G — centro de usinagem</h3>${tbl(gRows(G_FRESA))}</div>
  <div class="card"><h3>Códigos M</h3>${tbl(Object.keys(M_CODES).map(Number).map(k=>['M'+k,`<b>${esc(M_CODES[k].n)}</b><br><span style="color:var(--muted)">${M_CODES[k].d}</span>`]))}</div>
  <div class="card"><h3>Endereços (letras)</h3>${tbl(Object.keys(ADDR).map(k=>[esc(k), esc(ADDR[k].n||('Torno: '+(ADDR[k].t||'—')+' · Fresa: '+(ADDR[k].f||'—')))]))}</div>
  <div class="card"><h3>Teclas do painel (Romi G260 no SSCNC)</h3><ul>
    <li><b>CYCLE START</b> — executa o programa (no MDI, um bloco por vez; em HOME, referencia o eixo escolhido).</li>
    <li><b>CYCLE STOP</b> — para os eixos; <b>RESET</b> cancela tudo.</li>
    <li><b>SINGL BLOCK</b> — um bloco a cada Cycle Start. <b>BLOCK DELET</b> — pula blocos com <b>/</b>. <b>OPT STOP</b> — para no M1.</li>
    <li><b>DRY RUN</b> — avanços rápidos, sem peça. <b>PROG TEST</b> — roda sem girar o fuso.</li>
    <li><b>JOG</b> + <b>+X −X +Z −Z</b> (<b>TRVS</b> = rápido). <b>MPG X1/X10/X100</b> = manivela de 0,001 / 0,01 / 0,1 mm por pulso; o eixo é escolhido com +X/−X/+Z/−Z.</li>
    <li><b>JOG TURRET</b> + <b>TURRET POS</b> — gira a torre. <b>SPDL CW/STOP</b>, <b>CLNT ON/OFF/AUTO</b>.</li>
    <li>Botões giratórios: rotação do fuso 50–120 %, avanço 0–120 %.</li></ul></div>
  <div class="card wide"><h3>Passo a passo no painel do SSCNC — torno Romi G260 (Fanuc 0i)</h3>${window.procHtml('torno')}<p>Com pressa: <b>Ferramentas → Preparar máquina (atalho)</b> faz os passos 2 a 6 de uma vez.</p></div>
  <div class="card wide"><h3>Passo a passo — centro de usinagem (Fanuc 0i)</h3>${window.procHtml('fresa')}</div>
  <div class="card"><h3>Fórmulas</h3><ul>
    <li>Rotação: <b>N = Vc × 1000 ÷ (π × D)</b></li><li>Velocidade de corte: <b>Vc = π × D × N ÷ 1000</b></li>
    <li>Avanço da fresa: <b>Vf = fz × z × rpm</b></li><li>Macho (G84): <b>F = rpm × passo</b></li>
    <li>Rosca externa: altura ≈ <b>0,6134 × passo</b></li></ul></div>
  <div class="card"><h3>Progresso</h3><p>Salvo neste navegador. Faça backup:</p>
    <div class="actions"><button class="btn sm" id="btnExport">Exportar save</button><button class="btn sm" id="btnImport">Importar save</button>
    <button class="btn sm" id="btnTutorial">Rever o tutorial</button></div></div>`;
  $('#btnExport').onclick=()=>{ const b=new Blob([JSON.stringify(S)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='cnc-codigo-save.json'; a.click(); };
  $('#btnImport').onclick=()=>{ const i=document.createElement('input'); i.type='file'; i.accept='.json,application/json';
    i.onchange=()=>{ const f=i.files[0]; if(!f) return; f.text().then(t=>{ try{ const o=JSON.parse(t); if(!o||typeof o!=='object'||Array.isArray(o)||!('xp' in o||'stars' in o)) throw 0; localStorage.setItem(KEY, JSON.stringify(o)); S=load(); LEVELS=levelsFor(S.machine); hud(); $('#logoMark').classList.toggle('dev-on',S.dev); toast('Save importado.'); }catch(e){ toast('Arquivo inválido.'); } }); };
    i.click(); };
  $('#btnTutorial').onclick=()=>{ S.tutorial=false; save(); startLevel(LEVELS[0]); };   // fase 1 da trilha atual (torno ou fresa)
}

/* =========================================================================
   SIMULADOR LIVRE
   ========================================================================= */
const BENCH_EX = {
torno:`O7044 (PECA DO INSTRUTOR)
N10 G21 G40 G54 G90 G95
N20 G92 S4000
N30 M5
N40 M9
N50 G28 U0.
N60 G28 W0.
N70 T0202 (DESBASTE)
N80 G96 S200
N90 G92 S2500 M3
N100 G0 Z3. M8
N110 X54.
N120 G72 W1. R1.
N130 G72 P140 Q160 U0. W0. F0.3
N140 G0 Z0.
N150 G1 X-1.6 F0.1
N160 G1 Z1.
N175 G0 X54. Z3.
N180 G71 U1. R1.
N190 G71 P200 Q280 U0.5 W0.05 F0.3
N200 G0 X14. Z1.
N210 G1 X20. Z-2. F0.1
N220 G1 Z-15.
N230 G1 X30. Z-35.
N240 G2 X40. Z-40. R5.
N250 G1 X45.
N260 G3 X50. Z-42.5 R2.5
N270 G1 Z-53.
N280 G1 X54.
N300 M5
N310 M9
N320 G28 U0.
N330 G28 W0.
N340 T0404 (ACABAMENTO)
N350 G96 S300
N360 G92 S3500 M3
N370 G0 Z3. M8
N380 X54.
N390 G42
N400 G70 P200 Q280
N410 G40
N415 G0 X60.
N420 M5
N430 M9
N440 G28 U0.
N450 G28 W0.
N460 M30`,
fresa:`O0017 (PLACA)
N10 G17 G21 G40 G54 G80 G90
N20 G0 G53 Z-110. H00 M5
N30 T01 M6
N40 G54
N50 S1500 M3
N60 G0 X-15. Y-15.
N70 G43 H01 Z10.
N80 G0 Z5. M8
N90 G1 Z-5. F800
N100 G42 D01 G1 X0 Y0 F400
N110 G1 X30. Y0
N120 G2 X60. Y0 R15.
N130 G1 X140. Y0
N140 G3 X150. Y10. R10.
N150 G1 X150. Y100.
N160 G2 X130. Y120. R20.
N170 G1 X15. Y120.
N180 G3 X0 Y105. R15.
N190 G1 X0 Y0
N200 G40 G1 X-15. Y-15.
N210 G0 Z10. M9
N220 G0 G53 Z-110. H00 M5
N230 T02 M6 (BROCA D10)
N240 G54
N250 S1200 M3
N260 G0 X40. Y60. M8
N270 G43 H02 Z10.
N280 G81 X40. Y60. Z-20. R3. F120
N290 X110. Y60.
N300 G80
N310 G0 Z10. M9
N320 G0 G53 Z-110. H00 M5
N330 M30`
};
const BENCH_STOCK={torno:{stock:[52,70], face:1}, fresa:{stock:[0,0,150,120], thick:20}};
function benchState(){
  if(!S.bench || !S.bench.tools || Array.isArray(S.bench.stock.torno)) S.bench={machine:(S.bench&&S.bench.machine)||'torno', code:(S.bench&&S.bench.code)||BENCH_EX.torno,
    stock:JSON.parse(JSON.stringify(BENCH_STOCK)), tools:{torno:fullTurret('torno',inferTools(BENCH_EX.torno.split(/\r?\n/).map(t=>({text:t})),'torno')),
    fresa:fullTurret('fresa',inferTools(BENCH_EX.fresa.split(/\r?\n/).map(t=>({text:t})),'fresa'))}};
  return S.bench;
}
function benchPart(){ const b=benchState(); return JSON.parse(JSON.stringify(b.stock[b.machine])); }
function openBench(){
  const b=benchState();
  $('#benchMachine').value=b.machine; $('#benchCode').value=b.code;
  SIM.rowText = r => (benchLinesArr[r]||{}).text||'';
  SIM.rowN = r => { const t=(benchLinesArr[r]||{}).text||''; return (t.match(/^\s*(N\d+)/i)||['','linha '+(r+1)])[1].toUpperCase(); };
  SIM.rowEl = r => $(`.bl[data-r="${r}"]`);
  SIM.focus=-1;
  benchRun();
}
let benchLinesArr=[];
function benchRun(){
  const b=benchState(); b.code=$('#benchCode').value; save();
  const m=b.machine;
  benchLinesArr=b.code.split('\n').map((t,i)=>({row:i, text:t, n:null}));
  runSim({lines:benchLinesArr, machine:m, part:benchPart(), tools:b.tools[m], sim:true});
  const errs={}; (SIM.res?SIM.res.errs:[]).forEach(e=>errs[e.row]=e.msg);
  $('#benchLines').innerHTML=benchLinesArr.map((l,i)=>{
    if(!l.text.trim()) return '';
    const p=CNC.parse(l.text);
    let why, err=errs[i]||p.err;
    if(!err){
      const g=CNC.group(p.words);
      const bad=[...g.G.filter(G=>!gInfo(G,m)).map(G=>'G'+G), ...g.M.filter(M=>!mInfo(M,m)).map(M=>'M'+M)];
      if(bad.length) err=`${bad.join(', ')} não existe ${m==='torno'?'no torno Fanuc':'no centro de usinagem Fanuc'} deste simulador.`;
    }
    why = err || CNC.explainBlock(l.text,m).join(' · ');
    return `<div class="bl ${err?'err':''}" data-r="${i}"><span class="ln">${i+1}</span><div><div class="src">${esc(l.text)}</div><div class="why">${why}</div></div></div>`;
  }).join('');
  $$('.bl').forEach(d=>d.onclick=()=>{ const r=+d.dataset.r; SIM.focus=r; fanucHud(r,null,null); draw2d(); $$('.bl.cur').forEach(x=>x.classList.remove('cur')); d.classList.add('cur'); });
  showAlarms(SIM.alarms||[]);
}
$('#benchRun').onclick=benchRun;
$('#benchClear').onclick=()=>{ $('#benchCode').value=''; benchRun(); $('#benchCode').focus(); };
$('#benchExample').onclick=()=>{ const b=benchState(); $('#benchCode').value=BENCH_EX[b.machine]; benchRun(); };
$('#benchMachine').onchange=()=>{ const b=benchState(); b.machine=$('#benchMachine').value;
  if(!$('#benchCode').value.trim() || Object.values(BENCH_EX).includes($('#benchCode').value)) $('#benchCode').value=BENCH_EX[b.machine];
  benchRun(); };
$('#benchCode').addEventListener('input',()=>{ clearTimeout(benchRun._t); benchRun._t=setTimeout(benchRun,700); });

/* =========================================================================
   TUTORIAL
   ========================================================================= */
/* textos que mudam com a trilha (o tutorial roda na fase 1 do torno OU da fresa) */
const TUTM = () => P && P.lv.machine==='fresa'
  ? {fresa:true, code:'G94', row1:'Esta (N10) é o <b>bloco de segurança</b> — a coluna do meio diz o que cada código faz.',
     ask:'<i>avanço em milímetros por minuto</i>. O código é <b>G94</b> (na fresa o F é em mm/min).', rest:'', end:'para ver a ferramenta se mover!'}
  : {fresa:false, code:'M3', row1:'Esta (G97 S500) deixa a rotação em 500 rpm.',
     ask:'<i>ligue o fuso no sentido horário</i>. O código é <b>M3</b> (M de "miscelânea", 3 = horário).', rest:' (M5, M4, M5)', end:'para ver o fuso girar!'};
const TUT=[
 {sel:'#simPanel .mview', txt:()=>'Este é o <b>simulador</b>, montado igual ao <b>SSCNC</b> da escola (Fanuc 0i): aqui a máquina e a peça em <b>3D</b> — ela é usinada de verdade pelo seu código. Em <b>Peça bruta</b> você muda as dimensões do material; em <b>Ferramentas</b> monta a '+(TUTM().fresa?'magazine (fresa de topo, broca, macho, escareador…).':'torre (desbaste, acabamento, bedame, broca, rosca…).')},
 {sel:'#simPanel .ss-unit', txt:'A <b>tela do comando</b>, com as <b>softkeys</b> embaixo dela. As teclas <b>POS</b>, <b>PROG</b>, <b>OFFSET/SETTING</b> e <b>MESSAGE</b> (no teclado MDI) trocam a página: posição dos eixos, programa rodando, <b>corretores e zero-peça</b> e alarmes. Tudo que você digita no teclado aparece na linha <b>&gt;</b> (o buffer) antes de apertar INPUT, INSERT ou ALTER.'},
 {sel:'#kbd', txt:'O <b>teclado MDI</b>: letras e números (SHIFT troca para a letra pequena de cada tecla), <b>EOB</b> = fim de bloco, <b>CAN</b> apaga, <b>INPUT</b> grava valores nos corretores, <b>ALTER / INSERT / DELETE</b> editam o programa no modo EDIT (ou o bloco no MDI), as setas movem o cursor.'},
 {sel:'#opPanel', txt:()=>'O <b>painel de operação</b> é o do torno Romi G260 do SSCNC. Sequência: <b>1)</b> <b>CNC ON</b>, solte a emergência, feche a porta, <b>MACHINE ON</b>, <b>RESET</b>; <b>2)</b> <b>HOME</b> e, para cada eixo ('+(TUTM().fresa?'<b>+X</b>, <b>+Y</b>, <b>+Z</b>':'<b>+X</b> e <b>+Z</b>')+'), escolha o eixo e aperte <b>CYCLE START</b>; <b>3)</b> meça ferramentas e zero-peça em <b>OFS/SET → CORRET → GEOM / TRAB</b> usando <b>JOG</b> e <b>MPG</b> (o botão <b>HELP</b> do teclado mostra o passo a passo completo; ou use o atalho <b>Ferramentas → Preparar máquina</b>); <b>4)</b> <b>AUTO</b> e <b>CYCLE START</b>. No <b>MDI</b> você digita um bloco solto (ex.: T0101).'},
 {sel:'#progTable', txt:'Aqui está o <b>programa</b>. Cada linha é um <b>bloco</b>. Linhas cinza já vêm prontas; nas que têm campo, <b>você escreve o código</b>. A coluna do meio diz o que o bloco tem que fazer.'},
 {sel:'#progTable tr[data-r="1"]', txt:()=>'Clique numa linha e a tela do comando mostra como a máquina fica <b>depois</b> daquele bloco. '+TUTM().row1},
 {sel:'#progTable tr[data-r="2"]', gate:true, check:()=>{
    const v=valOf(2), i=rowInfo(2);
    if(i.ok){ $(`#progTable input[data-r="2"]`).classList.add('ok'); return {ok:true}; }
    return {ok:false, msg: v.trim()?diag(i).msg:`Digite <b>${TUTM().code}</b> no campo desta linha.`}; },
  txt:()=>`Sua vez! O bloco <b>N20</b> pede: ${TUTM().ask} Digite <b>${TUTM().code}</b> no campo e clique em <b>Conferir</b>.`},
 {sel:'#btnHint', txt:'Empacou? A <b>Dica</b> lê o que você digitou e diz o que está errado — o 1º nível é grátis. Depois de 3 tentativas, <b>Explicar</b> mostra bloco a bloco.'},
 {sel:'#btnAula', txt:'A <b>Aula</b> da fase fica aqui, e a <b>Cola</b> lista todos os códigos que você já aprendeu. O <b>Manual</b> (lá em cima) tem tudo do livro.'},
 {sel:'#btnCheck', txt:()=>`Complete os blocos que faltam${TUTM().rest} e clique em <b>Verificar</b>. Depois referencie a máquina e rode com <b>CYCLE START</b> ${TUTM().end}`}
];
let tstep=0, tutTarget=null, tutFails=0;
function startTutorial(){
  if(!$('#screen-play').classList.contains('active')) return;
  tstep=0; tutFails=0; $('#tutor').classList.add('on');
  addEventListener('scroll',tutReflow,true); addEventListener('resize',tutReflow); tutShow();
}
function tutReflow(){ requestAnimationFrame(()=>tutPlace(tutTarget)); }
function tutShow(){
  const s=TUT[tstep], el=$(s.sel); if(!el){ endTutorial(); return; }
  setView('#screen-play', el.closest('#simPanel')?'sim':'prog');
  tutTarget=el; tutFails=0;
  $('#tutStep').textContent=`PASSO ${tstep+1}/${TUT.length}`; $('#tutText').innerHTML=typeof s.txt==='function'?s.txt():s.txt; $('#tutErr').textContent='';
  $('#tutGive').style.display='none'; $('#tutBack').disabled=tstep===0;
  $('#tutNext').textContent=s.gate?'Conferir':(tstep===TUT.length-1?'Começar':'Próximo ›');
  $('#tutor').classList.toggle('interactive',!!s.gate);
  const r=el.getBoundingClientRect(); if(r.top<80||r.bottom>innerHeight-40) el.scrollIntoView({block:'center'});
  if(s.gate){ const inp=el.querySelector('input'); if(inp) setTimeout(()=>inp.focus({preventScroll:true}),60); }
  requestAnimationFrame(()=>requestAnimationFrame(()=>tutPlace(el)));
  beep(520,.05);
}
function tutPlace(el){
  if(!el||!$('#tutor').classList.contains('on')) return;
  const pad=8, r=el.getBoundingClientRect(), sp=$('#tutSpot'), b=$('#tutBubble');
  Object.assign(sp.style,{left:(r.left-pad)+'px',top:(r.top-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px'});
  const bb=b.getBoundingClientRect(); let bx=r.left+r.width/2-bb.width/2, by=r.bottom+16;
  if(by+bb.height>innerHeight-10) by=r.top-bb.height-16;
  b.style.left=Math.max(10,Math.min(bx,innerWidth-bb.width-10))+'px'; b.style.top=Math.max(10,Math.min(by,innerHeight-bb.height-10))+'px';
}
$('#tutNext').onclick=()=>{
  const s=TUT[tstep];
  if(s.gate){ const res=s.check(); if(!res.ok){ tutFails++; sndErr(); $('#tutErr').innerHTML=res.msg;
      const b=$('#tutBubble'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      if(tutFails>=2) $('#tutGive').style.display=''; tutPlace(tutTarget); return; }
    sndOk(); rerun(); }
  tstep++; tstep>=TUT.length?endTutorial():tutShow();
};
$('#tutGive').onclick=()=>{ const el=$('#progTable input[data-r="2"]'); if(el){ el.value=TUTM().code; el.classList.add('ok'); } $('#tutErr').textContent=''; $('#tutGive').style.display='none'; };
$('#tutBack').onclick=()=>{ if(tstep>0){ tstep--; tutShow(); } };
$('#tutSkip').onclick=()=>{ endTutorial(); toast('Sem problema — o Manual tem "Rever o tutorial".',3500); };
function endTutorial(){ $('#tutor').classList.remove('on','interactive'); removeEventListener('scroll',tutReflow,true); removeEventListener('resize',tutReflow); tutTarget=null; S.tutorial=true; save(); }

/* =========================================================================
   CONFETE
   ========================================================================= */
const fx=$('#fx'), fctx=fx.getContext('2d'); let fxRAF=0;
function confetti(){
  cancelAnimationFrame(fxRAF);
  const d=window.devicePixelRatio||1; fx.width=innerWidth*d; fx.height=innerHeight*d; fctx.setTransform(d,0,0,d,0,0);
  const cols=['#ffb020','#43d0ff','#31d07a','#ff5d5d','#ffffff'];
  const ps=[...Array(140)].map(()=>({x:innerWidth/2+(Math.random()-.5)*260,y:innerHeight/2,vx:(Math.random()-.5)*11,vy:-Math.random()*13-4,
    s:4+Math.random()*7,c:cols[(Math.random()*cols.length)|0],r:Math.random()*7,vr:(Math.random()-.5)*.4,a:1}));
  let f=0;(function loop(){ fctx.clearRect(0,0,innerWidth,innerHeight);
    ps.forEach(p=>{ p.vy+=.32;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;p.a-=.008; fctx.save(); fctx.globalAlpha=Math.max(0,p.a); fctx.translate(p.x,p.y); fctx.rotate(p.r); fctx.fillStyle=p.c; fctx.fillRect(-p.s/2,-p.s/2,p.s,p.s*.6); fctx.restore(); });
    if(++f<170) fxRAF=requestAnimationFrame(loop); else { fctx.clearRect(0,0,innerWidth,innerHeight); fx.width=fx.height=0; } })();
}
