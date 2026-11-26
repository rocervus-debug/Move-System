/* Lectura independiente de las cachés de cobros y de la vista habitual. */
(function() {
  'use strict';
  const el = id => document.getElementById(id);
  let active = null, view = null, timer = null, generation = 0;
  function capture() {
    if (typeof currentUser === 'undefined' || !currentUser || typeof MOVE_GYM_ID === 'undefined' ||
        !['admin','superadmin','recepcion'].includes(currentUser.rol) || !currentUser.jwt ||
        typeof isJwtExpired !== 'function' || isJwtExpired(currentUser.jwt) || !currentUser.gym_id ||
        String(currentUser.gym_id) !== String(MOVE_GYM_ID) || !window.supabaseClient ||
        (typeof roleBlocksView === 'function' && roleBlocksView('paquetes'))) return null;
    return {actor:currentUser, id:currentUser.id, role:currentUser.rol, gym:String(MOVE_GYM_ID), jwt:currentUser.jwt, client:window.supabaseClient};
  }
  function same(ctx) { const now = capture(); return !!(ctx && now && Object.keys(now).every(key => now[key] === ctx[key])); }
  function close() {
    generation++; active = null; clearInterval(timer); timer = null; view?.dispose(); view = null;
    el('flow-memberships-root').replaceChildren(); el('flow-memberships-root').hidden = true;
    el('paquetes-legacy').hidden = false; el('flow-memberships-toggle').textContent = 'Vista Flow';
    el('flow-memberships-toggle').setAttribute('aria-expanded','false');
  }
  async function load() {
    const saved = active, request = ++generation;
    if (!same(saved)) { close(); return; }
    view?.update({status:'loading',plans:[]});
    async function read(table, columns) {
      try { return await saved.client.from(table).select(columns,{count:'exact'}).eq('gym_id',saved.gym).order('id').limit(2000); }
      catch (_) { return {error:true}; }
    }
    const [packages,listings] = await Promise.all([
      read('packages','id,gym_id,name,description,price_mxn,currency,duration_days,num_classes,unlimited_classes,is_active,internal_only,billing_type,billing_interval,max_reservas_dia'),
      read('storefront_listings','id,gym_id,package_id,is_public')
    ]);
    if (request !== generation || !view) return;
    if (!same(saved)) { close(); return; }
    view.update(VelumMembershipCatalog.build({gym:saved.gym,packages,listings}));
  }
  function toggle() {
    if (view) { close(); return; }
    active = capture();
    if (!active || !window.VelumMembershipCatalog || !window.VelumMembershipView) return;
    el('paquetes-legacy').hidden = true; el('flow-memberships-root').hidden = false;
    el('flow-memberships-toggle').textContent = 'Vista habitual'; el('flow-memberships-toggle').setAttribute('aria-expanded','true');
    view = VelumMembershipView.mount(el('flow-memberships-root'), {onReload:load,onManage:close});
    timer = setInterval(() => { if (!same(active)) close(); },250); load();
  }
  window.VelumFlowMemberships = Object.freeze({toggle,close});
})();
