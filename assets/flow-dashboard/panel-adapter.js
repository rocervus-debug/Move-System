/* Inicio captura permisos/contexto antes de cada lectura y navegación. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);let active=null,view=null,timer=null,generation=0;
  function capture(){
    if(typeof currentUser==='undefined'||!currentUser||typeof MOVE_GYM_ID==='undefined'||!['admin','superadmin','recepcion'].includes(currentUser.rol)||
      !currentUser.jwt||typeof isJwtExpired!=='function'||isJwtExpired(currentUser.jwt)||!currentUser.gym_id||String(currentUser.gym_id)!==String(MOVE_GYM_ID)||!window.supabaseClient||
      typeof roleBlocksView!=='function'||roleBlocksView('dashboard'))return null;
    return {actor:currentUser,id:currentUser.id,role:currentUser.rol,gym:String(MOVE_GYM_ID),jwt:currentUser.jwt,client:window.supabaseClient,
      canMoney:['admin','superadmin'].includes(currentUser.rol)&&typeof roleOcultaDinero==='function'&&!roleOcultaDinero(),
      canCustomers:!roleBlocksView('clientes'),canAgenda:!roleBlocksView('horario')};
  }
  function same(ctx){const now=capture();return !!(ctx&&now&&Object.keys(now).every(key=>now[key]===ctx[key]));}
  function close(){generation++;active=null;clearInterval(timer);timer=null;view?.dispose();view=null;el('flow-dashboard-root').replaceChildren();el('flow-dashboard-root').hidden=true;el('dashboard-legacy').hidden=false;el('flow-dashboard-toggle').textContent='Vista Flow';el('flow-dashboard-toggle').setAttribute('aria-expanded','false');}
  async function load(){
    const saved=active,request=++generation;if(!same(saved)){close();return {state:'context_changed'};}
    const date=typeof _hoyMX==='function'?_hoyMX():new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date());
    view.update({status:'loading'});
    if(!VelumDashboardModel.validDate(date)){view.update({status:'error'});return {state:'pending'};}
    async function read(table,columns,{head=false,today=false,month=false}={}){
      try{let q=saved.client.from(table).select(columns,{count:'exact',head}).eq('gym_id',saved.gym);
        if(today)q=q.eq('fecha',date);if(month)q=q.gte('fecha',date.slice(0,8)+'01').lte('fecha',date);
        if(table==='waitlist')q=q.eq('estado','espera');
        return await q.order('id').limit(table==='reservas'||table==='pagos'?5000:2000);
      }catch(_){return {error:true};}
    }
    const denied={error:true};
    const [payments,customers,visits,horarios,cancelaciones,reservas,espera]=await Promise.all([
      saved.canMoney?read('pagos','id,gym_id,fecha,monto',{month:true}):denied,
      saved.canCustomers?read('clientes','id',{head:true}):denied,
      read('asistencias','id',{head:true,today:true}),
      saved.canAgenda?read('horarios','id,gym_id,dia,hora,tipo,coach_nombre,cupo,fecha'):denied,
      saved.canAgenda?read('horario_cancelaciones','id,gym_id,horario_id,fecha',{today:true}):denied,
      saved.canAgenda?read('reservas','id,gym_id,horario_id,fecha,estado',{today:true}):denied,
      saved.canAgenda?read('waitlist','id,gym_id,horario_id,fecha,estado',{today:true}):denied
    ]);
    if(request!==generation||!view)return {state:view?'pending':'inactive'};if(!same(saved)){close();return {state:'context_changed'};}
    const agenda=VelumAgendaModel.build({gym:saved.gym,date,horarios,cancelaciones,reservas,espera});
    const model=VelumDashboardModel.build({gym:saved.gym,date,payments,customers,visits,agenda,canMoney:saved.canMoney});
    view.update({...model,canCustomers:saved.canCustomers,canAgenda:saved.canAgenda});
    return {state:(!saved.canMoney||model.total!==null)&&(!saved.canCustomers||model.customers!==null)?'updated':'pending'};
  }
  function navigate(destination){
    if(!same(active)){close();return;}if(!['clientes','horario'].includes(destination)||roleBlocksView(destination))return;
    go(destination,el('nav-'+destination));
    if(destination==='horario')window.VelumFlowAgenda?.toggle();else window.VelumFlowPanel?.toggle();
    const root=el(destination==='horario'?'flow-agenda-root':'flow-customers-root');if(root&&!root.hidden){root.tabIndex=-1;root.focus();}
  }
  function toggle(){
    if(view){close();return;}active=capture();if(!active||!window.VelumDashboardModel||!window.VelumDashboardView||!window.VelumAgendaModel)return;
    el('dashboard-legacy').hidden=true;el('flow-dashboard-root').hidden=false;el('flow-dashboard-toggle').textContent='Vista habitual';el('flow-dashboard-toggle').setAttribute('aria-expanded','true');
    view=VelumDashboardView.mount(el('flow-dashboard-root'),{onReload:load,onNavigate:navigate});
    timer=setInterval(()=>{if(!same(active))close();},250);load();
  }
  async function refreshAfterPayment(expected){
    if(!view)return {state:'inactive'};
    if(!same(active)||active.actor!==expected.actor||active.id!==expected.userId||active.gym!==String(expected.gymId)||active.jwt!==expected.jwt||active.client!==expected.client)return {state:'context_changed'};
    return load();
  }
  window.VelumFlowDashboard=Object.freeze({toggle,close,refreshAfterPayment});
})();
