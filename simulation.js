// Life Sim v17.7.7 bootstrap.
const engineEl=document.getElementById('engineVersion');
if(engineEl)engineEl.textContent='cargando v17.7.7…';
document.title='Life Sim v17.7.7 — World Audit';
const titleEl=document.querySelector('#hud h1');if(titleEl)titleEl.textContent='Life Sim v17.7.7 — World Audit';
const subEl=document.querySelector('#hud .sub');if(subEl)subEl.textContent='Auditoría del mundo: historial de métricas, respaldo descargable y pruebas sobre copias sin gráficos.';
const noticeEl=document.getElementById('notice');if(noticeEl)noticeEl.textContent='Exporta la auditoría para revisar problemas de tu mundo. El modo copia no guarda cambios en tu partida principal.';

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
    ['birthGap','Tiempo desde nacimiento natural','—'],
    ['reproAgeAdults','Adultos en edad reproductiva','0'],
    ['reproJuveniles','Juveniles pre-reproductivos','0'],
    ['reproPostAdults','Adultos post-reproductivos','0'],
    ['reproPairsInSense','Pares fértiles dentro de percepción','0'],
    ['reproPairsInRange','Pares fértiles a distancia de apareamiento','0'],
    ['reproCompatiblePairs','Pares compatibles en rango','0'],
    ['reproNearestAny','Distancia mínima entre fértiles','—'],
    ['reproAvgCompatibility','Compatibilidad media en rango','—']
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
  await import('./engine-v17.7.4.js?v=5');
}catch(err){
  console.error('[Life Sim v17.7.7] error de arranque',err);
  if(engineEl)engineEl.textContent='v17.7.7 · ERROR';
  if(noticeEl){
    noticeEl.style.color='#ffb3b3';
    noticeEl.textContent='Error al cargar v17.7.7: '+(err?.message||String(err))+'. Recarga con Ctrl+F5. Si persiste, comparte esta pantalla.';
  }
  const history=document.getElementById('discoveryList');
  if(history)history.innerHTML='<div class="discEvent"><div class="discTitle">⚠️ Error de arranque v17.7.7</div><div class="discDetail">'+String(err?.message||err)+'</div></div>';
}

