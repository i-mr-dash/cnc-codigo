/* Mascote "Torninho": robozinho de capacete que fala (voz do navegador, pt-BR) e anima a boca enquanto fala. */
const Mascot = (()=>{
  const KEY='cnc-mascot-voz';
  let on=true, voice=null, speaking=false, last='', el=null;
  try{ on = localStorage.getItem(KEY)!=='0'; }catch(e){}
  const synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;

  const SVG=`<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <line x1="50" y1="6" x2="50" y2="20" stroke="#8b96a4" stroke-width="3" stroke-linecap="round"/>
    <circle class="m-led" cx="50" cy="6" r="5" fill="#ff5a4d"/>
    <rect x="22" y="36" width="56" height="48" rx="16" fill="#dfe5ec" stroke="#8b96a4" stroke-width="3"/>
    <path d="M18 40 Q18 14 50 14 Q82 14 82 40 Z" fill="#ffc21a" stroke="#b8860b" stroke-width="3"/>
    <rect x="14" y="38" width="72" height="8" rx="4" fill="#ffb000" stroke="#b8860b" stroke-width="3"/>
    <rect x="44" y="14" width="12" height="24" fill="#ffe08a" opacity=".7"/>
    <g class="m-eyes"><ellipse cx="38" cy="62" rx="7" ry="8" fill="#10161f"/><ellipse cx="62" cy="62" rx="7" ry="8" fill="#10161f"/>
      <circle cx="40" cy="59" r="2.6" fill="#fff"/><circle cx="64" cy="59" r="2.6" fill="#fff"/></g>
    <circle cx="30" cy="72" r="4" fill="#ff9aa2" opacity=".7"/><circle cx="70" cy="72" r="4" fill="#ff9aa2" opacity=".7"/>
    <ellipse class="m-mouth" cx="50" cy="74" rx="8" ry="2.5" fill="#10161f"/>
    <rect x="30" y="86" width="40" height="18" rx="6" fill="#4aa8ff" stroke="#2d6fb0" stroke-width="3"/>
    <circle cx="50" cy="95" r="5" fill="#dfe5ec" stroke="#2d6fb0" stroke-width="2"/><line x1="50" y1="91" x2="50" y2="99" stroke="#2d6fb0" stroke-width="2"/>
  </svg>`;

  function pickVoice(){
    if(!synth) return; const vs=synth.getVoices(); if(!vs.length) return;
    const br=vs.filter(v=>/pt[-_]BR/i.test(v.lang)), pt=vs.filter(v=>/^pt/i.test(v.lang));
    const pool=br.length?br:pt; if(!pool.length){ voice=null; return; }
    voice = pool.find(v=>/google|francisca|maria|luciana|antonio|microsoft/i.test(v.name)) || pool[0];
  }
  if(synth){ pickVoice(); synth.onvoiceschanged=pickVoice; }

  function plain(h){
    const d=document.createElement('div'); d.innerHTML=String(h||'');
    let t=d.textContent||'';
    t=t.replace(/→/g,', depois ').replace(/[·•]/g,', ').replace(/×/g,' vezes ').replace(/≈/g,' aproximadamente ').replace(/\s*\/\s*/g,' barra ')
       .replace(/\bG0?0\b/g,'G zero zero').replace(/\bM30\b/g,'M trinta').replace(/\s+/g,' ').trim();
    return t;
  }
  function mouth(v){ if(el) el.classList.toggle('talk',v); }
  function stop(){ if(synth) synth.cancel(); speaking=false; mouth(false); }
  function say(html, opts){
    const txt=plain(html); last=txt; if(!txt||!el) return;
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
    if(!on||!synth) return;
    stop();
    const u=new SpeechSynthesisUtterance(txt);
    u.lang='pt-BR'; if(voice) u.voice=voice; u.rate=(opts&&opts.rate)||1.05; u.pitch=1.3; u.volume=1;
    u.onstart=()=>{ speaking=true; mouth(true); };
    u.onend=u.onerror=()=>{ speaking=false; mouth(false); };
    // alguns navegadores só começam a falar depois do cancel: pequeno atraso
    setTimeout(()=>synth.speak(u),60);
  }
  function setOn(v){
    on=v; try{ localStorage.setItem(KEY,v?'1':'0'); }catch(e){}
    if(!v) stop();
    const b=document.getElementById('mascotVoice'); if(b){ b.textContent=v?'🔊':'🔇'; b.setAttribute('aria-pressed',v); b.title=v?'Voz ligada (clique para silenciar)':'Voz desligada (clique para ligar)'; }
  }
  function init(){
    const bub=document.getElementById('tutBubble'); if(!bub||el) return;
    bub.classList.add('has-mascot');
    el=document.createElement('div'); el.className='mascot'; el.innerHTML=SVG+
      `<button type="button" class="m-voice" id="mascotVoice" aria-pressed="true"></button>`;
    bub.prepend(el);
    el.querySelector('svg').addEventListener('click',()=>{ if(last){ const w=on; if(!w){ on=true; } say(last); on=w; } });
    el.querySelector('svg').title='Clique em mim para repetir';
    document.getElementById('mascotVoice').onclick=e=>{ e.stopPropagation(); setOn(!on); if(on) say(last); };
    setOn(on);
    if(!synth) document.getElementById('mascotVoice').style.display='none';
  }
  return { init, say, stop, setOn, get on(){ return on; }, get speaking(){ return speaking; } };
})();
window.Mascot=Mascot;
