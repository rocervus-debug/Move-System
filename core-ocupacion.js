// Dos semanas completas con los mismos días de la semana. El día de hoy aún no ha terminado.
const fechasCupoMX = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'});
const fechaCupoCorta = new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'});
function fechasOcupacion(hoy){
  const fin = new Date(hoy+'T12:00:00Z');
  return Array.from({length:14},(_,i)=>new Date(fin.valueOf()+(i-14)*86400000).toISOString().slice(0,10));
}

function franjasOcupacion(fechas, horarios, cancelaciones, reservas){
  const franjas=new Map();
  const alta=new Map(horarios.map(h=>[h.id,h.created_at?fechasCupoMX.format(new Date(h.created_at)):null]));
  const porFecha=new Map();
  for(const r of reservas){
    if(r.estado==='cancelado') continue;
    if(!porFecha.has(r.fecha)) porFecha.set(r.fecha,[]);
    porFecha.get(r.fecha).push(r);
  }
  const cancelPorFecha=new Map();
  for(const c of cancelaciones){
    if(!cancelPorFecha.has(c.fecha)) cancelPorFecha.set(c.fecha,new Set());
    cancelPorFecha.get(c.fecha).add(String(c.horario_id));
  }
  for(const [i,fecha] of fechas.entries()){
    const dia=_hovDiaNombre(fecha);
    const canceladas=cancelPorFecha.get(fecha)||new Set();
    const candidatas=horarios.filter(h=>h.fecha===fecha || (!h.fecha && h.dia===dia && (!alta.get(h.id)||alta.get(h.id)<=fecha)));
    const vigentes=resolverClasesFecha(candidatas,fecha,dia,canceladas);
    const clases=vigentes.map(h=>({fecha,hora:h.hora,tipo:h.tipo,cupo:Number(h.cupo)>0?Number(h.cupo):null,reservas:0}));
    const porId=new Map();
    vigentes.forEach((h,k)=>{
      porId.set(String(h.id),clases[k]);
      if(h.base_id!=null && !porId.has(String(h.base_id))) porId.set(String(h.base_id),clases[k]);
    });
    const conocidas=new Set(candidatas.map(h=>String(h.id)));
    const sinPlantilla=new Map();
    for(const r of porFecha.get(fecha)||[]){
      const id=String(r.horario_id);
      let clase=porId.get(id);
      if(!clase && canceladas.has(id)) continue;
      // Las filas borradas del horario conservan las reservas, pero su cupo ya no se conoce.
      if(!clase && conocidas.has(id)) continue;
      if(!clase && r.horario_id==null){
        const candidatas=clases.filter(c=>_horaToMinutes(c.hora)===_horaToMinutes(r.clase_hora) && c.tipo===r.clase_tipo);
        if(candidatas.length===1) clase=candidatas[0];
      }
      if(!clase){
        const clave=JSON.stringify([id,r.clase_hora,r.clase_tipo]);
        clase=sinPlantilla.get(clave);
        if(!clase){
          clase={fecha,hora:r.clase_hora,tipo:r.clase_tipo||'Clase',cupo:null,reservas:0};
          sinPlantilla.set(clave,clase);
        }
      }
      if(r.estado==='bloqueado'){
        if(clase.cupo!==null) clase.cupo=Math.max(0,clase.cupo-1);
      }else{
        clase.reservas++;
      }
    }
    for(const clase of [...clases,...sinPlantilla.values()]){
      const hora=_horaToMinutes(clase.hora);
      let franja=franjas.get(hora);
      if(!franja){
        const etiqueta=hora>=1440?'Hora sin registrar':String(Math.floor(hora/60)).padStart(2,'0')+':'+String(hora%60).padStart(2,'0');
        franja={hora,etiqueta,actual:[],anterior:[]};
        franjas.set(hora,franja);
      }
      franja[i<7?'anterior':'actual'].push(clase);
    }
  }
  return [...franjas.values()].sort((a,b)=>a.hora-b.hora);
}

function totalesOcupacion(clases){
  const lugares=clases.reduce((n,c)=>n+(c.cupo||0),0);
  const reservas=clases.reduce((n,c)=>n+c.reservas,0);
  const porcentaje=lugares>0 && clases.every(c=>c.cupo!=null)?Math.round(100*reservas/lugares):null;
  return {lugares,reservas,porcentaje};
}

// El límite de filas por respuesta depende del proyecto. Se pagina por ID único
// hasta terminar, sin leer nombres, teléfonos ni datos de pago de los socios.
async function leerFilasOcupacion(consulta,vigente){
  const filas=[];
  for(;;){
    if(!vigente()) throw new Error('Cambió el contexto');
    let q=consulta().order('id').limit(500);
    if(filas.length) q=q.gt('id',filas[filas.length-1].id);
    const {data,error}=await q;
    if(error) throw error;
    if(!Array.isArray(data)) throw new Error('Respuesta incompleta');
    if(!data.length) return filas;
    if(filas.length && data[0].id===filas[filas.length-1].id) throw new Error('No avanzó la lectura');
    filas.push(...data);
  }
}

let lecturaOcupacion=null;
function mostrarOcupacion(abierto,forzar=false){
  const seccion=document.getElementById('core-ocupacion');
  if(!seccion) return;
  const user=currentUser, gym=MOVE_GYM_ID, token=user?.jwt, hoy=_hoyMX();
  const visible=abierto && gym && user && ['admin','superadmin'].includes(user.rol) && _gymVertical==='gym';
  seccion.hidden=!visible;
  const cuerpo=document.getElementById('core-ocupacion-lista');
  if(!visible){ lecturaOcupacion=null; cuerpo.replaceChildren(); return; }
  const anterior=lecturaOcupacion;
  if(!forzar && anterior?.gym===gym && anterior.user===user && anterior.token===token && anterior.hoy===hoy) return;
  const consulta=lecturaOcupacion={gym,user,token,hoy};
  const vigente=()=>consulta===lecturaOcupacion && currentUser===user && currentUser?.jwt===token && MOVE_GYM_ID===gym && _gymVertical==='gym' && !seccion.hidden;
  const fechas=fechasOcupacion(hoy);
  const desde=fechas[0],hasta=fechas[13];
  const fechaCorta=f=>fechaCupoCorta.format(new Date(f+'T12:00:00Z'));
  document.getElementById('core-ocupacion-periodo').textContent=fechaCorta(fechas[7])+' – '+fechaCorta(hasta)+' frente a '+fechaCorta(desde)+' – '+fechaCorta(fechas[6]);
  cuerpo.textContent='Consultando clases y reservas…';
  const db=window.supabaseClient;
  const rango=q=>q.eq('gym_id',gym).gte('fecha',desde).lte('fecha',hasta);
  Promise.all([
    leerFilasOcupacion(()=>db.from('horarios').select('id,hora,tipo,cupo,dia,fecha,created_at').eq('gym_id',gym).or('fecha.is.null,fecha.eq."",and(fecha.gte.'+desde+',fecha.lte.'+hasta+')'),vigente),
    leerFilasOcupacion(()=>rango(db.from('horario_cancelaciones').select('id,fecha,horario_id')),vigente),
    leerFilasOcupacion(()=>rango(db.from('reservas').select('id,fecha,horario_id,clase_hora,clase_tipo,estado')).neq('estado','cancelado'),vigente)
  ]).then(([horarios,canceladas,reservas])=>{
    if(!vigente()) return;
    const franjas=franjasOcupacion(fechas,horarios,canceladas,reservas);
    const textoPorcentaje=clases=>{const n=totalesOcupacion(clases).porcentaje;return n==null?'Sin datos':n+'%';};
    function detalle(clases,periodo){
      const total=totalesOcupacion(clases);
      const lista=clases.map(c=>'<li><span>'+fechaCorta(c.fecha)+' · '+esc(c.tipo)+'</span> <span>'+c.reservas+' / '+(c.cupo??'cupo sin registrar')+'</span></li>').join('');
      return '<h4>'+periodo+' · '+total.reservas+' reservas</h4>'+(lista?'<ul>'+lista+'</ul>':'<p>Sin clases registradas.</p>');
    }
    cuerpo.innerHTML=franjas.length?franjas.map(f=>'<details><summary><strong>'+f.etiqueta+'</strong> <span>'+textoPorcentaje(f.actual)+'</span> <small>Anterior · '+textoPorcentaje(f.anterior)+'</small></summary>'+detalle(f.actual,'Últimos 7 días')+detalle(f.anterior,'7 días anteriores')+'</details>').join(''):'No hay clases ni reservas en estas dos semanas.';
  }).catch(()=>{
    if(vigente()) cuerpo.innerHTML='<p>No se pudo consultar la ocupación.</p><button class="btn btn-outline" type="button" onclick="mostrarOcupacion(true,true)">Reintentar</button>';
  });
}
