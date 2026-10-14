/* =========================================================================
   CLP LADDER — motor: modelo da linha (rung), varredura do CLP, temporizadores,
   contadores, testes automáticos e desenho em SVG.

   Linha (rung) = grade de R linhas × C colunas de contatos + 1 coluna de saída.
   cells[r][c] : null (sem fio) | {t:'W'} fio | {t:'NO'|'NC'|'P'|'N', a:'I0.0'}
   out[r]      : null | {t:'OUT'|'S'|'R'|'TON'|'TOF'|'CTU', a:'Q0.0', v:5}
   links       : Set "r,c" = ligação vertical entre a linha r e r+1 na fronteira c (1..C)
   ========================================================================= */
'use strict';

const LD = (()=>{
  const CONTACTS = ['NO','NC','P','N'];
  const OUTS = ['OUT','S','R','TON','TOF','CTU'];
  const TYPE_NAME = {W:'fio', NO:'contato NA', NC:'contato NF', P:'contato de borda de subida (P)', N:'contato de borda de descida (N)',
    OUT:'bobina', S:'bobina SET (liga e trava)', R:'bobina RESET (desliga / zera)', TON:'temporizador TON', TOF:'temporizador TOF', CTU:'contador CTU'};
  const isTC = a => /^[TC]\d+$/i.test(a||'');

  /* ---------- notação compacta usada nas fases ----------
     'NO I0.0'  'NC Q0.1'  'P I0.0'  '-' (fio)  '' (nada)  'OUT Q0.0'  'S Q0.0'  'TON T1 5'  'CTU C1 5'
     prefixo '?' = célula que o aluno preenche (o resto é a resposta)            */
  function parseItem(s){
    s=(s==null?'':String(s)).trim();
    if(s==='') return null;
    if(s==='-') return {t:'W'};
    const p=s.split(/\s+/), t=p[0].toUpperCase();
    const o={t, a:p[1]?p[1].toUpperCase():''};
    if(p[2]!=null) o.v=+p[2];
    return o;
  }
  function rung(def){
    // def: {rows:[[...C células..., saída], ...], links:['0,1'], edLinks:bool, title, note}
    const R=def.rows.length, C=def.rows[0].length-1;
    const g={C, title:def.title||'', note:def.note||'', cells:[], out:[], ans:{cells:[],out:[]}, ed:new Set(), links:new Set(), ansLinks:new Set(def.links||[]), edLinks:!!def.edLinks};
    for(let r=0;r<R;r++){
      g.cells.push([]); g.ans.cells.push([]);
      for(let c=0;c<=C;c++){
        let s=def.rows[r][c]; let ed=false;
        if(typeof s==='string' && s.startsWith('?')){ ed=true; s=s.slice(1); }
        const it=parseItem(s);
        if(c===C){ g.ans.out[r]=it; g.out[r]=ed?null:it; if(ed) g.ed.add(r+',o'); }
        else { g.ans.cells[r][c]=it; g.cells[r][c]=ed?null:it; if(ed) g.ed.add(r+','+c); }
      }
    }
    if(!g.edLinks) g.ansLinks.forEach(k=>g.links.add(k));
    return g;
  }
  const R_ = g => g.cells.length;
  const getCell = (g,r,c) => c==='o'||c===g.C ? g.out[r] : g.cells[r][c];
  const setCell = (g,r,c,v) => { if(c==='o'||c===g.C) g.out[r]=v; else g.cells[r][c]=v; };
  const ansCell = (g,r,c) => c==='o'||c===g.C ? g.ans.out[r] : g.ans.cells[r][c];
  const same = (a,b) => { if(!a||!b) return !a&&!b; if(a.t!==b.t) return false; if(a.t==='W') return true;
    if((a.a||'')!==(b.a||'')) return false; if(['TON','TOF','CTU'].includes(a.t)) return +a.v===+b.v; return true; };
  const label = it => !it?'(vazio)':it.t==='W'?'fio ( — )':`${TYPE_NAME[it.t]||it.t} ${it.a||''}${['TON','TOF'].includes(it.t)?' '+it.v+' s':it.t==='CTU'?' = '+it.v:''}`;

  /* ---------- estado do CLP ---------- */
  function newState(){ return {bits:{}, tm:{}, ct:{}, edge:{}, t:0}; }
  function readBit(st,a){
    a=(a||'').toUpperCase();
    if(/^T\d+$/.test(a)) return !!(st.tm[a]&&st.tm[a].q);
    if(/^C\d+$/.test(a)) return !!(st.ct[a]&&st.ct[a].q);
    return !!st.bits[a];
  }

  /* ---------- avalia uma linha (power flow da esquerda para a direita) ---------- */
  function evalRung(g, st, dt, ri, write=true){
    const R=R_(g), C=g.C;
    const node=[...Array(R)].map(()=>Array(C+1).fill(false));
    const pass=[...Array(R)].map(()=>Array(C).fill(false));
    const closed=[...Array(R)].map(()=>Array(C).fill(false));
    for(let r=0;r<R;r++) node[r][0]=true;                // trilho da esquerda (+24 V)
    const merge=c=>{ if(c===0) return;
      let r=0; while(r<R){ let e=r; while(e<R-1 && g.links.has(e+','+c)) e++;
        if(e>r){ let v=false; for(let k=r;k<=e;k++) v=v||node[k][c]; for(let k=r;k<=e;k++) node[k][c]=v; }
        r=e+1; } };
    for(let c=0;c<=C;c++){
      merge(c);
      if(c===C) break;
      for(let r=0;r<R;r++){
        const it=g.cells[r][c]; let ok=false;
        if(it){
          if(it.t==='W') ok=true;
          else { const v=readBit(st,it.a), key=ri+':'+r+':'+c, pv=!!st.edge[key];
            if(it.t==='NO') ok=v; else if(it.t==='NC') ok=!v;
            else if(it.t==='P') ok=v&&!pv; else if(it.t==='N') ok=!v&&pv;
            if(write && (it.t==='P'||it.t==='N')) st.edge[key]=v; }
        }
        closed[r][c]=ok; pass[r][c]=ok&&node[r][c]; node[r][c+1]=node[r][c+1]||pass[r][c];
      }
    }
    const pow=[];
    for(let r=0;r<R;r++){
      const o=g.out[r], p=node[r][C]; pow[r]=p;
      if(!o||!write) continue;
      const a=(o.a||'').toUpperCase();
      if(o.t==='OUT'){ if(a&&!isTC(a)) st.bits[a]=p; }
      else if(o.t==='S'){ if(p&&a&&!isTC(a)) st.bits[a]=true; }
      else if(o.t==='R'){ if(p&&a){ if(/^T/.test(a)) st.tm[a]={acc:0,q:false,pt:(st.tm[a]||{}).pt||0}; else if(/^C/.test(a)){ const k=st.ct[a]||{}; st.ct[a]={cv:0,q:false,pv:k.pv||0,pin:k.pin}; } else st.bits[a]=false; } }
      else if(o.t==='TON'||o.t==='TOF'){
        if(!a) continue; const pt=(+o.v||0)*1000; const t=st.tm[a]||(st.tm[a]={acc:0,q:false,pt});
        t.pt=pt; t.kind=o.t; t.in=p;
        if(o.t==='TON'){ if(p){ t.acc=Math.min(pt,t.acc+dt); t.q=t.acc>=pt; } else { t.acc=0; t.q=false; } }
        else { if(p){ t.q=true; t.acc=0; } else if(t.q){ t.acc=Math.min(pt,t.acc+dt); if(t.acc>=pt) t.q=false; } }
      }else if(o.t==='CTU'){
        if(!a) continue; const pv=+o.v||0; const k=st.ct[a]||(st.ct[a]={cv:0,q:false,pv,pin:false});
        k.pv=pv; if(p&&!k.pin) k.cv++; k.pin=p; k.q=k.cv>=pv;
      }
    }
    g._viz={node,pass,closed,pow};
    return pow;
  }
  function scan(prog, st, dt){ prog.forEach((g,i)=>evalRung(g,st,dt,i)); st.t+=dt; }
  function vizOnly(prog, st){ prog.forEach((g,i)=>evalRung(g,st,0,i,false)); }

  /* ---------- testes automáticos ----------
     test = {d:'descrição', steps:[{i:{I0.0:1}, t:500, q:{Q0.0:1}, d:'texto do passo'}]}
     as entradas começam no valor de repouso (rest) e persistem entre passos */
  const DT=10;
  function runTest(prog, test, rest, never){
    const st=newState(); const inputs={...rest}; const log=[];
    const apply=()=>{ for(const k in inputs) st.bits[k]=!!inputs[k]; };
    const step1=()=>{ apply(); scan(prog,st,DT);
      if(never) for(const pair of never){ if(pair.every(a=>readBit(st,a))) return pair; } return null; };
    for(let i=0;i<4;i++){ const bad=step1(); if(bad) return {ok:false, step:-1, never:bad, log}; }
    for(let s=0;s<test.steps.length;s++){
      const sp=test.steps[s];
      if(sp.i) Object.assign(inputs, sp.i);
      const n=Math.max(4, Math.round((sp.t||60)/DT));
      for(let k=0;k<n;k++){ const bad=step1(); if(bad) return {ok:false, step:s, never:bad, log}; }
      const snap={}; Object.keys(sp.q||{}).forEach(a=>snap[a]=readBit(st,a)?1:0);
      log.push({s, inputs:{...inputs}, got:snap, t:st.t});
      for(const a in (sp.q||{})) if(!!sp.q[a]!==readBit(st,a)) return {ok:false, step:s, addr:a, want:!!sp.q[a], got:readBit(st,a), log};
    }
    return {ok:true, log};
  }

  /* ---------- clonagem / serialização ---------- */
  function cloneRung(g){
    return {...g, cells:g.cells.map(r=>r.map(c=>c?{...c}:null)), out:g.out.map(c=>c?{...c}:null), links:new Set(g.links), ed:new Set(g.ed), ansLinks:new Set(g.ansLinks), _viz:null};
  }
  function serialize(prog){ return prog.map(g=>({C:g.C, cells:g.cells, out:g.out, links:[...g.links]})); }
  function deserialize(arr){
    return (arr||[]).map(o=>{ const R=o.cells.length;
      const g={C:o.C, title:'', note:'', cells:o.cells.map(r=>r.map(c=>c?{...c}:null)), out:o.out.map(c=>c?{...c}:null), links:new Set(o.links||[]),
        ed:new Set(), ans:{cells:[],out:[]}, ansLinks:new Set(), edLinks:true};
      for(let r=0;r<R;r++){ for(let c=0;c<o.C;c++) g.ed.add(r+','+c); g.ed.add(r+',o'); }
      return g; });
  }
  function blankRung(R=2, C=5){
    const g={C, title:'', note:'', cells:[...Array(R)].map((_,r)=>Array(C).fill(null).map(()=>r===0?{t:'W'}:null)), out:Array(R).fill(null), links:new Set(), ed:new Set(), ans:{cells:[],out:[]}, ansLinks:new Set(), edLinks:true};
    for(let r=0;r<R;r++){ for(let c=0;c<C;c++) g.ed.add(r+','+c); g.ed.add(r+',o'); }
    return g;
  }

  /* ---------- desenho SVG ---------- */
  const CW=104, RH=78, L0=26, OW=150, TOP=8;
  const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function render(g, opt={}){
    const R=R_(g), C=g.C, W=L0+C*CW+OW+14, H=TOP+R*RH+6;
    const v=g._viz, on=opt.live&&v, nm=opt.names||{}, st=opt.state;
    const y=r=>TOP+r*RH+RH/2-6;
    const xs=c=>L0+c*CW;
    const P=(cond)=>on&&cond?' on':'';
    let s=`<svg class="ldr" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Linha de ladder">`;
    // trilhos
    s+=`<line class="rail${on?' on':''}" x1="${L0}" y1="${TOP-6}" x2="${L0}" y2="${H-2}"/>`;
    s+=`<line class="rail" x1="${W-14}" y1="${TOP-6}" x2="${W-14}" y2="${H-2}"/>`;
    // ligações verticais (fixas e editáveis)
    for(let c=1;c<=C;c++) for(let r=0;r<R-1;r++){
      const k=r+','+c, has=g.links.has(k), x=xs(c);
      const pw=on&&has&&v.node[r][c];
      if(has) s+=`<line class="w${pw?' on':''}" x1="${x}" y1="${y(r)}" x2="${x}" y2="${y(r+1)}"/>`;
      if(opt.edit && g.edLinks) s+=`<rect class="lk-hit${has?' set':''}" data-link="${k}" x="${x-9}" y="${y(r)+6}" width="18" height="${RH-12}" rx="4"><title>Ligar/desligar o ramo paralelo aqui</title></rect>`;
    }
    for(let r=0;r<R;r++){
      const yy=y(r);
      for(let c=0;c<C;c++){
        const it=g.cells[r][c], x0=xs(c), x1=x0+CW, ed=opt.edit&&g.ed.has(r+','+c);
        const pin=on&&v.node[r][c], pout=on&&v.pass[r][c];
        s+=`<g class="cell${ed?' ed':''}${opt.focus===r+','+c?' foc':''}${opt.bad&&opt.bad.has(r+','+c)?' bad':''}" ${ed?`data-cell="${r},${c}" tabindex="0" role="button" aria-label="Célula linha ${r+1} coluna ${c+1}: ${esc(label(it))}"`:''}>`;
        if(ed) s+=`<rect class="slot${it?' filled':''}" x="${x0+4}" y="${yy-30}" width="${CW-8}" height="60" rx="6"/>`;
        if(it){
          if(it.t==='W') s+=`<line class="w${P(pin)}" x1="${x0}" y1="${yy}" x2="${x1}" y2="${yy}"/>`;
          else {
            const a=x0+CW/2-13, b=x0+CW/2+13, closed=on&&v.closed[r][c];
            s+=`<line class="w${P(pin)}" x1="${x0}" y1="${yy}" x2="${a}" y2="${yy}"/><line class="w${P(pout)}" x1="${b}" y1="${yy}" x2="${x1}" y2="${yy}"/>`;
            s+=`<rect class="ct-bg${on&&closed?(pin?' on':' cl'):''}" x="${a}" y="${yy-15}" width="${b-a}" height="30"/>`;
            s+=`<line class="ct${on&&pout?' on':''}" x1="${a}" y1="${yy-15}" x2="${a}" y2="${yy+15}"/><line class="ct${on&&pout?' on':''}" x1="${b}" y1="${yy-15}" x2="${b}" y2="${yy+15}"/>`;
            if(it.t==='NC') s+=`<line class="ct${on&&pout?' on':''}" x1="${a+3}" y1="${yy+13}" x2="${b-3}" y2="${yy-13}"/>`;
            if(it.t==='P'||it.t==='N') s+=`<text class="ctl" x="${x0+CW/2}" y="${yy+5}">${it.t}</text>`;
            s+=`<text class="adr" x="${x0+CW/2}" y="${yy-21}">${esc(it.a||'???')}</text>`;
            const n=nm[it.a]; if(n) s+=`<text class="nm" x="${x0+CW/2}" y="${yy+29}">${esc(n.length>15?n.slice(0,14)+'…':n)}</text>`;
          }
        }else if(ed) s+=`<text class="plus" x="${x0+CW/2}" y="${yy+6}">+</text>`;
        s+='</g>';
      }
      // saída
      const o=g.out[r], x0=xs(C), ed=opt.edit&&g.ed.has(r+',o'), pw=on&&v.pow[r];
      s+=`<g class="cell out${ed?' ed':''}${opt.focus===r+',o'?' foc':''}${opt.bad&&opt.bad.has(r+',o')?' bad':''}" ${ed?`data-cell="${r},o" tabindex="0" role="button" aria-label="Saída da linha ${r+1}: ${esc(label(o))}"`:''}>`;
      if(ed) s+=`<rect class="slot${o?' filled':''}" x="${x0+4}" y="${yy-32}" width="${OW-8}" height="64" rx="6"/>`;
      if(o){
        const cx=x0+OW/2;
        if(['TON','TOF','CTU'].includes(o.t)){
          const bx=cx-38, a=(o.a||'').toUpperCase();
          let extra='';
          if(st){ if(o.t==='CTU'){ const k=st.ct[a]; extra=k?`${k.cv}/${o.v}`:`0/${o.v}`; } else { const t=st.tm[a]; extra=t?(t.acc/1000).toFixed(1)+'s':'0.0s'; } }
          const q=st&&on&&(o.t==='CTU'?st.ct[a]&&st.ct[a].q:st.tm[a]&&st.tm[a].q);
          s+=`<line class="w${P(pw)}" x1="${x0}" y1="${yy}" x2="${bx}" y2="${yy}"/>`;
          s+=`<rect class="box${pw?' on':''}${q?' q':''}" x="${bx}" y="${yy-28}" width="76" height="56" rx="4"/>`;
          s+=`<text class="bxt" x="${cx}" y="${yy-12}">${o.t} ${esc(o.a||'?')}</text>`;
          s+=`<text class="bxv" x="${cx}" y="${yy+4}">${o.t==='CTU'?'PV='+o.v:'PT='+o.v+' s'}</text>`;
          if(extra) s+=`<text class="bxa${q?' q':''}" x="${cx}" y="${yy+20}">${extra}${q?' ✓':''}</text>`;
          s+=`<line class="w" x1="${bx+76}" y1="${yy}" x2="${W-14}" y2="${yy}"/>`;
        }else{
          s+=`<line class="w${P(pw)}" x1="${x0}" y1="${yy}" x2="${cx-16}" y2="${yy}"/><line class="w" x1="${cx+16}" y1="${yy}" x2="${W-14}" y2="${yy}"/>`;
          s+=`<path class="coil${pw?' on':''}" d="M${cx-10} ${yy-16} Q${cx-20} ${yy} ${cx-10} ${yy+16} M${cx+10} ${yy-16} Q${cx+20} ${yy} ${cx+10} ${yy+16}"/>`;
          if(o.t!=='OUT') s+=`<text class="ctl" x="${cx}" y="${yy+5}">${o.t}</text>`;
          s+=`<text class="adr" x="${cx}" y="${yy-23}">${esc(o.a||'???')}</text>`;
          const n=nm[o.a]; if(n) s+=`<text class="nm" x="${cx}" y="${yy+31}">${esc(n.length>20?n.slice(0,19)+'…':n)}</text>`;
        }
      }else if(ed) s+=`<text class="plus" x="${x0+OW/2}" y="${yy+6}">+</text>`;
      s+='</g>';
    }
    s+='</svg>';
    return s;
  }

  return {CONTACTS, OUTS, TYPE_NAME, rung, parseItem, getCell, setCell, ansCell, same, label, newState, readBit, evalRung, scan, vizOnly,
    runTest, cloneRung, serialize, deserialize, blankRung, render, isTC};
})();
window.LD=LD;
