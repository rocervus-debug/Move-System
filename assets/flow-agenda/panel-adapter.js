/* Lecturas de Agenda por contexto capturado. La vista no llama rutas de escritura legacy. */
(function(){
 'use strict';
 const el=id=>document.getElementById(id);let active=null,view=null,timer=null,generation=0;
 function capture(){
  if(typeof currentUser==='undefined'||!currentUser||typeof MOVE_GYM_ID==='undefined'||!['admin','superadmin','recepcion'].includes(currentUser.rol)||!currentUser.jwt||typeof isJwtExpired!=='function'||isJwtExpired(currentUser.jwt)||!currentUser.gym_id||String(currentUser.gym_id)!==String(MOVE_GYM_ID)||!window.supabaseClient||(typeof roleBlocksView==='function'&&roleBlocksView('horario')))return null;
  return {actor:currentUser,id:currentUser.id,role:currentUser.rol,gym:String(MOVE_GYM_ID),jwt:currentUser.jwt,client:window.supabaseClient};
 }
 function same(ctx){const now=capture();return !!(ctx&&now&&Object.keys(now).every(k=>now[k]===ctx[k]));}
 function close(){generation++;active=null;clearInterval(timer);timer=null;view?.dispose();view=null;el('flow-agenda-root').replaceChildren();el('flow-agenda-root').hidden=true;el('horario-legacy').hidden=false;el('flow-agenda-toggle').textContent='Vista Flow';el('flow-agenda-toggle').setAttribute('aria-expanded','false');}
 async function load(date,span){
  const saved=active,request=++generation;
  if(!same(saved)){close();return;}
  if(!VelumAgendaModel.validDate(date)||![1,7].includes(span))return;
  view?.update({status:'loading',events:[]});
  const end=VelumAgendaModel.add(date,span-1);
  async function read(table,columns,limit){
   try{let q=saved.client.from(table).select(columns,{count:'exact'}).eq('gym_id',saved.gym);
    if(table!=='horarios')q=q.gte('fecha',date).lte('fecha',end);
    if(table==='waitlist')q=q.eq('estado','espera');
    return await q.order('id').limit(limit);
   }catch(_){return {error:true};}
  }
  const [horarios,cancelaciones,reservas,espera]=await Promise.all([
   read('horarios','id,gym_id,dia,hora,tipo,coach_nombre,cupo,fecha',2000),
   read('horario_cancelaciones','id,gym_id,horario_id,fecha',2000),
   read('reservas','id,gym_id,horario_id,fecha,estado',5000),
   read('waitlist','id,gym_id,horario_id,fecha,estado',2000)
  ]);
  if(request!==generation||!view)return;
  if(!same(saved)){close();return;}
  view.update(VelumAgendaModel.build({gym:saved.gym,date,span,horarios,cancelaciones,reservas,espera}));
 }
 function receptionDay(event) {
  if (!same(active) || roleBlocksView('asistencia') || !['open','full'].includes(event.state)) return -1;
  for (let offset = 0; offset < 7; offset++) {
   if (_asistFechaSel_offset(offset) === event.date) return offset;
  }
  return -1;
 }
 function openReception(event) {
  const offset = receptionDay(event);
  if (offset < 0) return;
  go('asistencia', el('nav-asistencia'), offset);
  if (!el('v-asistencia').classList.contains('active') || _asistFechaSel() !== event.date) return;
  abrirDetalleClase(event.id, event.time, event.activity, event.coach, event.capacity);
 }
 function toggle(){
  if(view){close();return;}
  active=capture();if(!active||!window.VelumAgendaView||!window.VelumAgendaModel)return;
  el('horario-legacy').hidden=true;el('flow-agenda-root').hidden=false;el('flow-agenda-toggle').textContent='Vista habitual';el('flow-agenda-toggle').setAttribute('aria-expanded','true');
  const today=typeof _hoyMX==='function'?_hoyMX():new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date());
  view=VelumAgendaView.mount(el('flow-agenda-root'),{today,onChange:load,canReceive:event=>receptionDay(event)>=0,onReceive:openReception});
  timer=setInterval(()=>{if(!same(active))close();},250);load(today,1);
 }
 window.VelumFlowAgenda=Object.freeze({toggle,close});
})();
