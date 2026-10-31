/* ---------------- início ---------------- */
initSim();
hud();
show('map');
if(matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.documentElement.classList.add('standalone');
