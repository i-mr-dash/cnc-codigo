/* =========================================================================
   CLP LADDER — a "máquina": painel de comando (botões, chaves, sensores),
   dispositivos de saída, CLP com LEDs e as cenas com física simples
   (esteira, tanque, cilindro, semáforo, reversão, estrela-triângulo).
   ========================================================================= */
'use strict';

const Plant = (()=>{
  let lv=null, root=null, dev={}, phys={}, run=true;
  const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const isIn = a => /^I/.test(a);
  const restOf = d => d.rest!=null ? d.rest : (['pbnf','emg','ft'].includes(d.k)?1:0);
  const KIND_IN = {pb:'Botão NA (pulso)', pbnf:'Botão NF (pulso)', emg:'Emergência (NF, trava)', sw:'Chave (liga/desliga)', sensor:'Sensor', ft:'Relé térmico (NF)', fc:'Fim de curso'};
  const driven = a => { const p=lv&&lv.plant; if(!p) return false;
    return (p.type==='tank'&&(a===p.lb||a===p.la)) || (p.type==='cil'&&(a===p.s1||a===p.s2)); };

  /* ---------------- montagem ---------------- */
  function mount(level, el){
    lv=level; root=el; dev={}; phys={pos:0, lvl:.12, boxes:[], spawn:0, ang:0, flash:0};
    const ins=lv.io.filter(d=>isIn(d.a)), outs=lv.io.filter(d=>!isIn(d.a));
    ins.forEach(d=>dev[d.a]={d, on:false, bit:restOf(d)});
    // estado físico inicial que bate com o repouso
    ins.forEach(d=>{ if(d.k==='sw'||d.k==='sensor'||d.k==='fc') dev[d.a].on=!!restOf(d); });
    if(lv.plant&&lv.plant.type==='cil'){ phys.pos=0; }
    root.innerHTML=`
      <div class="pl-scene" id="plScene">${scene()}</div>
      <div class="pl-board">
        <div class="pl-col"><div class="pl-h">Painel de comando <small>entradas</small></div><div class="pl-ins">${ins.map(inHtml).join('')}</div></div>
        <div class="pl-col"><div class="pl-h">Dispositivos <small>saídas</small></div><div class="pl-outs">${outs.map(outHtml).join('')}</div></div>
      </div>
      <div class="plc" id="plc">
        <div class="plc-top"><b>CLP</b><span class="plc-model">CPU 24 V DC</span>
          <button class="plc-run on" id="plcRun" aria-pressed="true" title="Chave RUN / STOP do CLP">RUN</button></div>
        <div class="plc-leds">${leds('I',ins)}${leds('Q',outs.filter(d=>/^Q/.test(d.a)))}</div>
        <div class="plc-scan" id="plcScan">varredura: 10 ms</div>
      </div>`;
    bind();
    setRun(true);
  }
  function leds(p, list){
    const n=8, has=a=>list.find(d=>d.a===a);
    let h=`<div class="led-row"><span class="led-lb">${p}</span>`;
    for(let i=0;i<n;i++){ const a=p+'0.'+i, d=has(a); h+=`<span class="led${d?'':' unused'}" data-led="${a}" title="${esc(a+(d?' — '+d.n:''))}"><i></i><small>${i}</small></span>`; }
    return h+'</div>';
  }
  function inHtml(d){
    const k=d.k, col=d.c||(k==='pbnf'?'#ff5d5d':'#e8eef7');
    const icon = k==='emg' ? `<span class="emgbtn"></span>`
      : k==='sw' ? `<span class="swk"><i></i></span>`
      : k==='ft' ? `<span class="ftk">F</span>`
      : (k==='sensor'||k==='fc') ? `<span class="snk"></span>`
      : `<span class="pbk" style="--c:${col}"></span>`;
    const ro=driven(d.a);
    return `<button class="pin k-${k}${ro?' ro':''}" data-in="${d.a}" type="button" title="${esc(KIND_IN[k]||'')}${ro?' — acionado pela máquina':''}">
      ${icon}<span class="pin-t"><b>${esc(d.n)}</b><small>${d.a} · ${esc(KIND_IN[k]||'')}</small></span><span class="pin-bit">0</span></button>`;
  }
  function outHtml(d){
    const k=d.k; let icon='';
    if(k==='lamp') icon=`<span class="lmp" style="--c:${d.c||'#ffe27a'}"></span>`;
    else if(k==='motor'||k==='pump') icon=`<span class="mtr"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/><g class="fan"><path d="M20 20L20 6M20 20L32 27M20 20L8 27"/></g></svg></span>`;
    else if(k==='buzzer') icon=`<span class="bzr"><svg viewBox="0 0 40 40"><path d="M8 15h7l9-7v24l-9-7H8z"/><path class="wv" d="M28 13q5 7 0 14M32 9q9 11 0 22"/></svg></span>`;
    else if(k==='valve') icon=`<span class="vlv"><svg viewBox="0 0 40 40"><rect x="6" y="12" width="16" height="16" rx="2"/><path d="M22 20h12M28 14l6 6-6 6"/></svg></span>`;
    else if(k==='belt') icon=`<span class="blt"><svg viewBox="0 0 40 40"><rect x="3" y="15" width="34" height="10" rx="5"/><path class="bd" d="M8 20h24"/></svg></span>`;
    else icon=`<span class="ktr"><svg viewBox="0 0 40 40"><rect x="8" y="6" width="24" height="28" rx="3"/><rect class="kw" x="14" y="14" width="12" height="8"/></svg></span>`;
    return `<div class="pout k-${k}" data-out="${d.a}">${icon}<span class="pin-t"><b>${esc(d.n)}</b><small>${d.a}</small></span><span class="pin-bit">0</span></div>`;
  }

  /* ---------------- cenas ---------------- */
  function scene(){
    const p=lv.plant; if(!p) return '';
    if(p.type==='belt') return `<svg viewBox="0 0 400 120" class="sc-belt"><rect class="frame" x="20" y="70" width="330" height="18" rx="9"/>
      <path class="belt-dash" d="M30 79h310"/><circle class="roll" cx="29" cy="79" r="8"/><circle class="roll" cx="341" cy="79" r="8"/>
      <g id="scBoxes"></g><line class="beam" id="scBeam" x1="260" y1="20" x2="260" y2="70"/><rect class="eye" x="252" y="10" width="16" height="12" rx="2"/>
      <path class="bin" d="M352 60v48h42V60"/><text class="sc-t" x="373" y="104">CAIXA</text><text class="sc-t" x="260" y="8">B3</text></svg>`;
    if(p.type==='tank') return `<svg viewBox="0 0 400 140" class="sc-tank"><rect class="tank" x="150" y="10" width="110" height="120" rx="6"/>
      <rect class="water" id="scWater" x="153" y="128" width="104" height="0"/>
      <line class="lvl" x1="140" y1="${130-120*.25}" x2="270" y2="${130-120*.25}"/><text class="sc-t" x="300" y="${134-120*.25}">LB</text>
      <line class="lvl" x1="140" y1="${130-120*.85}" x2="270" y2="${130-120*.85}"/><text class="sc-t" x="300" y="${134-120*.85}">LA</text>
      <circle class="snd" id="scLB" cx="282" cy="${130-120*.25}" r="6"/><circle class="snd" id="scLA" cx="282" cy="${130-120*.85}" r="6"/>
      <path class="pipe" d="M60 128h40v-118h50"/><g class="pumpg" id="scPump"><circle cx="60" cy="118" r="16"/><path class="fan" d="M60 118l0-11M60 118l9 6M60 118l-9 6"/></g>
      <path class="pipe" d="M205 130v8h120"/><text class="sc-t" x="350" y="141">consumo</text></svg>`;
    if(p.type==='cil') return `<svg viewBox="0 0 400 120" class="sc-cil"><rect class="cbody" x="40" y="40" width="170" height="40" rx="4"/>
      <rect class="piston" id="scPiston" x="50" y="44" width="14" height="32"/><rect class="rod" id="scRod" x="64" y="55" width="150" height="10"/>
      <rect class="cap" id="scCap" x="214" y="48" width="12" height="24"/>
      <circle class="snd" id="scS1" cx="60" cy="30" r="7"/><text class="sc-t" x="60" y="16">S1</text>
      <circle class="snd" id="scS2" cx="196" cy="30" r="7"/><text class="sc-t" x="196" y="16">S2</text>
      <path class="pipe" d="M50 80v26h60"/><rect class="valveb" id="scValve" x="110" y="96" width="34" height="20" rx="2"/><text class="sc-t" x="127" y="110">Y1</text></svg>`;
    if(p.type==='sem') return `<svg viewBox="0 0 400 130" class="sc-sem"><rect class="pole" x="194" y="100" width="12" height="30"/><rect class="semb" x="170" y="4" width="60" height="100" rx="10"/>
      <circle class="sl r" id="scR" cx="200" cy="25" r="12"/><circle class="sl y" id="scY" cx="200" cy="54" r="12"/><circle class="sl g" id="scG" cx="200" cy="83" r="12"/></svg>`;
    if(p.type==='rev'||p.type==='yd') return `<svg viewBox="0 0 400 130" class="sc-mot"><rect class="mbody" x="130" y="30" width="120" height="70" rx="10"/>
      <path class="fins" d="M145 30v70M160 30v70M175 30v70M190 30v70M205 30v70M220 30v70M235 30v70"/><rect class="shaft" x="250" y="58" width="40" height="14"/>
      <g id="scRotor" class="rotor"><circle cx="310" cy="65" r="26"/><path d="M310 65L310 41M310 65L331 77M310 65L289 77"/></g>
      <text class="sc-big" id="scMode" x="190" y="122">PARADO</text><text class="sc-short" id="scShort" x="190" y="20">CURTO-CIRCUITO!</text></svg>`;
    return '';
  }

  /* ---------------- interação ---------------- */
  function bind(){
    root.querySelectorAll('[data-in]').forEach(b=>{
      const a=b.dataset.in, d=dev[a].d;
      if(driven(a) && !(lv.plant.type==='belt')) { b.disabled=false; b.onclick=()=>window.toast&&toast('Este sensor é acionado pela própria máquina.'); return; }
      if(d.k==='pb'||d.k==='pbnf'||(d.k==='sensor'&&lv.plant&&lv.plant.type==='belt'&&a===lv.plant.sensor)){
        const dn=e=>{ e.preventDefault(); dev[a].on=true; b.classList.add('down'); try{ b.setPointerCapture(e.pointerId); }catch(_){} };
        const up=()=>{ dev[a].on=false; b.classList.remove('down'); };
        b.addEventListener('pointerdown',dn); b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('lostpointercapture',up);
        b.addEventListener('keydown',e=>{ if((e.key===' '||e.key==='Enter')&&!e.repeat){ e.preventDefault(); dev[a].on=true; b.classList.add('down'); } });
        b.addEventListener('keyup',e=>{ if(e.key===' '||e.key==='Enter') up(); });
      }else{
        b.onclick=()=>{ dev[a].on=!dev[a].on; };
      }
    });
    const rb=root.querySelector('#plcRun'); rb.onclick=()=>setRun(!run);
  }
  function setRun(v){ run=v; const rb=root&&root.querySelector('#plcRun'); if(rb){ rb.classList.toggle('on',v); rb.textContent=v?'RUN':'STOP'; rb.setAttribute('aria-pressed',v); } }

  /* ---------------- imagem das entradas ---------------- */
  function inputs(){
    const o={};
    for(const a in dev){ const {d,on}=dev[a];
      let bit = d.k==='pb'?on : d.k==='pbnf'?!on : d.k==='emg'?!on : d.k==='ft'?!on : on;
      dev[a].bit=bit?1:0; o[a]=dev[a].bit; }
    return o;
  }

  /* ---------------- física + desenho (chamado a cada quadro) ---------------- */
  function step(st, dt){
    if(!lv||!root) return;
    const Q=a=>LD.readBit(st,a), p=lv.plant, s=dt/1000;
    if(p){
      if(p.type==='cil'){
        phys.pos+= (Q(p.y)?1:-1)*s/1.1; phys.pos=Math.max(0,Math.min(1,phys.pos));
        dev[p.s1].on=phys.pos<.02; dev[p.s2].on=phys.pos>.98;
        const x=50+phys.pos*140; set('#scPiston','x',x); set('#scRod','x',x+14); set('#scCap','x',x+164);
        cls('#scS1','on',dev[p.s1].on); cls('#scS2','on',dev[p.s2].on); cls('#scValve','on',Q(p.y));
      }else if(p.type==='tank'){
        phys.lvl += (Q(p.pump)?.09:0)*s - .025*s; phys.lvl=Math.max(0,Math.min(1,phys.lvl));
        dev[p.lb].on=phys.lvl>.25; dev[p.la].on=phys.lvl>.85;
        const h=phys.lvl*117; set('#scWater','y',128-h); set('#scWater','height',h);
        cls('#scLB','on',dev[p.lb].on); cls('#scLA','on',dev[p.la].on); cls('#scPump','on',Q(p.pump));
        if(phys.lvl>=1 && Q(p.pump)) flash('Transbordou! A bomba devia ter desligado no nível alto.');
      }else if(p.type==='belt'){
        const on=Q(p.motor); root.querySelector('.sc-belt').classList.toggle('run',on);
        if(on){ phys.spawn-=s; if(phys.spawn<=0){ phys.boxes.push(10); phys.spawn=1.7; }
          phys.boxes=phys.boxes.map(x=>x+s*70).filter(x=>x<380); }
        const hit=phys.boxes.some(x=>x>238&&x<268);
        dev[p.sensor].auto=hit;
        const g=root.querySelector('#scBoxes'); if(g) g.innerHTML=phys.boxes.map(x=>`<rect class="box" x="${x>348?352+ (x-348)*.2:x}" y="${x>348?Math.min(88,48+(x-348)*2):48}" width="22" height="22" rx="2"/>`).join('');
        cls('#scBeam','hit',hit||dev[p.sensor].on);
      }else if(p.type==='sem'){
        cls('#scR','on',Q(p.r)); cls('#scY','on',Q(p.y)); cls('#scG','on',Q(p.g));
      }else if(p.type==='rev'||p.type==='yd'){
        let dir=0, mode='PARADO', short=false;
        if(p.type==='rev'){ const a=Q(p.fw), b=Q(p.rw); short=a&&b; dir=short?0:a?1:b?-1:0; mode=short?'—':a?'HORÁRIO':b?'ANTI-HORÁRIO':'PARADO'; }
        else { const k1=Q(p.k1), k2=Q(p.k2), k3=Q(p.k3); short=k2&&k3; dir=k1&&!short?(k3?1:k2?.4:0):0; mode=short?'—':k1&&k3?'TRIÂNGULO (Δ)':k1&&k2?'ESTRELA (Y)':'PARADO'; }
        phys.ang+=dir*s*720; const r=root.querySelector('#scRotor'); if(r) r.setAttribute('transform',`rotate(${phys.ang%360} 310 65)`);
        const m=root.querySelector('#scMode'); if(m) m.textContent=mode;
        cls('#scShort','on',short); if(short) flash('CURTO-CIRCUITO! Faltou intertravamento.');
      }
    }
    // LEDs e dispositivos
    const im=inputs();
    // sensor da esteira: automático OU apertado à mão
    if(p&&p.type==='belt'&&dev[p.sensor]){ const b=dev[p.sensor].auto||dev[p.sensor].on; dev[p.sensor].bit=b?1:0; }
    root.querySelectorAll('[data-in]').forEach(b=>{ const a=b.dataset.in, v=dev[a].bit; b.classList.toggle('act',!!dev[a].on); b.querySelector('.pin-bit').textContent=v; b.classList.toggle('hi',!!v); });
    root.querySelectorAll('[data-out]').forEach(b=>{ const v=Q(b.dataset.out); b.classList.toggle('on',v); b.querySelector('.pin-bit').textContent=v?1:0; });
    root.querySelectorAll('[data-led]').forEach(l=>{ const a=l.dataset.led; const v=isIn(a)?(dev[a]?dev[a].bit:0):Q(a); l.classList.toggle('on',!!v); });
    if(phys.flash>0) phys.flash-=dt;
  }
  function flash(msg){ if(phys.flash>0) return; phys.flash=3500; if(window.toast) toast('<b>'+msg+'</b>',3200); }
  function set(sel,attr,v){ const e=root.querySelector(sel); if(e) e.setAttribute(attr,v); }
  function cls(sel,c,v){ const e=root.querySelector(sel); if(e) e.classList.toggle(c,!!v); }
  function image(){ const im=inputs(); if(lv&&lv.plant&&lv.plant.type==='belt'&&dev[lv.plant.sensor]){ const d=dev[lv.plant.sensor]; im[lv.plant.sensor]=(d.auto||d.on)?1:0; } return im; }

  return { mount, image, step, setRun, get run(){ return run; }, restOf };
})();
window.Plant=Plant;
