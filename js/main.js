/* ---------------- início ---------------- */
initSim();
hud();
if(location.hash==='#sim'){ Object.assign(MACH.pwr,{cnc:false,mach:false,door:true}); MACH.emg=true; $('#opEmg').classList.add('on'); show('bench'); pwrLamps(); }
else show('map');
if(matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.documentElement.classList.add('standalone');
