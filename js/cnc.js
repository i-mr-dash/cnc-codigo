/* =========================================================================
   CNC CÓDIGO — parser, simulador e corretor de blocos
   ========================================================================= */
'use strict';

const CNC = (()=>{

const TOL = 0.0005;
const NUM = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)';
const RE_SKIP  = /\s+/y;
const RE_KEY   = /(MCALL|REPEAT)\b/y;
const RE_CYCLE = /CYCLE\d+\s*\([^)]*\)/y;
const RE_COMMA = new RegExp(',\\s*([RC])\\s*('+NUM+')','y');
const RE_EQ    = new RegExp('([A-Z]{2,4})\\s*=\\s*('+NUM+')','y');
const RE_WORD  = new RegExp('([A-Z])\\s*('+NUM+')','y');
const RE_LABEL = /([A-Z]{3}):/y;

function cleanup(text){
  const comment=((text||'').match(/\(([^)]*)\)/)||[])[1]||'';
  let s=(text||'').toUpperCase().replace(/\([^)]*\)/g,' ').replace(/;.*$/,'').replace(/%/g,' ').trim().replace(/^\/\s*/,'');
  return {s, comment};
}

/* devolve {words:[{L,v,raw}], comment, err, n} */
function parse(text){
  const {s, comment}=cleanup(text);
  const out={words:[], comment, err:null, n:null, empty:!s};
  if(/[()]/.test(s)){ out.err='Parêntese sem par: comentário é <b>(assim)</b>, abrindo e fechando.'; return out; }
  let i=0;
  const at=re=>{ re.lastIndex=i; const m=re.exec(s); if(m) i=re.lastIndex; return m; };
  while(i<s.length){
    if(at(RE_SKIP)) continue;
    let m;
    if((m=at(RE_KEY)))   { out.words.push({L:m[1], v:null, raw:m[0]}); continue; }
    if((m=at(RE_CYCLE))) { out.words.push({L:'CYCLE', v:null, raw:m[0].replace(/\s+/g,'')}); continue; }
    if((m=at(RE_LABEL))) { out.words.push({L:'LBL', v:null, raw:m[1]}); continue; }
    if((m=at(RE_COMMA))) { out.words.push({L:','+m[1], v:+m[2], raw:m[0].replace(/\s+/g,'')}); continue; }
    if((m=at(RE_EQ)))    { out.words.push({L:m[1], v:+m[2], raw:m[0].replace(/\s+/g,'')}); continue; }
    if((m=at(RE_WORD)))  { out.words.push({L:m[1], v:+m[2], raw:m[1]+m[2]}); continue; }
    const c=s[i];
    if(/[A-Z]/.test(c)){
      const word=(s.slice(i).match(/^[A-Z]+/)||[c])[0];
      out.err = /^(CR|RND|CHF|AP|RP)$/.test(word) && /^\s*[\d.+-]/.test(s.slice(i+word.length))
        ? `<b>${word}</b> com número? Endereço de várias letras (Siemens) leva sinal de igual: <b>${word}=…</b> (ex.: RND=10.). No Fanuc cada palavra é UMA letra + número.`
        : word.length>1
        ? `Não entendi <b>${word}</b>: cada palavra é UMA letra seguida de um número (ex.: <b>G0</b>, <b>X20.</b>). Separe as letras.`
        : `A letra <b>${c}</b> está sem número. Toda palavra é letra + número (ex.: <b>${c}0</b>).`;
      return out;
    }
    if(c===',' && /\d/.test(s[i+1]||'')){ out.err='Vírgula no lugar do ponto? Em CNC o decimal é com <b>ponto</b>: <b>0.1</b>, não 0,1.'; return out; }
    if(c===','){ out.err='Vírgula solta. No Fanuc a vírgula só aparece em <b>,R</b> (arredondar) e <b>,C</b> (chanfrar).'; return out; }
    if(/[\d.+-]/.test(c)){ out.err='Tem número sem letra na frente. Todo número precisa de um endereço (X, Z, F…).'; return out; }
    out.err=`Caractere estranho: <b>${c.replace(/</g,'&lt;')}</b>.`; return out;
  }
  if(out.words.length && out.words[0].L==='N'){ out.n=out.words[0].v; out.words.shift(); }
  if(out.words.some(w=>w.L==='N')) out.err='O <b>N</b> (número do bloco) só pode vir no começo da linha.';
  return out;
}

/* agrupa palavras: G e M viram listas, o resto um valor só */
function group(words){
  const g={G:[], M:[], o:{}, dup:null, raw:[]};
  for(const w of words){
    if(w.L==='G') g.G.push(Math.round(w.v*10)/10);
    else if(w.L==='M') g.M.push(Math.round(w.v));
    else if(w.v===null) g.raw.push(w.raw);
    else { if(w.L in g.o && !g.dup) g.dup=w.L; g.o[w.L]=w.v; }
  }
  return g;
}

/* =========================================================================
   SIMULADOR
   lines: [{text, row, n}]  — machine: 'torno' | 'fresa'
   ========================================================================= */
const HOME = { torno:{x:null, z:null}, fresa:{z:100} };

function newState(machine){
  return { machine, x:null, y:0, z:null, home:true, mot:0, abs:true, unit:21,
    fmode: machine==='torno'?95:94, F:null, S:null, css:false, smax:null,
    spin:5, cool:false, tool:'', comp:40, plane:17, wcs:54, cyc:null, cycData:null,
    polar:false, shift:{x:0,y:0}, hlen:false, hidx:null, didx:null, ended:false, stop:'', dwell:0, prog:'',
    pend:{} };
}
const cloneSt = s => JSON.parse(JSON.stringify(s));

function simulate(lines, machine){
  const T = machine==='torno';
  const st=newState(machine);
  const segs=[], holes=[], shapes=[], errs=[], states={};
  const byN={}, byO={};
  lines.forEach((l,i)=>{
    l._p = l.raw ? {words:[],G:[],M:[],o:{},raw:[]} : parse(l.text);
    if(l._p.err && !l.raw) errs.push({row:l.row, msg:l._p.err});
    const n = l.n!=null ? l.n : l._p.n;
    if(n!=null) byN[n]=i;
    const o=(l._p.words||[]).find(w=>w.L==='O'); if(o) byO[Math.round(o.v)]=i;
  });

  const pos = () => ({x:st.x, y:st.y, z:st.z});
  let _fill=null; function pushFill(f){ _fill=f; }
  function push(kind, pts, row){ if(_fill && pts.length>1){ pts._fill=_fill; }  if(pts.length>1) segs.push({kind, pts, row, tool:st.tool, comp:st.comp, plane:st.plane, spin:st.spin, wcs:st.wcs, hlen:st.hlen, hidx:st.hidx, didx:st.didx, fill:_fill||undefined}); _fill=null; }

  /* ,R / ,C (Fanuc): arredonda/chanfra o canto entre o bloco que tem a vírgula e o próximo G1 */
  let cornerPend=null;
  function corner(segN, o){
    const s = segs.length>segN ? segs[segs.length-1] : null, c=cornerPend;
    cornerPend=null;
    if(c && s && s.kind!=='rapid' && st.plane===17){
      const a=c.seg, P=a.pts[a.pts.length-1], A=a.pts[a.pts.length-2], B=s.pts[s.pts.length-1];
      const l1=Math.hypot(A.x-P.x,A.y-P.y), l2=Math.hypot(B.x-P.x,B.y-P.y);
      if(l1>1e-6 && l2>1e-6 && Math.abs(A.z-P.z)<1e-6 && Math.abs(B.z-P.z)<1e-6 && Math.hypot(s.pts[0].x-P.x,s.pts[0].y-P.y)<1e-6){
        const e1={x:(A.x-P.x)/l1, y:(A.y-P.y)/l1}, e2={x:(B.x-P.x)/l2, y:(B.y-P.y)/l2};
        const th=Math.acos(Math.max(-1,Math.min(1,e1.x*e2.x+e1.y*e2.y)));
        const d = th>1e-3 && th<Math.PI-1e-3 ? (c.L===',C' ? c.v : c.v/Math.tan(th/2)) : 0;
        if(d>0 && d<l1+1e-6 && d<l2+1e-6){
          const T1={...P, x:P.x+e1.x*d, y:P.y+e1.y*d}, T2={...P, x:P.x+e2.x*d, y:P.y+e2.y*d}, mid=[];
          if(c.L===',R'){
            const bx=e1.x+e2.x, by=e1.y+e2.y, bl=Math.hypot(bx,by), h=c.v/Math.sin(th/2), C={x:P.x+bx/bl*h, y:P.y+by/bl*h};
            const a0=Math.atan2(T1.y-C.y,T1.x-C.x); let da=Math.atan2(T2.y-C.y,T2.x-C.x)-a0;
            while(da>Math.PI) da-=2*Math.PI; while(da<-Math.PI) da+=2*Math.PI;
            for(let k=1;k<12;k++){ const t=a0+da*k/12; mid.push({...P, x:C.x+c.v*Math.cos(t), y:C.y+c.v*Math.sin(t)}); }
          }
          a.pts.splice(a.pts.length-1, 1, T1, ...mid, T2);
          s.pts[0]={...T2};
        }
      }
    }
    if(!T && s && (',R' in o || ',C' in o)) cornerPend={seg:s, L:',R' in o?',R':',C', v:',R' in o?o[',R']:o[',C']};
  }

  function moveTo(t, kind, row){
    const a=pos();
    if(st.home || a.x===null || a.z===null){
      Object.assign(st, t);
      if(st.x!==null && st.z!==null){
        st.home=false;
        // saindo da referência: ao menos o ponto de chegada é conferido (G0 direto para dentro da peça = colisão)
        if(T) push(kind, [pos(), pos()], row);
      }
      return;
    }
    Object.assign(st, t);
    push(kind, [a, pos()], row);
  }

  function arcPts(a, b, cw, R, I, J, K, plane){
    // projeta para (u,v) conforme a máquina/plano
    let U,V,cu=null,cv=null;
    if(T){ U=p=>p.z; V=p=>p.x/2;
      if(I!=null||K!=null){ cu=a.z+(K||0); cv=a.x/2+(I||0); } }
    else if(plane===18){ U=p=>p.z; V=p=>p.x; if(I!=null||K!=null){ cu=a.z+(K||0); cv=a.x+(I||0);} }   // (Z,X) visto de +Y: G2 = horário
    else if(plane===19){ U=p=>p.y; V=p=>p.z; if(J!=null||K!=null){ cu=a.y+(J||0); cv=a.z+(K||0);} }
    else { U=p=>p.x; V=p=>p.y; if(I!=null||J!=null){ cu=a.x+(I||0); cv=a.y+(J||0);} }
    const au=U(a), av=V(a), bu=U(b), bv=V(b);
    if(cu===null){
      if(R==null) return null;
      const dx=bu-au, dy=bv-av, d=Math.hypot(dx,dy);
      if(d<1e-9 || Math.abs(R)*2 < d-1e-6) return null;
      const h=Math.sqrt(Math.max(0,R*R-d*d/4));
      let sgn = cw?1:-1; if(R<0) sgn=-sgn;
      cu=(au+bu)/2 + sgn*h*dy/d; cv=(av+bv)/2 - sgn*h*dx/d;
    }
    const r=Math.hypot(au-cu,av-cv);
    let a0=Math.atan2(av-cv,au-cu), a1=Math.atan2(bv-cv,bu-cu);
    if(cw){ while(a1>=a0-1e-9) a1-=2*Math.PI; } else { while(a1<=a0+1e-9) a1+=2*Math.PI; }
    if(Math.abs(Math.hypot(bu-cu,bv-cv)-r)>Math.max(0.05, r*0.02)) return {bad:true};
    const n=Math.max(8, Math.ceil(Math.abs(a1-a0)/(Math.PI/36)));
    const pts=[];
    for(let k=0;k<=n;k++){
      const t=a0+(a1-a0)*k/n, u=cu+r*Math.cos(t), v=cv+r*Math.sin(t), p={...a};
      if(T){ p.z=u; p.x=v*2; }
      else if(plane===18){ p.z=u; p.x=v; }
      else if(plane===19){ p.y=u; p.z=v; }
      else { p.x=u; p.y=v; }
      pts.push(p);
    }
    pts[pts.length-1]={...b};
    return {pts, c:{u:cu,v:cv}, r};
  }

  /* contorno entre N=P e N=Q para os ciclos do torno */
  function contour(P, Q){
    const i0=byN[P], i1=byN[Q];
    if(i0==null || i1==null || i1<i0) return null;
    const save=cloneSt(st), segStart=segs.length;
    for(let i=i0;i<=i1;i++) execLine(i, true);
    const cs=segs.splice(segStart);
    const after=cloneSt(st);
    Object.assign(st, save);
    return {segs:cs, end:after};
  }
  function polyOf(cs){
    const pts=[]; cs.forEach(s=>s.pts.forEach((p,k)=>{ if(k||!pts.length) pts.push(p); }));
    return pts;
  }

  /* passes de desbaste: cs = perfil A→B (sem o bloco P, que só leva do ponto de partida até A) */
  function lathePasses(kind, g, cs, row){
    const pts=polyOf(cs); if(pts.length<2) return;
    const sx=st.x, sz=st.z, base={row, tool:st.tool, spin:st.spin, comp:40, wcs:st.wcs};
    if(kind===71){
      const step=g.U1||1; let minR=Infinity; pts.forEach(p=>minR=Math.min(minR,p.x/2));
      for(let r=sx/2-step; r>minR+1e-6; r-=step){
        let zHit=null;
        for(let k=1;k<pts.length;k++){
          const a=pts[k-1], b=pts[k], ra=a.x/2, rb=b.x/2;
          if((ra-r)*(rb-r)<=0 && ra!==rb){ zHit=a.z+(b.z-a.z)*(r-ra)/(rb-ra); break; }
        }
        if(zHit===null) continue;
        // entra em rápido até o diâmetro do passe, corta até o perfil, recua a 45° e volta em rápido
        segs.push({kind:'rapid', pts:[{x:sx,y:0,z:sz},{x:r*2,y:0,z:sz}], ...base});
        segs.push({kind:'pass', pts:[{x:r*2,y:0,z:sz},{x:r*2,y:0,z:zHit},{x:r*2+2,y:0,z:zHit+1}], ...base});
        segs.push({kind:'rapid', pts:[{x:r*2+2,y:0,z:zHit+1},{x:r*2+2,y:0,z:sz},{x:sx,y:0,z:sz}], ...base});
      }
    }else{
      const step=g.W1||1; let minZ=Infinity, minX=Infinity;
      pts.forEach(p=>{ minZ=Math.min(minZ,p.z); minX=Math.min(minX,p.x); });
      for(let z=sz-step; z>minZ+1e-6; z-=step){
        let xHit=minX;
        for(let k=1;k<pts.length;k++){
          const a=pts[k-1], b=pts[k];
          if((a.z-z)*(b.z-z)<=0 && a.z!==b.z){ xHit=a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z); break; }
        }
        segs.push({kind:'rapid', pts:[{x:sx,y:0,z:sz},{x:sx,y:0,z}], ...base});
        segs.push({kind:'pass', pts:[{x:sx,y:0,z},{x:xHit,y:0,z},{x:xHit,y:0,z:z+1}], ...base});
        segs.push({kind:'rapid', pts:[{x:xHit,y:0,z:z+1},{x:sx,y:0,z:z+1},{x:sx,y:0,z:sz}], ...base});
      }
    }
  }

  function drillAt(row){
    const c=st.cycData; if(!c) return;
    holes.push({x:st.x, y:st.y, z:c.Z, g:st.cyc, row});
    const top=st.z??10, r=c.R??2, zb=c.Z??r;
    push('rapid',[{x:st.x,y:st.y,z:top},{x:st.x,y:st.y,z:r}],row);
    push('drill',[{x:st.x,y:st.y,z:r},{x:st.x,y:st.y,z:zb}],row);
    push('rapid',[{x:st.x,y:st.y,z:zb},{x:st.x,y:st.y,z:top}],row);
  }

  function execLine(i, inner){
    const l=lines[i], p=l._p, row=l.row;
    if(l.raw || p.err || p.empty) return;
    const g=group(p.words), o=g.o;
    if(g.raw.length && !g.G.length && !Object.keys(o).length) return;
    let oneShot=null, ref=false, mach=false, setMax=false;
    for(const G of g.G){
      if(G>=0 && G<=3) st.mot=G;
      else if(G===4) oneShot=4;
      else if(G===20||G===21) st.unit=G;
      else if(G===28) ref=true;
      else if(G>=40&&G<=42) st.comp=G;
      else if(G>=54&&G<=59) st.wcs=G;
      else if(G===90) st.abs=true; else if(G===91) st.abs=false;
      else if(G===94||G===95) st.fmode=G;
      else if(G===96) st.css=true; else if(G===97) st.css=false;
      else if(G===17||G===18||G===19) st.plane=G;
      else if(T && (G===92||G===50)) setMax=true;
      else if(T && G>=70 && G<=76) oneShot=G;
      else if(!T && G>=81 && G<=89){ st.cyc=G; }
      else if(!T && G===80){ st.cyc=null; st.cycData=null; }
      else if(!T && (G===71||G===72||G===12||G===13)) oneShot=G;
      else if(!T && G===16) st.polar=true; else if(!T && G===15) st.polar=false;
      else if(!T && G===52) oneShot=52;
      else if(!T && G===53) mach=true;
      else if(!T && G===43) st.hlen=true; else if(!T && G===49) st.hlen=false;
    }
    if('F' in o && !(T && oneShot===76)) st.F=o.F;
    if('S' in o){ if(setMax) st.smax=o.S; else st.S=o.S; }
    if('T' in o) st.tool = T ? String(Math.round(o.T)).padStart(4,'0') : String(Math.round(o.T)).padStart(2,'0');
    if(!T && 'H' in o){ if(Math.round(o.H)===0) st.hlen=false; else if(g.G.includes(43)) st.hidx=Math.round(o.H); }
    if(!T && 'D' in o) st.didx=Math.round(o.D);
    for(const M of g.M){
      if(M===3||M===4||M===5) st.spin=M;
      else if(M===13){ st.spin=3; st.cool=true; } else if(M===14){ st.spin=4; st.cool=true; }
      else if(M===8) st.cool=true; else if(M===9) st.cool=false;
      else if(M===0||M===1){ st.stop=M===0?'M0':'M1'; }
      else if(M===30||M===2){ st.spin=5; st.cool=false; if(!inner) st.ended=true; }
      else if(M===98 && 'P' in o && !inner){ callSub(o.P, row, o.L); }
    }
    if(oneShot===4){ st.dwell=('X' in o?o.X:('P' in o?o.P/1000:0)); return; }

    if(ref){
      if(T){ if('U' in o||'X' in o){ st.x=null; } if('W' in o||'Z' in o){ st.z=null; } st.home=true; }
      else { st.z=HOME.fresa.z; }
      return;
    }
    if(mach && 'Z' in o){ moveTo({z:HOME.fresa.z}, 'rapid', row); return; }

    if(T && oneShot){ latheCycle(oneShot, o, row); return; }
    if(!T && oneShot===52){ st.shift={x:o.X||0, y:o.Y||0}; return; }
    if(!T && (oneShot===71||oneShot===72)){
      const w=o.X||0, h=o.Y||0, cx=st.x, cy=st.y, z=st.z;
      shapes.push({kind:'rect', x:cx, y:cy, w, h, row});
      pushFill({kind:'rect', x:cx, y:cy, w, h, z});
      push('feed', [{x:cx-w/2,y:cy-h/2,z},{x:cx+w/2,y:cy-h/2,z},{x:cx+w/2,y:cy+h/2,z},{x:cx-w/2,y:cy+h/2,z},{x:cx-w/2,y:cy-h/2,z}], row);
      segs[segs.length-1].comp=41;   // D da bolsa: o centro da fresa anda por dentro da parede (percurso anti-horário)
      return;
    }
    if(!T && (oneShot===12||oneShot===13)){
      const r=('K' in o)?o.K:(o.I||0), cx=st.x, cy=st.y, z=st.z, pts=[];
      for(let k=0;k<=48;k++){ const t=k/48*2*Math.PI; pts.push({x:cx+r*Math.cos(t), y:cy+r*Math.sin(t), z}); }
      shapes.push({kind:'circle', x:cx, y:cy, r, row});
      pushFill({kind:'circle', x:cx, y:cy, r, z});
      push('feed', pts, row); segs[segs.length-1].comp=41; return;
    }

    // ciclo de furação da fresa: define e fura
    if(!T && st.cyc && g.G.some(G=>G>=81&&G<=89)){
      st.cycData={Z:o.Z, R:o.R, Q:o.Q, P:o.P};
    }

    // alvo
    const has = L => L in o;
    const anyAxis = T ? (has('X')||has('Z')||has('U')||has('W')) : (has('X')||has('Y')||has('Z'));
    if(!anyAxis) return;
    let t={};
    function polarXY(){   // G16: X = raio, Y = ângulo; o que faltar mantém o valor atual
      const r=has('X')?o.X:Math.hypot((st.x??0)-st.shift.x,st.y-st.shift.y);
      const ang=has('Y') ? o.Y*Math.PI/180 : Math.atan2(st.y-st.shift.y,(st.x??0)-st.shift.x);
      return {x:st.shift.x+r*Math.cos(ang), y:st.shift.y+r*Math.sin(ang)};
    }
    if(T){
      t.x = has('X') ? o.X : has('U') ? (st.x??0)+o.U : st.x;
      t.z = has('Z') ? o.Z : has('W') ? (st.z??0)+o.W : st.z;
      if(!st.abs){ if(has('X')) t.x=(st.x??0)+o.X; if(has('Z')) t.z=(st.z??0)+o.Z; }
    }else if(st.cyc){
      // com ciclo ativo, X/Y posicionam e furam; Z/R são do ciclo (com G16: furação em círculo, X=raio Y=ângulo)
      if(st.polar && st.plane===17) Object.assign(t, polarXY());
      else {
        t.x = has('X') ? (st.abs?st.shift.x+o.X:st.x+o.X) : st.x;
        t.y = has('Y') ? (st.abs?st.shift.y+o.Y:st.y+o.Y) : st.y;
      }
      if(st.x===null) st.x=t.x;
      moveTo({x:t.x,y:t.y}, 'rapid', row);
      drillAt(row); return;
    }else{
      if(st.polar && st.plane===17){
        Object.assign(t, polarXY());
      }else if(st.abs){
        t.x = has('X') ? st.shift.x+o.X : st.x;
        t.y = has('Y') ? st.shift.y+o.Y : st.y;
      }else{
        t.x = (st.x??0)+(o.X||0); t.y=st.y+(o.Y||0);
      }
      t.z = has('Z') ? (st.abs?o.Z:(st.z??0)+o.Z) : st.z;
      if(st.x===null && t.x!=null) st.x=t.x;
    }
    if(st.mot===2||st.mot===3){
      cornerPend=null;
      const a=pos();
      if(a.x===null || a.z===null || st.home){ moveTo(t,'feed',row); return; }
      const b={x:t.x??a.x, y:t.y??a.y, z:t.z??a.z};
      const R = has('R') ? o.R : null;
      const arc=arcPts(a,b, st.mot===2, R, o.I??null, o.J??null, o.K??null, st.plane);
      Object.assign(st,{x:b.x,y:b.y,z:b.z});
      if(!arc){ errs.push({row, msg:'Arco impossível: com esse raio os pontos não se alcançam.'}); push('feed',[a,b],row); }
      else if(arc.bad){ errs.push({row, msg:'O centro I/J/K não fica à mesma distância do início e do fim do arco.'}); push('feed',[a,b],row); }
      else push('arc', arc.pts, row);
      return;
    }
    const segN=segs.length;
    moveTo(t, st.mot===0?'rapid':'feed', row);
    if(!T) corner(segN, o);
  }

  function latheCycle(G, o, row){
    const start={x:st.x, z:st.z};
    if(G===71||G===72){
      if(!('P' in o)){ st.pend[G]={U1:o.U, W1:o.W, R:o.R}; return; }
      const c=contour(Math.round(o.P), Math.round(o.Q));
      if(!c){ errs.push({row, msg:`Não achei os blocos N${Math.round(o.P)} a N${Math.round(o.Q)} do perfil.`}); return; }
      if(byN[Math.round(o.P)] > curLine) skipTo = byN[Math.round(o.Q)];   // Fanuc: depois do ciclo segue após o bloco Q
      if(st.x!==null && st.z!==null && !st.home){
        const rowP=lines[byN[Math.round(o.P)]].row;
        lathePasses(G, st.pend[G]||{}, c.segs.filter(s=>s.row!==rowP), row);
        c.segs.forEach(s=>{ s.row=row; s.kind=s.kind==='rapid'?'rapid':'feed'; s.cyc=true; s.tool=st.tool; s.wcs=st.wcs; segs.push(s); });
      }
      return;
    }
    if(G===70){
      const c=contour(Math.round(o.P), Math.round(o.Q));
      if(!c){ errs.push({row, msg:`Não achei os blocos N${Math.round(o.P)} a N${Math.round(o.Q)} do perfil.`}); return; }
      if(st.x!==null && st.z!==null && !st.home)
        c.segs.forEach(s=>{ s.row=row; s.kind=s.kind==='rapid'?'rapid':'finish'; s.tool=st.tool; s.comp=st.comp; s.wcs=st.wcs; segs.push(s); });
      return;
    }
    if(st.x===null || st.z===null || st.home){ if(G===74||G===75||G===76){ st.pend[G]=o; } return; }
    if(G===74){
      if(!('Z' in o) && !('W' in o)){ st.pend[74]=o; return; }
      const zt='Z' in o?o.Z:st.z+o.W;
      push('drill',[{x:start.x,y:0,z:start.z},{x:start.x,y:0,z:zt}],row);
      push('rapid',[{x:start.x,y:0,z:zt},{x:start.x,y:0,z:start.z}],row);
      holes.push({x:start.x, z:zt, lathe:true, row});
      return;
    }
    if(G===75){
      if(!('X' in o) && !('U' in o)){ st.pend[75]=o; return; }
      const xt='X' in o?o.X:st.x+o.U;
      // com Z/W o G75 faz vários mergulhos, andando Q (mícrons) em Z entre eles
      const zt='Z' in o?o.Z:'W' in o?st.z+o.W:start.z, dz=zt-start.z;
      const step=Math.abs(o.Q)>0?o.Q/1000:Math.abs(dz)||1, nPl=Math.min(200, Math.ceil(Math.abs(dz)/step-1e-6));
      for(let k=0;k<=nPl;k++){
        const z=nPl? start.z+dz*Math.min(1,k*step/Math.abs(dz)) : start.z;
        push('groove',[{x:start.x,y:0,z},{x:xt,y:0,z}],row);
        push('rapid',[{x:xt,y:0,z},{x:start.x,y:0,z}],row);
      }
      if(nPl) push('rapid',[{x:start.x,y:0,z:zt},{x:start.x,y:0,z:start.z}],row);
      return;
    }
    if(G===76){
      if(!('X' in o) && !('U' in o)){ st.pend[76]=o; return; }
      const xt='X' in o?o.X:st.x+o.U, zt='Z' in o?o.Z:st.z+(o.W||0), pitch=o.F||1;
      // filete: altura P (mícrons) do 2º bloco, ou 0,6134 × passo; a crista não passa do ponto de partida
      const h=('P' in o && o.P>0) ? o.P/1000 : pitch*0.6134, crest=Math.min(start.x, xt+2*h), pts=[];
      for(let z=start.z, k=0; z>=zt-1e-6; z-=pitch/2, k++)
        pts.push({x: k%2 ? xt : crest, y:0, z});
      push('rapid',[{x:start.x,y:0,z:start.z},{x:xt+pitch,y:0,z:start.z}],row);
      push('thread', pts, row);
      push('rapid',[{x:xt,y:0,z:zt},{x:start.x,y:0,z:zt},{x:start.x,y:0,z:start.z}],row); segs[segs.length-1].safe=true;
      return;
    }
  }

  function callSub(P, row, L){
    const pn=Math.round(P), s=String(pn);
    const reps = Math.min(L!=null ? Math.max(1,Math.round(L)) : s.length>4 ? +s.slice(0,-4) : 1, 60), num=+s.slice(-4);   // P250002 ou P2 L25
    const i0=byO[num];
    if(i0==null){ errs.push({row, msg:`Subprograma O${String(num).padStart(4,'0')} não existe neste programa.`}); return; }
    const s0=segs.length;
    for(let r=0;r<reps;r++){
      for(let i=i0+1;i<lines.length;i++){
        const p=lines[i]._p; if(!p || p.err) continue;
        const gg=group(p.words||[]);
        if(gg.M.includes(99)) break;
        execLine(i, true);
      }
    }
    segs.slice(s0).forEach(sg=>sg.row=row);
  }

  let curLine=0, skipTo=null;
  for(let i=0;i<lines.length;i++){
    if(st.ended){ break; }
    st.stop=''; st.dwell=0; curLine=i;
    execLine(i, false);
    states[lines[i].row]=cloneSt(st);
    if(skipTo!=null){ i=skipTo; skipTo=null; }
  }
  return {segs, holes, shapes, errs, states, final:cloneSt(st), order:lines.filter(l=>l.row in states).map(l=>l.row)};
}

/* =========================================================================
   CORRETOR DE BLOCO
   ========================================================================= */
const G_GROUP = G => {
  if(G>=0&&G<=3) return 'mot'; if(G>=17&&G<=19) return 'plane'; if(G===20||G===21) return 'unit';
  if(G===90||G===91) return 'abs'; if(G===94||G===95) return 'feed'; if(G>=40&&G<=42) return 'comp';
  if(G===96||G===97) return 'css'; if(G>=54&&G<=59) return 'wcs'; if(G===15||G===16) return 'polar';
  if(G===43||G===49) return 'hlen';
  if((G>=70&&G<=89)||G===12||G===13) return 'cyc';
  return 'misc'+G;
};
const M_GROUP = M => ({3:'spin',4:'spin',5:'spin',13:'spin',14:'spin',8:'cool',9:'cool',0:'stop',1:'stop',2:'stop',30:'stop',98:'sub',99:'sub',6:'tool'}[M]||'m'+M);

const fmtN = v => { const r=Math.round(v*10000)/10000; return (Object.is(r,-0)?0:r).toString(); };
const near = (a,b) => Math.abs(a-b) < TOL;

function normRaw(s){
  return cleanup(s).s.replace(/\s+/g,'').replace(/(\d)\.(?![\d])/g,'$1').replace(/^N\d+/,'');
}

/* ctx: {mot, F} = estado modal ANTES deste bloco (do programa gabarito) */
function diffBlock(typedP, expText, ctx, opt){
  const e=group(parse(expText).words), t=group(typedP.words);
  const optSet=new Set(opt||[]);
  // modalidade: G0-3 e F iguais ao estado anterior são "redundantes", aceitos com ou sem
  const effMot = g => { const m=g.G.filter(G=>G>=0&&G<=3); return m.length? m[m.length-1] : (ctx?ctx.mot:null); };
  const res={missing:[], extra:[], wrong:[], score:0};
  const eG=e.G.filter(G=>!(G>=0&&G<=3)), tG=t.G.filter(G=>!(G>=0&&G<=3));
  const eMot=effMot(e), tMot=effMot(t);
  const motionMatters = e.G.some(G=>G>=0&&G<=3) || t.G.some(G=>G>=0&&G<=3);
  if(motionMatters && eMot!==tMot){
    const exExplicit=e.G.find(G=>G>=0&&G<=3);
    if(t.G.some(G=>G>=0&&G<=3)) res.wrong.push({L:'G', exp:exExplicit??eMot, got:tMot});
    else res.missing.push({L:'G', v:exExplicit});
  }
  // outros G como conjuntos, pareando por grupo
  const usedT=new Set();
  for(const G of eG){
    const k=tG.findIndex((x,i)=>!usedT.has(i)&&x===G);
    if(k>=0){ usedT.add(k); continue; }
    const k2=tG.findIndex((x,i)=>!usedT.has(i)&&G_GROUP(x)===G_GROUP(G));
    if(k2>=0){ usedT.add(k2); res.wrong.push({L:'G', exp:G, got:tG[k2]}); }
    else res.missing.push({L:'G', v:G});
  }
  tG.forEach((G,i)=>{ if(!usedT.has(i) && !optSet.has('G'+G)) res.extra.push({L:'G', v:G}); });
  // M
  const usedM=new Set();
  for(const M of e.M){
    const k=t.M.findIndex((x,i)=>!usedM.has(i)&&x===M);
    if(k>=0){ usedM.add(k); continue; }
    const k2=t.M.findIndex((x,i)=>!usedM.has(i)&&M_GROUP(x)===M_GROUP(M));
    if(k2>=0){ usedM.add(k2); res.wrong.push({L:'M', exp:M, got:t.M[k2]}); }
    else res.missing.push({L:'M', v:M});
  }
  t.M.forEach((M,i)=>{ if(!usedM.has(i) && !optSet.has('M'+M)) res.extra.push({L:'M', v:M}); });
  // endereços
  const keys=new Set([...Object.keys(e.o), ...Object.keys(t.o)]);
  for(const L of keys){
    const ev=e.o[L], tv=t.o[L];
    if(L==='F' && ctx && ctx.F!=null){
      const eF = ev ?? ctx.F, tF = tv ?? ctx.F;
      if(near(eF,tF)) continue;
      if(tv===undefined){ res.missing.push({L, v:ev}); continue; }
      res.wrong.push({L, exp:eF, got:tF}); continue;
    }
    if(ev===undefined){ if(!optSet.has(L)) res.extra.push({L, v:tv}); continue; }
    if(tv===undefined){ res.missing.push({L, v:ev}); continue; }
    if(!near(ev,tv)) res.wrong.push({L, exp:ev, got:tv});
  }
  // palavras "cruas" (Siemens) — compara texto
  const eR=e.raw.join(' '), tR=t.raw.join(' ');
  if(eR.replace(/\s/g,'')!==tR.replace(/\s/g,'')){
    if(eR && !tR) res.missing.push({L:'RAW', v:eR}); else if(!eR && tR) res.extra.push({L:'RAW', v:tR});
    else res.wrong.push({L:'RAW', exp:eR, got:tR});
  }
  if(t.dup) res.wrong.unshift({L:t.dup, dup:true});
  res.score = res.missing.length+res.extra.length+res.wrong.length*1.5;
  return res;
}

function wordTxt(L,v){
  if(L==='G') return 'G'+fmtN(v);
  if(L==='M') return 'M'+fmtN(v);
  if(L==='RAW') return v;
  if(L.length>1 && L[0]!==',') return L+'='+fmtN(v);
  return L+fmtN(v);
}

/* explica uma palavra em português, no contexto da máquina */
function explainWord(L, v, machine){
  if(L==='G'){ const i=gInfo(v,machine); return i?i.n:`G${fmtN(v)}: não existe ${machine==='torno'?'no torno Fanuc':'na fresa Fanuc'}`; }
  if(L==='M'){ const i=mInfo(v,machine); return i?i.n:`M${fmtN(v)}: código M desconhecido`; }
  if(machine==='torno' && L==='X') return `diâmetro ${fmtN(v)} mm`;
  if(L==='Z') return v===0?'na face (Z0)': v>0?`${fmtN(v)} mm FORA da peça`:`${fmtN(-v)} mm para dentro`;
  if(L==='F') return machine==='torno'?`avanço ${fmtN(v)} mm/rot`:`avanço ${fmtN(v)} mm/min`;
  if(L==='S') return `S${fmtN(v)}`;
  if(L==='T') return machine==='torno'?`ferramenta ${String(Math.round(v)).padStart(4,'0').slice(0,2)}, corretor ${String(Math.round(v)).padStart(4,'0').slice(2)}`:`ferramenta ${Math.round(v)}`;
  const a=addrInfo(L,machine); return a||'';
}

/* mensagem de diagnóstico (nível "o que está errado") */
function diagnose(row, typed, ctx, machine, lastExpX){
  const p=parse(typed);
  if(!typed.trim()) return {code:'vazio', msg:`O bloco <b>${row.n||''}</b> está vazio. Ele precisa: <i>${row.say}</i>`};
  if(p.err) return {code:'formato', msg:p.err};
  const tg=group(p.words);
  for(const G of tg.G) if(!gInfo(G,machine)) return {code:'naoexiste', msg:`<b>G${fmtN(G)}</b> não existe ${machine==='torno'?'no torno Fanuc deste jogo':'no Fanuc de centro de usinagem do livro'}. Confira o código na Cola.`};
  for(const M of tg.M) if(!mInfo(M,machine)) return {code:'naoexiste', msg:`<b>M${fmtN(M)}</b> não existe ${machine==='torno'?'no torno':'na fresa'} deste jogo.`};
  const variants=[row.code, ...(row.alt||[])];
  let best=null;
  for(const v of variants){ const d=diffBlock(p, v, ctx, row.opt); if(!best || d.score<best.score) best={...d, v}; }
  const d=best;
  const w=d.wrong[0], m=d.missing[0], x=d.extra[0];
  if(w && w.dup) return {code:'dup', msg:`A letra <b>${w.L}</b> aparece duas vezes no mesmo bloco. Cada endereço só pode aparecer uma vez.`};
  // R sem vírgula no Fanuc
  if(m && (m.L===',R'||m.L===',C') && x && x.L===m.L[1])
    return {code:'virgula', msg:`No Fanuc o canto automático leva <b>vírgula</b>: <b>${m.L}${fmtN(m.v)}</b>. Sem vírgula o ${m.L[1]} vira outra coisa.`};
  // contexto do bloco esperado (torno): qual ciclo / função ele usa
  const eb=group(parse(d.v).words), eg=eb.G, has=G=>eg.includes(G), T=machine==='torno';
  const cyc1 = (has(71)||has(72)) && !('P' in eb.o);          // 1º bloco do G71/G72
  if(T){
    if(has(28) && m && x && (m.L==='U'||m.L==='W') && x.L===(m.L==='U'?'X':'Z'))
      return {code:'g28', msg:`<b>G28 ${x.L}${fmtN(x.v)}</b> manda a ferramenta passar ANTES pelo ponto ${x.L}${fmtN(x.v)} (${x.L==='X'?'o centro da peça':'a face da peça'}!) e só depois ir para a referência. Com <b>${m.L}0.</b> ela "anda 0 daqui" e vai direto.`};
    if(cyc1 && m && x && ((m.L==='U'&&x.L==='W')||(m.L==='W'&&x.L==='U')))
      return {code:'troca', msg:`No 1º bloco do <b>G${has(71)?71:72}</b> a profundidade por passe vai em <b>${m.L}</b>: ${has(71)?'o G71 desce em X a cada passe (U, no raio)':'o G72 avança em Z a cada passe (W)'}.`};
    if((has(74)||has(75)) && m && x && ((m.L==='P'&&x.L==='Q')||(m.L==='Q'&&x.L==='P')))
      return {code:'troca', msg:`No <b>G${has(74)?74:75}</b> a bicada vai em <b>${m.L}</b> (${has(74)?'o G74 fura em Z → Q':'o G75 mergulha em X → P'}), em mícrons.`};
    const pair={U:'X',W:'Z',X:'U',Z:'W'};
    if(!has(28) && !eg.some(G=>G>=70&&G<=76) && m && x && pair[m.L]===x.L)
      return {code:'incr', msg: /[UW]/.test(m.L)
        ? `Este bloco pede <b>incremental</b>: <b>${m.L}</b> = quanto andar a partir de onde a ferramenta está (${m.L==='U'?'no diâmetro':'em Z'}), e não a posição final ${x.L}.`
        : `Este bloco pede a posição <b>absoluta</b> em <b>${m.L}</b> (medida a partir do zero-peça), e não o incremental ${x.L}.`};
  }
  if(w){
    if(w.L==='G'||w.L==='M'){
      const gi = w.L==='G'?gInfo(w.got,machine):mInfo(w.got,machine);
      const ei = w.L==='G'?gInfo(w.exp,machine):mInfo(w.exp,machine);
      const pre = `<b>${w.L}${fmtN(w.got)}</b> = ${gi?gi.n.toLowerCase():'?'}.`;
      let why='';
      if(w.L==='G' && w.exp===0 && w.got===1) why=' Este movimento é de aproximação/recuo, no ar — não está cortando.';
      else if(w.L==='G' && w.exp===1 && w.got===0) why=' Aqui a ferramenta está CORTANDO material: em rápido ela quebraria.';
      else if(w.L==='G' && ((w.exp===2&&w.got===3)||(w.exp===3&&w.got===2))) why= machine==='torno'
        ? ' Olhe o desenho com Z para a direita e X para cima: o arco gira no sentido do relógio ou ao contrário?'
        : ' Olhe a peça de cima (X para a direita, Y para cima): o arco gira no sentido do relógio ou ao contrário?';
      else if(w.L==='G' && ((w.exp===41&&w.got===42)||(w.exp===42&&w.got===41))) why=' Ande junto com a ferramenta no sentido do percurso: a peça fica de qual lado?';
      return {code:'troca', msg:`${pre} Este bloco pede: <b>${ei?ei.n.toLowerCase():'outro código do mesmo grupo'}</b>.${why}`};
    }
    if(w.L==='RAW') return {code:'geral', msg:`<b>${w.got}</b> não confere. Revise a sintaxe.`};
    const e=w.exp, g=w.got;
    if(T && has(4) && (w.L==='X'||w.L==='U'||w.L==='P')) return {code:'valor', msg: w.L==='P'
      ? `No <b>G4</b> o P é o tempo em <b>milésimos de segundo</b>, sem ponto: P1000 = 1 s.`
      : `No <b>G4</b> o ${w.L} é o tempo em <b>segundos</b> (aqui ${w.L} não é diâmetro): G4 X2. = 2 s.`};
    if(T && has(76) && !('X' in eb.o) && !('U' in eb.o) && w.L==='P') return {code:'valor', msg:'No 1º bloco do <b>G76</b> o P tem <b>6 dígitos</b>, de 2 em 2: passes de acabamento, chanfro de saída e ângulo da ferramenta. Ex.: P010060.'};
    if(T && has(76) && w.L==='F') return {code:'valor', msg:'No <b>G76</b> o F é o <b>PASSO</b> da rosca em mm (ex.: M20 x 1,5 → F1.5), não o avanço.'};
    if(T && cyc1 && w.L==='U') return {code:'valor', msg:'No 1º bloco do <b>G71</b> o U é a <b>profundidade de corte por passe</b>, medida no RAIO (não no diâmetro). Confira o enunciado.'};
    if(e!==0 && near(g,-e)) return {code:'sinal', msg:`O número de <b>${w.L}</b> está certo, mas o <b>sinal</b> está trocado. ${w.L==='Z'?'Para dentro da peça Z é negativo; fora dela (à direita da face / acima do topo) é positivo.':''}`};
    if(machine==='torno' && (w.L==='X'||w.L==='U') && e!==0 && near(g*2,e)) return {code:'raio', msg:`Você escreveu o <b>raio</b>. No torno ${w.L} é <b>diâmetro</b> — o dobro.`};
    if(machine==='torno' && (w.L==='X'||w.L==='U') && e!==0 && near(g,e*2)) return {code:'dobro', msg:`${w.L} ficou com o dobro. O desenho já mostra o <b>diâmetro</b> — não multiplique por 2.`};
    if(T && w.L==='I' && e!==0 && near(g,e*2)) return {code:'dobro', msg:'O <b>I</b> é medido no <b>RAIO</b> (diferente do X, que é diâmetro): é a metade da diferença de diâmetros entre o início e o centro.'};
    if(w.L==='F' && ctx && machine==='torno' && g>=10 && e<2) return {code:'feed', msg:`F${fmtN(g)} parece mm/min. No torno com <b>G95</b> o avanço é em <b>mm por rotação</b> (valores como 0.1, 0.2, 0.3).`};
    const eG=group(parse(d.v).words);
    if(eG.M.includes(98) && w.L==='P'){
      const pad=v=>String(Math.round(v)%10000).padStart(4,'0'), rep=v=>Math.floor(Math.round(v)/10000);
      if(pad(g)!==pad(e)) return {code:'sub', msg:`Os <b>4 últimos dígitos</b> do P são o número do subprograma: O${pad(e)} → P…<b>${pad(e)}</b>.`};
      return {code:'sub', msg:`O subprograma (…${pad(e)}) está certo, mas as <b>repetições</b> não: os dígitos ANTES dos 4 últimos dizem quantas vezes rodar — ${rep(e)} vezes = <b>P${rep(e)}${pad(e)}</b>.`};
    }
    if((eG.G.includes(4)||eG.G.includes(82)) && (w.L==='P'||w.L==='X')){
      if(w.L==='P' && near(g*1000,e)) return {code:'tempo', msg:`No ${eG.G.includes(82)?'G82':'G4'} o <b>P</b> é em <b>milésimos de segundo</b>, sem ponto: ${fmtN(g)} s = <b>P${fmtN(e)}</b>.`};
      if(w.L==='X' && near(g,e*1000)) return {code:'tempo', msg:`No G4 o <b>X</b> é em <b>segundos</b>: <b>X${fmtN(e)}</b>. (Em milésimos se usa o P: P${fmtN(g)}.)`};
    }
    if(w.L==='F' && eG.G.includes(4)) return {code:'tempo', msg:'No Fanuc a pausa do <b>G4</b> vai em <b>X</b> (segundos) ou <b>P</b> (milésimos). <b>F</b> é a pausa do Siemens — aqui F seria avanço.'};
    if(eG.G.includes(16) && (w.L==='X'||w.L==='Y')) return {code:'valor', msg:'Com <b>G16</b> (polar) o <b>X é o RAIO</b> e o <b>Y é o ÂNGULO</b> (graus, + anti-horário a partir do eixo X).'};
    if(w.L==='F' && machine==='fresa' && eG.G.includes(84)) return {code:'feed', msg:`No G84 (macho) o avanço tem que acompanhar a rosca: <b>F = rpm × passo</b>. F${fmtN(g)} não confere.`};
    if(w.L==='F' && machine==='fresa' && g<10 && e>=10) return {code:'feed', msg:`F${fmtN(g)} parece mm/rotação (torno). Na fresa, com <b>G94</b>, o avanço é em <b>mm por minuto</b> (valores como F150, F300).`};
    if((w.L==='Q'||w.L==='P') && near(g*1000,e)) return {code:'micron', msg:`Neste ciclo ${w.L} é em <b>mícrons</b>, sem ponto: ${fmtN(g)} mm = <b>${w.L}${fmtN(e)}</b>.`};
    if((w.L==='Q'||w.L==='P') && near(g,e*1000)) return {code:'micron', msg:`${w.L}${fmtN(g)} ficou mil vezes maior. Confira a unidade pedida no enunciado.`};
    if(w.L==='T' && machine==='torno' && near(g*100+g,e)) return {code:'tool', msg:'No torno o T tem <b>4 dígitos</b>: os 2 primeiros são a posição na torre, os 2 últimos o corretor. Ex.: T0101.'};
    return {code:'valor', msg:`<b>${w.L==='T'&&T?'T'+String(Math.round(g)).padStart(4,'0'):wordTxt(w.L,g)}</b> não confere com o pedido. Lembre: ${w.L} = ${addrInfo(w.L,machine)||w.L}. Releia o enunciado e os pontos do desenho.`};
  }
  if(m){
    if(m.L==='G'){ const i=gInfo(m.v,machine); return {code:'falta', msg:`Falta uma função G: este bloco precisa de <b>${i?i.n.toLowerCase():'um G'}</b>.`}; }
    if(m.L==='M'){ const i=mInfo(m.v,machine); return {code:'falta', msg:`Falta uma função M: <b>${i?i.n.toLowerCase():'um M'}</b>.`}; }
    if(m.L==='RAW') return {code:'falta', msg:'Falta a parte especial do comando (palavra-chave).'};
    return {code:'falta', msg:`Faltou o endereço <b>${m.L}</b> (${addrInfo(m.L,machine)||m.L}).`};
  }
  if(x){
    if(x.L==='G'||x.L==='M'){
      const i= x.L==='G'?gInfo(x.v,machine):mInfo(x.v,machine);
      return {code:'sobra', msg:`Sobrou <b>${x.L}${fmtN(x.v)}</b> (${i?i.n.toLowerCase():'?'}) — o enunciado deste bloco não pede isso.`};
    }
    return {code:'sobra', msg:`Sobrou <b>${wordTxt(x.L,x.v)}</b>: este bloco não pede ${addrInfo(x.L,machine)||x.L}.`};
  }
  return {code:'geral', msg:'Algo não confere neste bloco.'};
}

function checkRow(row, typed, ctx, machine){
  if(row.raw){
    const ok=[row.code,...(row.alt||[])].some(v=>normRaw(v)===normRaw(typed));
    return {ok, blank:!typed.trim()};
  }
  const p=parse(typed);
  if(!typed.trim()) return {ok:false, blank:true};
  if(p.err) return {ok:false};
  for(const v of [row.code,...(row.alt||[])]) if(diffBlock(p, v, ctx, row.opt).score===0) return {ok:true};
  return {ok:false};
}

/* torno: o significado de X/U/W/P/Q/R/S/F depende do G do bloco */
function latheWord(L, v, G, o){
  const has=g=>G.includes(g), f=fmtN(v), um=`${f} mícrons = ${fmtN(v/1000)} mm`;
  if(has(4)){ if(L==='X'||L==='U') return `pausa de ${f} segundo(s)`; if(L==='P') return `pausa de ${f} milésimos = ${fmtN(v/1000)} s`; }
  if(has(28) && (L==='U'||L==='W')) return `recolhe o ${L==='U'?'X':'Z'} direto para a referência (anda ${f} antes = sem ponto intermediário)`;
  if(L==='S'){ if(has(92)||has(50)) return `limite máximo de ${f} rpm`; if(has(96)) return `velocidade de corte ${f} m/min`; if(has(97)) return `${f} rpm fixas`; }
  if((has(2)||has(3)) && L==='R') return `raio do arco: ${f} mm`;
  if(has(70)||has(71)||has(72)){
    if(L==='P') return `1º bloco do perfil: N${f}`; if(L==='Q') return `último bloco do perfil: N${f}`;
    if(!('P' in o)){ if(L==='R') return `recuo de ${f} mm depois de cada passe`; if(L==='U') return `profundidade de ${f} mm por passe (no raio)`; if(L==='W') return `profundidade de ${f} mm por passe (em Z)`; }
    else { if(L==='U') return `sobremetal de ${f} mm no diâmetro para o acabamento`; if(L==='W') return `sobremetal de ${f} mm em Z para o acabamento`; }
  }
  if(has(74)||has(75)){
    if(L==='R') return `recuo de ${f} mm a cada bicada`;
    if(L==='Q') return has(74)?`bicada (em Z) de ${um}`:`deslocamento em Z entre mergulhos: ${um}`;
    if(L==='P') return has(75)?`bicada (em X) de ${um}`:`deslocamento em X entre furos: ${um}`;
    if(L==='Z' && has(74)) return `fundo do furo em Z${f}`;
    if(L==='X' && has(75)) return `fundo do canal: ø${f}`;
  }
  if(has(76)){
    if(!('X' in o) && !('U' in o)){
      const s=String(Math.round(v)).padStart(6,'0');
      if(L==='P') return `${s.slice(0,2)} = passe(s) de acabamento · ${s.slice(2,4)} = chanfro de saída (décimos do passo) · ${s.slice(4)} = ângulo da ferramenta (graus)`;
      if(L==='Q') return `passe mínimo ${um}`; if(L==='R') return `sobremetal de acabamento ${f} mm`;
    }else{
      if(L==='P') return `altura do filete ${um}`; if(L==='Q') return `profundidade do 1º passe ${um}`;
      if(L==='F') return `PASSO da rosca: ${f} mm`; if(L==='X') return `diâmetro do fundo da rosca: ø${f}`; if(L==='Z') return `fim da rosca em Z${f}`;
    }
  }
  if(L==='U') return `incremental em X: ${v<0?'diminui':'aumenta'} ${fmtN(Math.abs(v))} mm no diâmetro`;
  if(L==='W') return `incremental em Z: anda ${fmtN(Math.abs(v))} mm para a ${v<0?'esquerda (rumo à placa)':'direita (afasta da placa)'}`;
  return null;
}

/* explica um bloco inteiro palavra por palavra */
function explainBlock(text, machine){
  const p=parse(text);
  if(p.err) return [p.err];
  const out=[], gr=group(p.words), T=machine==='torno', multi=machine==='multi', m=multi?'fresa':machine;   // 'multi' = fase do tradutor (Siemens / Mach 9)
  const dwell=p.words.some(w=>w.L==='G' && Math.round(w.v)===4);
  const PAUSA={X:'s (Fanuc)', P:'ms (Fanuc)', F:'s (Siemens)', D:'s (Mach 9)'};
  for(const w of p.words){
    if(w.v===null){ out.push(`<b>${w.raw}</b>`); continue; }
    const t= T && w.L==='T' ? 'T'+String(Math.round(w.v)).padStart(4,'0')
      : T && w.L==='P' && gr.G.includes(76) && !('X' in gr.o) && !('U' in gr.o) ? 'P'+String(Math.round(w.v)).padStart(6,'0')
      : wordTxt(w.L,w.v);
    const e= dwell && PAUSA[w.L] ? `pausa de ${fmtN(w.v)} ${PAUSA[w.L]}`
      : multi && w.L==='G' && w.v===71 ? 'milímetros (Siemens / Mach 9 — no Fanuc é G21)'
      : (T && latheWord(w.L,w.v,gr.G,gr.o)) || explainWord(w.L,w.v,m);
    out.push(`<b>${t}</b> → ${e}`);
  }
  if(p.comment) out.push(`<b>(${p.comment})</b> → comentário, a máquina ignora`);
  return out;
}

/* esqueleto para dica: "G__ X__ Z__" */
function skeleton(code, showCodes){
  const p=parse(code);
  return p.words.map(w=>{
    if(w.v===null) return w.raw;
    if(showCodes && (w.L==='G'||w.L==='M')) return wordTxt(w.L,w.v);
    const L=w.L.length>1&&w.L[0]!==','?w.L+'=':w.L;
    return L+'__';
  }).join(' ');
}

/* sem ponto decimal em inteiro de coordenada? (aviso de oficina) */
function missingDot(text){
  const p=parse(text); if(p.err) return false;
  return p.words.some(w=>/^[XYZUWIJKR]$/.test(w.L) && w.v!==0 && Number.isInteger(w.v) && !/\./.test(w.raw));
}

return {parse, group, simulate, diagnose, checkRow, explainBlock, skeleton, fmtN, missingDot, normRaw, wordTxt};
})();
