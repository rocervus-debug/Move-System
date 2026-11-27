// Agenda del gimnasio. El pase de lista y la planificación comparten las mismas clases efectivas.
let horTabActual='mensual';
let horTabElegida=false;
let lecturaAgendaDia=0;
let lecturaHorarioPublico=0;
let lecturaCalendarioLugares=0;

function resolverClasesFecha(filas,fecha,dia,canceladas){
  const plantillas=filas.filter(h=>!h.fecha && h.dia===dia && h.tipo!=='CERRADO' && !canceladas.has(String(h.id)));
  const excepciones=filas.filter(h=>h.fecha===fecha);
  const horasSustituidas=new Set(excepciones.map(h=>h.hora));
  const clases=plantillas.filter(h=>!horasSustituidas.has(h.hora));
  for(const h of excepciones){
    if(h.tipo==='CERRADO' || canceladas.has(String(h.id))) continue;
    const base=plantillas.find(b=>b.hora===h.hora);
    clases.push({...h,base_id:base?.id});
  }
  return clases.sort((a,b)=>_horaToMinutes(a.hora)-_horaToMinutes(b.hora));
}

function horTabPredeterminada(){
  if(window.matchMedia('(max-width:768px)').matches) return 'dia';
  return _fLugaresP()?'lugares':'mensual';
}

function entrarAlHorario(){
  const contexto=contextoPagoGym();
  document.getElementById('hor-dia-fecha').value=_asistFechaSel_offset(0);
  _scSelId=null;
  switchHorTab(horTabPredeterminada(),false);
  cargarHorarioPublico();
  Promise.all([loadHorarioOverridesFromSupabase(),loadHorarioCancelaciones()]).then(()=>{
    if(pagoGymVigente(contexto) && horTabActual==='mensual' && document.getElementById('v-horario').classList.contains('active')) renderHorarioMensual();
  });
}

function agendaVolverAHoy(){
  document.getElementById('hor-dia-fecha').value=_asistFechaSel_offset(0);
  renderAgendaDia();
}

async function renderAgendaDia(){
  const lectura=++lecturaAgendaDia, contexto=contextoPagoGym();
  const selector=document.getElementById('hor-dia-fecha'), lista=document.getElementById('hor-dia-lista');
  const fecha=selector.value;
  lista.textContent='';
  if(!contexto.vista || !pagoGymVigente(contexto)) return;
  if(!fecha || !selector.validity.valid){ lista.textContent='Elige una fecha para ver sus clases.'; return; }
  lista.textContent='Consultando las clases…';
  const vigente=()=>lectura===lecturaAgendaDia && pagoGymVigente(contexto) && selector.value===fecha;
  try{
    const [clases,ocupacion]=await Promise.all([
      _horariosEfectivosFecha(fecha,_hovDiaNombre(fecha),true),
      _gymHoyOcupacion(fecha,contexto.vista)
    ]);
    if(!vigente()) return;
    if(!clases.length){ lista.textContent='No hay clases programadas para esta fecha.'; return; }
    const puedeAbrir=!roleBlocksView('asistencia');
    const filas=clases.map(h=>{
      const cupo=Number(h.cupo);
      const total=ocupacion?(ocupacion.porClase[h.id]||0)+(h.base_id?ocupacion.porClase[h.base_id]||0:0):null;
      const resumen=total===null?'Ocupación por confirmar':cupo>0?total+' / '+cupo+' lugares':total+' reservados · Sin cupo definido';
      const fila=document.createElement(puedeAbrir?'button':'div');
      fila.className='hor-dia-clase';
      fila.innerHTML='<strong>'+esc(fmtHoraClase(h.hora))+'</strong><span><b>'+esc(h.tipo||'Clase')+'</b><small>'+esc(h.coach_nombre||'Coach por asignar')+'</small></span><span class="hor-dia-cupo">'+resumen+'</span>';
      if(puedeAbrir){
        fila.type='button';
        fila.setAttribute('aria-label','Abrir lista: '+fmtHoraClase(h.hora)+' · '+(h.tipo||'Clase')+' · '+resumen);
        fila.addEventListener('click',()=>{
          if(vigente()) abrirClaseHoy(String(h.id),fecha);
        });
      }
      return fila;
    });
    lista.replaceChildren(...filas);
    if(!ocupacion) lista.append(botonReintentarAgenda(renderAgendaDia));
  }catch{
    if(!vigente()) return;
    lista.textContent='No se pudo consultar la agenda. ';
    lista.append(botonReintentarAgenda(renderAgendaDia));
  }
}

function botonReintentarAgenda(accion){
  const btn=document.createElement('button');
  btn.type='button'; btn.className='btn btn-outline'; btn.textContent='Reintentar';
  btn.addEventListener('click',accion);
  return btn;
}

async function cargarHorarioPublico(){
  const box=document.getElementById('hor-publico');
  const contexto=contextoPagoGym(), lectura=++lecturaHorarioPublico;
  box.replaceChildren();
  if(!contexto.vista || !pagoGymVigente(contexto)) return;
  const vigente=()=>pagoGymVigente(contexto) && lectura===lecturaHorarioPublico;
  try{
    const [tienda,tabs]=await Promise.all([
      contexto.db.from('gym_storefront').select('slug,is_enabled,show_schedule').eq('gym_id',contexto.vista).maybeSingle(),
      contexto.db.from('gym_config').select('value').eq('gym_id',contexto.vista).eq('key','sf_tabs').maybeSingle()
    ]);
    if(!vigente()) return;
    if(tienda.error || tabs.error) throw tienda.error || tabs.error;
    const sf=tienda.data;
    let visibles=tabs.data?.value;
    if(typeof visibles==='string'){
      try{ visibles=JSON.parse(visibles); }catch{ visibles=null; } // Misma interpretación que la tienda.
    }
    let aviso='';
    if(!sf?.is_enabled || !sf.slug) aviso='La página del gimnasio está sin publicar.';
    else if(!sf.show_schedule || (Array.isArray(visibles) && visibles.length && !visibles.includes('horario'))) aviso='El horario está oculto en la página pública.';
    if(!aviso){
      const enlace=document.createElement('a');
      enlace.className='btn btn-outline'; enlace.textContent='Ver horario público';
      enlace.href=STOREFRONT_PUBLIC_BASE+encodeURIComponent(sf.slug)+'#horario';
      enlace.target='_blank'; enlace.rel='noopener';
      enlace.addEventListener('click',e=>{if(!vigente()){e.preventDefault(); cargarHorarioPublico();}});
      box.append(enlace);
      return;
    }
    box.textContent=aviso;
    if(roleAllowsSettings('storefront') && !roleBlocksView('settings')){
      const btn=document.createElement('button');
      btn.type='button'; btn.className='btn btn-outline'; btn.textContent='Configurar página pública';
      btn.addEventListener('click',()=>{
        if(!vigente()) return;
        go('settings',document.getElementById('nav-settings')); openSettingsPanel('storefront');
      });
      box.append(btn);
    }
  }catch{
    if(!vigente()) return;
    box.textContent='No se pudo consultar el horario público. ';
    box.append(botonReintentarAgenda(cargarHorarioPublico));
  }
}
