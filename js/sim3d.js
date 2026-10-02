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
let world, partGroup, partMesh=null, toolGroup, toolModel=null, coolant, spinAngle=0;
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
const MEAS_ERR = 25;     // corretor não medido: a ferramenta "acha" que está 25 mm mais longe

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
    for(let k=i0;k<=i1;k++) if(M.rOut[k]>0 && M.rIn[k]<dr) M.rIn[k]=Math.min(dr, M.rOut[k]);
    return;
  }
  if(kind==='bore'){
    const [i0,i1]=cellRange(z, z+1);
    for(let k=i0;k<=i1;k++) if(r>M.rIn[k] && M.rIn[k]>0) M.rIn[k]=Math.min(r, M.rOut[k]);
    return;
  }
  const w = kind==='groove' ? (t&&t.w?t.w:3) : 1.0;
  const [i0,i1] = kind==='groove' ? cellRange(z-w, z) : cellRange(z, z+w);
  for(let k=i0;k<=i1;k++) if(M.rOut[k]>r){ M.rOut[k]=r; if(M.rIn[k]>r) M.rIn[k]=r; }
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
    if(px*px+py*py<=r2){ const k=j*M.nx+i; if(M.hgt[k]>zz) M.hgt[k]=zz; }
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
  if(seg.tool && !t && seg.kind!=='rapid'){ alarm(seg.row, `FERRAMENTA T${String(seg.tool).slice(0,2)} NÃO ESTÁ MONTADA (veja FERRAMENTAS)`); return; }
  const p={...p0};
  if(t && t.measured===false){ p.z=(p.z??0)+MEAS_ERR; alarm(seg.row, `T${String(seg.tool).slice(0,2)} SEM CORRETOR MEDIDO — trabalha ${MEAS_ERR} mm fora do lugar (meça em FERRAMENTAS / OFS)`); }
  if(machine==='torno'){
    let kind = seg.kind==='rapid' ? 'rapid' : seg.kind==='drill' ? 'drill' : seg.kind==='groove' ? 'groove' : latheKindOf(t);
    const tk=latheKindOf(t);
    // o 1º ponto do G0 é onde a ferramenta já está (fim do corte anterior): não conta como colisão
    if(kind==='rapid'){ if(!seg.safe && prev && latheInside(p.x,p.z,tk,t)) alarm(seg.row,'COLISÃO: AVANÇO RÁPIDO (G0) DENTRO DO MATERIAL'); return; }
    if(kind==='turn' && tk!=='turn') kind=tk;                 // broca/bedame chamados em G1 comum
    if(kind==='groove' && tk==='drill') kind='drill';
    if(latheInside(p.x,p.z,kind,t) && seg.spin===5) alarm(seg.row,'CORTE COM O FUSO PARADO (faltou M3)');
    carveLathe(p.x, p.z, kind, t);
  }else{
    const rad=millRad(t,seg);
    let x=p.x, y=p.y;
    if((seg.comp===41||seg.comp===42) && prev && seg.kind!=='drill' && seg.kind!=='rapid'){
      const dx=p0.x-prev.x, dy=p0.y-prev.y, d=Math.hypot(dx,dy);
      if(d>1e-6){ const s=seg.comp===41?1:-1; x+=-dy/d*rad*s; y+=dx/d*rad*s; }
    }
    p0._x=x; p0._y=y;
    if(seg.kind==='rapid'){ if(millInside(x,y,p.z,rad*0.8)) alarm(seg.row,'COLISÃO: AVANÇO RÁPIDO (G0) DENTRO DO MATERIAL'); return; }
    if(millInside(x,y,p.z,rad*0.8) && seg.spin===5) alarm(seg.row,'CORTE COM O FUSO PARADO (faltou M3)');
    carveMill(x,y,p.z,rad);
  }
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
    if(e.shiftKey||e.buttons===4||e.buttons===2){ cam.tx-=dx*cam.dist/600; cam.ty+=dy*cam.dist/600; }
    else { cam.yaw-=dx*0.008; cam.pitch=Math.max(-1.45,Math.min(1.45,cam.pitch+dy*0.008)); }
    dirty=true;
  });
  const up=e=>{ pts.delete(e.pointerId); pinch0=0; };
  c.addEventListener('pointerup',up); c.addEventListener('pointercancel',up);
  c.addEventListener('wheel',e=>{ e.preventDefault(); cam.dist=Math.max(20,Math.min(1500,cam.dist*(e.deltaY>0?1.1:0.9))); dirty=true; },{passive:false});
  c.addEventListener('dblclick',()=>{ frame(); dirty=true; });
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
}
function clearGroup(g){ while(g.children.length){ const o=g.children.pop(); o.traverse(x=>{ if(x.geometry) x.geometry.dispose(); }); } }
let sceneKey='';
function buildScene(){
  mats(); clearGroup(world);
  partGroup=new THREE.Group(); world.add(partGroup);
  toolGroup=new THREE.Group(); world.add(toolGroup); toolModel=null; curModelKey='';
  if(machine==='torno'){
    const R=M.D/2, chuck=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(R+24,R+24,26,48), MAT.dark); body.rotation.z=Math.PI/2; body.position.x=-M.L-5; chuck.add(body);
    for(let k=0;k<3;k++){ const j=new THREE.Mesh(new THREE.BoxGeometry(14,10,12), MAT.jaw); const a=k*2*Math.PI/3;
      j.position.set(-M.L+7, Math.cos(a)*(R+5), Math.sin(a)*(R+5)); j.rotation.x=a; chuck.add(j); }
    partGroup.add(chuck);
    coolant=new THREE.Mesh(new THREE.CylinderGeometry(0.8,1.6,26,10), MAT.cool); coolant.position.set(9,13,8); coolant.rotation.x=-0.3; coolant.rotation.z=0.5;
    const cl=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-M.L-40,0,0),new THREE.Vector3(40,0,0)]),
      new THREE.LineDashedMaterial({color:0x8ea0b8,dashSize:3,gapSize:2})); cl.computeLineDistances(); world.add(cl);
    floorGrid(-(R+30), -M.L/2, 0, Math.max(200, Math.ceil((M.L+120)/20)*20));
  }else{
    const table=new THREE.Mesh(new THREE.BoxGeometry(M.w+80, 8, M.h+80), MAT.dark);
    table.position.set(M.x0+M.w/2, -M.T-4, -(M.y0+M.h/2)); world.add(table);
    floorGrid(-M.T-8.2, M.x0+M.w/2, -(M.y0+M.h/2), Math.max(200, Math.ceil((Math.max(M.w,M.h)+160)/20)*20));
    coolant=new THREE.Mesh(new THREE.CylinderGeometry(0.8,1.5,40,10), MAT.cool); coolant.position.set(16,20,0); coolant.rotation.z=0.45;
  }
  coolant.visible=false; toolGroup.add(coolant);
  rebuildPart();
}
/* modelos 3D de cada tipo de ferramenta (ponta da ferramenta na origem do grupo) */
let curModelKey='';
function setToolModel(t){
  const key = t ? t.type+'|'+(t.d||'')+'|'+(t.w||'') : 'none';
  if(key===curModelKey) return; curModelKey=key;
  if(toolModel){ toolGroup.remove(toolModel); toolModel.traverse(x=>x.geometry&&x.geometry.dispose()); }
  const g=new THREE.Group(); toolModel=g; toolGroup.add(g);
  const add=(geo,mat,x,y,z,rx=0,ry=0,rz=0)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); g.add(m); return m; };
  const type=t?t.type:'none';
  if(machine==='torno'){
    if(type==='broca'||type==='centro'){
      const r=(t.d||4)/2, L=type==='centro'?14:Math.max(30,t.d*8);
      add(new THREE.ConeGeometry(r,r*1.2,20), MAT.hss, r*0.6,0,0, 0,0,Math.PI/2);
      add(new THREE.CylinderGeometry(r,r,L,20), MAT.hss, r*1.2+L/2,0,0, 0,0,Math.PI/2);
      add(new THREE.BoxGeometry(26,26,26), MAT.hold, r*1.2+L+13,0,0);
    }else if(type==='bedame'){
      const w=t.w||3;
      add(new THREE.BoxGeometry(w,20,4), MAT.ins, -w/2,10,0);
      add(new THREE.BoxGeometry(14,26,12), MAT.hold, -w/2+3,32,0);
    }else if(type==='interno'){
      add(new THREE.CylinderGeometry(3,3,50,16), MAT.hold, 27,1.5,0, 0,0,Math.PI/2);
      add(new THREE.ConeGeometry(2.2,4,3), MAT.ins, 1.5,1,0, 0,0,Math.PI);
    }else if(type==='rosca'){
      add(new THREE.ConeGeometry(3,6,3), MAT.gold, 0,3,0, 0,0,0);
      add(new THREE.BoxGeometry(10,28,10), MAT.hold, 5,19,0);
    }else if(type==='acab'){
      const ins=add(new THREE.ConeGeometry(3.2,9,4), MAT.ins, 2,4,0, 0,0,0.6); ins.scale.set(1,1,0.35);
      add(new THREE.BoxGeometry(10,30,10), MAT.hold, 7,20,0);
    }else{
      const ins=add(new THREE.ConeGeometry(4.5,7,4), MAT.ins, 1.5,3.5,0); ins.scale.set(1,1,0.4);
      add(new THREE.BoxGeometry(12,30,12), MAT.hold, 7,19,0);
    }
  }else{
    const r=t&&t.d?t.d/2:5;
    if(type==='broca'||type==='macho'||type==='alargador'){
      add(new THREE.ConeGeometry(r,r*1.1,20), type==='macho'?MAT.gold:MAT.hss, 0,r*0.55,0, Math.PI,0,0);
      add(new THREE.CylinderGeometry(r,r,40,20), type==='macho'?MAT.gold:MAT.hss, 0,r*1.1+20,0);
    }else if(type==='escareador'){
      add(new THREE.ConeGeometry(r,r,24), MAT.gold, 0,r/2,0, Math.PI,0,0);
      add(new THREE.CylinderGeometry(4,4,30,16), MAT.hss, 0,r+15,0);
    }else if(type==='esferica'){
      add(new THREE.SphereGeometry(r,20,12), MAT.ins, 0,r,0);
      add(new THREE.CylinderGeometry(r,r,30,20), MAT.ins, 0,r+15,0);
    }else if(type==='facear'){
      add(new THREE.CylinderGeometry(r,r,10,36), MAT.ins, 0,5,0);
      add(new THREE.CylinderGeometry(12,12,20,20), MAT.hss, 0,20,0);
    }else{
      add(new THREE.CylinderGeometry(r,r,30,20), MAT.ins, 0,15,0);
    }
    add(new THREE.CylinderGeometry(10,13,24,24), MAT.hold, 0,58,0);
    add(new THREE.CylinderGeometry(24,24,40,32), MAT.dark, 0,90,0);
  }
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
function homePos(){ return machine==='torno' ? {x:M.D+16, z:15} : {x:M.x0+M.w/2, y:M.y0+M.h/2, z:100}; }
function placeTool(p, code){
  if(!ok) return;
  toolPos=p;
  if(code!==undefined){ curTool=code; setToolModel(toolOf(code)); }
  const q = p && p.x!=null && p.z!=null ? p : homePos();
  if(machine==='torno') toolGroup.position.set(q.z, q.x/2, 0);
  else toolGroup.position.set(q._x??q.x, Math.min(q.z??100,150), -((q._y??q.y)||0));
  dirty=true;
}

/* ---------------- carregar / resultado final ---------------- */
function fresh(){ M = machine==='torno' ? latheModel(part) : millModel(part); }
function load(o){
  machine=o.machine; part=o.part; res=o.res; rowState=res?res.states:{}; order=(res&&res.order)||[];
  getTool=o.getTool||(()=>null);
  anim=null; fresh();
  if(!ok) return;
  const key=machine+'|'+JSON.stringify(part&&part.stock)+'|'+(part&&part.face)+'|'+(part&&part.thick);
  if(key!==sceneKey){ buildScene(); frame(); sceneKey=key; } else rebuildPart();
  alarms=[]; buildPath();
}
function computeFinal(){
  alarms=[]; fresh();
  if(!res) return [];
  let last=null, lastSeg=null;
  for(const s of res.segs){
    if(s.fill && machine!=='torno') fillMill(s.fill);
    let prev=null;
    for(const p of samples(s, machine==='torno'?0.2:0.5)){ applyPoint(s,p,prev); prev=p; last=p; }
    lastSeg=s;
  }
  if(ok){ rebuildPart(); placeTool(last, lastSeg?lastSeg.tool:undefined); }
  return alarms.slice();
}
function showFinal(){ anim=null; const a=computeFinal(); setSpin(null); return a; }
function resetStock(){ anim=null; alarms=[]; fresh(); if(ok){ rebuildPart(); placeTool(null); } }

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
      setSpin(st); if(st.tool!==curTool) placeTool(toolPos, st.tool);
      onTick({row:blk.row, pos:toolPos, state:st});
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
      applyPoint(sg.s, p, a.prev); a.prev=p;
      placeTool(p, sg.s.tool); rebuilt=true;
    }
    budget -= n*step/v;
    if(a.pi>=sg.pts.length){ a.pi=0; a.si++; a.prev=null; if(a.si>=blk.segs.length){ endBlock(a, blk); if(a.hold){ onTick({row:blk.row,pos:toolPos,state:st}); break; } } }
    onTick({row:blk.row, pos:toolPos, state:st});
  }
  if(rebuilt) rebuildPart();
  if(a.bi>=a.tl.length){ anim=null; setSpin(null); onDone(alarms.slice()); }
}

/* ---------------- operação manual (JOG / MDI / REF) ---------------- */
function manualMove(from, to, o){
  const seg={kind:o.rapid?'rapid':'feed', pts:[from,to], row:-1, tool:o.tool, spin:o.spin, comp:40};
  const before=alarms.length;
  let prev=null; for(const p of samples(seg, machine==='torno'?0.2:0.5)){ applyPoint(seg,p,prev); prev=p; }
  if(ok){ rebuildPart(); placeTool(to, o.tool); }
  return alarms.slice(before);
}
let spinState=null;
function setSpin(st){ spinState=st; if(coolant) coolant.visible=!!(st&&st.cool); dirty=true; }

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
  if(coolant && coolant.visible){ coolant.material.opacity=0.4+0.25*Math.sin(now/60); dirty=true; }
  if(!dirty || el.offsetParent===null) return;
  placeCamera(); renderer.render(scene,camera); dirty=false;
}
function snapshot(){ try{ placeCamera(); renderer.render(scene,camera); return renderer.domElement.toDataURL('image/jpeg',0.82); }catch(e){ return null; } }

return { init, load, showFinal, resetStock, play, hold, stop, running, active, setOpts, manualMove, placeTool, setSpin, snapshot,
  setPathVisible:v=>{ showPath=v; buildPath(); dirty=true; }, resetView:()=>{ frame(); dirty=true; },
  homePos:()=>M?homePos():null, getAlarms:()=>alarms.slice(),
  set onTick(f){ onTick=f; }, set onDone(f){ onDone=f; }, set onStop(f){ onStop=f; },
  get ok(){ return ok; }, get model(){ return M; }, get toolPos(){ return toolPos; } };
})();
