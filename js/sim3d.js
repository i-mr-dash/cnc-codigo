/* =========================================================================
   CNC CÓDIGO — simulador 3D (three.js)
   Torno: sólido de revolução com remoção de material por fatias em Z.
   Fresa: mapa de alturas sobre o bloco.
   As ferramentas vêm da tabela da torre/magazine (tipo, dimensões, corretor).
   ========================================================================= */
'use strict';

const Sim3D = (()=>{
let ok=false, el=null, renderer, scene, camera;
let machine='torno', part=null, res=null, rowState={}, order=[];
let world, partGroup, partMesh=null, toolGroup, toolModel=null, spinAngle=0;
let M=null;
let anim=null, onTick=()=>{}, onDone=()=>{}, onStop=()=>{};
let alarms=[];
let getTool=()=>null;
const opts={single:false, optStop:false, dry:false, feedOvr:1, rapidOvr:1};
const cam={yaw:0.42, pitch:0.32, dist:180, tx:0, ty:0, tz:0};
let dirty=true;

/* ---------------- ferramentas ---------------- */
const LATHE_KIND = {desb:'turn', acab:'turn', rosca:'turn', bedame:'groove', broca:'drill', centro:'drill', interno:'bore'};
function toolOf(code){ return code ? getTool(code) : null; }
function latheKindOf(t){ return t ? (LATHE_KIND[t.type]||'turn') : 'turn'; }
/* ligação com o painel (zero-peça + corretores): o painel diz o quanto a ferramenta REAL está deslocada da posição comandada */
let shiftFn=()=>null, compFn=()=>null, homeFn=null, carved=0, shiftAlarmed={}, toolPhys=null, ideal=false;   // ideal = prévia sem erro de zero-peça

/* ---------------- material: torno ---------------- */
const DZ=0.25;
function latheModel(p){
  const D=(p&&p.stock?p.stock[0]:40), L=(p&&p.stock?p.stock[1]:50), face=(p&&p.face)||0;
  const n=Math.ceil((face+L)/DZ);
  return {type:'torno', D, L, z0:face, n, rOut:new Float32Array(n).fill(D/2), rIn:new Float32Array(n)};
}
const zIdx = z => Math.floor((M.z0 - z)/DZ);
const cellRange = (za, zb) => [Math.max(0,Math.ceil((M.z0-zb)/DZ-0.5)), Math.min(M.n-1,Math.floor((M.z0-za)/DZ-0.5))];
function carveLathe(x, z, kind, t){
  const r=Math.max(0,x/2);
  if(kind==='drill'){
    const dr=(t&&t.d?t.d:4)/2;
    const [i0,i1]=cellRange(z, M.z0+5);
    for(let k=i0;k<=i1;k++) if(M.rOut[k]>0 && M.rIn[k]<dr){ M.rIn[k]=Math.min(dr, M.rOut[k]); carved++; }
    return;
  }
  if(kind==='bore'){
    const [i0,i1]=cellRange(z, z+1);
    for(let k=i0;k<=i1;k++) if(r>M.rIn[k] && M.rIn[k]>0){ M.rIn[k]=Math.min(r, M.rOut[k]); carved++; }
    return;
  }
  const w = kind==='groove' ? (t&&t.w?t.w:3) : 1.0;
  const [i0,i1] = kind==='groove' ? cellRange(z-w, z) : cellRange(z, z+w);
  for(let k=i0;k<=i1;k++) if(M.rOut[k]>r){ M.rOut[k]=r; if(M.rIn[k]>r) M.rIn[k]=r; carved++; }
}
function latheInside(x,z,kind,t){
  if(kind==='groove'){ const w=(t&&t.w)||3; return latheInside1(x,z-0.3) || latheInside1(x,z-w+0.3); }
  if(kind==='drill'){ const dr=(t&&t.d?t.d:4)/2; const i=zIdx(z+0.3); if(i<0||i>=M.n) return false; return M.rOut[i]>0.01 && M.rIn[i] < dr-0.3; }
  return latheInside1(x,z);
}
function latheInside1(x,z){
  if(z > M.z0-0.05) return false;
  const i=zIdx(z); if(i<0||i>=M.n) return false;
  const r=x/2; return r < M.rOut[i]-0.3 && r > M.rIn[i]+0.05;
}

/* ---------------- material: fresa ---------------- */
function millModel(p){
  const s=(p&&p.stock)||[0,0,100,60];
  const x0=s[0], y0=s[1], w=s[2]-s[0], h=s[3]-s[1];
  const cell=Math.max(0.5, Math.max(w,h)/150);
  const nx=Math.max(2,Math.round(w/cell)+1), ny=Math.max(2,Math.round(h/cell)+1);
  return {type:'fresa', x0, y0, w, h, nx, ny, cx:w/(nx-1), cy:h/(ny-1), hgt:new Float32Array(nx*ny), T:(p&&p.thick)||20, holes:(p&&p.holes)||[]};
}
function carveMill(x,y,z,rad){
  if(z>=0) return;
  const i0=Math.max(0,Math.floor((x-rad-M.x0)/M.cx)), i1=Math.min(M.nx-1,Math.ceil((x+rad-M.x0)/M.cx));
  const j0=Math.max(0,Math.floor((y-rad-M.y0)/M.cy)), j1=Math.min(M.ny-1,Math.ceil((y+rad-M.y0)/M.cy));
  const r2=rad*rad, zz=Math.max(z,-M.T);
  for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
    const px=M.x0+i*M.cx-x, py=M.y0+j*M.cy-y;
    if(px*px+py*py<=r2){ const k=j*M.nx+i; if(M.hgt[k]>zz){ M.hgt[k]=zz; carved++; } }
  }
}
function millInside(x,y,z,rad){
  if(z>=-0.05) return false;
  if(x<M.x0-rad||x>M.x0+M.w+rad||y<M.y0-rad||y>M.y0+M.h+rad) return false;
  const i=Math.round((x-M.x0)/M.cx), j=Math.round((y-M.y0)/M.cy);
  if(i<0||j<0||i>=M.nx||j>=M.ny) return false;
  return M.hgt[j*M.nx+i] > Math.max(z,-M.T)+0.3;
}
function fillMill(f){
  for(let j=0;j<M.ny;j++) for(let i=0;i<M.nx;i++){
    const x=M.x0+i*M.cx, y=M.y0+j*M.cy;
    const inside = f.kind==='rect' ? Math.abs(x-f.x)<=f.w/2 && Math.abs(y-f.y)<=f.h/2 : Math.hypot(x-f.x,y-f.y)<=f.r;
    if(inside){ const k=j*M.nx+i; M.hgt[k]=Math.min(M.hgt[k], Math.max(f.z??-5,-M.T)); }
  }
}
function millRad(t, seg){
  if(t && t.d) return t.d/2;
  if(seg && seg.kind==='drill'){
    const p=seg.pts[0]; let best=null, bd=1e9;
    (M.holes||[]).forEach(h=>{ const d=Math.hypot(h[0]-p.x,h[1]-p.y); if(d<bd){bd=d;best=h;} });
    if(best && bd<1) return best[2]/2;
  }
  return 5;
}

/* ---------------- aplica um ponto do percurso ---------------- */
function alarm(row,msg){ if(!alarms.some(a=>a.row===row&&a.msg===msg)) alarms.push({row,msg}); }
function applyPoint(seg, p0, prev){
  const t=toolOf(seg.tool);
  if(seg.tool && !t){   // sem ferramenta não corta — e o recuo em G0 de um furo "não feito" não é colisão
    if(seg.kind!=='rapid') alarm(seg.row, `FERRAMENTA T${String(seg.tool).slice(0,2)} NÃO ESTÁ MONTADA (veja FERRAMENTAS)`); return null; }
  const sh = (seg.phys||ideal) ? null : shiftFn(seg);
  const dx=sh?sh.x:0, dy=sh?sh.y:0, dz=sh?sh.z:0;
  if(sh && seg.row>=0 && seg.kind!=='rapid' && !shiftAlarmed[seg.tool] && (Math.abs(dx)>0.3||Math.abs(dy)>0.3||Math.abs(dz)>0.3)){
    shiftAlarmed[seg.tool]=1;
    const f=v=>(Math.round(v*10)/10).toString();
    alarm(seg.row, machine==='torno'
      ? `T${seg.tool} FORA DO LUGAR: ΔX ${f(dx)} · ΔZ ${f(dz)} mm — zero-peça/corretor não conferem com a ferramenta (meça em OFFSET)`
      : `T${seg.tool} FORA DO LUGAR: ΔX ${f(dx)} · ΔY ${f(dy)} · ΔZ ${f(dz)} mm — zero-peça (G54)/corretor H não conferem (meça em OFFSET)`); }
  const p={x:p0.x+dx, y:(p0.y||0)+dy, z:p0.z+dz};
  if(machine==='torno'){
    let kind = seg.kind==='rapid' ? 'rapid' : seg.kind==='drill' ? 'drill' : seg.kind==='groove' ? 'groove' : latheKindOf(t);
    const tk=latheKindOf(t);
    // o 1º ponto do G0 é onde a ferramenta já está (fim do corte anterior): não conta como colisão
    if(kind==='rapid'){ if(!seg.safe && prev && latheInside(p.x,p.z,tk,t)) alarm(seg.row,'COLISÃO: AVANÇO RÁPIDO (G0) DENTRO DO MATERIAL'); return p; }
    if(kind==='turn' && tk!=='turn') kind=tk;                 // broca/bedame chamados em G1 comum
    if(kind==='groove' && tk==='drill') kind='drill';
    if(latheInside(p.x,p.z,kind,t) && seg.spin===5) alarm(seg.row,'CORTE COM O FUSO PARADO (faltou M3)');
    carveLathe(p.x, p.z, kind, t);
    return p;
  }
  const rad=millRad(t,seg);
  let x=p.x, y=p.y;
  if((seg.comp===41||seg.comp===42) && (seg.plane||17)===17 && seg.kind!=='drill' && seg.kind!=='rapid'){
    const cr = ideal ? null : compFn(seg); const cRad = cr==null ? rad : cr;   // raio gravado no corretor D (pode estar errado/zerado); na prévia ideal usa o raio real
    if(cr===0 && seg.row>=0 && !shiftAlarmed['D'+seg.didx]){ shiftAlarmed['D'+seg.didx]=1; alarm(seg.row, `COMPENSAÇÃO COM D${seg.didx==null?'':String(seg.didx).padStart(2,'0')} ZERADO: grave o raio da fresa no corretor (OFFSET → D)`); }
    // 1º ponto do bloco: usa a direção do próprio bloco (senão a fresa ficaria centrada no canto e morderia a peça)
    const q=prev||seg.pts[0], r=prev?p0:(seg.pts[1]||p0);
    const ddx=r.x-q.x, ddy=r.y-q.y, d=Math.hypot(ddx,ddy);
    if(d>1e-6){ const sg=seg.comp===41?1:-1; x+=-ddy/d*cRad*sg; y+=ddx/d*cRad*sg; }
  }
  const ph={x,y,z:p.z};
  if(seg.kind==='rapid'){ if(millInside(x,y,p.z,rad*0.8)) alarm(seg.row,'COLISÃO: AVANÇO RÁPIDO (G0) DENTRO DO MATERIAL'); return ph; }
  if((seg.fill ? p.z<0 : millInside(x,y,p.z,rad*0.8)) && seg.spin===5) alarm(seg.row,'CORTE COM O FUSO PARADO (faltou M3)');
  if(!seg.fill) carveMill(x,y,p.z,rad);          // bolsa (G71/G72/G12/G13): o fillMill já tirou o material na medida
  return ph;
}
function samples(seg, step){
  const out=[], P=seg.pts;
  for(let k=1;k<P.length;k++){
    const a=P[k-1], b=P[k];
    const L=Math.hypot((b.x-a.x)/(machine==='torno'?2:1), (b.y||0)-(a.y||0), b.z-a.z);
    const n=Math.max(1,Math.ceil(L/step));
    for(let s=(k===1?0:1); s<=n; s++){ const q=s/n; out.push({x:a.x+(b.x-a.x)*q, y:(a.y||0)+((b.y||0)-(a.y||0))*q, z:a.z+(b.z-a.z)*q}); }
  }
  return out;
}

/* ---------------- cena ---------------- */
function init(container){
  el=container;
  if(!window.THREE) return false;
  try{ renderer=new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true}); }catch(e){ return false; }
  ok=true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  el.appendChild(renderer.domElement);
  scene=new THREE.Scene(); scene.background=new THREE.Color('#1b2330');
  look();
  camera=new THREE.PerspectiveCamera(38,1,0.5,4000);
  scene.add(new THREE.HemisphereLight(0xe6eeff,0x2a3038,0.55));
  const d1=new THREE.DirectionalLight(0xfff6ea,0.95); d1.position.set(80,140,120); scene.add(d1);   /* luz principal, levemente quente */
  const d2=new THREE.DirectionalLight(0x9fc3ff,0.45); d2.position.set(-120,60,-80); scene.add(d2);  /* contraluz fria: recorta o perfil */
  const d3=new THREE.DirectionalLight(0xffffff,0.25); d3.position.set(0,-80,140); scene.add(d3);    /* preenchimento por baixo */
  world=new THREE.Group(); scene.add(world);
  bindControls();
  new ResizeObserver(resize).observe(el);
  resize(); loop();
  return true;
}
/* aparência: fundo em degradê (cabine da máquina) + ambiente de estúdio para o metal refletir */
function look(){
  try{
    const cv=document.createElement('canvas'); cv.width=4; cv.height=256;
    const g=cv.getContext('2d'), gr=g.createLinearGradient(0,0,0,256);
    gr.addColorStop(0,'#2a3546'); gr.addColorStop(0.55,'#1b2330'); gr.addColorStop(1,'#11161e');
    g.fillStyle=gr; g.fillRect(0,0,4,256);
    scene.background=new THREE.CanvasTexture(cv);
    if(THREE.PMREMGenerator){
      const ec=document.createElement('canvas'); ec.width=256; ec.height=128;
      const e=ec.getContext('2d'), eg=e.createLinearGradient(0,0,0,128);
      eg.addColorStop(0,'#c9d6e6'); eg.addColorStop(0.45,'#5a6676'); eg.addColorStop(0.5,'#3a4452'); eg.addColorStop(1,'#14181e');
      e.fillStyle=eg; e.fillRect(0,0,256,128);
      e.fillStyle='rgba(255,255,255,.9)'; e.fillRect(40,18,70,14); e.fillRect(150,26,60,10);   /* "softboxes" que viram brilho no aço */
      const tex=new THREE.CanvasTexture(ec); tex.mapping=THREE.EquirectangularReflectionMapping;
      const pm=new THREE.PMREMGenerator(renderer);
      scene.environment=pm.fromEquirectangular(tex).texture; tex.dispose(); pm.dispose();
    }
  }catch(e){}
}
function floorGrid(y,cx,cz,size){
  const g=new THREE.GridHelper(size, Math.round(size/10), 0x3a4a60, 0x253041);
  g.position.set(cx,y,cz); g.material.transparent=true; g.material.opacity=0.55; g.material.depthWrite=false;
  world.add(g);
}
function resize(){ if(!ok) return; const w=el.clientWidth||400, h=el.clientHeight||300; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); dirty=true; }
function panView(dx,dy){      // arrasta a vista no plano da tela (direita/esquerda/cima/baixo), qualquer que seja o ângulo
  const k=cam.dist/600, cy=Math.cos(cam.yaw), sy=Math.sin(cam.yaw), sp=Math.sin(cam.pitch), cp=Math.cos(cam.pitch);
  cam.tx+=-dx*k*cy+dy*k*(-sp*sy); cam.ty+=dy*k*cp; cam.tz+=dx*k*sy+dy*k*(-sp*cy);
  dirty=true;
}
let follow=false;
function buildCamPad(){
  const host=el.parentElement||el; if(host.querySelector('.cam-pad')) return;
  const pad=document.createElement('div'); pad.className='cam-pad'; pad.setAttribute('role','group'); pad.setAttribute('aria-label','Câmera');
  pad.innerHTML='<button data-c="up" title="Subir a vista (seta ↑)">▲</button><button data-c="in" title="Aproximar (+)">＋</button>'+
    '<button data-c="left" title="Vista para a esquerda (seta ←)">◀</button><button data-c="fol" title="Seguir a ferramenta" aria-pressed="false">🎯</button><button data-c="right" title="Vista para a direita (seta →)">▶</button>'+
    '<button data-c="down" title="Descer a vista (seta ↓)">▼</button><button data-c="out" title="Afastar (−)">－</button>';
  host.appendChild(pad);
  const act=c=>{ const st=26;
    if(c==='up') panView(0,-st); else if(c==='down') panView(0,st); else if(c==='left') panView(-st,0); else if(c==='right') panView(st,0);
    else if(c==='in'){ cam.dist=Math.max(20,cam.dist*0.9); dirty=true; } else if(c==='out'){ cam.dist=Math.min(1500,cam.dist*1.1); dirty=true; } };
  pad.querySelectorAll('button').forEach(b=>{
    const c=b.dataset.c; let iv=null;
    if(c==='fol'){ b.onclick=()=>{ follow=!follow; b.setAttribute('aria-pressed',follow); b.classList.toggle('on',follow); dirty=true; }; return; }
    const stop=()=>{ clearInterval(iv); iv=null; };
    b.addEventListener('pointerdown',e=>{ e.preventDefault(); act(c); stop(); iv=setInterval(()=>act(c),70); });
    ['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,stop));
  });
  let hover=false; host.addEventListener('mouseenter',()=>hover=true); host.addEventListener('mouseleave',()=>hover=false);
  addEventListener('keydown',e=>{
    if(!hover||/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')||e.ctrlKey||e.metaKey||e.altKey) return;
    const m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right','+':'in','=':'in','-':'out'}[e.key];
    if(m){ e.preventDefault(); act(m); }
  });
}
function bindControls(){
  const c=renderer.domElement, pts=new Map(); let pinch0=0, dist0=0;
  c.style.touchAction='none';
  c.addEventListener('pointerdown',e=>{ c.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2){ const [a,b]=[...pts.values()]; pinch0=Math.hypot(a.x-b.x,a.y-b.y); dist0=cam.dist; } });
  c.addEventListener('pointermove',e=>{
    const p=pts.get(e.pointerId); if(!p) return;
    if(pts.size===2){ p.x=e.clientX; p.y=e.clientY; const [a,b]=[...pts.values()];
      const d=Math.hypot(a.x-b.x,a.y-b.y); if(pinch0) cam.dist=Math.max(20,Math.min(1500,dist0*pinch0/d)); dirty=true; return; }
    const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
    if(e.shiftKey||e.buttons===4||e.buttons===2){ panView(dx,dy); }
    else { cam.yaw-=dx*0.008; cam.pitch=Math.max(-1.45,Math.min(1.45,cam.pitch+dy*0.008)); }
    dirty=true;
  });
  const up=e=>{ pts.delete(e.pointerId); pinch0=0; };
  c.addEventListener('pointerup',up); c.addEventListener('pointercancel',up);
  c.addEventListener('wheel',e=>{ e.preventDefault(); cam.dist=Math.max(20,Math.min(1500,cam.dist*(e.deltaY>0?1.1:0.9))); dirty=true; },{passive:false});
  c.addEventListener('dblclick',()=>{ frame(); dirty=true; });
  buildCamPad();
  c.addEventListener('contextmenu',e=>e.preventDefault());
}
function placeCamera(){
  const cp=Math.cos(cam.pitch);
  camera.position.set(cam.tx+cam.dist*cp*Math.sin(cam.yaw), cam.ty+cam.dist*Math.sin(cam.pitch), cam.tz+cam.dist*cp*Math.cos(cam.yaw));
  camera.lookAt(cam.tx,cam.ty,cam.tz);
}
function frame(){
  if(machine==='torno'){ const L=M.L, D=M.D; cam.tx=-L/2+12; cam.ty=4; cam.tz=0; cam.dist=Math.max(130, L*2.2+D*1.3); cam.yaw=0.42; cam.pitch=0.32; }
  else { cam.tx=M.x0+M.w/2; cam.ty=-5; cam.tz=-(M.y0+M.h/2); cam.dist=Math.max(150,Math.max(M.w,M.h)*2.0); cam.yaw=-0.35; cam.pitch=0.72; }
}
const MAT={};
function mats(){
  if(MAT.steel) return;
  MAT.steel=new THREE.MeshStandardMaterial({color:0xc3cbd4, metalness:0.7, roughness:0.28, envMapIntensity:0.9, side:THREE.DoubleSide});
  MAT.alu=new THREE.MeshStandardMaterial({color:0xd2d9e0, metalness:0.5, roughness:0.5, envMapIntensity:0.55, side:THREE.DoubleSide});
  MAT.cut=new THREE.MeshStandardMaterial({vertexColors:true, metalness:0.6, roughness:0.42, envMapIntensity:0.55, side:THREE.DoubleSide});
  MAT.dark=new THREE.MeshStandardMaterial({color:0x434d5a, metalness:0.45, roughness:0.55, envMapIntensity:0.6});
  MAT.jaw=new THREE.MeshStandardMaterial({color:0x6a7482, metalness:0.7, roughness:0.35});
  MAT.hold=new THREE.MeshStandardMaterial({color:0xffb020, metalness:0.3, roughness:0.45});
  MAT.ins=new THREE.MeshStandardMaterial({color:0x22262c, metalness:0.7, roughness:0.3});
  MAT.gold=new THREE.MeshStandardMaterial({color:0xd9b44a, metalness:0.8, roughness:0.25});
  MAT.hss=new THREE.MeshStandardMaterial({color:0x8d98a5, metalness:0.85, roughness:0.25});
  MAT.cool=new THREE.MeshBasicMaterial({color:0x43d0ff, transparent:true, opacity:0.55});
  MAT.rapid=new THREE.LineDashedMaterial({color:0xffb020, dashSize:2, gapSize:2});
  MAT.feed=new THREE.LineBasicMaterial({color:0x43d0ff});
  MAT.carb=new THREE.MeshStandardMaterial({color:0x2d3138, metalness:0.5, roughness:0.3});
  MAT.tin=new THREE.MeshStandardMaterial({color:0xd4a93c, metalness:0.85, roughness:0.28});
  MAT.body=new THREE.MeshStandardMaterial({color:0x8f98a3, metalness:0.6, roughness:0.4});
  MAT.blade=new THREE.MeshStandardMaterial({color:0x7d8794, metalness:0.8, roughness:0.3});
  MAT.screw=new THREE.MeshStandardMaterial({color:0xd5d9de, metalness:0.9, roughness:0.2});
  MAT.flute=new THREE.MeshStandardMaterial({color:0x23272d, metalness:0.5, roughness:0.45});
}
function clearGroup(g){ while(g.children.length){ const o=g.children.pop(); o.traverse(x=>{ if(x.geometry) x.geometry.dispose(); }); } }

/* ---------------- efeitos: refrigerante (jato de partículas), cavacos, faíscas e torre giratória ---------------- */
let fxCool=null, fxChip=null, drum=null, drumAng=0, drumTarget=0, coolOn=false, lastCarved=0;
const FXN={cool:420, chip:260};
function makeFx(color, size, n, blend){
  const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n*3).fill(9999),3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n*3),3));
  const pts=new THREE.Points(g, new THREE.PointsMaterial({size:size, vertexColors:true, transparent:true, opacity:0.95, depthWrite:false, blending:blend?THREE.AdditiveBlending:THREE.NormalBlending, sizeAttenuation:true}));
  pts.frustumCulled=false; pts.userData={n:n, vel:new Float32Array(n*3), life:new Float32Array(n), col:color, head:0};
  return pts;
}
function emit(fx, o, v, life, col){
  const u=fx.userData, i=u.head=(u.head+1)%u.n, p=fx.geometry.attributes.position.array, c=fx.geometry.attributes.color.array;
  p[i*3]=o.x; p[i*3+1]=o.y; p[i*3+2]=o.z; u.vel[i*3]=v.x; u.vel[i*3+1]=v.y; u.vel[i*3+2]=v.z; u.life[i]=life;
  const cc=col||u.col; c[i*3]=cc[0]; c[i*3+1]=cc[1]; c[i*3+2]=cc[2];
}
function stepFx(fx, dt, grav, drag){
  const u=fx.userData, p=fx.geometry.attributes.position.array; let alive=false;
  for(let i=0;i<u.n;i++){
    if(u.life[i]<=0) continue;
    alive=true; u.life[i]-=dt;
    if(u.life[i]<=0){ p[i*3]=p[i*3+1]=p[i*3+2]=9999; continue; }
    u.vel[i*3+1]-=grav*dt; const dk=Math.max(0,1-drag*dt); u.vel[i*3]*=dk; u.vel[i*3+1]*=dk; u.vel[i*3+2]*=dk;
    p[i*3]+=u.vel[i*3]*dt; p[i*3+1]+=u.vel[i*3+1]*dt; p[i*3+2]+=u.vel[i*3+2]*dt;
  }
  fx.geometry.attributes.position.needsUpdate=true; fx.geometry.attributes.color.needsUpdate=true;
  return alive;
}
function buildFx(){
  fxCool=makeFx([0.35,0.8,1],1.7,FXN.cool,true); fxChip=makeFx([1,0.6,0.2],1.5,FXN.chip,false);
  world.add(fxCool); world.add(fxChip);
}
function nozzlePos(){
  const p=toolGroup.position;
  return machine==='torno' ? {x:p.x+34, y:p.y+34, z:p.z+22} : {x:p.x+22, y:p.y+46, z:p.z+14};
}
function tickFx(dt, cutting){
  if(!fxCool) return false;
  const p=toolGroup.position, tip={x:p.x,y:p.y,z:p.z};
  if(coolOn){
    const n=nozzlePos(), want=Math.round(dt*260);
    for(let k=0;k<want;k++){
      const dx=tip.x-n.x, dy=tip.y-n.y, dz=tip.z-n.z, L=Math.hypot(dx,dy,dz)||1, sp=60+Math.random()*10;
      emit(fxCool, n, {x:dx/L*sp+(Math.random()-.5)*5, y:dy/L*sp+14+(Math.random()-.5)*5, z:dz/L*sp+(Math.random()-.5)*5}, 0.5+Math.random()*0.25);
    }
  }
  if(cutting){
    const n=Math.min(10,Math.round(dt*160));
    for(let k=0;k<n;k++){
      const hot=Math.random()<0.35, a=Math.random()*6.283, sp=18+Math.random()*30;
      emit(fxChip, tip, {x:Math.cos(a)*sp*0.6+(machine==='torno'?-14:0), y:12+Math.random()*28, z:Math.sin(a)*sp},
           hot?0.35:0.7, hot?[1,0.85,0.35]:[0.62,0.64,0.68]);
    }
  }
  const a=stepFx(fxCool,dt,70,0.4), b=stepFx(fxChip,dt,150,0.6);
  return a||b;
}
function buildDrum(){
  const R=56, N=8, g=new THREE.Group(), body=new THREE.Group(), stubs=[]; g.add(body);
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(R-8,R-8,46,N*2), MAT.dark); disc.rotation.z=Math.PI/2; body.add(disc);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(22,22,56,24), MAT.jaw); hub.rotation.z=Math.PI/2; body.add(hub);
  for(let i=0;i<N;i++){
    const a=i*2*Math.PI/N, c=Math.cos(a), sn=Math.sin(a);
    const lug=new THREE.Mesh(new THREE.BoxGeometry(46,16,34), MAT.body); lug.position.set(0,-(R-2)*c,(R-2)*sn); lug.rotation.x=a; body.add(lug);
    const st=new THREE.Group(); body.add(st); stubs.push(st);
    {
      const stub=new THREE.Mesh(new THREE.BoxGeometry(20,36,20), MAT.body); stub.position.set(0,-(R+16)*c,(R+16)*sn); stub.rotation.x=a; st.add(stub);
      const band=new THREE.Mesh(new THREE.BoxGeometry(20.4,5,20.4), MAT.hold); band.position.set(0,-(R+30)*c,(R+30)*sn); band.rotation.x=a; st.add(band);
    }
    const cv=document.createElement('canvas'); cv.width=cv.height=64; const x=cv.getContext('2d');
    x.fillStyle='#10161f'; x.fillRect(0,0,64,64); x.fillStyle='#ffd24a'; x.font='bold 44px sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(String(i+1),32,36);
    const lab=new THREE.Mesh(new THREE.PlaneGeometry(14,14), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv)}));
    lab.position.set(24,-(R-12)*c,(R-12)*sn); lab.rotation.set(0,Math.PI/2,0); lab.rotateOnWorldAxis(new THREE.Vector3(1,0,0),a); body.add(lab);
  }
  g.userData.body=body; g.userData.stubs=stubs; g.userData.hold=[]; return g;
}
function slotOf(code){ if(!code) return 1; return code>=100?Math.floor(code/100):code; }
function setDrumSlot(code, snap){
  const n=((slotOf(code)-1)%8+8)%8; let t=-n*2*Math.PI/8; const cur=drumTarget;
  while(t-cur>Math.PI) t-=2*Math.PI; while(cur-t>Math.PI) t+=2*Math.PI;
  drumTarget=t; if(snap) drumAng=t;
}

let sceneKey='';
function buildScene(){
  mats(); clearGroup(world); fxCool=fxChip=drum=null;
  partGroup=new THREE.Group(); world.add(partGroup);
  toolGroup=new THREE.Group(); world.add(toolGroup); toolModel=null; curModelKey='';
  if(machine==='torno'){
    const R=M.D/2, chuck=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(R+24,R+24,26,48), MAT.dark); body.rotation.z=Math.PI/2; body.position.x=-M.L-5; chuck.add(body);
    for(let k=0;k<3;k++){ const j=new THREE.Mesh(new THREE.BoxGeometry(14,10,12), MAT.jaw); const a=k*2*Math.PI/3;
      j.position.set(-M.L+7, Math.cos(a)*(R+5), Math.sin(a)*(R+5)); j.rotation.x=a; chuck.add(j); }
    partGroup.add(chuck);
    const cl=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-M.L-40,0,0),new THREE.Vector3(40,0,0)]),
      new THREE.LineDashedMaterial({color:0x8ea0b8,dashSize:3,gapSize:2})); cl.computeLineDistances(); world.add(cl);
    floorGrid(-(R+30), -M.L/2, 0, Math.max(200, Math.ceil((M.L+120)/20)*20));
  }else{
    const table=new THREE.Mesh(new THREE.BoxGeometry(M.w+80, 8, M.h+80), MAT.dark);
    table.position.set(M.x0+M.w/2, -M.T-4, -(M.y0+M.h/2)); world.add(table);
    floorGrid(-M.T-8.2, M.x0+M.w/2, -(M.y0+M.h/2), Math.max(200, Math.ceil((Math.max(M.w,M.h)+160)/20)*20));
  }
  buildFx();
  if(machine==='torno'){ drum=buildDrum(); drum.position.set(18,148,-12); toolGroup.add(drum); slotsKey=''; setDrumSlot(curTool,true); drum.userData.body.rotation.x=drumAng; syncSlots(); }
  rebuildPart();
}
/* modelos 3D das ferramentas (ponta da ferramenta na origem do grupo)
   torno: mundo X = Z da máquina, mundo Y = raio (X da máquina), mundo Z = altura de centro
   fresa: eixo da ferramenta = +Y do mundo (Z da máquina), ponta na origem */
let curModelKey='';
const D2R=Math.PI/180;
/* pastilha rômbica com raio de ponta: canto teórico na origem, arestas nos ângulos a1 e a2 (graus) */
function insertShape(a1, a2, L, rn, hole){
  const e1=[Math.cos(a1*D2R),Math.sin(a1*D2R)], e2=[Math.cos(a2*D2R),Math.sin(a2*D2R)];
  const eps=Math.abs(a1-a2)*D2R, d=rn/Math.tan(eps/2), cdist=rn/Math.sin(eps/2);
  const bis=[e1[0]+e2[0], e1[1]+e2[1]], bl=Math.hypot(bis[0],bis[1]); bis[0]/=bl; bis[1]/=bl;
  const C=[bis[0]*cdist, bis[1]*cdist], T1=[e1[0]*d,e1[1]*d], T2=[e2[0]*d,e2[1]*d];
  const P1=[e1[0]*L,e1[1]*L], P3=[e2[0]*L,e2[1]*L], P2=[P1[0]+P3[0],P1[1]+P3[1]];
  const s=new THREE.Shape();
  s.moveTo(T2[0],T2[1]); s.lineTo(P3[0],P3[1]); s.lineTo(P2[0],P2[1]); s.lineTo(P1[0],P1[1]); s.lineTo(T1[0],T1[1]);
  let aS=Math.atan2(T1[1]-C[1],T1[0]-C[0]), aE=Math.atan2(T2[1]-C[1],T2[0]-C[0]);
  const cross=(T1[0]-C[0])*(T2[1]-C[1])-(T1[1]-C[1])*(T2[0]-C[0]);
  const ccw = cross>0; if(ccw){ while(aE<aS) aE+=2*Math.PI; } else { while(aE>aS) aE-=2*Math.PI; }
  s.absarc(C[0],C[1],rn,aS,aE,!ccw);
  const ctr=[P2[0]/2,P2[1]/2];
  if(hole){ const h=new THREE.Path(); h.absarc(ctr[0],ctr[1],hole,0,2*Math.PI,true); s.holes.push(h); }
  return {shape:s, ctr, P1, P2, P3};
}
function extrude(shape, depth, bevel){
  return new THREE.ExtrudeGeometry(shape,{depth, bevelEnabled:!!bevel, bevelThickness:bevel||0, bevelSize:bevel||0, bevelSegments:1, curveSegments:10});
}
/* canais helicoidais (broca / fresa): tubos escuros enrolados no corpo, ao longo de +Y */
class Helix extends THREE.Curve{
  constructor(r,len,turns,phase,y0){ super(); this.r=r; this.len=len; this.turns=turns; this.phase=phase; this.y0=y0; }
  getPoint(t,o=new THREE.Vector3()){ const a=this.phase+t*this.turns*2*Math.PI; return o.set(this.r*Math.cos(a), this.y0+t*this.len, this.r*Math.sin(a)); }
}
function fluted(g, r, y0, len, nFl, mat, flMat, pitch){
  const core=new THREE.Mesh(new THREE.CylinderGeometry(r*0.97,r*0.97,len,28), mat); core.position.y=y0+len/2; g.add(core);
  const turns=len/pitch;
  for(let k=0;k<nFl;k++){
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new Helix(r*0.86,len,turns,k*2*Math.PI/nFl,y0),Math.max(24,Math.round(turns*40)),r*0.3,8,false), flMat);
    g.add(tube);
  }
}
function drillBody(g, d, len, mat){
  const r=d/2, tipH=r/Math.tan(59*D2R);                      // ponta de 118°
  const tip=new THREE.Mesh(new THREE.ConeGeometry(r,tipH,28), mat); tip.rotation.x=Math.PI; tip.position.y=tipH/2; g.add(tip);
  fluted(g, r, tipH, len*0.65, 2, mat, MAT.flute, Math.max(6,d*3));
  const sh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len*0.35,28), mat); sh.position.y=tipH+len*0.65+len*0.175; g.add(sh);
  return tipH+len;
}
function makeToolModel(t){
  const g=new THREE.Group();
  const add=(geo,mat,x,y,z,rx=0,ry=0,rz=0,parent=g)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); parent.add(m); return m; };
  const type=t?t.type:'none';
  if(machine==='torno'){
    const TH=4.76;                                            // espessura da pastilha; face de saída em z=0 (altura de centro)
    const lathePocketTool=(a1,a2,L,rn)=>{
      const ins=insertShape(a1,a2,L,rn,2.6);
      add(extrude(ins.shape,TH,0.25), MAT.carb, 0,0,-TH);
      add(new THREE.CylinderGeometry(2.3,2.3,1.6,16), MAT.screw, ins.ctr[0],ins.ctr[1],0.8, Math.PI/2,0,0);
      const xs=[0,ins.P1[0],ins.P2[0],ins.P3[0]], ys=[0,ins.P1[1],ins.P2[1],ins.P3[1]];
      const x0=Math.min(...xs)+1.6, x1=Math.max(...xs)+4, y0=Math.min(...ys)+1.6, y1=Math.max(...ys)+6;
      add(new THREE.BoxGeometry(x1-x0,y1-y0,20), MAT.body, (x0+x1)/2,(y0+y1)/2,-TH-10+0.6);       // cabeça do suporte
      add(new THREE.BoxGeometry(20,90,20), MAT.body, x1-10,y1+45,-TH-10+0.6);                      // haste 20x20
      add(new THREE.BoxGeometry(20.4,6,20.4), MAT.hold, x1-10,y1+70,-TH-10+0.6);                   // faixa amarela
    };
    if(type==='broca'||type==='centro'){
      const d=(t&&t.d)||4, sub=new THREE.Group(); g.add(sub);
      const len = type==='centro' ? 18 : Math.max(36, d*9);
      let end;
      if(type==='centro'){
        const r=d/2, tipH=r/Math.tan(59*D2R);
        add(new THREE.ConeGeometry(r,tipH,24), MAT.hss, 0,tipH/2,0, Math.PI,0,0, sub);
        add(new THREE.CylinderGeometry(r,r,4,24), MAT.hss, 0,tipH+2,0,0,0,0,sub);
        add(new THREE.ConeGeometry(4,5,24), MAT.hss, 0,tipH+6.5,0, Math.PI,0,0, sub);
        add(new THREE.CylinderGeometry(4,4,12,24), MAT.hss, 0,tipH+15,0,0,0,0,sub); end=tipH+21;
      }else end=drillBody(sub, d, len, MAT.hss);
      add(new THREE.CylinderGeometry(Math.max(d,8)*1.1,Math.max(d,8)*1.3,14,28), MAT.body, 0,end+5,0,0,0,0,sub);   // pinça / mandril
      add(new THREE.BoxGeometry(30,24,30), MAT.body, 0,end+24,0,0,0,0,sub);                                      // suporte axial
      sub.rotation.z=-Math.PI/2;                                   // eixo da broca ao longo de Z da máquina
    }else if(type==='bedame'){
      const w=(t&&t.w)||3;
      add(new THREE.BoxGeometry(w+0.3,5,4.5), MAT.carb, -w/2,2.5,-2.25);
      add(new THREE.BoxGeometry(w*0.85,30,4.5), MAT.blade, -w/2,20,-2.25);
      add(new THREE.BoxGeometry(w*0.85,2,24), MAT.blade, -w/2,35,-12);
      add(new THREE.BoxGeometry(16,22,26), MAT.body, -w/2+7,44,-12);
      add(new THREE.BoxGeometry(16.4,5,26.4), MAT.hold, -w/2+7,52,-12);
    }else if(type==='interno'){
      const ins=insertShape(-82,-137,8,0.4,1.6);
      add(extrude(ins.shape,3.2,0.15), MAT.carb, 0,0,-3.2);
      add(new THREE.CylinderGeometry(4.5,4.5,70,20), MAT.body, 39,-4,-3, 0,0,Math.PI/2);
      add(new THREE.BoxGeometry(24,24,24), MAT.body, 82,-4,-3);
    }else if(type==='rosca'){
      const h=9.5, b=h*Math.tan(30*D2R), s=new THREE.Shape();
      s.moveTo(0,0); s.lineTo(b,h); s.lineTo(-b,h); s.lineTo(0,0);
      add(extrude(s,3.5,0.15), MAT.tin, 0,0,-3.5);
      add(new THREE.CylinderGeometry(1.8,1.8,1.4,14), MAT.screw, 0,h*0.66,0.7, Math.PI/2,0,0);
      add(new THREE.BoxGeometry(14,12,20), MAT.body, 1,h+4,-13.5);
      add(new THREE.BoxGeometry(20,90,20), MAT.body, 4,h+55,-13.5);
      add(new THREE.BoxGeometry(20.4,6,20.4), MAT.hold, 4,h+80,-13.5);
    }else if(type==='acab'){
      lathePocketTool(87,52,16.6,(t&&t.r)||0.4);                  // VNMG 35°
    }else if(type==='desb'){
      lathePocketTool(85,5,12.9,(t&&t.r)||0.8);                   // CNMG 80°
    }else add(new THREE.SphereGeometry(1.5,12,8), MAT.hold, 0,0,0);
  }else{
    const d=(t&&t.d)||10, r=d/2;
    let top;
    if(type==='broca'||type==='alargador'){
      top=drillBody(g, d, Math.max(40,d*5), MAT.hss);
    }else if(type==='macho'){
      const tipH=r*0.5;
      add(new THREE.CylinderGeometry(r*0.75,r*0.9,tipH,24), MAT.tin, 0,tipH/2,0);
      add(new THREE.CylinderGeometry(r*0.92,r*0.92,22,24), MAT.tin, 0,tipH+11,0);
      for(let k=0;k<14;k++) add(new THREE.TorusGeometry(r*0.92,r*0.1,6,24), MAT.tin, 0,tipH+1+k*1.5,0, Math.PI/2,0,0);
      add(new THREE.CylinderGeometry(r*0.75,r*0.75,24,20), MAT.hss, 0,tipH+34,0);
      top=tipH+46;
    }else if(type==='escareador'){
      add(new THREE.ConeGeometry(r,r,32), MAT.tin, 0,r/2,0, Math.PI,0,0);
      add(new THREE.CylinderGeometry(5,5,30,20), MAT.hss, 0,r+15,0); top=r+30;
    }else if(type==='esferica'){
      add(new THREE.SphereGeometry(r,24,14,0,Math.PI*2,Math.PI/2,Math.PI/2), MAT.carb, 0,r,0);
      fluted(g, r, r, 22, 2, MAT.carb, MAT.flute, d*2.6);
      add(new THREE.CylinderGeometry(r,r,22,24), MAT.carb, 0,r+33,0); top=r+44;
    }else if(type==='facear'){
      add(new THREE.CylinderGeometry(r,r*0.92,9,48), MAT.body, 0,4.5,0);
      const n=Math.max(4,Math.round(d/10));
      for(let k=0;k<n;k++){ const a=k*2*Math.PI/n; add(new THREE.BoxGeometry(8,4,8), MAT.tin, Math.cos(a)*(r-3),2,Math.sin(a)*(r-3), 0,-a,0); }
      add(new THREE.CylinderGeometry(14,14,16,28), MAT.body, 0,17,0); top=25;
    }else{
      const L=Math.max(18,d*2.2);
      fluted(g, r, 0, L, d>=12?4:3, MAT.carb, MAT.flute, d*2.8);
      add(new THREE.CylinderGeometry(r,r,d*2.2,24), MAT.carb, 0,L+d*1.1,0); top=L+d*2.2;
    }
    add(new THREE.CylinderGeometry(Math.max(r,6)*1.25,Math.max(r,6)*1.6,18,28), MAT.body, 0,top+9,0);
    add(new THREE.CylinderGeometry(22,15,26,32), MAT.body, 0,top+31,0);
    add(new THREE.CylinderGeometry(24,24,8,32), MAT.hold, 0,top+48,0);
    add(new THREE.CylinderGeometry(26,26,40,32), MAT.dark, 0,top+72,0);
  }
  return g;
}
function toolKey(t){ return t ? t.type+'|'+(t.d||'')+'|'+(t.w||'')+'|'+(t.r||'') : 'none'; }
function setToolModel(t){
  if(machine==='torno'){ syncSlots(); return; }
  const key=toolKey(t);
  if(key===curModelKey) return; curModelKey=key;
  if(toolModel){ toolGroup.remove(toolModel); toolModel.traverse(x=>x.geometry&&x.geometry.dispose()); }
  toolModel=makeToolModel(t); toolGroup.add(toolModel); dirty=true;
}
/* torno: cada estação da torre carrega a sua ferramenta e gira junto com o tambor */
let slotsKey='';
const slotCode=n=>{ const q=String(n).padStart(2,'0'); return q+q; };
function syncSlots(){
  if(machine!=='torno'||!drum) return;
  const ts=[]; for(let n=1;n<=8;n++) ts.push(toolOf(slotCode(n)));
  const k=ts.map(toolKey).join('#'); if(k===slotsKey) return; slotsKey=k;
  const body=drum.userData.body, u=drum.userData;
  (u.hold||[]).forEach(w=>{ body.remove(w); w.traverse(x=>x.geometry&&x.geometry.dispose()); }); u.hold=[];
  ts.forEach((t,i)=>{
    if(u.stubs[i]) u.stubs[i].visible=!t;
    if(!t) return;
    const w=new THREE.Group(); w.rotation.x=i*2*Math.PI/8;
    const m=makeToolModel(t); m.position.set(-drum.position.x,-drum.position.y,-drum.position.z); w.add(m);
    if(['broca','centro','interno'].includes(t.type)){      // ferramenta axial: suporte que liga o cabeçote à face do tambor
      const ty=-drum.position.y, tz=-drum.position.z, Rr=56, len=Math.abs(ty)-Rr+6;
      const arm=new THREE.Mesh(new THREE.BoxGeometry(70,len,30), MAT.body); arm.position.set(28,-(Rr-6)-len/2,tz); w.add(arm);
      const cap=new THREE.Mesh(new THREE.BoxGeometry(70.4,5,30.4), MAT.hold); cap.position.set(28,-(Rr-6)-len+3,tz); w.add(cap);
    }
    body.add(w); u.hold.push(w);
  });
  dirty=true;
}

function rebuildPart(){
  if(!ok) return;
  if(partMesh){ partGroup.remove(partMesh); partMesh.geometry.dispose(); }
  if(machine==='torno'){
    const {n,rOut,rIn,z0}=M, zAt=k=>z0-k*DZ, L=[[rIn[n-1], zAt(n)]];
    let prev=null;
    for(let k=n-1;k>=0;k--){ const r=rOut[k];
      if(prev===null||Math.abs(r-prev)>1e-4){ L.push([r,zAt(k+1)]); prev=r; }
      if(k===0||Math.abs(rOut[k-1]-r)>1e-4) L.push([r,zAt(k)]); }
    prev=null;
    for(let k=0;k<n;k++){ const r=rIn[k];
      if(prev===null||Math.abs(r-prev)>1e-4){ L.push([r,zAt(k)]); prev=r; }
      if(k===n-1||Math.abs(rIn[k+1]-r)>1e-4) L.push([r,zAt(k+1)]); }
    const geo=new THREE.LatheGeometry(L.map(([r,z])=>new THREE.Vector2(Math.max(0.001,r),z)), 72);
    partMesh=new THREE.Mesh(geo, part&&part.mat==='alu'?MAT.alu:MAT.steel);
    partMesh.rotation.z=-Math.PI/2;
  }else partMesh=millMesh();
  partGroup.add(partMesh);
  dirty=true;
}
function millMesh(){
  const {nx,ny,x0,y0,cx,cy,hgt,T}=M, pos=[], col=[], idx=[];
  const c0=new THREE.Color(part&&part.mat==='alu'?0xd8dee5:0xc4ccd6), c1=new THREE.Color(0x6f8db0);
  const vtx=(x,y,z,t)=>{ pos.push(x,z,-y); const c=c0.clone().lerp(c1,Math.min(1,t)); col.push(c.r,c.g,c.b); return pos.length/3-1; };
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ const h=hgt[j*nx+i]; vtx(x0+i*cx, y0+j*cy, h, -h/T*3); }
  for(let j=0;j<ny-1;j++) for(let i=0;i<nx-1;i++){ const a=j*nx+i, b=a+1, c=a+nx, d=c+1; idx.push(a,b,d, a,d,c); }
  const wall=list=>{ for(let k=0;k<list.length-1;k++){ const [xa,ya,ha]=list[k], [xb,yb,hb]=list[k+1];
      const a=vtx(xa,ya,ha,0.2), b=vtx(xb,yb,hb,0.2), c=vtx(xa,ya,-T,0.2), d=vtx(xb,yb,-T,0.2); idx.push(a,c,d, a,d,b); } };
  const H=(i,j)=>[x0+i*cx, y0+j*cy, hgt[j*nx+i]];
  wall([...Array(nx)].map((_,i)=>H(i,0))); wall([...Array(nx)].map((_,i)=>H(nx-1-i,ny-1)));
  wall([...Array(ny)].map((_,j)=>H(0,ny-1-j))); wall([...Array(ny)].map((_,j)=>H(nx-1,j)));
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, MAT.cut);
}
let pathObj=null, showPath=true;
function toWorld(p){ return machine==='torno' ? new THREE.Vector3(p.z,(p.x||0)/2+0.05,0.05) : new THREE.Vector3(p.x,(p.z??0)+0.05,-(p.y||0)); }
function buildPath(){
  if(pathObj){ world.remove(pathObj); pathObj.traverse(o=>o.geometry&&o.geometry.dispose()); pathObj=null; }
  if(!ok || !res || !showPath) return;
  pathObj=new THREE.Group();
  res.segs.forEach(s=>{ const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints(s.pts.map(toWorld)), s.kind==='rapid'?MAT.rapid:MAT.feed);
    if(s.kind==='rapid') ln.computeLineDistances(); pathObj.add(ln); });
  world.add(pathObj);
}

/* ---------------- ferramenta na tela ---------------- */
let toolPos=null, curTool=null;
function homePos(code){ if(homeFn){ const h=homeFn(code); if(h) return h; } return machine==='torno' ? {x:100, z:45} : {x:M.x0+M.w/2, y:M.y0+M.h/2, z:100}; }
/* q = posição FÍSICA da ponta (ou null = posição de referência da máquina) */
function placePhys(q, code){
  if(!ok) return;
  toolPhys=q;
  if(code!==undefined && code!==curTool){ curTool=code; setToolModel(toolOf(code)); setDrumSlot(code); }
  const h = q || homePos(curTool);
  if(machine==='torno') toolGroup.position.set(h.z, h.x/2, 0);
  else toolGroup.position.set(h.x, Math.min(h.z,400), -(h.y||0));
  dirty=true;
}
/* p = posição COMANDADA (a do programa); o desvio de zero-peça/corretor é aplicado aqui */
function placeTool(p, code){
  toolPos=p;
  if(!p){ placePhys(null, code); return; }
  const sh=shiftFn({tool:code!==undefined?code:curTool, row:-1, hlen:false})||{x:0,y:0,z:0};
  placePhys({x:p.x+sh.x, y:(p.y||0)+sh.y, z:p.z+sh.z}, code);
}
function setToolCode(code){ if(!ok) return; curTool=code; slotsKey=''; setToolModel(toolOf(code)); setDrumSlot(code); placePhys(toolPhys, code); }

/* medições: folga entre a ponta e a peça (calibrador) e diâmetro torneado (paquímetro) */
function gaps(q, code){
  if(!M||!q) return null;
  const t=toolOf(code), res={x:null,y:null,z:null};
  if(machine==='torno'){
    const r=q.x/2, z=q.z, iF=Math.min(M.n-1,Math.max(0,zIdx(M.z0-0.01)));
    if(r < M.rOut[iF]+0.01 && r >= M.rIn[iF]) res.z = z-M.z0;                       // folga até a face
    const i=zIdx(z); if(i>=0 && i<M.n && z<=M.z0) res.x = q.x-2*M.rOut[i];           // folga no diâmetro
    return res;
  }
  const rad=millRad(t,null);
  const inX=(q.x>=M.x0-rad && q.x<=M.x0+M.w+rad), inY=(q.y>=M.y0-rad && q.y<=M.y0+M.h+rad);
  if(q.x>=M.x0 && q.x<=M.x0+M.w && q.y>=M.y0 && q.y<=M.y0+M.h){
    const i=Math.round((q.x-M.x0)/M.cx), j=Math.round((q.y-M.y0)/M.cy);
    res.z = q.z - M.hgt[Math.min(M.ny-1,Math.max(0,j))*M.nx+Math.min(M.nx-1,Math.max(0,i))];
  }
  if(q.z<0 && inY){ const l=M.x0-(q.x+rad), r2=(q.x-rad)-(M.x0+M.w); res.x = Math.abs(l)<Math.abs(r2)?l:r2; }
  if(q.z<0 && inX){ const b=M.y0-(q.y+rad), t2=(q.y-rad)-(M.y0+M.h); res.y = Math.abs(b)<Math.abs(t2)?b:t2; }
  return res;
}
function diameterAt(z){        // menor diâmetro na janela que a ferramenta acabou de tocar (z … z+1,2 mm)
  if(!M||machine!=='torno'||z>M.z0) return null;
  const [i0,i1]=cellRange(z-0.1, Math.min(z+1.2, M.z0)); if(i1<i0) return null;
  let r=Infinity; for(let k=i0;k<=i1;k++) r=Math.min(r,M.rOut[k]); return isFinite(r)?2*r:null;
}

/* ---------------- carregar / resultado final ---------------- */
function fresh(){ M = machine==='torno' ? latheModel(part) : millModel(part); carved=0; shiftAlarmed={}; }
function load(o){
  machine=o.machine; part=o.part; res=o.res; rowState=res?res.states:{}; order=(res&&res.order)||[];
  getTool=o.getTool||(()=>null); shiftFn=o.shift||(()=>null); compFn=o.comp||(()=>null); homeFn=o.home||null;
  anim=null; fresh();
  if(!ok) return;
  const key=machine+'|'+JSON.stringify(part&&part.stock)+'|'+(part&&part.face)+'|'+(part&&part.thick);
  if(key!==sceneKey){ buildScene(); frame(); sceneKey=key; } else rebuildPart();
  alarms=[]; buildPath();
}
function computeFinal(){
  alarms=[]; fresh();
  if(!res) return [];
  let lastPh=null, lastSeg=null;
  for(const s of res.segs){
    if(s.fill && machine!=='torno') fillMill(s.fill);
    let prev=null;
    for(const p of samples(s, machine==='torno'?0.2:0.5)){ const ph=applyPoint(s,p,prev); prev=p; if(ph) lastPh=ph; }
    lastSeg=s;
  }
  if(ok){ rebuildPart(); placePhys(lastPh, lastSeg?lastSeg.tool:undefined); }
  return alarms.slice();
}
function showFinal(){ anim=null; ideal=true; const a=computeFinal(); ideal=false; setSpin(null); return a; }
function resetStock(){ anim=null; alarms=[]; fresh(); if(ok){ rebuildPart(); placePhys(null); } }

/* ---------------- CYCLE START ---------------- */
function play(){
  if(!res) return;
  if(anim && anim.hold){ anim.hold=false; return; }
  alarms=[]; fresh(); rebuildPart();
  const bySeg={}; res.segs.forEach(s=>{ (bySeg[s.row]=bySeg[s.row]||[]).push(s); });
  const tl=order.map(row=>({row, segs:(bySeg[row]||[]).map(s=>({s, pts:samples(s, machine==='torno'?0.2:0.5)}))}));
  anim={tl, bi:0, si:0, pi:0, hold:false, wait:0, prev:null, started:false};
}
function hold(){ if(anim) anim.hold=true; }
function stop(){ anim=null; setSpin(null); }
function running(){ return !!anim && !anim.hold; }
function active(){ return !!anim; }
function setOpts(o){ Object.assign(opts,o); }

function endBlock(a, blk){
  const st=rowState[blk.row]||{};
  a.bi++; a.si=0; a.pi=0; a.wait=0; a.started=false;
  if(st.stop==='M0' || (st.stop==='M1' && opts.optStop)){ a.hold=true; onStop(st.stop, blk.row); return; }
  if(opts.single){ a.hold=true; onStop('SBK', blk.row); }
}
function stepAnim(dt){
  const a=anim; if(!a || a.hold) return;
  let budget=dt, rebuilt=false, guard=0;
  while(budget>0 && a.bi<a.tl.length && guard++<20000){
    const blk=a.tl[a.bi], st=rowState[blk.row]||{};
    if(!a.started){
      a.started=true;
      a.wait = blk.segs.length ? 0 : (st.dwell ? Math.min(st.dwell,4) : 0.22);
      setSpin(st); if(st.tool!==curTool) placePhys(toolPhys, st.tool);
      onTick({row:blk.row, pos:toolPos, phys:toolPhys, state:st});
    }
    if(!blk.segs.length){
      const use=Math.min(budget,a.wait); a.wait-=use; budget-=use;
      if(a.wait<=1e-6){ endBlock(a, blk); if(a.hold) break; }
      continue;
    }
    const sg=blk.segs[a.si], rapid=sg.s.kind==='rapid';
    const v = rapid ? 160*opts.rapidOvr : (machine==='torno'?28:55)*opts.feedOvr*(opts.dry?4:1);
    const step = machine==='torno'?0.2:0.5;
    const n=Math.max(1, Math.floor(budget*v/step));
    for(let k=0;k<n && a.pi<sg.pts.length;k++){
      const p=sg.pts[a.pi++];
      if(sg.s.fill && a.pi===1 && machine!=='torno') fillMill(sg.s.fill);
      const ph=applyPoint(sg.s, p, a.prev); a.prev=p; toolPos=p;
      if(ph) placePhys(ph, sg.s.tool); rebuilt=true;
    }
    budget -= n*step/v;
    if(a.pi>=sg.pts.length){ a.pi=0; a.si++; a.prev=null; if(a.si>=blk.segs.length){ endBlock(a, blk); if(a.hold){ onTick({row:blk.row,pos:toolPos,phys:toolPhys,state:st}); break; } } }
    onTick({row:blk.row, pos:toolPos, phys:toolPhys, state:st});
  }
  if(rebuilt) rebuildPart();
  if(a.bi>=a.tl.length){ anim=null; setSpin(null); onDone(alarms.slice()); }
}

/* ---------------- operação manual (JOG / MDI / REF) ---------------- */
function manualMove(from, to, o){          // from/to = posição FÍSICA da ponta (JOG / INC / MANIVELA / MDI)
  const seg={kind:o.rapid?'rapid':'feed', pts:[from,to], row:-1, tool:o.tool, spin:o.spin, comp:40, phys:true};
  const before=alarms.length;
  let prev=null; for(const p of samples(seg, machine==='torno'?0.2:0.5)){ applyPoint(seg,p,prev); prev=p; }
  if(ok){ rebuildPart(); placePhys(to, o.tool); }
  if(carved>lastCarved) manualCut=0.25;
  return alarms.slice(before);
}
let spinState=null, manualCut=0;
function setSpin(st){ spinState=st; coolOn=!!(st&&st.cool); dirty=true; }

function loop(){
  requestAnimationFrame(loop);
  if(!ok) return;
  const now=performance.now(), dt=Math.min(0.25,(now-(loop._t||now))/1000); loop._t=now;
  if(anim) stepAnim(dt);
  if(spinState && (spinState.spin===3||spinState.spin===4)){
    spinAngle += (spinState.spin===3?-1:1)*dt*14;
    if(machine==='torno') partGroup.rotation.x=spinAngle; else if(toolModel) toolModel.rotation.y=spinAngle;
    dirty=true;
  }
  if(follow&&toolGroup){ const q=toolGroup.position, f=Math.min(1,dt*5); cam.tx+=(q.x-cam.tx)*f; cam.ty+=(q.y-cam.ty)*f; cam.tz+=(q.z-cam.tz)*f; dirty=true; }
  if(drum){ const d=drumTarget-drumAng; if(Math.abs(d)>1e-3){ drumAng+=d*Math.min(1,dt*6); drum.userData.body.rotation.x=drumAng; dirty=true; } }
  const cutting = !!anim && !anim.hold && carved>lastCarved; lastCarved=carved;
  if(tickFx(dt, cutting||manualCut>0) || coolOn) dirty=true;
  if(manualCut>0) manualCut-=dt;
  if(!dirty || el.offsetParent===null) return;
  placeCamera(); renderer.render(scene,camera); dirty=false;
}
function snapshot(){ try{ placeCamera(); renderer.render(scene,camera); return renderer.domElement.toDataURL('image/jpeg',0.82); }catch(e){ return null; } }

function setYawPitch(y,pt){ cam.yaw=+y; cam.pitch=+pt; dirty=true; }
function focusTool(dist){ if(!ok||!toolGroup) return; const p=toolGroup.position; cam.tx=p.x; cam.ty=p.y; cam.tz=p.z; cam.dist=dist||70; cam.yaw=0.9; cam.pitch=0.35; dirty=true; }
return { init, load, showFinal, focusTool, setYawPitch, resetStock, play, hold, stop, running, active, setOpts, manualMove, placeTool, placePhys, setToolCode, gaps, diameterAt, setSpin, snapshot,
  setPathVisible:v=>{ showPath=v; buildPath(); dirty=true; }, resetView:()=>{ frame(); dirty=true; },
  homePos:c=>M?homePos(c):null, getAlarms:()=>alarms.slice(), carved:()=>carved,
  set onTick(f){ onTick=f; }, set onDone(f){ onDone=f; }, set onStop(f){ onStop=f; },
  get ok(){ return ok; }, get model(){ return M; }, get toolPos(){ return toolPos; }, get toolPhys(){ return toolPhys; } };
})();
