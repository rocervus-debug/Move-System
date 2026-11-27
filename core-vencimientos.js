// Las fechas de membresía son días de calendario, sin hora ni desfase horario.
function resumenVigencias(pagos,fechaHoy,esPase){
  const dia=raw=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw||'')) return null;
    const n=Date.parse(raw+'T00:00:00Z');
    return Number.isFinite(n) && new Date(n).toISOString().slice(0,10)===raw ? n/86400000 : null;
  };
  const hoy=dia(fechaHoy), socios=new Map();
  for(const p of pagos||[]){
    const nombre=(p.cliente||'').trim();
    if(!nombre || p.notas==='__sin_pago__' || esPase(p.plan)) continue;
    if(!socios.has(nombre)) socios.set(nombre,[]);
    socios.get(nombre).push(p);
  }
  const estados=new Map();
  for(const [nombre,filas] of socios){
    let acceso=false, mejor=null, prioridad=-1, orden=-Infinity;
    for(const p of filas){
      const fin=dia(p.vence), paquete=p.clases_totales!=null;
      const saldo=!paquete || Number(p.clases_usadas??0)<Number(p.clases_totales);
      // Una fecha ausente admite paquetes con saldo. Una fecha inválida no concede acceso.
      const sinFecha=!p.vence || p.vence==='—' || String(p.vence).length<10;
      const vigente=saldo && ((fin!==null && fin>=hoy) || (paquete && sinFecha));
      acceso ||= vigente;
      // Una congelación conserva su regla de acceso. Los avisos esperan a que se recalcule
      // la fecha. Un plan vigente independiente puede seguir mostrando su propio plazo.
      const nivel=vigente && !p.congelado?3:p.congelado && saldo?2:1;
      const finOrden=vigente && sinFecha?Infinity:fin??-Infinity;
      if(nivel>prioridad || (nivel===prioridad && (finOrden>orden ||
        (finOrden===orden && String(p.fecha||'')>String(mejor?.fecha||''))))){
        mejor=p; prioridad=nivel; orden=finOrden;
      }
    }
    const congelado=prioridad===2, fin=dia(mejor.vence);
    const agotado=!acceso && !congelado && mejor.clases_totales!=null &&
      Number(mejor.clases_usadas??0)>=Number(mejor.clases_totales) && (fin===null || fin>=hoy);
    const mejorVence=congelado || agotado || fin===null ? null:mejor.vence;
    estados.set(nombre,{nombre,acceso,congelado,agotado,mejorVence,diasRest:mejorVence?fin-hoy:null,pago:mejor});
  }
  return estados;
}

function personasParaRenovar(estados,directorio,dias,tipo){
  const clientes=new Map();
  for(const c of directorio||[]){
    const n=(c.nombre||'').trim();
    if(!clientes.has(n)) clientes.set(n,[]);
    clientes.get(n).push(c);
  }
  const lista=[];
  for(const e of estados.values()){
    if(e.congelado || !clientes.has(e.nombre)) continue;
    const vencido=!e.acceso && (e.agotado || e.diasRest!==null && e.diasRest<0);
    const proximo=e.acceso && e.diasRest!==null && e.diasRest>=0 && e.diasRest<=dias;
    if(!(tipo==='vencidos'?vencido:tipo==='ambos'?vencido||proximo:proximo)) continue;
    const p=e.pago, coincidencias=clientes.get(e.nombre);
    const homonimo=coincidencias.length>1;
    const origen=homonimo?'':String(coincidencias[0].telefono||p.telefono||'').trim();
    const digitos=origen.replace(/\D/g,'');
    const telefono=digitos.length===10?'52'+digitos:digitos;
    lista.push({...e,homonimo,telefono:/^\d{11,15}$/.test(telefono)?telefono:'',plan:p.plan||'Membresía'});
  }
  return lista.sort((a,b)=>(a.diasRest??0)-(b.diasRest??0) || a.nombre.localeCompare(b.nombre,'es'));
}

let _pvEstado='proximos';
let _pvDays=7;
function pvDatosListos(){
  return !!currentUser && !!MOVE_GYM_ID && [contextoClientesInicio,contextoPagosInicio].every(c=>
    c?.gym===MOVE_GYM_ID && c.user===currentUser && c.token===currentUser.jwt);
}
async function pvRecargar(btn){
  btn.disabled=true;btn.textContent='Consultando…';
  await Promise.allSettled([loadPagosFromSupabase(),loadClientesFromSupabase()]);
  if(document.getElementById('v-por-vencer').classList.contains('active')) renderPorVencer();
}
function pvPersonas(dias=_pvDays,tipo=_pvEstado){
  if(!pvDatosListos()) return [];
  return personasParaRenovar(estadoMembresiaPorCliente(),clientesDB,dias,tipo);
}
function setPVFilter(days){
  if(![7,14,30].includes(days)) return;
  _pvDays=days;_pvEstado='proximos';renderPorVencer();
}
function pvElegirEstado(estado){
  _pvEstado=estado==='vencidos'?'vencidos':'proximos';
  renderPorVencer();
}
function pvVigencia(p){
  if(p.agotado) return 'Clases agotadas';
  if(p.diasRest===0) return 'Vence hoy';
  if(p.diasRest===1) return 'Vence mañana';
  const dias=Math.abs(p.diasRest);
  return (p.diasRest<0?'Venció hace ':'Vence en ')+dias+(dias===1?' día':' días');
}
function pvTexto(p){
  const gym=gymConfig?.gym_nombre||'el gimnasio';
  const saludo='Hola, '+p.nombre.split(' ')[0]+'. Te escribimos de '+gym+'. ';
  if(p.agotado) return saludo+'Ya usaste las clases de tu paquete '+p.plan+'. ¿Te ayudamos a renovarlo?';
  const fecha=new Date(p.mejorVence+'T12:00:00Z').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  return saludo+'Tu plan '+p.plan+(p.acceso?' vence el ':' venció el ')+fecha+'. ¿Te ayudamos con la renovación?';
}
function renderPorVencer(){
  if(!pvDatosListos()){
    document.getElementById('pv-list').innerHTML='<p role="status">Falta consultar el directorio o los pagos de este gimnasio.</p><button class="btn btn-outline" onclick="pvRecargar(this)">Volver a consultar</button>';
    document.getElementById('pv-summary').textContent='';
    document.getElementById('pv-btn-todos').disabled=true;
    for(const b of document.querySelectorAll('#pv-estado button')) b.textContent=b.dataset.estado==='vencidos'?'Vencidos':'Próximos a vencer';
    return;
  }
  const estados=estadoMembresiaPorCliente(),lista=personasParaRenovar(estados,clientesDB,_pvDays,_pvEstado);
  const vencidos=_pvEstado==='vencidos'?lista:personasParaRenovar(estados,clientesDB,_pvDays,'vencidos');
  const proximos=_pvEstado==='proximos'?lista:personasParaRenovar(estados,clientesDB,_pvDays,'proximos');
  const botones=document.querySelectorAll('#pv-estado button');
  for(const b of botones){
    const esVencido=b.dataset.estado==='vencidos';
    b.textContent=(esVencido?'Vencidos':'Próximos a vencer')+' · '+(esVencido?vencidos:proximos).length;
    b.setAttribute('aria-pressed',String(b.dataset.estado===_pvEstado));
  }
  for(const d of [7,14,30]){
    const b=document.getElementById('pv-btn-'+d), activo=d===_pvDays;
    b.classList.toggle('active',activo);b.classList.toggle('btn-outline',!activo);b.setAttribute('aria-pressed',String(activo));
  }
  document.getElementById('pv-plazo').hidden=_pvEstado==='vencidos';
  const btn=document.getElementById('pv-btn-todos');btn.disabled=!lista.some(p=>p.telefono);
  const host=document.getElementById('pv-list');
  const fecha=p=>p.mejorVence?new Date(p.mejorVence+'T12:00:00Z').toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
  const moneyHidden=roleOcultaDinero();
  document.getElementById('pv-summary').textContent=lista.length&&!moneyHidden
    ?'Importe de los planes en la lista · '+_pvMoney2(lista.reduce((s,p)=>s+(Number(p.pago.monto)||0),0)):'';
  host.innerHTML=lista.length?lista.map((p,i)=>`<article class="pv-persona"><div><strong>${esc(p.nombre)}</strong><small>${esc(p.plan)}${p.mejorVence?' · '+fecha(p):''} · ${_pvMoney2(p.pago.monto||0)}</small></div>
    <span class="pv-vigencia">${pvVigencia(p)}</span><button type="button" class="btn btn-outline btn-sm" data-pv-persona="${i}" ${p.homonimo?'aria-expanded="false"':''}>${p.homonimo?'Revisar homónimos':p.telefono?'Ver recordatorio':'Editar teléfono'}</button>${p.homonimo?'<p class="pv-aviso" hidden>Hay varias fichas con este nombre. Verifica su identidad en Clientes antes de preparar un recordatorio.</p>':''}</article>`).join(''):
    '<p class="pv-empty">'+(_pvEstado==='vencidos'?'Sin membresías vencidas ni paquetes agotados.':'Sin vencimientos en los próximos '+_pvDays+' días.')+'</p>';
  host.onclick=e=>{
    const b=e.target.closest('[data-pv-persona]');if(!b) return;
    const p=lista[Number(b.dataset.pvPersona)];
    if(p.homonimo){
      const aviso=b.closest('.pv-persona').querySelector('.pv-aviso');
      aviso.hidden=!aviso.hidden;b.setAttribute('aria-expanded',String(!aviso.hidden));return;
    }
    if(p.telefono) pvRevisar([p],true);else abrirEditarTelefono(p.nombre);
  };
}
function pvRevisarNombre(nombre){
  const p=pvPersonas(30,'ambos').find(p=>p.nombre===nombre);
  if(p) pvRevisar([p],true);
}
function pvEnviarTodos(){pvRevisar(pvPersonas());}
function waEnMasa(){pvRevisar(pvPersonas(14,'ambos'));}

function pvRevisar(personas,individual=false){
  const origen=document.querySelector('.view.active')?.id.slice(2)||'por-vencer';
  if(!currentUser || roleBlocksView(origen)) return;
  if(!pvDatosListos()){toast('Falta consultar los clientes y pagos del gimnasio.','ℹ️');return;}
  const gym=MOVE_GYM_ID,user=currentUser,rol=user.rol,token=user.jwt;
  const filas=personas.filter(p=>p.telefono).map(p=>({nombre:p.nombre,telefono:p.telefono,texto:pvTexto(p)}));
  if(!filas.length){toast('Ningún destinatario tiene teléfono disponible.','ℹ️');return;}
  const elegidos=new Set(individual?[0]:[]);
  const dialog=abrirDialogoCore('Recordatorios de renovación','<div class="pv-lector"></div>');
  dialog.dataset.renovaciones='';
  const host=dialog.querySelector('.pv-lector');
  const vigente=()=>pvDatosListos() && gym===MOVE_GYM_ID && currentUser===user && rol===currentUser?.rol && token===currentUser?.jwt && !roleBlocksView(origen);
  function seleccion(){
    host.innerHTML='<p>Elige a quién quieres contactar.</p><div class="pv-candidatos">'+filas.map((p,i)=>
      `<label><input type="checkbox" value="${i}" ${elegidos.has(i)?'checked':''}><span><strong>${esc(p.nombre)}</strong><small>+${p.telefono}</small></span></label>`).join('')+'</div><button type="button" class="btn btn-primary" data-pv-revisar></button>';
    const btn=host.querySelector('[data-pv-revisar]');
    function contar(){btn.disabled=!elegidos.size;btn.textContent='Revisar selección · '+elegidos.size;}
    host.onchange=e=>{const i=Number(e.target.value);if(e.target.checked)elegidos.add(i);else elegidos.delete(i);contar();};
    btn.onclick=revisar;contar();
  }
  function revisar(){
    if(!vigente()){dialog.close();return;}
    host.onchange=null;
    host.innerHTML='<p>'+elegidos.size+(elegidos.size===1?' destinatario':' destinatarios')+' · Abre cada conversación y revisa el mensaje en WhatsApp antes de enviarlo.</p>'+
      (!individual?'<button type="button" class="btn btn-outline btn-sm" data-pv-volver>Cambiar selección</button>':'')+
      [...elegidos].map(i=>{const p=filas[i];return `<article class="pv-mensaje"><strong>${esc(p.nombre)}</strong><small>+${p.telefono}</small><p>${esc(p.texto)}</p><button type="button" class="btn btn-primary" data-pv-abrir="${i}">Abrir en WhatsApp</button></article>`;}).join('');
    host.querySelector('[data-pv-volver]')?.addEventListener('click',seleccion);
    host.querySelectorAll('[data-pv-abrir]').forEach(b=>b.onclick=()=>{
      if(!vigente()){dialog.close();return;}
      const p=filas[Number(b.dataset.pvAbrir)];
      // Si el panel recibió una renovación o un teléfono nuevo durante la revisión, pide seleccionar otra vez.
      const actual=pvPersonas(30,'ambos').find(socio=>socio.nombre===p.nombre);
      if(!actual || actual.telefono!==p.telefono || pvTexto(actual)!==p.texto){
        dialog.close();
        if(origen==='por-vencer') renderPorVencer();
        toast('Los datos del socio cambiaron. Revisa de nuevo el recordatorio.','↺');
        return;
      }
      window.open('https://wa.me/'+p.telefono+'?text='+encodeURIComponent(p.texto),'_blank','noopener,noreferrer');
    });
  }
  if(individual) revisar();else seleccion();
}
