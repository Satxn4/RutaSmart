// ====== Config ======
const ADMIN_PASSWORD = 'admin123'; // cámbialo si quieres

// ====== Estado ======
const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const $ = s => document.querySelector(s);
const state = {
  workers: loadWorkers(),
  origin: null,
  map: null,
  markers: [],
  services: {},
  renderers: {},
  autocomplete: {}
};

// ====== Storage ======
function saveWorkers(){
  localStorage.setItem('workers.v1', JSON.stringify(state.workers));
  renderAll();
}
function loadWorkers(){
  try { return JSON.parse(localStorage.getItem('workers.v1')||'[]') } catch { return [] }
}

// ====== Utils ======
function uid(){return Math.random().toString(36).slice(2,10)}
function fillDaySelects(){
  $('#day').innerHTML = DAYS.map(d=>`<option value="${d}">${d}</option>`).join('');
  $('#editDay').innerHTML = DAYS.map(d=>`<option value="${d}">${d}</option>`).join('');
  $('#filterDayAdmin').innerHTML = `<option value="">Todos</option>`+DAYS.map(d=>`<option value="${d}">${d}</option>`).join('');
  $('#filterDayDriver').innerHTML = DAYS.map(d=>`<option value="${d}">${d}</option>`).join('');
}
function applyTheme(){
  const t = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  document.documentElement.setAttribute('data-theme',t)
}
function haversine(a,b){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
  const lat1=toRad(a.lat), lat2=toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

// ====== Render ======
function renderStats(){
  $('#stats').innerHTML = DAYS.map(d=>`<span class="chip">${d}: <strong style="margin-left:6px">${state.workers.filter(w=>w.day===d).length}</strong></span>`).join('')
}
function filtered(list,day,shift){
  return list.filter(w=>(!day||w.day===day)&&(!shift||w.shift===shift))
}
function renderTable(){
  const tbody=$('#workersTable tbody');
  const rows = filtered(state.workers,$('#filterDayAdmin').value,$('#filterShiftAdmin').value)
    .map((w,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${w.name}</td>
        <td>${w.address}</td>
        <td><a href="tel:${w.phone}">${w.phone}</a></td>
        <td>${w.day}</td>
        <td>${w.shift}</td>
        <td class="row-actions">
          <button class="btn" onclick="onEdit('${w.id}')">✏️</button>
          <button class="btn" onclick="onDelete('${w.id}')">🗑️</button>
        </td>
      </tr>`).join('');
  tbody.innerHTML = rows || `<tr><td colspan="7" style="color:var(--muted)">Sin registros.</td></tr>`;
}
function renderDriverList(){
  const tbody=$('#driverTable tbody');
  const day=$('#filterDayDriver').value;
  const list=filtered(state.workers,day,'');
  const rows = list.map((w,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${w.name}</td>
      <td>${w.address}</td>
      <td><a href="tel:${w.phone}">${w.phone}</a></td>
    </tr>`).join('');
  tbody.innerHTML = rows || `<tr><td colspan="4" style="color:var(--muted)">Sin pasajeros para este día.</td></tr>`;
}

// ====== Google Maps bootstrapping ======
window.initMap = ()=>{
  try {
    state.map = new google.maps.Map(document.getElementById('map'),{
      center:{lat:-33.4489,lng:-70.6693},zoom:11
    });
    state.services.geocoder = new google.maps.Geocoder();
    state.services.directions = new google.maps.DirectionsService();
    state.renderers.directions = new google.maps.DirectionsRenderer({map:state.map,suppressMarkers:false});
    state.services.distance = new google.maps.DistanceMatrixService();

    // Autocomplete (admin start). Si no está disponible, simplemente no se usa.
    try {
      if (google.maps.places?.Autocomplete) {
        state.autocomplete.address = new google.maps.places.Autocomplete($('#address'),{types:['geocode']});
        state.autocomplete.start = new google.maps.places.Autocomplete($('#start'),{types:['geocode']});
        const editInput = document.getElementById('editAddress');
        if (editInput) state.autocomplete.editAddress = new google.maps.places.Autocomplete(editInput,{types:['geocode']});

        state.autocomplete.start.addListener('place_changed',()=>{
          const p=state.autocomplete.start.getPlace();
          if(!p?.geometry) return;
          state.origin = {
            lat:p.geometry.location.lat(),
            lng:p.geometry.location.lng(),
            address:p.formatted_address||p.name
          };
          placeOriginMarker();
        });
      }
    } catch (e) {
      console.warn('Error inicializando Autocomplete:', e);
    }

    state.map.addListener('click',e=>{
      state.origin={lat:e.latLng.lat(),lng:e.latLng.lng(),address:'Origen en mapa'};
      $('#start').value=state.origin.address;
      placeOriginMarker();
    });

    renderAll();
  } catch (e){
    console.error('Fallo initMap:', e);
    alert('No se pudo iniciar Google Maps. Revisa tu clave/APIs habilitadas.');
  }
};

let originMarker=null;
function placeOriginMarker(){
  if(!state.origin || !state.map) return;
  if(originMarker) originMarker.setMap(null);
  originMarker=new google.maps.Marker({position:state.origin,map:state.map,label:'O',title:'Origen'});
  state.map.panTo(state.origin);
}

function geocodeAddress(address){
  return new Promise((resolve,reject)=>{
    if(!state.services.geocoder) return reject(new Error('Geocoder no disponible'));
    state.services.geocoder.geocode({address},(results,status)=>{
      if(status==='OK'&&results&&results[0]){
        const r=results[0];
        resolve({
          address:r.formatted_address,
          location:{lat:r.geometry.location.lat(),lng:r.geometry.location.lng()},
          placeId:r.place_id
        });
      } else reject(new Error('No se pudo geocodificar la dirección'));
    });
  });
}

function clearMarkers(){ (state.markers||[]).forEach(m=>m.setMap(null)); state.markers=[] }
function addMarkersForWorkers(list,mapRef=state.map){
  clearMarkers();
  (list||[]).forEach((w,i)=>{
    if(!w.location) return;
    const m=new google.maps.Marker({position:w.location,map:mapRef,label:String(i+1),title:w.name});
    state.markers.push(m);
  });
}

// ====== Orden por distancia (con fallback) ======
function requestRouteOrderedByDistance(origin,workers){
  return new Promise((resolve,reject)=>{
    if(!workers.length) return resolve({order:[],result:null});
    if(!origin) return reject(new Error('Falta origen'));

    // Fallback simple
    if(!state.services.distance){
      const order=[...workers].sort((a,b)=>haversine(origin,a.location)-haversine(origin,b.location))
        .map(w=>({...w,distanceText:'~',durationText:'~'}));
      return resolve({order});
    }

    const origins=[ new google.maps.LatLng(origin.lat,origin.lng) ];
    const destinations = workers.map(w=> new google.maps.LatLng(w.location.lat,w.location.lng) );

    state.services.distance.getDistanceMatrix({
      origins,
      destinations,
      travelMode:google.maps.TravelMode.DRIVING,
      unitSystem:google.maps.UnitSystem.METRIC
    },(resp,status)=>{
      if(status!=='OK'||!resp?.rows?.[0]?.elements){
        console.warn('DistanceMatrix falló, usando fallback simple:', status);
        const order=[...workers].sort((a,b)=>haversine(origin,a.location)-haversine(origin,b.location))
          .map(w=>({...w,distanceText:'~',durationText:'~'}));
        return resolve({order});
      }
      const elements = resp.rows[0].elements;

      const distances = elements.map((el,idx)=>{
        if(el.status!=='OK') return {idx,value:Number.MAX_SAFE_INTEGER,text:'—',durationText:'—'};
        return {idx,value:el.distance.value,text:el.distance.text,durationText:el.duration.text};
      });

      const sorted = [...distances].sort((a,b)=>a.value-b.value);
      const ordered = sorted.map(s=>({
        ...workers[s.idx],
        distanceText:s.text,
        durationText:s.durationText
      }));
      resolve({order:ordered});
    });
  });
}

// Versión neutra del cálculo de direcciones que acepta un renderer externo
function directionsFromOrderWithRenderer(origin,ordered,renderer){
  return new Promise((resolve,reject)=>{
    if(!ordered.length || !state.services.directions){
      renderer?.set('directions',null);
      return resolve(null);
    }
    const waypoints = ordered.slice(0,-1).map(w=>({location:w.location,stopover:true}));
    const destination = ordered[ordered.length-1].location;

    state.services.directions.route({
      origin,
      destination,
      waypoints,
      optimizeWaypoints:false, // mantenemos el orden cercano->lejano
      travelMode:google.maps.TravelMode.DRIVING,
      drivingOptions:{departureTime:new Date()}
    },(res,status)=>{
      if(status!=='OK'){
        console.warn('Directions error:', status);
        return reject(new Error('Error al obtener direcciones'));
      }
      renderer?.setDirections(res);
      resolve(res);
    });
  });
}

async function buildRouteFor(list,origin,mapRef,renderSummary=true){
  try{
    if(!origin){ alert('Define el origen.'); return; }
    if(!list.length){ alert('No hay trabajadores con ubicación para los filtros actuales.'); return; }

    addMarkersForWorkers(list,mapRef);
    const {order} = await requestRouteOrderedByDistance(origin,list);

    if(mapRef===state.map){ renderRouteList(order); }

    const bounds = [origin,...order.map(o=>o.location)];
    fitBoundsToPoints(bounds);

    const dir = await directionsFromOrderWithRenderer(origin,order,state.renderers.directions);

    if(renderSummary && dir){
      let totalDistance=0,totalDuration=0;
      dir.routes[0].legs.forEach(leg=>{
        totalDistance+=leg.distance.value; totalDuration+=leg.duration.value;
      });
      $('#routeSummary').innerHTML =
        `<span class="chip">Distancia total: <strong style="margin-left:6px">${(totalDistance/1000).toFixed(1)} km</strong></span>`+
        `<span class="chip">Tiempo estimado: <strong style="margin-left:6px">${Math.round(totalDuration/60)} min</strong></span>`;
    }
    return order;
  }catch(err){
    console.error(err);
    alert(err.message||'Error al generar la ruta');
  }
}

function fitBoundsToPoints(points){
  if(!points.length || !state.map) return;
  const bounds=new google.maps.LatLngBounds();
  points.forEach(p=>bounds.extend(new google.maps.LatLng(p.lat,p.lng)));
  state.map.fitBounds(bounds);
}

// ====== UI actions ======
document.addEventListener('DOMContentLoaded',()=>{
  applyTheme();
  fillDaySelects();

  // role buttons
  $('#btnAdminView').addEventListener('click',()=>{
    const pw=prompt('Contraseña admin:');
    if(pw===ADMIN_PASSWORD){ showAdmin() }
    else if(pw===null){ return; }
    else { alert('Contraseña incorrecta') }
  });
  $('#btnDriverView').addEventListener('click',()=>{ showDriver() });

  $('#toggleTheme').addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme');
    const next=cur==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',next);
    localStorage.setItem('theme',next);
  });

  // Form submit
  $('#workerForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const name=$('#name').value.trim();
    const phone=$('#phone').value.trim();
    const day=$('#day').value;
    const shift=$('#shift').value;
    const notes=$('#notes').value.trim();
    const rawAddress=$('#address').value.trim();
    if(!name||!phone||!day||!shift||!rawAddress) return;

    try{
      const g=await geocodeAddress(rawAddress);
      const worker={id:uid(),name,phone,day,shift,notes,address:g.address,location:g.location,placeId:g.placeId};
      state.workers.push(worker);
      saveWorkers();
      e.target.reset();
      alert('Trabajador agregado');
    }catch(err){
      alert('No se pudo geocodificar la dirección.');
    }
  });

  // Import/export
  $('#exportBtn').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(state.workers,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=Object.assign(document.createElement('a'),{href:url,download:'trabajadores.json'});
    a.click(); URL.revokeObjectURL(url);
  });
  $('#importBtn').addEventListener('click',()=>$('#importFile').click());
  $('#importFile').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{ state.workers=JSON.parse(r.result); saveWorkers(); alert('Importado'); }
      catch{ alert('Archivo inválido'); }
    };
    r.readAsText(f);
  });

  // Filters admin
  $('#filterDayAdmin').addEventListener('change',()=>{renderTable();renderStats()});
  $('#filterShiftAdmin').addEventListener('change',()=>renderTable());

  $('#buildRouteAdmin').addEventListener('click',async ()=>{
    const list=filtered(state.workers,$('#filterDayAdmin').value,$('#filterShiftAdmin').value).filter(w=>w.location);
    await buildRouteFor(list,state.origin,state.map,true);
  });

  // Use my location (Admin)
  $('#useMyLocation').addEventListener('click',()=>{
    if(!navigator.geolocation){ alert('Geolocalización no disponible'); return; }
    navigator.geolocation.getCurrentPosition(pos=>{
      state.origin={lat:pos.coords.latitude,lng:pos.coords.longitude,address:'Mi ubicación'};
      $('#start').value='Mi ubicación';
      placeOriginMarker();
    },err=>alert('No se pudo obtener ubicación: '+err.message),{enableHighAccuracy:true,timeout:10000});
  });

  // Edit/delete
  $('#workersTable').addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn) return;
  });

  $('#editForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const id=$('#editId').value;
    const idx=state.workers.findIndex(w=>w.id===id);
    if(idx<0) return;

    const name=$('#editName').value.trim();
    const phone=$('#editPhone').value.trim();
    const day=$('#editDay').value;
    const shift=$('#editShift').value;
    const notes=$('#editNotes').value.trim();
    const newAddress=$('#editAddress').value.trim();

    try{
      let address=state.workers[idx].address;
      let location=state.workers[idx].location;
      let placeId=state.workers[idx].placeId;

      if(newAddress!==address){
        const g=await geocodeAddress(newAddress);
        address=g.address; location=g.location; placeId=g.placeId;
      }
      state.workers[idx]={...state.workers[idx],name,phone,day,shift,notes,address,location,placeId};
      saveWorkers();
      document.getElementById('editDialog').close();
    }catch{
      alert('No se pudo actualizar la dirección.');
    }
  });

  // ====== Chofer / Driver ======
  $('#filterDayDriver').addEventListener('change',()=>{ renderDriverList(); });

  // Enter en el input del origen (chofer)
  const driverStart = document.getElementById('driverStart');
  if (driverStart) {
    driverStart.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){ e.preventDefault(); document.getElementById('buildRouteDriver').click(); }
    });
  }

  // Ver ruta (chofer) — con geocodificación del punto base y resumen de distancia/tiempo
  $('#buildRouteDriver').addEventListener('click', async ()=>{
    const day = $('#filterDayDriver').value;
    const list = filtered(state.workers, day, '').filter(w => w.location);

    if(!list.length){
      alert('No hay pasajeros para este día o no han sido geocodificados.');
      return;
    }

    // 1) Determinar ORIGEN: usar texto del input si existe; si no, usar state.origin; si no, usar primer pasajero
    let origin = state.origin;
    const typed = ($('#driverStart')?.value || '').trim();
    if (typed){
      try{
        const g = await geocodeAddress(typed);
        origin = { ...g.location, address: g.address };
        state.origin = origin;
      }catch(err){
        alert('No se pudo geocodificar la dirección de partida.'); 
        return;
      }
    }
    if(!origin){ origin = list[0].location; }

    // 2) Inicializar mapa (chofer) y renderer propios
    const mapEl = document.getElementById('mapDriver');
    if(!window.driverMap){
      window.driverMap = new google.maps.Map(mapEl, {center: origin, zoom: 12});
      window.driverRenderer = new google.maps.DirectionsRenderer({map: window.driverMap, suppressMarkers:false});
    }

    // Limpiar marcadores previos
    (window.driverMarkers||[]).forEach(m=>m.setMap(null));
    window.driverMarkers = [];

    // 3) Ordenar por distancia desde el origen (cercano -> lejano)
    const {order} = await requestRouteOrderedByDistance(origin, list);

    // 4) Marcar en el mapa
    order.forEach((w,i)=>{
      if(!w.location) return;
      const m = new google.maps.Marker({
        position: w.location,
        map: window.driverMap,
        label: String(i+1),
        title: w.name
      });
      window.driverMarkers.push(m);
    });

    // 5) Ajustar bounds incluyendo el origen
    const bounds = new google.maps.LatLngBounds();
    order.forEach(w => bounds.extend(new google.maps.LatLng(w.location.lat, w.location.lng)));
    if(origin) bounds.extend(new google.maps.LatLng(origin.lat, origin.lng));
    window.driverMap.fitBounds(bounds);

    // 6) Generar ruta respetando el orden (sin optimizar)
    try{
      const dir = await directionsFromOrderWithRenderer(origin, order, window.driverRenderer);

      // Resumen total (distancia/tiempo)
      if(dir){
        let totalDistance=0,totalDuration=0;
        dir.routes[0].legs.forEach(leg=>{
          totalDistance+=leg.distance.value; totalDuration+=leg.duration.value;
        });
        $('#routeSummary').innerHTML =
          `<span class="chip">Distancia total: <strong style="margin-left:6px">${(totalDistance/1000).toFixed(1)} km</strong></span>`+
          `<span class="chip">Tiempo estimado: <strong style="margin-left:6px">${Math.round(totalDuration/60)} min</strong></span>`;
      }
    }catch(err){
      console.warn('Error generando ruta chofer:', err);
    }

    // 7) Mostrar listado (con links + distancia/tiempo desde el origen)
    renderRouteList(order);
  });

  // ====== Mi ubicación para chofer ======
  $('#useMyLocationDriver').addEventListener('click',()=>{
    if(!navigator.geolocation){ alert('Geolocalización no disponible'); return; }
    navigator.geolocation.getCurrentPosition(pos=>{
      state.origin = {lat:pos.coords.latitude,lng:pos.coords.longitude,address:'Mi ubicación'};
      $('#driverStart').value = 'Mi ubicación';
      // Colocar marcador en el mapa del driver
      if(!window.driverMap) window.driverMap = new google.maps.Map(document.getElementById('mapDriver'),{center: state.origin, zoom:13});
      if(window.driverOriginMarker) window.driverOriginMarker.setMap(null);
      window.driverOriginMarker = new google.maps.Marker({position:state.origin, map:window.driverMap, label:'O', title:'Origen'});
      window.driverMap.panTo(state.origin);
    }, err=>alert('No se pudo obtener ubicación: '+err.message), {enableHighAccuracy:true, timeout:10000});
  });

  const lastRole=localStorage.getItem('lastRole')||'admin';
  if(lastRole==='driver') showDriver(); else showAdmin();
});

// ====== Actions expuestas ======
window.onDelete = id=>{
  if(!confirm('¿Eliminar este registro?'))return;
  state.workers=state.workers.filter(w=>w.id!==id);
  saveWorkers();
}
window.onEdit = id=>{
  const w=state.workers.find(x=>x.id===id); if(!w) return;
  $('#editId').value=w.id; $('#editName').value=w.name; $('#editAddress').value=w.address;
  $('#editPhone').value=w.phone; $('#editDay').value=w.day; $('#editShift').value=w.shift;
  $('#editNotes').value=w.notes||'';
  document.getElementById('editDialog').showModal();
}

// ====== Vistas ======
function showAdmin(){
  document.getElementById('adminArea').style.display='grid';
  document.getElementById('driverArea').style.display='none';
  localStorage.setItem('lastRole','admin');
  renderAll();
}
function showDriver(){
  document.getElementById('adminArea').style.display='none';
  document.getElementById('driverArea').style.display='block';
  localStorage.setItem('lastRole','driver');
  renderAll();
}

// ====== Render all ======
function renderRouteList(order){
  const listEl=$('#routeList');
  if(!order||!order.length){
    listEl.innerHTML='<li style="color:var(--muted)">Agrega trabajadores y genera una ruta.</li>';
    return;
  }
  listEl.innerHTML=order.map(p=>`
    <li>
      <strong>${p.name}</strong> — 
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}" target="_blank">
        ${p.address}
      </a>
      <span class="small">(${p.distanceText||'~'}, ${p.durationText||'~'})</span>
    </li>`).join('');
}
function renderAll(){ fillDaySelects(); renderStats(); renderTable(); renderDriverList(); }
