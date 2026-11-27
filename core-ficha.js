// Resumen de la ficha. Acceso, saldo de clases y domiciliación tienen orígenes distintos.
async function cargarResumenFicha(cliente, historial){
  const root=document.getElementById('cpanel-resumen'), gym=MOVE_GYM_ID, user=currentUser;
  const role=user?.rol;
  const visible=()=>root?.isConnected && MOVE_GYM_ID===gym && currentUser===user && currentUser?.rol===role;
  if(!root || !cliente.id || !gym || !user) return;
  const write=(key,value)=>{if(visible()) root.querySelector('[data-fact="'+key+'"]').textContent=value;};
  const hoy=_hoyMX();
  function fecha(raw){
    if(!/^\d{4}-\d{2}-\d{2}/.test(raw||'')) return null;
    const d=new Date(raw.length===10?raw+'T12:00:00Z':raw);
    return Number.isFinite(d.getTime())?d.toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Mexico_City'}):null;
  }
  async function acceso(){
    const states=await _cargarPaquetesLista([cliente.id],hoy), e=states[cliente.id];
    if(!e) return;
    if(e.membresia){
      const dates=historial.filter(p=>p.clases_totales==null && !esPaseDia(p.plan) && fecha(p.vence) && p.vence>=hoy).map(p=>p.vence).sort();
      write('vigencia',fecha(dates.at(-1))||'Vigente · fecha por confirmar');
      write('clases','Acceso por tiempo');
    }else{
      const count=Number(e.restantes);
      if(e.restantes!=null && Number.isFinite(count)){
        write('clases',String(count));
        write('vigencia',count>0?(fecha(e.vence)?'Paquete en uso hasta '+fecha(e.vence):'Sin fecha límite'):'Sin paquete vigente');
      }
    }
  }
  async function renovacion(){
    if(roleBlocksView('domiciliados')){write('renovacion','Consultar con administración');return;}
    const columns='id,status,interval,cancel_at_period_end,current_period_end,stripe_subscription_id,packages(name)';
    const query=()=>window.supabaseClient.from('member_subscriptions').select(columns).eq('gym_id',gym)
      .in('status',['active','trialing','past_due','unpaid','incomplete','paused']);
    const requests=[query().eq('cliente_id',cliente.id)];
    const email=String(cliente.email||'').trim().toLowerCase();
    const coincidencias=email?clientesDB.filter(c=>String(c.email||'').trim().toLowerCase()===email).length:0;
    if(coincidencias===1)
      requests.push(query().is('cliente_id',null).eq('customer_email',email));
    const responses=await Promise.all(requests);
    if(responses.some(r=>r.error || !Array.isArray(r.data))) return;
    const rows=responses.flatMap(r=>r.data);
    if(!rows.length && coincidencias>1){write('renovacion','Correo compartido · revisar en Cobros');return;}
    if(!rows.length){write('renovacion',historial[0] && CoreCobros.frequency({kind:'paid',data:historial[0]})==='Pago único'?'Pago único · sin renovación registrada':'Sin renovación registrada');return;}
    write('renovacion',rows.map(s=>{
      const plan=rows.length>1?(s.packages?.name||'Plan')+' · ':'';
      const fin=fecha(s.current_period_end);
      if(s.cancel_at_period_end) return plan+'Renovación cancelada'+(fin?' · fin del periodo '+fin:'');
      if(s.status==='incomplete') return plan+'Pendiente de activación';
      if(['past_due','unpaid'].includes(s.status)) return plan+'Recurrente · pago pendiente';
      if(s.status==='paused') return plan+'Suscripción en pausa';
      return plan+(s.interval==='month'?'Mensual recurrente':'Recurrente')+(fin?' · próximo periodo '+fin:'');
    }).join('\n'));
  }
  await Promise.allSettled([acceso(),renovacion()]);
}
