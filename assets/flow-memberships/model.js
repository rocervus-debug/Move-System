/* Catálogo comercial: sus condiciones no certifican derechos de una persona. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VelumMembershipCatalog = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  'use strict';
  const id = value => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === 'string' && /^[1-9]\d*$/.test(value));
  const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum ? value : null;
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function validRows(result, gym) {
    return !!(result && !result.error && Array.isArray(result.data) && result.data.every(row =>
      row && id(row.id) && String(row.gym_id) === String(gym)) &&
      new Set(result.data.map(row => String(row.id))).size === result.data.length);
  }
  const complete = result => Number.isSafeInteger(result.count) && result.count === result.data.length;
  function build({gym, packages, listings}) {
    if (!id(gym) || !validRows(packages, gym)) return {status:'error', plans:[]};
    const listingsKnown = validRows(listings, gym) && complete(listings) && listings.data.every(row =>
      id(row.package_id) && typeof row.is_public === 'boolean');
    const plans = packages.data.map(row => {
      const matches = listingsKnown ? listings.data.filter(item => String(item.package_id) === String(row.id)) : [];
      const publication = !listingsKnown || matches.length > 1 ? null : matches.some(item => item.is_public);
      const unlimited = typeof row.unlimited_classes === 'boolean' ? row.unlimited_classes : null;
      return {
        id:String(row.id), name:typeof row.name === 'string' && row.name.trim() ? row.name : 'Plan sin nombre',
        description:typeof row.description === 'string' ? row.description : '',
        price:row.currency === 'MXN' ? integer(row.price_mxn, 0) : null,
        duration:integer(row.duration_days, 1), sessions:unlimited === false ? integer(row.num_classes, 1) : null,
        kind:unlimited === true ? 'unlimited' : unlimited === false && integer(row.num_classes, 1) !== null ? 'limited' : 'unknown',
        active:typeof row.is_active === 'boolean' ? row.is_active : null,
        internal:typeof row.internal_only === 'boolean' ? row.internal_only : null,
        publication, billing:['one_time','recurring'].includes(row.billing_type) ? row.billing_type : null,
        interval:['month','year','week','day'].includes(row.billing_interval) ? row.billing_interval : null,
        daily:row.max_reservas_dia === null ? 'unlimited' : integer(row.max_reservas_dia, 0)
      };
    });
    return {status:'ready', plans, partial:!complete(packages), publicationUnknown:plans.some(plan => plan.publication === null)};
  }
  function filter(plans, {query='', kind='', availability='', sort='name'} = {}) {
    const q = normalize(query.trim());
    const result = plans.filter(plan => normalize(plan.name+' '+plan.id).includes(q) && (!kind || plan.kind === kind) &&
      (!availability || (availability === 'active' && plan.active === true) || (availability === 'inactive' && plan.active === false) || (availability === 'unknown' && plan.active === null)));
    result.sort((a,b) => {
      if (sort === 'price') {
        if (a.price === null && b.price !== null) return 1;
        if (b.price === null && a.price !== null) return -1;
        if (a.price !== b.price) return a.price - b.price;
      }
      return a.name.localeCompare(b.name,'es') || a.id.localeCompare(b.id);
    });
    return result;
  }
  return Object.freeze({build, filter});
});
