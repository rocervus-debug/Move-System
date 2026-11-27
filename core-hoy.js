// Inicio del gimnasio. Los accesos abren el directorio y la lista de asistencia existentes.
function abrirRenovacionesHoy(estado){
  if(roleBlocksView('clientes')) return;
  document.getElementById('clientes-search').value='';
  _cliPage=0;
  go('clientes',document.getElementById('nav-clientes'));
  setCliFiltroRapido(estado);
}

function pintarProximaClase(clases,ocupacion,ahora){
  const el=document.getElementById('gym-hoy-body');
  const minutos=ahora.getHours()*60+ahora.getMinutes();
  const proxima=clases.find(c=>_horaToMinutes(c.hora)>=minutos && _horaToMinutes(c.hora)<1440);
  if(!proxima){
    el.innerHTML=clases.length?'<p class="core-hoy-vacio">Ya comenzaron todas las clases de hoy.</p>':'<p class="core-hoy-vacio">Hoy no hay clases programadas.</p>';
    return;
  }
  const inscritos=ocupacion?(ocupacion[proxima.id]||0)+(proxima.base_id?ocupacion[proxima.base_id]||0:0):null;
  const cupo=Number(proxima.cupo);
  const detalle=inscritos===null?'Ocupación por confirmar':cupo>0?inscritos+' de '+cupo+' lugares ocupados':inscritos+' lugares ocupados';
  const barra=cupo>0 && inscritos!==null?'<progress aria-label="Ocupación de la clase" max="'+cupo+'" value="'+Math.min(inscritos,cupo)+'"></progress>':'';
  const markup=`<button type="button" class="core-hoy-abrir" data-slot="${esc(String(proxima.id)).replace(/"/g,'&quot;')}" onclick="abrirClaseHoy(this.dataset.slot)">
    <span class="core-hoy-hora">${esc(fmtHoraClase(proxima.hora))}</span>
    <span class="core-hoy-nombre">${esc(proxima.tipo||'Clase')}</span>
    ${proxima.coach_nombre?'<span class="core-hoy-coach">'+esc(proxima.coach_nombre)+'</span>':''}
    <span class="core-hoy-ocupacion">${detalle}</span>${barra}
    <span class="core-hoy-accion">Abrir lista de clase <span aria-hidden="true">→</span></span></button>`;
  const boton=el.querySelector('.core-hoy-abrir');
  if(boton && el._ultimaClase===markup) return;
  const enfocado=boton && boton===document.activeElement;
  el.innerHTML=markup;
  el._ultimaClase=markup;
  if(enfocado) el.querySelector('button').focus({preventScroll:true});
}

let consultaInicioHoy=null;
let refrescoInicioHoy;
async function renderInicioHoy(estados){
  clearTimeout(refrescoInicioHoy);
  const el=document.getElementById('core-hoy'), cuerpo=document.getElementById('gym-hoy-body');
  const gym=MOVE_GYM_ID, user=currentUser, token=user?.jwt;
  const reservar=document.getElementById('core-reservar-lugar');
  if(reservar) reservar.hidden=!puedeReservarMostrador();
  el.hidden=_gymVertical!=='gym' || !gym || !user;
  if(document.hidden || el.hidden || !document.getElementById('v-dashboard').classList.contains('active')) return;
  const fecha=_asistFechaSel_offset(0);
  const ahora=new Date();
  document.getElementById('core-hoy-fecha').textContent=ahora.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});
  const disponible=[contextoPagosInicio,contextoClientesInicio].every(c=>c?.gym===gym && c.user===user && c.token===token);
  let vencidos=0,proximos=0;
  if(disponible){
    const socios=new Set(clientesDB.map(c=>c.nombre?.trim()));
    for(const [nombre,estado] of estados||estadoMembresiaPorCliente()){
      if(!socios.has(nombre) || estado.congelado) continue;
      if(!estado.acceso && (estado.agotado || estado.mejorVence)) vencidos++;
      else if(estado.diasRest!=null && estado.diasRest<=14) proximos++;
    }
  }
  document.getElementById('core-hoy-vencido').textContent=disponible?vencidos:'—';
  document.getElementById('core-hoy-por-vencer').textContent=disponible?proximos:'—';
  if(consultaInicioHoy?.gym===gym && consultaInicioHoy.user===user && consultaInicioHoy.token===token && consultaInicioHoy.fecha===fecha && consultaInicioHoy.cargando) return;
  const anterior=consultaInicioHoy;
  const consulta=consultaInicioHoy={gym,user,token,fecha,cargando:true};
  if(!anterior || anterior.gym!==gym || anterior.user!==user || anterior.token!==token || anterior.fecha!==fecha)
    cuerpo.innerHTML='<p class="core-hoy-vacio" role="status">Consultando la agenda…</p>';
  const vigente=()=>consultaInicioHoy===consulta && MOVE_GYM_ID===gym && currentUser===user && token===currentUser?.jwt && _gymVertical==='gym' && fecha===_asistFechaSel_offset(0);
  try{
    const [clases,ocupacion]=await Promise.all([_horariosEfectivosFecha(fecha,_hovDiaNombre(fecha),true),_gymHoyOcupacion(fecha,gym)]);
    if(vigente()){
      pintarProximaClase(clases,ocupacion?.porClase,new Date());
      window._mhwCheckins=ocupacion?.asistencias;
      for(const id of ['mhw-checkins','kpi-checkins-hoy']) document.getElementById(id).textContent=ocupacion?.asistencias??'—';
    }
  }catch{
    if(vigente()) cuerpo.innerHTML='<p class="core-hoy-vacio">No se pudo consultar la agenda.</p><button type="button" class="btn btn-outline" onclick="renderInicioHoy()">Reintentar</button>';
  }finally{
    consulta.cargando=false;
    if(vigente() && !document.hidden && document.getElementById('v-dashboard').classList.contains('active'))
      refrescoInicioHoy=setTimeout(()=>renderInicioHoy(),60000);
  }
}

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && document.getElementById('v-dashboard')?.classList.contains('active')) renderInicioHoy();
});
