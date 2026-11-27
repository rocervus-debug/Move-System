// Agenda del gimnasio. El pase de lista y la planificación comparten las mismas clases efectivas.
let horTabActual='mensual';
let horTabElegida=false;
let lecturaAgendaDia=0;
let lecturaHorarioPublico=0;
let lecturaCalendarioLugares=0;

function resolverClasesFecha(filas,fecha,dia,canceladas){
  const horas=new Map();
  for(const h of filas){
    const esExcepcion=h.fecha===fecha;
    if(!esExcepcion && (h.fecha || h.dia!==dia)) continue;
    if(!horas.has(h.hora)) horas.set(h.hora,{plantillas:[],excepciones:[]});
    const grupo=horas.get(h.hora);
    (esExcepcion?grupo.excepciones:grupo.plantillas).push(h);
  }
  const clases=[];
  const abierta=h=>h.tipo!=='CERRADO' && !canceladas.has(String(h.id));
  for(const {plantillas,excepciones} of horas.values()){
    // El trigger de reserva asocia los dos IDs sólo si la relación es inequívoca,
    // contando también filas cerradas o canceladas antes de decidir qué mostrar.
    if(plantillas.length===1 && excepciones.length===1){
      const excepcion=excepciones[0];
      if(abierta(excepcion)) clases.push({...excepcion,base_id:plantillas[0].id});
    }else{
      clases.push(...plantillas.filter(abierta),...excepciones.filter(abierta));
    }
  }
  return clases.sort((a,b)=>_horaToMinutes(a.hora)-_horaToMinutes(b.hora));
}

let horarioMovil;

function colocarAccionHorario(vista){
  if(!horarioMovil){
    horarioMovil=window.matchMedia('(max-width:768px)');
    horarioMovil.addEventListener('change',()=>{
      colocarAccionHorario(document.getElementById('v-horario').classList.contains('active')?'horario':'');
    });
  }
  const boton=document.getElementById('topBtn'), destino=document.getElementById('hor-accion-clase');
  if(vista==='horario' && horarioMovil.matches){
    if(boton.parentElement!==destino) destino.append(boton);
  }else if(boton.parentElement===destino){
    document.getElementById('msearch-btn').before(boton);
  }
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

function cupoAgendaDia(clase,ocupacion){
  const suma=mapa=>(mapa[clase.id]||0)+(clase.base_id?mapa[clase.base_id]||0:0);
  const bloqueados=suma(ocupacion.bloqueadosPorClase);
  const cupo=Number(clase.cupo);
  return {bloqueados,reservados:suma(ocupacion.porClase)-bloqueados,ofrecidos:cupo>0?Math.max(0,cupo-bloqueados):null};
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
      let resumen='Ocupación por confirmar';
      if(ocupacion){
        const {reservados,ofrecidos,bloqueados}=cupoAgendaDia(h,ocupacion);
        resumen=ofrecidos==null?reservados+' reservados · Sin cupo definido':reservados+' / '+ofrecidos+' lugares';
        if(bloqueados) resumen+=' · '+bloqueados+(bloqueados===1?' bloqueado':' bloqueados');
      }
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
