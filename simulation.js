// Life Sim v17.7.3 bootstrap.
const engineEl=document.getElementById('engineVersion');
if(engineEl)engineEl.textContent='cargando v17.7.3…';
document.title='Life Sim v17.7.3 — Natural Demographic Stability';
const titleEl=document.querySelector('#hud h1');if(titleEl)titleEl.textContent='Life Sim v17.7.3 — Natural Demographic Stability';
const subEl=document.querySelector('#hud .sub');if(subEl)subEl.textContent='Diagnóstico demográfico natural: mide si los fértiles se encuentran, si tienen energía, cuánto tarda un nacimiento y por qué interviene el rescate biológico, sin aumentar artificialmente la fertilidad.';
const noticeEl=document.getElementById('notice');if(noticeEl)noticeEl.textContent='v17.7.3 audita la reproducción y el rescate. Distingue individuos insertados de episodios de rescate, registra su causa y mide oportunidades reproductivas. Las probabilidades de reproducción no se han aumentado.';

function addDemographicDiagnostics(){
  const anchor=document.getElementById('recentRescues')?.closest('.stat');
  if(!anchor||document.getElementById('rescueEpisodesTotal'))return;
  const rows=[
    ['rescueEpisodesTotal','Episodios rescate totales','0'],
    ['rescuePopulationEpisodes','Rescates por población crítica','0'],
    ['rescueFertilityEpisodes','Rescates por falta de fertilidad','0'],
    ['rescueLoadEpisodes','Rescates al cargar','0'],
    ['lastRescueReason','Última causa de rescate','—'],
    ['fertilePairsNearby','Parejas fértiles cercanas','0'],
    ['fertileNearestDistance','Distancia media al fértil más cercano','—'],
    ['isolatedFertile','Fértiles aislados','0'],
    ['fertileEncountersRecent','Encuentros fértiles últimos 100','0'],
    ['matingEventsRecent','Apareamientos últimos 100','0'],
    ['energyBlockedAdults','Adultos bloqueados por energía','0'],
    ['cooldownBlockedAdults','Adultos en cooldown reproductivo','0'],
    ['birthGap','Tiempo desde nacimiento natural','—']
  ];
  const label=document.getElementById('recentRescues')?.parentElement;
  if(label)label.firstChild.textContent='Episodios rescate últimos 100';
  let cursor=anchor;
  for(const [id,text,value] of rows){
    const div=document.createElement('div');div.className='stat';div.append(document.createTextNode(text));
    const b=document.createElement('b');b.id=id;b.textContent=value;div.appendChild(b);
    cursor.after(div);cursor=div;
  }
}
addDemographicDiagnostics();

try{
  const {loadLifeSim1773}=await import('./patch-v17.7.3.js?v=17.7.3b');
  await loadLifeSim1773();
}catch(err){
  console.error('[Life Sim v17.7.3] error de arranque',err);
  if(engineEl)engineEl.textContent='v17.7.3 · ERROR';
  if(noticeEl){
    noticeEl.style.color='#ffb3b3';
    noticeEl.textContent='Error al cargar v17.7.3: '+(err?.message||String(err))+'. Recarga con Ctrl+F5. Si persiste, comparte esta pantalla.';
  }
  const history=document.getElementById('discoveryList');
  if(history)history.innerHTML='<div class="discEvent"><div class="discTitle">⚠️ Error de arranque v17.7.3</div><div class="discDetail">'+String(err?.message||err)+'</div></div>';
}
