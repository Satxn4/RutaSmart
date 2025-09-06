// ====== Config ======
const ADMIN_PASSWORD = 'admin123'; // cámbialo si quieres

// ====== Estado ======
const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const $ = s=>document.querySelector(s);
const state = { workers: loadWorkers(), origin: null, map: null, markers: [], services:{}, renderers:{}, autocomplete:{} };

// ====== Storage ======
function saveWorkers(){ localStorage.setItem('workers.v1', JSON.stringify(state.workers)); renderAll(); }
function loadWorkers(){ try{return JSON.parse(localStorage.getItem('workers.v1')||'[]')}catch{return []} }

// ====== Utils ======
function uid(){return Math.random().toString(36).slice(2,10)}
function fillDaySelects(){
  $('#day').innerHTML = DAYS.map(d=>`<option value="${d}">${d}</option>`).join('');
  $('#editDay').innerHTML = DAYS.map(d=>`<option value="${d}">${d}</option>`).join('');
  $('#filterDayAdmin').innerHTML = `<option value="">Todos</option>`+DAYS.map(d=>`<option value="${d}">${d}</option>`).join('');
  $('#filterDayDriver').innerHTML = DAYS.map(d=>`<option value="${d}">${d}</option>`).join('');
}

function applyTheme(){const t=localStorage.getItem('theme')|| (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}

// ====== Renderers ======
function renderStats(){$('#stats').innerHTML = DAYS.map(d=>`<span class="chip">${d}: <strong style="margin-left:6px">${state.workers.filter(w=>w.day===d).length}</strong></span>`).join('')}
function filtered(list,day,shift){return list.filter(w=>(!day||w.day===day)&&(!shift||w.shift===shift))}

function renderTable(){const tbody=$('#workersTable tbody');const rows=filtered(state.workers,$('#filterDayAdmin').value,$('#filterShiftAdmin').value).map((w,i)=>`<tr><td>${i+1}</td><td>${w.name}</td><td>${w.address}</td><td><a href="tel:${w.phone}">${w.phone}</a></td><td>${w.day}</td><td>${w.shift}</td><td class="row-actions"><button class="btn" onclick="onEdit('${w.id}')">✏️</button><button class="btn" onclick="onDelete('${w.id}')">🗑️</button></td></tr>`).join('');tbody.innerHTML = rows||`<tr><td colspan="7" style="color:var(--muted)">Sin registros.</td></tr>`}

function renderDriverList(){const tbody=$('#driverTable tbody');const day=$('#filterDayDriver').value;const list=filtered(state.workers,day,'');const rows=list.map((w,i)=>`<tr><td>${i+1}</td><td>${w.name}</td><td>${w.address}</td><td><a href="tel:${w.phone}">${w.phone}</a></td></tr>`).join('');tbody.innerHTML = rows||`<tr><td colspan="4" style="color:var(--muted)">Sin pasajeros para este día.</td></tr>`}

// ====== Google Maps helpers (same que antes) ======
window.initMap = ()=>{
  state.map = new google.maps.Map(document.getElementById('map'),{center:{lat:-33.4489,lng:-70.6693},zoom:11});
  state.services.geocoder = new google.maps.Geocoder();
  state.services.directions = new google.maps.DirectionsService();
  state.renderers.directions = new google.maps.DirectionsRenderer({map:state.map,suppressMarkers:false});
  state.services.distance = new google.maps.DistanceMatrixService();

  // Autocomplete
  state.autocomplete.address = new google.maps.places.Autocomplete(document.getElementById('address'),{types:['geocode']});
  state.autocomplete.start = new google.maps.places.Autocomplete(document.getElementById('start'),{types:['geocode']});
  state.autocomplete.editAddress = new google.maps.places.Autocomplete(document.getElementById('editAddress')||document.createElement('input'),{types:['geocode']});

  state.autocomplete.start.addListener('place_changed',()=>{const p=state.autocomplete.start.getPlace();if(!p.geometry)return;state.origin={lat:p.geometry.location.lat(),lng:p.geometry.location.lng(),address:p.formatted_address||p.name};placeOriginMarker();});

  state.map.addListener('click',e=>{state.origin={lat:e.latLng.lat(),lng:e.latLng.lng(),address:'Origen en mapa'};$('#start').value=state.origin.address;placeOriginMarker();});

  renderAll();
}

let originMarker=null;function placeOriginMarker(){if(!state.origin)return;if(originMarker)originMarker.setMap(null);originMarker=new google.maps.Marker({position:state.origin,map:state.map,label:'O',title:'Origen'});state.map.panTo(state.origin)}

function geocodeAddress(address){return new Promise((resolve,reject)=>{state.services.geocoder.geocode({address},(results,status)=>{if(status==='OK'&&results&&results[0]){const r=results[0];resolve({address:r.formatted_address,location:{lat:r.geometry.location.lat(),lng:r.geometry.location.lng()},placeId:r.place_id});}else reject(new Error('No se pudo geocodificar la dirección'))})})}

function clearMarkers(){(state.markers||[]).forEach(m=>m.setMap(null));state.markers=[]}
function addMarkersForWorkers(list,mapRef=state.map){clearMarkers();(list||[]).forEach((w,i)=>{if(!w.location) return;const m=new google.maps.Marker({position:w.location,map:mapRef,label:String(i+1),title:w.name});state.markers.push(m)})}

function requestRouteOrderedByDistance(origin,workers){return new Promise((resolve,reject)=>{if(!workers.length)resolve({order:[],result:null});state.services.distance.getDistanceMatrix({origins:[origin],destinations:workers.map(w=>w.location),travelMode:google.maps.TravelMode.DRIVING,unitSystem:google.maps.UnitSystem.METRIC},(resp,status)=>{if(status!=='OK'){reject(new Error('DistanceMatrix error: '+status));return;}const distances=resp.rows[0].elements.map((el,idx)=>({idx,value:el.distance?el.distance.value:Number.MAX_SAFE_INTEGER,text:el.distance?el.distance.text:'—',durationText:el.duration?el.duration.text:'—'}));const sorted=[...distances].sort((a,b)=>a.value-b.value);const ordered=sorted.map(s=>({...workers[s.idx],distanceText:s.text,durationText:s.durationText}));resolve({order:ordered})})})}

function directionsFromOrder(origin,ordered){return new Promise((resolve,reject)=>{if(!ordered.length){state.renderers.directions.set('directions',null);resolve(null);return;}const waypoints=ordered.slice(0,-1).map(w=>({location:w.location,stopover:true}));const destination=ordered[ordered.length-1].location;state.services.directions.route({origin,destination,waypoints,optimizeWaypoints:false,travelMode:google.maps.TravelMode.DRIVING,drivingOptions:{departureTime:new Date()}},(res,status)=>{if(status!=='OK'){reject(new Error('Directions error: '+status));return;}state.renderers.directions.setDirections(res);resolve(res)})})}

async function buildRouteFor(list,origin,mapRef,renderSummary=true){try{if(!origin){alert('Define el origen.');return;}if(!list.length){alert('No hay trabajadores con ubicación para los filtros actuales.');return;}addMarkersForWorkers(list,mapRef);const {order}=await requestRouteOrderedByDistance(origin,list);if(mapRef===state.map){renderRouteList(order);}const bounds=[origin,...order.map(o=>o.location)];fitBoundsToPoints(bounds);const dir=await directionsFromOrder(origin,order);if(renderSummary){let totalDistance=0,totalDuration=0;if(dir){dir.routes[0].legs.forEach(leg=>{totalDistance+=leg.distance.value;totalDuration+=leg.duration.value});$('#routeSummary').innerHTML=`<span class="chip">Distancia total: <strong style="margin-left:6px">${(totalDistance/1000).toFixed(1)} km</strong></span><span class="chip">Tiempo estimado: <strong style="margin-left:6px">${Math.round(totalDuration/60)} min</strong></span>`;} }return order}catch(err){console.error(err);alert(err.message||'Error al generar la ruta')}}

function fitBoundsToPoints(points){if(!points.length)return;const bounds=new google.maps.LatLngBounds();points.forEach(p=>bounds.extend(p));state.map.fitBounds(bounds)}

// ====== UI actions ======
document.addEventListener('DOMContentLoaded',()=>{
  applyTheme();
  fillDaySelects();

  // role buttons
  $('#btnAdminView').addEventListener('click',()=>{const pw=prompt('Contraseña admin:');if(pw===ADMIN_PASSWORD){showAdmin()}else if(pw===null){return;}else{alert('Contraseña incorrecta')}});
  $('#btnDriverView').addEventListener('click',()=>{showDriver()});

  $('#toggleTheme').addEventListener('click',()=>{const cur=document.documentElement.getAttribute('data-theme');const next=cur==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',next);localStorage.setItem('theme',next)});

  // Form submit
  $('#workerForm').addEventListener('submit',async e=>{e.preventDefault();const name=$('#name').value.trim();const phone=$('#phone').value.trim();const day=$('#day').value;const shift=$('#shift').value;const notes=$('#notes').value.trim();const rawAddress=$('#address').value.trim();if(!name||!phone||!day||!shift||!rawAddress)return;try{const g=await geocodeAddress(rawAddress);const worker={id:uid(),name,phone,day,shift,notes,address:g.address,location:g.location,placeId:g.placeId};state.workers.push(worker);saveWorkers();e.target.reset();alert('Trabajador agregado')}catch(err){alert('No se pudo geocodificar la dirección.')}});

  // Import/export
  $('#exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state.workers,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=Object.assign(document.createElement('a'),{href:url,download:'trabajadores.json'});a.click();URL.revokeObjectURL(url)});
  $('#importBtn').addEventListener('click',()=>$('#importFile').click());
  $('#importFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state.workers=JSON.parse(r.result);saveWorkers();alert('Importado')}catch{alert('Archivo inválido')}};r.readAsText(f)});

  // Filters admin
  $('#filterDayAdmin').addEventListener('change',()=>{renderTable();renderStats()});$('#filterShiftAdmin').addEventListener('change',()=>renderTable());
  $('#buildRouteAdmin').addEventListener('click',async ()=>{const list=filtered(state.workers,$('#filterDayAdmin').value,$('#filterShiftAdmin').value).filter(w=>w.location);await buildRouteFor(list,state.origin,state.map,true)});

  // Use my location
  $('#useMyLocation').addEventListener('click',()=>{if(!navigator.geolocation){alert('Geolocalización no disponible');return;}navigator.geolocation.getCurrentPosition(pos=>{state.origin={lat:pos.coords.latitude,lng:pos.coords.longitude,address:'Mi ubicación'};$('#start').value='Mi ubicación';placeOriginMarker()},err=>alert('No se pudo obtener ubicación: '+err.message),{enableHighAccuracy:true,timeout:10000})});

  // Edit/delete
  $('#workersTable').addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;});

  $('#editForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('#editId').value;const idx=state.workers.findIndex(w=>w.id===id);if(idx<0)return;const name=$('#editName').value.trim();const phone=$('#editPhone').value.trim();const day=$('#editDay').value;const shift=$('#editShift').value;const notes=$('#editNotes').value.trim();const newAddress=$('#editAddress').value.trim();try{let address=state.workers[idx].address;let location=state.workers[idx].location;let placeId=state.workers[idx].placeId;if(newAddress!==address){const g=await geocodeAddress(newAddress);address=g.address;location=g.location;placeId=g.placeId}state.workers[idx]={...state.workers[idx],name,phone,day,shift,notes,address,location,placeId};saveWorkers();document.getElementById('editDialog').close();}catch{alert('No se pudo actualizar la dirección.')}});

  // Driver filters
  $('#filterDayDriver').addEventListener('change',()=>{renderDriverList();});
  $('#buildRouteDriver').addEventListener('click',async ()=>{const day=$('#filterDayDriver').value;const list=filtered(state.workers,day,'').filter(w=>w.location);const mapEl=document.getElementById('mapDriver');if(!list.length){alert('No hay pasajeros para este día o no han sido geocodificados.');return;} // create a separate map instance for driver if needed
    // Create driver map if not exists
    if(!window.driverMap){window.driverMap=new google.maps.Map(mapEl,{center:{lat:-33.4489,lng:-70.6693},zoom:11});}
    // add markers on driverMap
    (window.driverMarkers||[]).forEach(m=>m.setMap(null));window.driverMarkers=[];list.forEach((w,i)=>{if(!w.location) return;const m=new google.maps.Marker({position:w.location,map:window.driverMap,label:String(i+1),title:w.name});window.driverMarkers.push(m)});
    // fit bounds
    const bounds=new google.maps.LatLngBounds();list.forEach(w=>bounds.extend(w.location));if(state.origin)bounds.extend(state.origin);window.driverMap.fitBounds(bounds);
    // request ordered route and draw on main renderer (we'll reuse directions on main map but show list here)
    const order= (await requestRouteOrderedByDistance(state.origin||list[0].location,list)).order; renderRouteList(order);
  });

  // initial view: try admin if previously selected
  const lastRole=localStorage.getItem('lastRole')||'admin'; if(lastRole==='driver') showDriver(); else showAdmin();

  // init map happens via Google callback
});

// ====== Actions exposed ======
window.onDelete = id=>{if(!confirm('¿Eliminar este registro?'))return;state.workers=state.workers.filter(w=>w.id!==id);saveWorkers()}
window.onEdit = id=>{const w=state.workers.find(x=>x.id===id);if(!w)return;$('#editId').value=w.id;$('#editName').value=w.name;$('#editAddress').value=w.address;$('#editPhone').value=w.phone;$('#editDay').value=w.day;$('#editShift').value=w.shift;$('#editNotes').value=w.notes||'';document.getElementById('editDialog').showModal()}

// ====== Views control ======
function showAdmin(){document.getElementById('adminArea').style.display='grid';document.getElementById('driverArea').style.display='none';localStorage.setItem('lastRole','admin');renderAll();}
function showDriver(){document.getElementById('adminArea').style.display='none';document.getElementById('driverArea').style.display='block';localStorage.setItem('lastRole','driver');renderAll();}

// ====== Render all ======
function renderRouteList(order){const listEl=$('#routeList');if(!order||!order.length){listEl.innerHTML='<li style="color:var(--muted)">Agrega trabajadores y genera una ruta.</li>';return;}listEl.innerHTML=order.map(p=>`<li><strong>${p.name}</strong> — ${p.address}</li>`).join('')}
function renderAll(){fillDaySelects();renderStats();renderTable();renderDriverList();}