/* Presentación del catálogo aprobado Flow 05, con datos y desconocidos explícitos. */
(function() {
  'use strict';
  const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0});
  const kinds = {unlimited:'Sesiones ilimitadas',limited:'Paquete de sesiones',unknown:'Tipo por verificar'};
  const intervals = {month:'mensual',year:'anual',week:'semanal',day:'diario'};
  const price = p => p.price === null ? 'Precio por verificar' : money.format(p.price);
  const duration = p => p.duration === null ? 'Duración por verificar' : p.duration+' '+(p.duration === 1 ? 'día de servicio' : 'días de servicio');
  const sessions = p => p.kind === 'unlimited' ? 'Sesiones ilimitadas' : p.sessions === null ? 'Sesiones por verificar' : p.sessions+' '+(p.sessions === 1 ? 'sesión incluida' : 'sesiones incluidas');
  const availability = p => p.active === true ? 'Activo' : p.active === false ? 'Inactivo' : 'Por verificar';
  const publication = p => p.publication === null ? 'Publicación por verificar' : p.publication ? 'Publicación activada' : 'Sin publicación';
  function node(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function mount(root,{onReload,onManage}) {
    let snapshot = {status:'loading',plans:[]}, page = 0, disposed = false, returnTo = null;
    root.classList.add('flow-memberships'); root.replaceChildren();
    function button(text,fn,cls='') { const b = node('button',cls,text); b.type = 'button'; b.addEventListener('click',fn); return b; }
    const head = node('header','fm-head'), intro = node('div');
    intro.append(node('p','fm-eyebrow','PLANES Y PAQUETES'),node('h2','','Membresías'),node('p','fm-muted','Lo que tu estudio ofrece. Condiciones claras, en un solo lugar.'));
    const actions = node('div','fm-actions'); actions.append(button('Actualizar',onReload),button('Gestionar planes',onManage)); head.append(intro,actions);
    const scope = node('p','fm-scope','Catálogo comercial · Los derechos y vencimientos de cada cliente se consultan por separado.');
    const surface = node('section','fm-surface'), filters = node('div','fm-filters');
    const search = node('input'); search.type = 'search'; search.placeholder = 'Buscar plan o referencia…'; search.setAttribute('aria-label','Buscar plan o referencia');
    function select(label, choices) { const s = node('select'); s.setAttribute('aria-label',label); for (const [value,text] of choices) { const o = node('option','',text); o.value = value; s.append(o); } s.addEventListener('change',resetPage); return s; }
    const kind = select('Tipo de plan',[['','Todos los tipos'],['limited','Sesiones limitadas'],['unlimited','Sesiones ilimitadas'],['unknown','Por verificar']]);
    const state = select('Disponibilidad del catálogo',[['','Toda disponibilidad'],['active','Activos'],['inactive','Inactivos'],['unknown','Por verificar']]);
    const sort = select('Ordenar planes',[['name','Nombre A–Z'],['price','Menor precio']]);
    filters.append(search,kind,state,sort); search.addEventListener('input',resetPage);
    const summary = node('div','fm-summary'), count = node('span','fm-muted');
    summary.append(count,button('Limpiar filtros',() => { search.value=''; kind.value=''; state.value=''; sort.value='name'; resetPage(); }));
    const notice = node('p','fm-notice'); notice.setAttribute('role','status');
    const table = node('table','fm-table'); table.setAttribute('aria-label','Planes y paquetes');
    const thead = node('thead'), tr = node('tr'); for (const text of ['Plan / paquete','Tipo','Precio','Incluye / duración','Catálogo','Detalle']) { const th = node('th','',text); th.scope = 'col'; tr.append(th); } thead.append(tr);
    const tbody = node('tbody'); table.append(thead,tbody);
    const pagination = node('div','fm-pagination'), position = node('span','fm-muted'); position.setAttribute('aria-live','polite');
    const prev = button('Anterior',() => { page--; render(); }), next = button('Siguiente',() => { page++; render(); }); pagination.append(position,prev,next);
    const retry = button('Reintentar',onReload,'fm-retry');
    const detail = node('section','fm-detail'); detail.hidden = true; detail.tabIndex = -1; detail.setAttribute('aria-label','Detalle del plan');
    function hideDetail() { detail.hidden = true; detail.replaceChildren(); returnTo = null; }
    function showDetail(plan,source) {
      returnTo = source; detail.replaceChildren(); detail.hidden = false;
      detail.append(node('p','fm-eyebrow','PLAN / '+plan.id),node('h3','',plan.name));
      if (plan.description) detail.append(node('p','fm-description',plan.description));
      const dl = node('dl');
      const billing = plan.billing === 'one_time' ? 'Pago único' : plan.billing === 'recurring' ? 'Recurrente'+(plan.interval ? ' · '+intervals[plan.interval] : ' · frecuencia por verificar') : 'Por verificar';
      const daily = plan.daily === 'unlimited' ? 'Sin límite configurado' : plan.daily === null ? 'Por verificar' : plan.daily === 0 ? 'No permite reservar' : plan.daily+' por día';
      for (const [label,value] of [['Precio de catálogo',price(plan)+(plan.price === null ? '' : ' MXN')],['Sesiones incluidas',sessions(plan)],['Duración del servicio',duration(plan)],['Disponibilidad en catálogo',availability(plan)],['Publicación online',publication(plan)],['Uso interno',plan.internal === null ? 'Por verificar' : plan.internal ? 'Sí' : 'No'],['Forma de cobro',billing],['Reservas por día',daily]]) dl.append(node('dt','',label),node('dd','',value));
      detail.append(dl,node('p','fm-muted','La publicación activada no garantiza que la oferta se pueda comprar. La disponibilidad de venta también depende del catálogo y de la configuración de pagos. La duración describe el servicio, no un vencimiento individual.'),button('Cerrar detalle',() => { const source = returnTo; hideDetail(); source?.focus(); })); detail.focus();
    }
    detail.addEventListener('keydown',event => { if (event.key === 'Escape') { const source = returnTo; hideDetail(); source?.focus(); } });
    function resetPage() { page=0; render(); }
    function render() {
      hideDetail(); tbody.replaceChildren(); count.textContent=''; notice.hidden=false;
      const ready = snapshot.status === 'ready'; filters.hidden=!ready; summary.hidden=!ready; table.hidden=!ready; pagination.hidden=!ready; retry.hidden=snapshot.status!=='error';
      if (!ready) { notice.textContent = snapshot.status === 'loading' ? 'Cargando planes…' : 'No pudimos consultar el catálogo. Intenta actualizar.'; return; }
      const plans = VelumMembershipCatalog.filter(snapshot.plans,{query:search.value,kind:kind.value,availability:state.value,sort:sort.value});
      page = Math.min(Math.max(0,page),Math.max(0,Math.ceil(plans.length/8)-1));
      count.textContent=plans.length+' '+(plans.length === 1 ? 'plan en vista' : 'planes en vista');
      notice.textContent = [snapshot.partial ? 'Catálogo parcial: se muestran solo los planes recibidos.' : '',snapshot.publicationUnknown ? 'Hay publicaciones por verificar.' : '',plans.length ? '' : 'No hay planes para estos filtros.'].filter(Boolean).join(' '); notice.hidden=!notice.textContent;
      for (const p of plans.slice(page*8,page*8+8)) {
        const row = node('tr'); row.dataset.id=p.id;
        function cell(label) { const td=node('td'); td.dataset.label=label; row.append(td); return td; }
        const name=cell('Plan / paquete'), nameText=node('span','fm-plan-name'); nameText.append(node('strong','',p.name),node('small','fm-muted','PLAN / '+p.id));
        const icon=node('span','fm-icon'); icon.setAttribute('aria-hidden','true'); icon.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 14h4"/></svg>';
        name.append(icon,nameText); cell('Tipo').append(node('span','',kinds[p.kind]));
        cell('Precio').append(node('strong','',price(p)),node('small','fm-muted',p.price===null?'':'MXN · precio de catálogo'));
        cell('Incluye / duración').append(node('span','',sessions(p)),node('small','fm-muted',duration(p)));
        const badge=node('span','fm-badge',availability(p)); badge.dataset.state=p.active===true?'active':p.active===false?'inactive':'unknown';
        cell('Catálogo').append(badge,node('small','fm-muted',publication(p)));
        const open=button('↗',() => showDetail(p,open),'fm-open'); open.setAttribute('aria-label','Ver detalle de '+p.name); cell('Detalle').append(open); tbody.append(row);
      }
      prev.disabled=page===0; next.disabled=(page+1)*8>=plans.length;
      position.textContent=plans.length ? (page*8+1)+'–'+Math.min((page+1)*8,plans.length)+' de '+plans.length : '0 planes';
    }
    surface.append(filters,summary,notice,table,retry,pagination); root.append(head,scope,surface,detail);
    return {update(next) { if (!disposed) { snapshot=next; render(); } },dispose() { disposed=true; root.replaceChildren(); }};
  }
  window.VelumMembershipView=Object.freeze({mount});
})();
