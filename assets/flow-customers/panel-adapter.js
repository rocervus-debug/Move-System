/* Conexión de identidad entre el panel y Clientes Flow. */
(function () {
  'use strict';
  let view = null, snapshot = null, generation = 0, context = null, watcher = null;
  let detail = null, selected = null, detailGeneration = 0;
  const element = id => document.getElementById(id);
  function capture() {
    if (typeof currentUser === 'undefined' || !currentUser || typeof MOVE_GYM_ID === 'undefined') return null;
    if (!['admin', 'superadmin', 'recepcion'].includes(currentUser.rol)) return null;
    if (!currentUser.jwt || typeof isJwtExpired !== 'function' || isJwtExpired(currentUser.jwt)) return null;
    if (!currentUser.gym_id || String(currentUser.gym_id) !== String(MOVE_GYM_ID)) return null;
    if (!window.supabaseClient || (typeof roleBlocksView === 'function' && roleBlocksView('clientes'))) return null;
    return { actor: currentUser, user: currentUser.id, role: currentUser.rol, gym: String(MOVE_GYM_ID), jwt: currentUser.jwt, client: window.supabaseClient,
      canPayments:['admin','superadmin'].includes(currentUser.rol)&&typeof roleOcultaDinero==='function'&&!roleOcultaDinero()&&typeof roleBlocksView==='function'&&!roleBlocksView('pagos') };
  }
  function matches(saved) {
    const now = capture();
    return !!(saved && now && saved.actor === now.actor && saved.user === now.user && saved.role === now.role && saved.gym === now.gym && saved.jwt === now.jwt && saved.client === now.client && saved.canPayments===now.canPayments);
  }
  function close(restoreFocus = false) {
    generation++;
    detailGeneration++; detail = null; selected = null;
    clearInterval(watcher); watcher = null;
    if (view) view.clear();
    view = null; snapshot = null; context = null;
    const host = element('flow-customers-root');
    if (host) { host.replaceChildren(); host.hidden = true; }
    const legacy = element('clientes-legacy'); if (legacy) legacy.hidden = false;
    const button = element('flow-customers-toggle');
    if (button) { button.textContent = 'Vista Flow'; button.setAttribute('aria-expanded', 'false'); if (restoreFocus) button.focus(); }
  }
  function getSnapshot() { return matches(context) ? snapshot : null; }
  function getDetail() { return matches(context) ? detail : null; }
  async function selectCustomer(id) {
    const request = ++detailGeneration;
    detail = null; selected = id ? String(id) : null;
    if (!selected) return;
    if (!view || !matches(context) || snapshot?.status !== 'ready' || !/^[1-9]\d*$/.test(selected)) return;
    const own = snapshot.rows.filter(row => String(row.id) === selected && String(row.gym_id) === context.gym);
    if (own.length !== 1) { selected = null; return; }
    const saved = context, customerId = selected;
    detail = {gymId:saved.gym,customerId,profile:{status:'loading'},attendance:{status:'loading'},reservations:{status:'loading'},payments:{status:saved.canPayments?'loading':'restricted'}};
    view.refreshDetail?.();
    async function readPart(part, query) {
      try {
        const result = await query();
        if(request !== detailGeneration || !view || selected !== customerId)return;
        if(!matches(saved)){close();return;}
        if(result.error) {
          detail = {...detail,[part]:{status:'error'}};
          if(typeof _handleSessionError === 'function')_handleSessionError(result.error);
        } else if(part === 'profile') detail = {...detail,profile:{status:'ready',row:result.data}};
        else detail = {...detail,[part]:{status:'ready',rows:result.data,
          truncated:!Number.isSafeInteger(result.count)||!Array.isArray(result.data)||result.count>result.data.length}};
        view.refreshDetail?.();
      } catch (_) {
        if(request !== detailGeneration || !view || !matches(saved))return;
        detail = {...detail,[part]:{status:'error'}};view.refreshDetail?.();
      }
    }
    async function readPayments() {
      const fields = 'id,gym_id,cliente,monto,fecha,plan,metodo,vence,notas';
      const ledger = () => saved.client.from('pagos');
      const linked = await ledger().select(fields + ',cliente_id', {count:'exact'})
        .eq('gym_id', saved.gym).eq('cliente_id', customerId)
        .order('fecha', {ascending:false}).order('id', {ascending:false})
        .order('cliente').order('monto').order('plan').order('metodo').order('vence').order('notas').limit(50);
      if (linked.error?.code !== '42703' || !matches(saved)) return linked;

      // En el esquema anterior sólo una reserva con pago_id identifica el pago de esta persona.
      const bookings = await saved.client.from('reservas').select('pago_id', {count:'exact'})
        .eq('gym_id', saved.gym).eq('cliente_id', customerId).not('pago_id','is',null)
        .order('fecha',{ascending:false}).order('id').limit(50);
      if (bookings.error || !matches(saved)) return {error:true};
      const ids = [...new Set(bookings.data.map(row => row.pago_id))];
      const more = bookings.count !== bookings.data.length;
      if (!ids.length) return {data:[], count:more ? null : 0};
      const payments = await ledger().select(fields, {count:'exact'})
        .eq('gym_id', saved.gym).in('id', ids).order('fecha',{ascending:false}).order('id');
      if (payments.error || payments.count !== payments.data?.length) return {error:true};
      // La clave primaria del libro es compuesta. Un ID ambiguo no acredita identidad.
      const occurrences = new Map();
      for (const row of payments.data) occurrences.set(String(row.id), (occurrences.get(String(row.id)) || 0) + 1);
      const data = payments.data.filter(row => occurrences.get(String(row.id)) === 1)
        .map(row => ({...row, cliente_id:customerId}));
      return {data, count:more || data.length !== ids.length ? null : data.length};
    }
    await Promise.all([
      readPart('profile',()=>saved.client.from('clientes').select('id,gym_id,nombre,numero_cliente,telefono,email,cumpleanos,notas')
        .eq('gym_id',saved.gym).eq('id',customerId).single()),
      readPart('attendance',()=>saved.client.from('asistencias').select('id,gym_id,cliente_id,fecha,hora,metodo',{count:'exact'})
        .eq('gym_id',saved.gym).eq('cliente_id',customerId).order('fecha',{ascending:false}).order('hora',{ascending:false}).order('id',{ascending:false}).limit(50)),
      readPart('reservations',()=>saved.client.from('reservas').select('id,gym_id,cliente_id,fecha,clase_tipo,clase_hora,estado',{count:'exact'})
        .eq('gym_id',saved.gym).eq('cliente_id',customerId).order('fecha',{ascending:false}).order('clase_hora',{ascending:false}).order('id',{ascending:false}).limit(50)),
      saved.canPayments ? readPart('payments', readPayments) :Promise.resolve()
    ]);
  }
  async function load() {
    if (!view || !matches(context)) { close(); return {state:'context_changed'}; }
    const saved = context, request = ++generation;
    detailGeneration++; detail = null; selected = null;
    snapshot = { gymId: saved.gym, actorGymId: saved.actor.gym_id, status: 'loading', rows: [], truncated: false };
    view.refresh();
    try {
      const { data, error, count } = await saved.client.from('clientes')
        .select('id,gym_id,nombre,numero_cliente,telefono,email', { count: 'exact' })
        .eq('gym_id', saved.gym).order('nombre').order('id').limit(2000);
      if (request !== generation || !view) return {state:view?'pending':'inactive'};
      if (!matches(saved)) { close(); return {state:'context_changed'}; }
      if (error) {
        snapshot = { ...snapshot, status: 'error', rows: [] }; view.refresh();
        if (typeof _handleSessionError === 'function') _handleSessionError(error);
        return {state:'pending'};
      }
      const rows = Array.isArray(data) ? data : [];
      snapshot = { ...snapshot, status: 'ready', rows, truncated: !Number.isSafeInteger(count) || count > rows.length };
      view.refresh();
      return {state:Array.isArray(data)&&Number.isSafeInteger(count)&&count===rows.length?'updated':'pending'};
    } catch (_) {
      if (request !== generation || !view) return {state:view?'pending':'inactive'};
      if (!matches(saved)) { close(); return {state:'context_changed'}; }
      snapshot = { ...snapshot, status: 'error', rows: [] }; view.refresh();
      return {state:'pending'};
    }
  }
  function toggle() {
    if (view) { close(true); return; }
    const saved = capture(), host = element('flow-customers-root');
    if (!saved || !host || !window.VelumFlowCustomers) return;
    context = saved;
    snapshot = { gymId: saved.gym, actorGymId: saved.actor.gym_id, status: 'loading', rows: [], truncated: false };
    host.hidden = false;
    const legacy = element('clientes-legacy'); if (legacy) legacy.hidden = true;
    const button = element('flow-customers-toggle');
    if (button) { button.textContent = 'Volver a vista habitual'; button.setAttribute('aria-expanded', 'true'); }
    view = window.VelumFlowCustomers.mount(host, { getSnapshot, onRetry: load, getDetail,
      onSelect: selectCustomer, onRetryDetail: () => selectCustomer(selected) });
    // Defensa adicional ante cambios de contexto fuera de los puntos de navegación habituales.
    watcher = setInterval(() => { if (!matches(context)) close(); }, 250);
    load();
  }
  async function refreshAfterPayment(expected){
    if(!view)return {state:'inactive'};
    if(!matches(context)||context.actor!==expected.actor||context.user!==expected.userId||context.gym!==String(expected.gymId)||context.jwt!==expected.jwt||context.client!==expected.client)return {state:'context_changed'};
    const keep=selected,saved=context,result=await load();
    if(result.state==='updated'&&keep&&view&&matches(saved)&&snapshot.rows.some(row=>String(row.id)===keep&&String(row.gym_id)===saved.gym)&&view.restoreSelection?.(keep)){
      await selectCustomer(keep);
      if(saved.canPayments&&matches(saved)&&selected===keep){
        const payments=window.VelumFlowCustomers.projectPayments(detail?.payments,saved.gym,keep);
        if(payments.status!=='ready'||payments.truncated||payments.unresolved)return {state:'pending'};
      }
    }
    return result;
  }
  window.VelumFlowPanel = Object.freeze({ toggle, close, refresh: load, refreshAfterPayment });
})();
