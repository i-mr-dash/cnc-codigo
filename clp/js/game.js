/* =========================================================================
   CLP LADDER — interface do jogo: progressão (igual ao CNC Código), editor,
   verificação por testes automáticos, dicas, loja, manual, bancada e tutorial.
   ========================================================================= */
'use strict';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'clpladder_v1';
const REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- progressão ---------------- */
const RANKS = [
  [0,'Aprendiz de Automação'], [150,'Eletricista Júnior'], [450,'Técnico de Manutenção'],
  [900,'Programador de CLP'], [1500,'Integrador Sênior'], [2200,'Mestre do Ladder']
];
const UNLOCKS = [
  {lvl:2,  id:'shop',        name:'Oficina / Loja',  desc:'Agora você pode gastar moedas.'},
  {lvl:3,  id:'th_blueprint',name:'Tema Blueprint',  desc:'Visual de prancheta azul. Troque na Loja.'},
  {lvl:4,  id:'bench',       name:'Bancada livre',   desc:'Monte qualquer ladder do zero e teste no CLP, com 8 entradas e 8 saídas.'},
  {lvl:6,  id:'reveal',      name:'Revelar célula',  desc:'Compre a resposta de UMA célula por 40 🪙 — a fase passa a valer no máximo 2 ★.'},
  {lvl:10, id:'th_neon',     name:'Tema Neon',       desc:'Oficina cyberpunk. Troque na Loja.'},
  {lvl:'boss', id:'endless', name:'Modo Infinito',   desc:'Lógicas aleatórias (tabela-verdade) para sempre.'}
];
const SHOP = [
  {id:'pack',    name:'Pacote de 3 dicas', price:40,  repeat:true, desc:'Mais três fichas 💡 para usar em qualquer fase.'},
  {id:'safety',  name:'Seguro do Novato',  price:200, desc:'A primeira tentativa errada de cada fase não conta para as estrelas.'},
  {id:'monitor', name:'Osciloscópio',      price:120, desc:'Quando um teste falha, mostra passo a passo como estavam as entradas e as saídas.'}
];
const THEMES = [
  {t:'steel',    name:'Oficina (padrão)', price:0,   desc:'Visual escuro de chão de fábrica.'},
  {t:'blueprint',name:'Blueprint',        price:180, unlock:'th_blueprint', desc:'Prancheta azul. Grátis ao completar a fase 3.'},
  {t:'paper',    name:'Impressão',        price:80,  desc:'Fundo claro, cara de folha de projeto.'},
  {t:'neon',     name:'Neon',             price:250, unlock:'th_neon', desc:'Oficina cyberpunk. Grátis na fase 10.'},
  {t:'brasa',    name:'Brasa',            price:150, desc:'Preto e vermelho.'},
  {t:'forja',    name:'Forja',            price:150, desc:'Preto e dourado.'}
];
const REVEAL_COST = 40;
const LEVELS = LEVELS_CLP;
const skey = lv => 'clp_'+lv.id;
const MAXST = LEVELS.length*3, BOSSST = Math.round(MAXST*0.5);

/* ---------------- estado ---------------- */
const DEF = {xp:0, coins:0, hints:3, stars:{}, best:{}, unlocked:[], owned:[], theme:'steel', tutorial:false,
  aula:{}, endlessRun:0, streak:0, bestStreak:0, dev:false, bench:null};
let S = load();
function load(){
  let raw={}; try{ raw=JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ raw={}; }
  const s={...DEF, ...raw};
  const num=(v,d)=> typeof v==='number'&&isFinite(v)?Math.max(0,Math.floor(v)):d;
  s.xp=num(s.xp,0); s.coins=num(s.coins,0); s.hints=num(s.hints,3);
  ['stars','best','aula'].forEach(k=>{ if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k])) s[k]={}; });
  ['unlocked','owned'].forEach(k=>{ if(!Array.isArray(s[k])) s[k]=[]; });
  return s;
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

let P=null, timer=null;
const HINT_TIER={};
const totalStars = () => Object.values(S.stars).reduce((a,b)=>a+(+b||0),0);
const rankOf = xp => RANKS.filter(r=>xp>=r[0]).pop();
const nextRank = xp => RANKS.find(r=>xp<r[0]);
const has = id => S.dev || S.unlocked.includes(id) || S.owned.includes(id);
const done = k => (S.stars[k]||0) > 0;
const mmss = s => String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
function toast(msg, ms=2600){ const t=$('#toast'); t.innerHTML=msg; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),ms); }
window.toast=toast;
function countUp(el,from,to,ms=900){
  if(REDUCED||from===to){ el.textContent=to; return; }
  const t0=performance.now(); (function f(t){ const k=Math.min(1,(t-t0)/ms); el.textContent=Math.round(from+(to-from)*(1-Math.pow(1-k,3))); if(k<1) requestAnimationFrame(f); })(t0);
}
let AC=null;
function unlockAudio(){ try{ if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); }catch(e){} }
addEventListener('pointerdown',unlockAudio,{once:true});
function beep(freq=660, dur=.09, type='sine', vol=.06){
  if(!AC) return; try{ const o=AC.createOscillator(), g=AC.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=vol;
    o.connect(g); g.connect(AC.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+dur); o.stop(AC.currentTime+dur); }catch(e){}
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
  document.body.dataset.theme=S.theme;
}

/* ---------------- navegação ---------------- */
function closeAllModals(){ document.body.style.overflow=''; setInert(false); $('#overlay').classList.remove('on'); $$('.modal').forEach(m=>m.classList.remove('on')); }
let screen='map';
function show(id){
  closeAllModals(); closePicker();
  if(id!=='play' && P && !P.won && !P.pausedAt) P.pausedAt=Date.now();
  $$('.screen').forEach(s=>{ s.classList.remove('active'); s.setAttribute('aria-hidden','true'); });
  const sc=$('#screen-'+id); sc.classList.add('active'); sc.setAttribute('aria-hidden','false'); screen=id;
  if(id!=='play'){ clearInterval(timer); timer=null; }
  if(id==='map') renderMap();
  if(id==='shop') renderShop();
  if(id==='help') renderHelp();
  if(id==='bench') openBench();
  window.scrollTo({top:0,behavior:'auto'});
  const h1=sc.querySelector('h1'); if(h1){ h1.tabIndex=-1; h1.focus({preventScroll:true}); }
}
$('#navMap').onclick=()=>show('map');
$('#navBench').onclick=()=>{ if(!has('bench')){ toast('A Bancada livre abre ao completar a fase 4.'); return; } show('bench'); };
$('#navShop').onclick=()=>{ if(!has('shop')){ toast('A Loja abre ao completar a fase 2.'); return; } show('shop'); };
$('#navHelp').onclick=()=>show('help');
$('#btnBack').onclick=()=>show('map');
function setView(scr, v){
  const sc=typeof scr==='string'?$(scr):scr, g=sc&&sc.querySelector('.play-grid'); if(!g||g.dataset.view===v) return;
  g.dataset.view=v; closePicker();
  sc.querySelectorAll('.vt').forEach(b=>{ const on=b.dataset.view===v; b.classList.toggle('on',on); b.setAttribute('aria-selected',on?'true':'false'); });
}
$$('.viewtabs .vt').forEach(b=>b.addEventListener('click',()=>setView(b.closest('.screen'), b.dataset.view)));

(function(){                                   // modo desenvolvedor: 7 cliques no logo
  let clicks=[];
  $('#logoMark').addEventListener('click',()=>{
    const now=Date.now(); clicks=clicks.filter(t=>now-t<3000); clicks.push(now);
    if(clicks.length>=7){ clicks=[]; S.dev=!S.dev; save(); toast(S.dev?'Modo desenvolvedor: tudo liberado.':'Modo desenvolvedor desligado.',3000);
      if(screen==='map') renderMap(); }
  });
})();

/* ---------------- mapa ---------------- */
function isUnlocked(lv){
  if(S.dev) return true;
  const i=LEVELS.indexOf(lv);
  if(i<=0) return true;
  if(S.stars[skey(lv)]) return true;
  if(!done(skey(LEVELS[i-1]))) return false;
  if(lv.boss) return totalStarsTrack()>=BOSSST;
  return true;
}
const totalStarsTrack = () => LEVELS.reduce((a,l)=>a+(S.stars[skey(l)]||0),0);
function nodeEl(html, cls, act, label){
  const d=document.createElement('div'); d.className='node '+cls; d.tabIndex=0; d.setAttribute('role','button');
  if(label) d.setAttribute('aria-label',label);
  d.innerHTML=html; d.onclick=act;
  d.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); act(); } });
  return d;
}
const LOCK_IC='<svg class="ic" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';
function renderMap(){
  const t=$('#mapTrack'); t.innerHTML='';
  const ts=totalStarsTrack();
  const feitas=LEVELS.filter(l=>done(skey(l))).length;
  $('#mapStats').innerHTML=`<b>${ts} / ${MAXST} ★</b> · ${feitas} de ${LEVELS.length} fases`;
  const bossLv=LEVELS.find(l=>l.boss && !isUnlocked(l));
  if(bossLv){
    const f=Math.max(0,BOSSST-ts);
    $('#mapStats').insertAdjacentHTML('beforeend',`<span class="goal"><i style="width:${Math.min(100,ts/BOSSST*100)}%"></i></span>
      <span class="goal-txt">${f>0?`Faltam <b>${f} ★</b> para o CHEFE`:'Estrelas suficientes — complete as fases anteriores para liberar o CHEFE'}</span>`);
  }
  if(P && !P.won)
    t.appendChild(nodeEl(`<div class="num">EM ANDAMENTO</div><div class="nm">Retomar</div><div class="sb">${esc(P.lv.endless?P.lv.name:'Fase '+P.lv.id+' — '+P.lv.name)}</div><div class="st">▶</div><i class="lampn" aria-hidden="true"></i>`,'cur resume',resumeLevel));
  let curMarked=false;
  LEVELS.forEach((lv,i)=>{
    const st=S.stars[skey(lv)]||0, open=isUnlocked(lv), b=S.best[skey(lv)];
    const cur=open&&st===0&&!curMarked; if(cur) curMarked=true;
    const d=nodeEl(`<div class="num">FASE <b>${String(lv.id).padStart(2,'0')}</b></div><div class="nm">${esc(lv.name)}</div>
      <div class="sb">${esc(lv.sub)}</div><div class="st" aria-hidden="true">${[1,2,3].map(k=>k<=st?'<b>★</b>':'☆').join('')}</div>
      ${b?`<div class="rec">recorde ${mmss(b)}</div>`:''}${lv.boss?'<div class="badge">CHEFE</div>':''}
      ${lv.boss&&!open?`<div class="gate">Requer ${BOSSST} ★ — você tem ${ts}</div>`:''}${open?'<i class="lampn" aria-hidden="true"></i>':`<div class="lock" aria-hidden="true">${LOCK_IC}</div>`}`,
      (open?'':'locked')+(lv.boss?' boss':'')+(cur?' cur':'')+(st===3?' perfect':st>0?' done':''),
      open?()=>startLevel(lv):()=>toast(lv.boss?`O CHEFE exige ${BOSSST} ★ e as fases anteriores completas.`:'Complete a fase anterior primeiro.',3500),
      `Fase ${lv.id}: ${lv.name}. ${st} de 3 estrelas.${open?'':' Bloqueada.'}`);
    d.style.setProperty('--i',i);
    t.appendChild(d);
  });
  if(has('endless'))
    t.appendChild(nodeEl(`<div class="num">EXTRA</div><div class="nm">Modo Infinito</div><div class="sb">Lógicas aleatórias pela tabela-verdade. Rodada ${S.endlessRun+1}.</div>
      <div class="st">∞</div><div class="rec">sequência ${S.streak} · recorde ${S.bestStreak}</div><div class="badge">∞</div><i class="lampn" aria-hidden="true"></i>`,'boss endless',()=>startLevel(makeEndlessLevel(S.endlessRun+1))));
  const prox=UNLOCKS.find(u=>!has(u.id));
  $('#unlockStrip').innerHTML=UNLOCKS.map(u=>`<span class="uchip ${has(u.id)?'on':(u===prox?'next':'')}"><i class="uc-mk" aria-hidden="true">${has(u.id)?'✓':(u===prox?'▶':LOCK_IC)}</i> ${u.name} <small>${u.lvl==='boss'?'chefe':'fase '+u.lvl}</small></span>`).join('');
}

/* =========================================================================
   EDITOR DE LADDER (fase e bancada usam o mesmo)
   ========================================================================= */
function namesOf(lv){
  const n={...(lv.names||{})}; (lv.io||[]).forEach(d=>n[d.a]=d.n); return n;
}
function addrsOf(lv){
  const set=new Set((lv.io||[]).map(d=>d.a));
  (lv.prog||[]).forEach(def=>def.rows.forEach(row=>row.forEach(s=>{ const it=LD.parseItem(String(s||'').replace(/^\?/,'')); if(it&&it.a) set.add(it.a); })));
  Object.keys(lv.names||{}).forEach(a=>set.add(a));
  const ord=a=>({I:0,Q:1,M:2,T:3,C:4}[a[0]]??5);
  return [...set].sort((a,b)=>ord(a)-ord(b)||a.localeCompare(b,'en',{numeric:true}));
}
// E = editor ativo: {prog, lv, box, names, addrs, types, onChange, focus}
let E=null;
function drawEditor(ed, live=true){
  if(!ed) return;
  const st=ed.state, bad=ed.bad||new Set();
  ed.box.innerHTML=ed.prog.map((g,i)=>`<div class="rung" data-rung="${i}">
      <div class="rung-h"><span class="rung-n">Linha ${i+1}</span>${g.title?`<span class="rung-t">${esc(g.title)}</span>`:''}${ed.bench?`<span class="rung-tools">
        <button class="mini" data-act="addrow" data-i="${i}" title="Mais um ramo embaixo">+ ramo</button><button class="mini" data-act="delrow" data-i="${i}" title="Tira o último ramo">− ramo</button>
        <button class="mini" data-act="del" data-i="${i}" title="Apagar a linha">Apagar</button></span>`:''}</div>
      <div class="rung-svg">${LD.render(g,{edit:true, live:live&&Plant.run, names:ed.names, state:st, focus:ed.focus&&ed.focus.i===i?ed.focus.k:null, bad:new Set([...bad].filter(k=>k.startsWith(i+':')).map(k=>k.slice(k.indexOf(':')+1)))})}</div></div>`).join('');
}
function editorClick(e){
  if(!E) return;
  const lk=e.target.closest('[data-link]'), cl=e.target.closest('[data-cell]'), act=e.target.closest('[data-act]');
  const rg=e.target.closest('[data-rung]'); if(!rg) return;
  const i=+rg.dataset.rung, g=E.prog[i];
  if(act){ benchAct(act.dataset.act, +act.dataset.i); return; }
  if(lk){ const k=lk.dataset.link; g.links.has(k)?g.links.delete(k):g.links.add(k); beep(520,.04); E.onChange(); return; }
  if(cl){ openPicker(i, cl.dataset.cell, cl); }
}
function editorKey(e){
  if((e.key==='Enter'||e.key===' ') && e.target.closest('[data-cell]')){ e.preventDefault(); editorClick(e); }
}
['#ladderBox','#benchBox'].forEach(s=>{ $(s).addEventListener('click',editorClick); $(s).addEventListener('keydown',editorKey); });

/* ---------------- seletor ---------------- */
let PK=null;
const TYPE_SHORT={W:'Fio',NO:'NA',NC:'NF',P:'Borda ↑',N:'Borda ↓',OUT:'Bobina',S:'SET',R:'RESET',TON:'TON',TOF:'TOF',CTU:'CTU'};
function openPicker(i, key, anchor){
  const [r,c]=key.split(','), g=E.prog[i], isOut=c==='o';
  PK={i, r:+r, c:isOut?'o':+c, g};
  E.focus={i,k:key};
  const allowed=E.types;
  const types=(isOut?['OUT','S','R','TON','TOF','CTU']:['W','NO','NC','P','N']).filter(t=>t==='W'||allowed.includes(t));
  const cur=LD.getCell(g,PK.r,PK.c);
  $('#pkTitle').textContent=isOut?`Linha ${i+1} — saída do ramo ${+r+1}`:`Linha ${i+1} — ramo ${+r+1}, posição ${+c+1}`;
  $('#pkTypes').innerHTML=`<button class="pk-t${!cur?' on':''}" data-t="">${'<svg viewBox="0 0 60 30"><path d="M18 15h24" stroke-dasharray="3 4"/></svg>'}<span>Vazio</span></button>`+
    types.map(t=>`<button class="pk-t${cur&&cur.t===t?' on':''}" data-t="${t}">${SYM[t]||''}<span>${TYPE_SHORT[t]}</span></button>`).join('');
  fillAdrs();
  const pk=$('#picker'); pk.hidden=false;
  const rc=anchor.getBoundingClientRect(), pw=Math.min(360,innerWidth-16);
  pk.style.width=pw+'px';
  const ph=pk.offsetHeight;
  let x=rc.left+rc.width/2-pw/2, y=rc.bottom+8;
  if(y+ph>innerHeight-8) y=Math.max(8,rc.top-ph-8);
  // no tutorial o balão fica embaixo da célula: abre o seletor ao lado
  if($('#tutor').classList.contains('on')){ x=rc.right+12>innerWidth-pw-8?rc.left-pw-12:rc.right+12; y=Math.max(8,Math.min(rc.top-20,innerHeight-ph-8)); }
  pk.style.left=Math.max(8,Math.min(x,innerWidth-pw-8))+'px'; pk.style.top=y+'px';
  E.onChange(true);
  const f=pk.querySelector('.pk-t.on')||pk.querySelector('.pk-t'); f&&f.focus({preventScroll:true});
}
function fillAdrs(){
  const cur=LD.getCell(PK.g,PK.r,PK.c), t=cur&&cur.t;
  const showA=cur&&t!=='W';
  $('#pkAdrLbl').hidden=!showA; $('#pkAdrs').hidden=!showA;
  if(showA){
    const okA=a=>{ if(['NO','NC','P','N'].includes(t)) return true; if(t==='OUT'||t==='S') return /^[QM]/.test(a); if(t==='R') return /^[QMTC]/.test(a);
      if(t==='TON'||t==='TOF') return /^T/.test(a); if(t==='CTU') return /^C/.test(a); return true; };
    const list=E.addrs.filter(okA);
    $('#pkAdrs').innerHTML=list.map(a=>`<button class="pk-a${cur.a===a?' on':''}" data-a="${a}"><b>${a}</b><small>${esc(E.names[a]||'')}</small></button>`).join('')||'<small>Nenhum endereço disponível.</small>';
  }
  const par=cur&&['TON','TOF','CTU'].includes(t);
  $('#pkPar').hidden=!par;
  if(par){ $('#pkParLbl').textContent=t==='CTU'?'PV (contagem)':'PT (segundos)'; $('#pkParIn').step=t==='CTU'?1:0.5; $('#pkParIn').value=cur.v??(t==='CTU'?5:5); }
}
$('#pkTypes').addEventListener('click',e=>{
  const b=e.target.closest('[data-t]'); if(!b||!PK) return;
  const t=b.dataset.t, cur=LD.getCell(PK.g,PK.r,PK.c);
  let nv=null;
  if(t==='W') nv={t:'W'};
  else if(t){ nv={t, a:cur&&cur.a?cur.a:''};
    if(['TON','TOF'].includes(t)){ nv.v=cur&&cur.v!=null&&['TON','TOF'].includes(cur.t)?cur.v:5; if(!/^T/.test(nv.a)) nv.a=E.addrs.find(a=>/^T/.test(a))||'T1'; }
    else if(t==='CTU'){ nv.v=cur&&cur.t==='CTU'?cur.v:5; if(!/^C/.test(nv.a)) nv.a=E.addrs.find(a=>/^C/.test(a))||'C1'; }
    else if((t==='OUT'||t==='S')&&!/^[QM]/.test(nv.a)) nv.a='';
  }
  LD.setCell(PK.g,PK.r,PK.c,nv);
  $$('#pkTypes .pk-t').forEach(x=>x.classList.toggle('on',x===b));
  fillAdrs(); beep(600,.03); E.onChange(true);
  if(nv && nv.t!=='W' && !nv.a) { const f=$('#pkAdrs .pk-a'); f&&f.focus({preventScroll:true}); }
  if(!nv||nv.t==='W') setTimeout(closePicker,120);
});
$('#pkAdrs').addEventListener('click',e=>{
  const b=e.target.closest('[data-a]'); if(!b||!PK) return;
  const cur=LD.getCell(PK.g,PK.r,PK.c); if(!cur) return;
  cur.a=b.dataset.a; beep(700,.03); E.onChange(true);
  if(!['TON','TOF','CTU'].includes(cur.t)) closePicker(); else fillAdrs();
});
$('#pkParIn').addEventListener('input',()=>{ if(!PK) return; const cur=LD.getCell(PK.g,PK.r,PK.c); if(cur){ cur.v=Math.max(0,+$('#pkParIn').value||0); E.onChange(true); } });
$('#pkClose').onclick=()=>closePicker();
function closePicker(){ if($('#picker').hidden) return; $('#picker').hidden=true; PK=null; if(E){ E.focus=null; E.onChange(true); } }
addEventListener('pointerdown',e=>{ if(!$('#picker').hidden && !e.target.closest('#picker') && !e.target.closest('[data-cell]')) closePicker(); },true);
addEventListener('keydown',e=>{ if(e.key==='Escape' && !$('#picker').hidden){ e.stopPropagation(); closePicker(); } },true);

/* =========================================================================
   FASE
   ========================================================================= */
function restImage(lv){ const r={}; (lv.io||[]).forEach(d=>{ if(/^I/.test(d.a)) r[d.a]=Plant.restOf(d); }); return r; }
function typesUpTo(lv){
  if(lv.types) return lv.types;
  return ['NO','NC','OUT'];
}
function startLevel(lv){
  closeAllModals();
  P={lv, prog:lv.prog.map(d=>LD.rung(d)), tries:0, hints:0, revealed:0, assisted:false, borrowed:false, won:false, t0:Date.now(), safetyUsed:false, st:LD.newState(), bad:new Set()};
  for(const k in HINT_TIER) delete HINT_TIER[k];
  $('#lvName').textContent=lv.endless?lv.name:`Fase ${lv.id} — ${lv.name}`;
  $('#lvSub').textContent=lv.sub;
  $('#tipLine').textContent=lv.tip||'';
  $('#briefLine').innerHTML=`<b>Objetivo:</b> ${esc(lv.brief)}`;
  $('#chipTry').textContent='Tentativas: 0';
  $('#feedback').className='feedback'; $('#feedback').textContent=''; $('#hintBox').innerHTML='';
  $('#btnCheck').hidden=false; $('#btnNext').hidden=true;
  $('#btnReveal').style.display=has('reveal')?'':'none';
  $('#btnAula').style.display=lv.aula?'':'none';
  syncExplainBtn();
  $('#symTable').innerHTML=symTable(lv);
  show('play');
  Plant.mount(lv, $('#plantBox'));
  E={prog:P.prog, lv, box:$('#ladderBox'), names:namesOf(lv), addrs:addrsOf(lv), types:typesUpTo(lv), get state(){ return P&&P.st; }, get bad(){ return P&&P.bad; },
     onChange(keepBad){ if(!keepBad&&P) P.bad=new Set(); drawEditor(E); }};
  drawEditor(E);
  setView('#screen-play','prog');
  clearInterval(timer); timer=setInterval(()=>{ if(P&&!P.won&&!P.pausedAt) $('#chipTime').textContent=mmss(Math.floor((Date.now()-P.t0)/1000)); },500);
  $('#chipTime').textContent='00:00';
  if(lv.aula && !S.aula[lv.id] && !lv.endless){ S.aula[lv.id]=1; save(); openAula(lv, maybeTutorial); } else maybeTutorial();
}
function resumeLevel(){
  if(!P) return;
  if(P.pausedAt){ P.t0+=Date.now()-P.pausedAt; P.pausedAt=0; }
  show('play'); E.box=$('#ladderBox'); E.prog=P.prog; drawEditor(E);
  clearInterval(timer); timer=setInterval(()=>{ if(P&&!P.won&&!P.pausedAt) $('#chipTime').textContent=mmss(Math.floor((Date.now()-P.t0)/1000)); },500);
}
function maybeTutorial(){ if(!S.tutorial && P && P.lv.id===1 && !P.lv.endless) setTimeout(startTutorial,350); }
function symTable(lv){
  const nm=namesOf(lv), adrs=addrsOf(lv);
  const kind=a=>{ const d=(lv.io||[]).find(x=>x.a===a); if(d) return /^I/.test(a)?'Entrada':'Saída'; return {M:'Memória',T:'Temporizador',C:'Contador'}[a[0]]||''; };
  return `<table><tr><th>Endereço</th><th>Símbolo</th><th>Tipo</th></tr>${adrs.map(a=>`<tr><td><code>${a}</code></td><td>${esc(nm[a]||'—')}</td><td>${kind(a)}</td></tr>`).join('')}</table>`;
}

/* ---------------- laço do CLP (varredura em tempo real) ---------------- */
let lastT=performance.now(), drawAcc=0;
function loop(){
  const t=performance.now(), dt=Math.min(60, t-lastT); lastT=t;
  const ctx = screen==='play'&&P ? {prog:P.prog, st:P.st} : screen==='bench'&&B ? {prog:B.prog, st:B.st} : null;
  if(ctx){
    if(Plant.run){
      let rem=dt; while(rem>0){ const d=Math.min(10,rem); const im=Plant.image(); for(const a in im) ctx.st.bits[a]=!!im[a]; LD.scan(ctx.prog, ctx.st, d); rem-=d; }
    }else{
      // STOP: saídas desligadas, nada é executado
      for(const a in ctx.st.bits) if(/^Q/.test(a)) ctx.st.bits[a]=false;
      const im=Plant.image(); for(const a in im) ctx.st.bits[a]=!!im[a];
    }
    Plant.step(ctx.st, Plant.run?dt:0);
    drawAcc+=dt;
    if(drawAcc>90){ drawAcc=0; if(E && $('#picker').hidden) drawEditor(E); const led=document.querySelector('#screen-'+screen+' .vt-led'); if(led) led.classList.toggle('run',Plant.run && [...Object.keys(ctx.st.bits)].some(a=>/^Q/.test(a)&&ctx.st.bits[a])); }
  }
}
// timer fixo (não para quando a janela não está sendo desenhada, como o requestAnimationFrame)
setInterval(()=>{ try{ loop(); }catch(e){ console.error(e); } }, 16);

/* ---------------- diagnóstico das células ---------------- */
function cellsBad(){
  const out=[];
  P.prog.forEach((g,i)=>{
    const R=g.cells.length;
    for(let r=0;r<R;r++){
      for(let c=0;c<g.C;c++) if(g.ed.has(r+','+c)){ const cur=g.cells[r][c], ans=g.ans.cells[r][c]; if(!LD.same(cur,ans)) out.push({i,r,c,key:r+','+c,cur,ans}); }
      if(g.ed.has(r+',o')){ const cur=g.out[r], ans=g.ans.out[r]; if(!LD.same(cur,ans)) out.push({i,r,c:'o',key:r+',o',cur,ans}); }
    }
    if(g.edLinks){ const a=[...g.ansLinks].sort().join('|'), b=[...g.links].sort().join('|'); if(a!==b) out.push({i, link:true, cur:new Set(g.links), ans:new Set(g.ansLinks)}); }
  });
  return out;
}
const pos = b => b.link?`Linha ${b.i+1} (ligações dos ramos)`:`Linha ${b.i+1}, ${b.c==='o'?'saída do ramo '+(b.r+1):'ramo '+(b.r+1)+' posição '+(b.c+1)}`;
function diagMsg(b){
  const nm=E.names, an=a=>a?`<b>${a}</b>${nm[a]?' ('+esc(nm[a])+')':''}`:'';
  if(b.link) return 'Os ramos paralelos não estão ligados do jeito certo. Lembre: o ramo de baixo se junta ao de cima <b>logo depois</b> dos contatos que ele substitui. Clique no espaço entre as linhas para ligar/desligar.';
  const {cur,ans}=b;
  if(!cur) return ans.t==='W'?'Está vazia — aqui precisa só de um <b>fio</b> para a energia continuar até a bobina.':'Está vazia. Esta posição precisa de um elemento.';
  if(!ans) return 'Aqui não deveria ter nada.';
  if(cur.t!==ans.t){
    if(['NO','NC'].includes(cur.t)&&['NO','NC'].includes(ans.t)) return `NA ou NF? Pergunte: a energia deve passar quando ${an(ans.a)} está <b>${ans.t==='NO'?'ligado (1)':'desligado (0)'}</b>?`+(/NF/.test(nm[ans.a]||'')||['pbnf','emg','ft'].includes(((E.lv.io||[]).find(d=>d.a===ans.a)||{}).k)?' Lembre: botão NF no painel fica em 1 em repouso.':'');
    if(ans.t==='W') return 'Aqui é só um <b>fio</b>.';
    return `O símbolo não é esse. Releia a aula: o que esta linha precisa fazer?`;
  }
  if((cur.a||'')!==(ans.a||'')) return cur.a?`O símbolo está certo, mas o <b>endereço</b> não: ${an(cur.a)} não é o sinal que controla isso.`:'Falta escolher o <b>endereço</b>.';
  if(+cur.v!==+ans.v) return ans.t==='CTU'?'O valor de contagem (PV) está diferente do pedido.':'O tempo (PT) está diferente do pedido no objetivo.';
  return 'Revise esta célula.';
}

/* ---------------- verificação ---------------- */
const ONOFF=(a,v)=>{ const d=(P.lv.io||[]).find(x=>x.a===a); const k=d&&d.k; return k==='lamp'?(v?'ACESA':'APAGADA'):(v?'LIGADO':'DESLIGADO'); };
function check(){
  if(P.won) return;
  closePicker();
  const blanks=P.prog.every(g=>[...g.ed].every(k=>{ const [r,c]=k.split(','); return !LD.getCell(g,+r,c==='o'?'o':+c); }));
  const fb=$('#feedback');
  if(blanks && !P.prog.some(g=>g.edLinks)){ fb.className='feedback bad'; fb.textContent='Monte o ladder antes de verificar — esta não conta como tentativa.'; sndErr(); return; }
  const rest=restImage(P.lv); let fail=null, ti=-1;
  for(let i=0;i<P.lv.tests.length;i++){ const r=LD.runTest(P.prog,P.lv.tests[i],rest,P.lv.never); if(!r.ok){ fail=r; ti=i; break; } }
  if(!fail){ win(); return; }
  P.tries++; $('#chipTry').textContent='Tentativas: '+P.tries; sndErr(); syncExplainBtn();
  const bads=cellsBad(); P.bad=new Set(bads.filter(b=>!b.link).map(b=>b.i+':'+b.key)); drawEditor(E);
  const t=P.lv.tests[ti], nm=E.names;
  let msg=`<b>Teste ${ti+1} de ${P.lv.tests.length} falhou:</b> ${esc(t.d)}.<br>`;
  if(fail.never) msg+=`<span style="color:var(--err)"><b>${fail.never.map(a=>esc(nm[a]||a)).join(' e ')} ligaram JUNTOS</b> — isso queima a instalação!</span>`;
  else { const sp=t.steps[fail.step];
    msg+=`No passo <b>“${esc(sp.d||'passo '+(fail.step+1))}”</b>: esperava <b>${esc(nm[fail.addr]||fail.addr)}</b> (${fail.addr}) <b>${ONOFF(fail.addr,fail.want)}</b>, mas ficou <b>${ONOFF(fail.addr,fail.got)}</b>.`; }
  if(bads.length) msg+=`<br><small>${bads.length} célula(s) marcada(s) em vermelho para revisar.</small>`;
  if(has('monitor')) msg+=monitorTable(t, fail);
  fb.className='feedback bad'; fb.innerHTML=msg;
}
$('#btnCheck').onclick=check;
function monitorTable(t, fail){
  const ins=(P.lv.io||[]).filter(d=>/^I/.test(d.a)).map(d=>d.a);
  const outs=[...new Set(t.steps.flatMap(s=>Object.keys(s.q||{})))];
  const rows=fail.log.map((l,k)=>{ const sp=t.steps[l.s]; const failed=k===fail.log.length-1&&!fail.never&&l.s===fail.step;
    return `<tr class="${failed?'bad':''}"><td>${esc(sp.d||'')}</td>${ins.map(a=>`<td>${l.inputs[a]?1:0}</td>`).join('')}${outs.map(a=>{ const w=sp.q&&a in sp.q?(sp.q[a]?1:0):'·', g=a in l.got?l.got[a]:'·'; return `<td class="${w!=='·'&&w!==g?'x':''}">${g}${w!=='·'&&w!==g?` <small>(esperado ${w})</small>`:''}</td>`; }).join('')}</tr>`; }).join('');
  return `<div class="osc"><div class="osc-h">Osciloscópio</div><table><tr><th>passo</th>${ins.map(a=>`<th>${a}</th>`).join('')}${outs.map(a=>`<th>${a}</th>`).join('')}</tr>${rows}</table></div>`;
}
function syncExplainBtn(){
  const b=$('#btnExplain'), f=3-P.tries;
  b.dataset.locked=f>0?'1':''; b.classList.toggle('locked-soft',f>0);
  b.textContent=f>0?`Explicar (${f})`:'Explicar';
  b.title=f>0?`Abre depois de ${f} tentativa(s).`:'Linha a linha, com a resposta.';
}

/* ---------------- dicas ---------------- */
$('#btnHint').onclick=()=>{
  const b=cellsBad()[0];
  if(!b){ toast('Tudo igual ao gabarito — clique em Verificar!'); return; }
  const key=b.i+':'+(b.link?'L':b.key), tier=HINT_TIER[key]||0;
  let txt, custa=true, titulo=pos(b);
  if(tier===0){ custa=false; titulo+=' — o que está errado'; txt=diagMsg(b); }
  else if(tier===1){
    titulo+=' — o símbolo';
    txt = b.link ? `Ligações certas nesta linha: ${[...b.ans].map(k=>{ const [r,c]=k.split(','); return `entre o ramo ${+r+1} e o ${+r+2}, depois da posição ${c}`; }).join('; ')||'nenhuma'}.`
      : b.ans ? `Aqui vai: <b>${LD.TYPE_NAME[b.ans.t]}</b>${b.ans.t!=='W'?' — falta descobrir o endereço.':'.'}` : 'Aqui fica vazio.';
  }else{
    titulo+=' — resposta';
    txt = b.link ? 'Use <b>Revelar célula</b> ou o <b>Explicar</b> para ver o desenho completo.' : `<b>${esc(LD.label(b.ans))}</b>${b.ans&&b.ans.a&&E.names[b.ans.a]?' — '+esc(E.names[b.ans.a]):''}`;
  }
  if(custa){
    if(S.hints>0){ S.hints--; save(); hud(); P.hints++; }
    else { P.borrowed=true; toast('Dica emprestada: sem ficha 💡, esta fase vale 1 ★. Compre fichas na Loja.',4200); }
  }
  HINT_TIER[key]=tier+1;
  const d=document.createElement('div'); d.className='hint'; d.innerHTML=`<b>${esc(titulo)}:</b> ${txt}`;
  $('#hintBox').appendChild(d); d.scrollIntoView({block:'nearest'}); beep(760,.1);
  if(!b.link){ E.focus={i:b.i,k:b.key}; drawEditor(E); setTimeout(()=>{ if(E) { E.focus=null; } },2500); }
};
$('#btnReveal').onclick=()=>{
  if(S.coins<REVEAL_COST){ toast(`Faltam moedas (custa ${REVEAL_COST} 🪙).`); return; }
  const b=cellsBad()[0]; if(!b){ toast('Nada para revelar — clique em Verificar!'); return; }
  const g=P.prog[b.i];
  if(b.link) g.links=new Set(g.ansLinks); else LD.setCell(g,b.r,b.c,b.ans?{...b.ans}:null);
  S.coins-=REVEAL_COST; P.revealed++; save(); hud(); sndCoin(); P.bad.delete(b.i+':'+b.key); drawEditor(E);
  toast(`${pos(b)} revelada. −${REVEAL_COST} 🪙 · a fase vale no máximo ${P.revealed>2?1:2} ★`,3400);
};

/* ---------------- explicação ---------------- */
$('#btnExplain').onclick=()=>{
  if($('#btnExplain').dataset.locked){
    toast(`O passo a passo abre depois de 3 tentativas. Enquanto isso: <b>Dica</b> (1º nível grátis) ou <b>Aula</b>.`,4200); return; }
  const nm=E.names;
  $('#explainBody').innerHTML=P.prog.map((g,i)=>{
    const sol=LD.cloneRung(g); sol.ans.cells.forEach((row,r)=>row.forEach((c,ci)=>sol.cells[r][ci]=c?{...c}:null)); sol.ans.out.forEach((o,r)=>sol.out[r]=o?{...o}:null); sol.links=new Set(sol.ansLinks);
    const items=[]; for(let r=0;r<g.cells.length;r++){ for(let c=0;c<g.C;c++) if(g.ed.has(r+','+c)) items.push(g.ans.cells[r][c]); if(g.ed.has(r+',o')) items.push(g.ans.out[r]); }
    return `<div class="exrow"><b>Linha ${i+1}</b>${items.length||g.edLinks?'':' <small>(já vinha pronta)</small>'}<div class="ex-svg">${LD.render(sol,{names:nm})}</div>
      <small>${items.filter(Boolean).map(it=>esc(LD.label(it))+(it.a&&nm[it.a]?' = '+esc(nm[it.a]):'')).join(' · ')}</small></div>`;
  }).join('')+(P.lv.aula&&P.lv.aula.tips?`<div class="exrow"><b>Por quê</b><ul>${P.lv.aula.tips.map(t=>`<li>${t}</li>`).join('')}</ul></div>`:'');
  openModal('#modalExplain');
};
$('#expClose').onclick=()=>closeModal('#modalExplain');
$('#expFill').onclick=()=>{
  if(!confirm('Isso monta todas as células e a fase fica com 1 ★ (você pode repetir depois). Continuar?')) return;
  P.prog.forEach(g=>{ g.ed.forEach(k=>{ const [r,c]=k.split(','); const a=LD.ansCell(g,+r,c==='o'?'o':+c); LD.setCell(g,+r,c==='o'?'o':+c,a?{...a}:null); }); if(g.edLinks) g.links=new Set(g.ansLinks); });
  P.assisted=true; P.bad=new Set(); closeModal('#modalExplain'); drawEditor(E);
  toast('Ladder montado. Teste na aba Máquina e clique em Verificar.',4200);
};

/* ---------------- aula / cola ---------------- */
function codeCard(key){
  const c=CODES[key]; if(!c) return '';
  return `<div class="acard">${c.sym?`<div class="k sym">${SYM[c.sym]}</div>`:`<div class="k">${esc(key.length>4?'':key)}</div>`}<div class="t">${esc(c.n)}</div><div class="d">${c.d}</div>${c.ex?`<div class="e">${esc(c.ex)}</div>`:''}</div>`;
}
function openAula(lv, after){
  const a=lv.aula; if(!a){ after&&after(); return; }
  $('#aulaTitle').textContent=`Fase ${lv.id} — ${lv.name}`;
  $('#aulaBody').innerHTML=`<p class="aula-intro">${a.intro}</p>`+
    (a.codes&&a.codes.length?`<div class="aula-cards">${a.codes.map(codeCard).join('')}</div>`:'')+
    (a.tips&&a.tips.length?`<h4>Na prática</h4><ul class="aula-tips">${a.tips.map(t=>`<li>${t}</li>`).join('')}</ul>`:'');
  openModal('#modalAula');
  $('#aulaClose').onclick=()=>{ closeModal('#modalAula'); after&&after(); };
}
$('#btnAula').onclick=()=>{ if(P&&P.lv.aula) openAula(P.lv); };
$('#btnCola').onclick=()=>{
  const lv=P.lv, idx=lv.endless?LEVELS.length-1:LEVELS.indexOf(lv);
  const keys=[]; LEVELS.slice(0,idx+1).forEach(l=>(l.aula&&l.aula.codes||[]).forEach(c=>{ if(!keys.includes(c)) keys.push(c); }));
  $('#unTitle').textContent='Cola — o que você já aprendeu';
  $('#modalUnlock').classList.remove('finish');
  $('#unBody').innerHTML=`<div class="cola-grid">${keys.map(codeCard).join('')}</div>`;
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
    const okU = u.lvl==='boss' ? LEVELS.some(l=>l.boss && done(skey(l))) : done('clp_'+u.lvl);
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
  P.won=true; clearInterval(timer); timer=null; P.bad=new Set(); drawEditor(E);
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
  $('#resStars').setAttribute('aria-label',st+' de 3 estrelas');
  $$('#resStars span').forEach((s,i)=>{ const on=i<st; s.classList.toggle('on',on); s.textContent=on?'★':'☆'; });
  $('#resLine').textContent = st===3?'PROGRAMA PERFEITO':st===2?'APROVADO':'APROVADO COM RESSALVA';
  $('#resTitle').textContent = st===3?'Ladder perfeito!':st===2?'Ladder aprovado!':'Passou nos testes';
  $('#resText').textContent = `${lv.endless?'Rodada':'Fase'} concluída em ${mmss(secs)} · `+(P.tries===0&&P.hints===0?'sem erros, sem dicas pagas.':`${P.tries} tentativa(s) · ${P.hints} dica(s) paga(s).`)+` Passou nos ${lv.tests.length} teste(s) automático(s).`;
  $('#resRewards').innerHTML=`<span class="rw">+${xp} XP</span><span class="rw">+${coins} 🪙</span>`+(first?'<span class="rw">+2 💡</span>':'')+
    (recorde?'<span class="rw">⏱ NOVO RECORDE</span>':'')+(lv.endless&&S.streak>1?`<span class="rw">🔥 sequência ${S.streak}</span>`:'')+(!first&&!lv.endless?'<span class="rw dim">30% (repetição)</span>':'');
  const rk=rankOf(S.xp), nxr=nextRank(S.xp), pctR=nxr?Math.round((S.xp-rk[0])/(nxr[0]-rk[0])*100):100;
  const proxU=UNLOCKS.find(u=>!has(u.id));
  $('#resProg').innerHTML=`<div class="rp-rank"><span>${rk[1]}</span><span>${nxr?`faltam ${nxr[0]-S.xp} XP → ${nxr[1]}`:'patente máxima'}</span></div><div class="rp-bar"><i style="width:${pctR}%"></i></div>`+
    (proxU?`<div class="rp-line">Próximo desbloqueio: <b>${proxU.name}</b> ${proxU.lvl==='boss'?'ao vencer o CHEFE':'na fase '+proxU.lvl}.</div>`:'');
  countUp($('#coinTxt'),coinsAntes,S.coins);
  const last=!lv.endless && LEVELS.indexOf(lv)===LEVELS.length-1;
  $('#resNext').textContent=lv.endless?'Próxima lógica ›':last?'Ver conclusão ›':'Próxima fase ›';
  const fb=$('#feedback'); fb.className='feedback ok'; fb.innerHTML='<b>Todos os testes passaram!</b> Brinque na aba Máquina ou siga em frente.';
  openModal('#modalResult');
  const goNext=()=>{ if(newly.length){ const l=newly.splice(0); showUnlocks(l); } else nextLevel(); };
  $('#resNext').onclick=()=>{ closeModal('#modalResult'); goNext(); };
  $('#btnCheck').hidden=true; $('#btnNext').hidden=false; $('#btnNext').textContent=$('#resNext').textContent;
  $('#btnNext').onclick=()=>goNext();
  $('#resRepeat').onclick=()=>{ closeModal('#modalResult'); setView('#screen-play','sim'); toast('Aperte os botões do painel e veja seu ladder funcionando. Depois use <b>Próxima fase ›</b>.',5000); };
}
function nextLevel(){
  const lv=P.lv;
  if(lv.endless){ startLevel(makeEndlessLevel(S.endlessRun+1)); return; }
  const i=LEVELS.indexOf(lv), nx=LEVELS[i+1];
  if(nx && isUnlocked(nx)) startLevel(nx);
  else if(nx){ show('map'); toast(`O CHEFE exige ${BOSSST} ★. Refaça fases para pegar 3 ★.`,4500); }
  else showFinish();
}
function showFinish(){
  const tot=totalStarsTrack(), pct=Math.round(tot/MAXST*100);
  $('#modalUnlock').classList.add('finish');
  $('#unTitle').textContent='Fim da trilha';
  $('#unBody').innerHTML=`<div class="diploma"><div class="dip-seal">L</div><div class="dip-kick">CERTIFICADO DE CONCLUSÃO</div>
    <div class="dip-name">${rankOf(S.xp)[1]}</div><div class="dip-sub">Trilha do CLP — Ladder · ${S.xp} XP</div>
    <div class="dip-bar"><i style="width:${pct}%"></i></div><div class="dip-nums"><span><b>${tot}</b><small>de ${MAXST} ★</small></span>
    <span><b>${LEVELS.filter(l=>(S.stars[skey(l)]||0)===3).length}</b><small>ladders perfeitos</small></span></div></div>
    <div class="exrow">Agora use a <b>Bancada livre</b> para montar os exercícios da escola e o <b>Modo Infinito</b> para treinar lógica.</div>`;
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
function setInert(v){ $('#topbar').inert=v; $('#app').inert=v; }
function openModal(sel){
  closePicker();
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
   BANCADA LIVRE
   ========================================================================= */
let B=null;
const BENCH_LV={
  id:'bancada', name:'Bancada', machine:'clp',
  io:[{a:'I0.0',n:'B1 Botão',k:'pb',c:'#31d07a'},{a:'I0.1',n:'B2 Botão',k:'pb',c:'#43d0ff'},{a:'I0.2',n:'B0 Botão NF',k:'pbnf',c:'#ff5d5d'},{a:'I0.3',n:'S0 Emergência',k:'emg'},
      {a:'I0.4',n:'S1 Chave',k:'sw'},{a:'I0.5',n:'S2 Chave',k:'sw'},{a:'I0.6',n:'B3 Sensor',k:'sensor'},{a:'I0.7',n:'F1 Térmico',k:'ft'},
      {a:'Q0.0',n:'K1 Motor',k:'motor'},{a:'Q0.1',n:'H1 Verde',k:'lamp',c:'#31d07a'},{a:'Q0.2',n:'H2 Vermelha',k:'lamp',c:'#ff5d5d'},{a:'Q0.3',n:'H3 Amarela',k:'lamp',c:'#ffb020'},
      {a:'Q0.4',n:'H4 Azul',k:'lamp',c:'#43d0ff'},{a:'Q0.5',n:'Y1 Válvula',k:'valve'},{a:'Q0.6',n:'H5 Sirene',k:'buzzer'},{a:'Q0.7',n:'M2 Esteira',k:'belt'}],
  prog:[]
};
const BENCH_ADDRS=[...BENCH_LV.io.map(d=>d.a),'M0.0','M0.1','M0.2','M0.3','T1','T2','T3','T4','C1','C2'];
function openBench(){
  if(!B){
    let prog=[]; try{ prog=S.bench?LD.deserialize(S.bench):[]; }catch(e){ prog=[]; }
    if(!prog.length) prog=[LD.blankRung(2,5)];
    B={prog, st:LD.newState()};
  }
  Plant.mount(BENCH_LV, $('#benchPlant'));
  E={prog:B.prog, lv:BENCH_LV, box:$('#benchBox'), bench:true, names:namesOf(BENCH_LV), addrs:BENCH_ADDRS, types:['NO','NC','P','N','OUT','S','R','TON','TOF','CTU'],
     get state(){ return B.st; }, bad:null, onChange(){ S.bench=LD.serialize(B.prog); save(); drawEditor(E); }};
  drawEditor(E);
}
function benchAct(act, i){
  if(!B) return;
  const g=B.prog[i];
  if(act==='del'){ if(B.prog.length<=1){ B.prog[0]=LD.blankRung(2,5); } else B.prog.splice(i,1); }
  if(act==='addrow'){ if(g.cells.length>=4){ toast('No máximo 4 ramos por linha.'); return; } g.cells.push(Array(g.C).fill(null)); g.out.push(null); const r=g.cells.length-1; for(let c=0;c<g.C;c++) g.ed.add(r+','+c); g.ed.add(r+',o'); }
  if(act==='delrow'){ if(g.cells.length<=1) return; const r=g.cells.length-1; g.cells.pop(); g.out.pop(); for(let c=0;c<=g.C;c++){ g.ed.delete(r+','+c); g.links.delete((r-1)+','+c); } g.ed.delete(r+',o'); }
  E.prog=B.prog; E.onChange();
}
$('#benchAdd').onclick=()=>{ if(!B) return; if(B.prog.length>=12){ toast('No máximo 12 linhas.'); return; } B.prog.push(LD.blankRung(2,5)); E.onChange(); };
$('#benchClear').onclick=()=>{ if(!B||!confirm('Apagar todas as linhas da bancada?')) return; B.prog.length=0; B.prog.push(LD.blankRung(2,5)); B.st=LD.newState(); E.onChange(); };

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
  const symRows=['NO','NC','P','N','OUT','S','R','TON','TOF','CTU'].map(k=>[`<span class="hsym">${SYM[k]}</span>`,`<b>${esc(CODES[k].n)}</b><br><span style="color:var(--muted)">${CODES[k].d}</span>`]);
  g.innerHTML=`
  <div class="card wide"><h3>Como o CLP pensa</h3>
    <p>${CODES.SCAN.d}</p>
    <ul><li>A energia sai do <b>trilho da esquerda</b> e anda para a direita passando pelos contatos.</li>
    <li><b>Série = E</b> (todos fecham) · <b>Paralelo = OU</b> (qualquer ramo fecha).</li>
    <li>Cada bobina deve aparecer <b>uma vez só</b> no programa (exceto SET/RESET). Se aparecer duas vezes, vale a última — erro clássico.</li>
    <li>Como a execução é de cima para baixo, a ordem das linhas importa (ex.: RESET depois do SET).</li></ul></div>
  <div class="card"><h3>Símbolos</h3>${tbl(symRows)}</div>
  <div class="card"><h3>Endereços em cada fabricante</h3>${tbl([
    ['Siemens S7-1200/300 (este jogo)','I0.0','Q0.0','M0.0','T1 / IEC_Timer'],
    ['Siemens LOGO!','I1','Q1','M1','B001 (bloco)'],
    ['Allen-Bradley (RSLogix 500)','I:0/0','O:0/0','B3:0/0','T4:0'],
    ['Schneider (Zelio / M221)','%I0.0','%Q0.0','%M0','%TM0'],
    ['WEG Clic02','I01','Q01','M01','T01'],
    ['Mitsubishi FX','X0','Y0','M0','T0']],['Marca','Entrada','Saída','Memória','Temporizador'])}</div>
  <div class="card wide"><h3>Padrões clássicos</h3>${tbl([
    [`<b>Selo</b>`,CODES.SELO.d],[`<b>Botão NF no painel</b>`,CODES.NFFIS.d],[`<b>Intertravamento</b>`,CODES.INTER.d],
    [`<b>Liga/desliga com um botão</b>`,'Borda P gera um pulso M; ramo 1: pulso E NÃO saída; ramo 2: NÃO pulso E saída → saída.'],
    [`<b>Pisca-pisca</b>`,CODES.PISCA.d],[`<b>Sequência por tempo</b>`,CODES.SEQ.d],[`<b>Estrela-triângulo</b>`,CODES.YD.d]])}</div>
  <div class="card"><h3>Lógica × Ladder</h3>${tbl([
    ['A E B','| A | | B | ( Q )'],['A OU B','| A | em paralelo com | B |'],['NÃO A','|/ A |'],['A E NÃO B','| A | |/ B |'],['(A OU B) E C','paralelo A/B, depois | C | em série'],['A OU (B E C)','ramo de cima | A |, ramo de baixo | B | | C |']],['Lógica','Ladder'])}</div>
  <div class="card"><h3>Teclas do jogo</h3><ul>
    <li>Clique numa célula tracejada para escolher o símbolo e o endereço.</li>
    <li>Clique no espaço <b>entre duas linhas</b> para ligar/desligar um ramo paralelo.</li>
    <li>Na aba <b>Máquina</b>: botões de pulso funcionam enquanto você segura o clique (ou a tecla Espaço).</li>
    <li>A chave <b>RUN/STOP</b> do CLP para tudo. Com RUN, a linha fica verde por onde a energia passa.</li>
    <li>Modo desenvolvedor: 7 cliques no logo.</li></ul></div>
  <div class="card"><h3>Rever o tutorial</h3><p>O tutorial roda na fase 1.</p><button class="btn sm" id="helpTut">Rever o tutorial</button></div>`;
  $('#helpTut').onclick=()=>{ S.tutorial=false; save(); startLevel(LEVELS[0]); };
}

/* =========================================================================
   TUTORIAL (fase 1) com o mascote
   ========================================================================= */
let tstep=0, tutTarget=null, tutFails=0;
const cellIs=(i,k,t,a)=>{ const g=P&&P.prog[i]; if(!g) return false; const [r,c]=k.split(','); const it=LD.getCell(g,+r,c==='o'?'o':+c); return it&&it.t===t&&it.a===a; };
const TUT=[
  {sel:'#ladderBox', txt:'Este é o <b>diagrama Ladder</b>. A barra da <b>esquerda</b> é a energia (+24 V). A energia anda para a direita e, se chegar na <b>bobina</b> no fim da linha, a saída liga.'},
  {sel:'#ladderBox [data-cell="0,0"]', gate:true, txt:'Clique no quadrado tracejado da esquerda e escolha <b>NA</b> e depois o endereço <b>I0.0</b> (o botão B1). Depois clique em <b>Conferir</b>.',
    check:()=>cellIs(0,'0,0','NO','I0.0')?{ok:true}:{ok:false,msg:'Ainda não: o primeiro quadrado precisa ser contato NA com I0.0.'}},
  {sel:'#ladderBox [data-cell="0,o"]', gate:true, txt:'Agora a saída: clique no quadrado da direita, escolha <b>Bobina</b> e o endereço <b>Q0.0</b> (a lâmpada H1).',
    check:()=>cellIs(0,'0,o','OUT','Q0.0')?{ok:true}:{ok:false,msg:'A saída precisa ser Bobina com Q0.0.'}},
  {sel:'#plantBox', txt:'Esta é a <b>máquina</b>: o painel com o botão B1, a lâmpada H1 e o CLP com os LEDs. <b>Segure</b> o botão B1 e veja o LED I0.0 acender, a linha ficar verde e a lâmpada acender.'},
  {sel:'#btnCheck', txt:'Quando achar que está certo, clique em <b>Verificar</b>: o jogo testa o seu programa sozinho, apertando e soltando os botões. Bora!'}
];
function startTutorial(){
  if(screen!=='play') return;
  tstep=0; tutFails=0; $('#tutor').classList.add('on'); if(window.Mascot) Mascot.init();
  addEventListener('scroll',tutReflow,true); addEventListener('resize',tutReflow); tutShow();
}
function tutReflow(){ requestAnimationFrame(()=>tutPlace(tutTarget)); }
function tutShow(){
  const s=TUT[tstep]; setView('#screen-play', s.sel==='#plantBox'?'sim':'prog');
  const el=$(s.sel); if(!el){ endTutorial(); return; }
  tutTarget=el; tutFails=0;
  $('#tutStep').textContent=`PASSO ${tstep+1}/${TUT.length}`; $('#tutText').innerHTML=s.txt; $('#tutErr').textContent='';
  $('#tutGive').style.display='none'; $('#tutBack').disabled=tstep===0;
  $('#tutNext').textContent=s.gate?'Conferir':(tstep===TUT.length-1?'Começar':'Próximo ›');
  $('#tutor').classList.toggle('interactive',true);
  const r=el.getBoundingClientRect(); if(r.top<80||r.bottom>innerHeight-40) el.scrollIntoView({block:'center'});
  requestAnimationFrame(()=>requestAnimationFrame(()=>tutPlace(el)));
  beep(520,.05);
  if(window.Mascot) Mascot.say((tstep===0?'Oi! Eu sou o Torninho, e agora vou te ensinar Ladder. ':'')+$('#tutText').innerHTML);
}
function tutPlace(el){
  if(!el||!$('#tutor').classList.contains('on')) return;
  if(!document.contains(el)){ const s=TUT[tstep]; el=$(s.sel); tutTarget=el; if(!el) return; }
  const pad=8, r=el.getBoundingClientRect(), sp=$('#tutSpot'), b=$('#tutBubble');
  Object.assign(sp.style,{left:(r.left-pad)+'px',top:(r.top-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px'});
  const bb=b.getBoundingClientRect(); let bx=r.left+r.width/2-bb.width/2, by=r.bottom+16;
  if(by+bb.height>innerHeight-10) by=r.top-bb.height-16;
  b.style.left=Math.max(10,Math.min(bx,innerWidth-bb.width-10))+'px'; b.style.top=Math.max(10,Math.min(by,innerHeight-bb.height-10))+'px';
}
setInterval(()=>{ if($('#tutor').classList.contains('on')) tutPlace(tutTarget); },400);
$('#tutNext').onclick=()=>{
  const s=TUT[tstep];
  if(s.gate){ const res=s.check(); if(!res.ok){ tutFails++; sndErr(); $('#tutErr').innerHTML=res.msg; if(window.Mascot) Mascot.say('Quase! '+res.msg);
      const b=$('#tutBubble'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      if(tutFails>=2) $('#tutGive').style.display=''; tutPlace(tutTarget); return; }
    sndOk(); }
  closePicker();
  tstep++; tstep>=TUT.length?endTutorial():tutShow();
};
$('#tutGive').onclick=()=>{
  const g=P.prog[0];
  if(tstep===1) LD.setCell(g,0,0,{t:'NO',a:'I0.0'}); if(tstep===2) LD.setCell(g,0,'o',{t:'OUT',a:'Q0.0'});
  drawEditor(E); $('#tutErr').textContent=''; $('#tutGive').style.display='none'; };
$('#tutBack').onclick=()=>{ if(tstep>0){ tstep--; tutShow(); } };
$('#tutSkip').onclick=()=>{ endTutorial(); toast('Sem problema — o Manual tem "Rever o tutorial".',3500); };
function endTutorial(){ if(window.Mascot) Mascot.stop(); $('#tutor').classList.remove('on','interactive'); removeEventListener('scroll',tutReflow,true); removeEventListener('resize',tutReflow); tutTarget=null; S.tutorial=true; save(); }

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

/* ---------------- início ---------------- */
hud();
show('map');
