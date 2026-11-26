(() => {
  'use strict';

  const PAGE_SIZE = 25;
  const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

  // El panel usa identificadores enteros positivos. Conservar dígitos largos recibidos como texto.
  function positiveId(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
    return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : '';
  }

  function field(value) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  }

  function normalize(value) {
    return field(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function project(snapshot) {
    const gym = positiveId(snapshot?.gymId);
    if (!gym || positiveId(snapshot.actorGymId) !== gym) return { status: 'unavailable' };
    if (snapshot.status === 'loading') return { status: 'loading', gym };
    if (snapshot.status !== 'ready' || !Array.isArray(snapshot.rows)) return { status: 'error', gym };
    const identities = new Map();
    let unresolved = false;
    for (const row of snapshot.rows) {
      if (positiveId(row?.gym_id) !== gym) continue;
      const id = positiveId(row.id);
      if (!id || identities.has(id)) {
        if (id) identities.set(id, null);
        unresolved = true;
        continue;
      }
      identities.set(id, {
        id,
        name: field(row.nombre),
        number: field(row.numero_cliente),
        phone: field(row.telefono),
        email: field(row.email),
      });
    }
    const rows = [...identities.values()].filter(Boolean);
    rows.sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id));
    return { status: 'ready', gym, rows, unresolved, truncated: snapshot.truncated === true };
  }

  function findRows(rows, query) {
    const term = normalize(query);
    if (!term) return rows;
    const digits = /^[+\d ()-]+$/.test(term) ? term.replace(/\D/g, '') : '';
    return rows.filter(row =>
      [row.name, row.number, row.email, row.phone, row.id].some(value => normalize(value).includes(term)) ||
      (digits && row.phone.replace(/\D/g, '').includes(digits))
    );
  }

  function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0,10) === value ? value : '';
  }
  function projectDetail(snapshot, gym, customerId) {
    gym = positiveId(gym); customerId = positiveId(customerId);
    if (!gym || !customerId || positiveId(snapshot?.gymId) !== gym || positiveId(snapshot?.customerId) !== customerId) return { status: 'unavailable' };
    const source = snapshot.profile;
    let info = { status: source?.status === 'loading' ? 'loading' : 'error' };
    if (source?.status === 'ready') {
      const row = source.row;
      if (positiveId(row?.id) === customerId && positiveId(row?.gym_id) === gym) {
        info = { status:'ready', name:field(row.nombre), number:field(row.numero_cliente), phone:field(row.telefono),
          email:field(row.email), birthday:calendarDate(row.cumpleanos), notes:field(row.notas) };
      }
    }
    const activity = snapshot.attendance;
    let attendance = { status: activity?.status === 'loading' ? 'loading' : 'error' };
    if (activity?.status === 'ready' && Array.isArray(activity.rows)) {
      const identities = new Map(); let unresolved = false;
      for (const row of activity.rows) {
        if (positiveId(row?.gym_id) !== gym || positiveId(row?.cliente_id) !== customerId) { unresolved = true; continue; }
        const id = positiveId(row.id), date = calendarDate(row.fecha);
        if (!id || !date || identities.has(id)) { if (id) identities.set(id,null); unresolved = true; continue; }
        const time = typeof row.hora === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(row.hora) ? row.hora.slice(0,5) : '';
        identities.set(id,{id,date,time,method:field(row.metodo)});
      }
      const rows = [...identities.values()].filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time)||collator.compare(b.id,a.id));
      attendance = { status:'ready', rows, unresolved, truncated: activity.truncated === true };
    }
    const bookings = snapshot.reservations;
    let reservations = { status: bookings?.status === 'loading' ? 'loading' : 'error' };
    if (bookings?.status === 'ready' && Array.isArray(bookings.rows)) {
      const identities = new Map(); let unresolved = false;
      for (const row of bookings.rows) {
        if (positiveId(row?.gym_id) !== gym || positiveId(row?.cliente_id) !== customerId) { unresolved = true; continue; }
        const id = typeof row.id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(row.id) ? row.id.toLowerCase() : '';
        const date = calendarDate(row.fecha);
        if (!id || !date || row.estado === 'bloqueado' || identities.has(id)) { if (id) identities.set(id,null); unresolved = true; continue; }
        const labels = {reservado:'Reservada',checkin:'Asistencia registrada en reserva',ausente:'Ausencia registrada',cancelado:'Cancelada'};
        identities.set(id,{id,date,type:field(row.clase_tipo),time:field(row.clase_hora),
          state:Object.hasOwn(labels,row.estado) ? labels[row.estado] : 'Estado sin verificar'});
      }
      // clase_hora es texto del registro, no una hora normalizada ni una zona horaria.
      const rows = [...identities.values()].filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time)||b.id.localeCompare(a.id));
      reservations = { status:'ready', rows, unresolved, truncated:bookings.truncated === true };
    }
    return { status:'ready', info, attendance, reservations, payments:projectPayments(snapshot.payments,gym,customerId) };
  }
  function projectPayments(source,gym,customerId) {
    gym=positiveId(gym);customerId=positiveId(customerId);
    if(!gym||!customerId)return {status:'error'};
    if(!source||source.status==='restricted')return {status:'restricted'};
    if(source.status!=='ready'||!Array.isArray(source.rows))return {status:source.status==='loading'?'loading':'error'};
    const records=new Map();let unresolved=false;
    for(const row of source.rows){
      const id=positiveId(row?.id),date=calendarDate(row?.fecha);
      if(!id||!date||positiveId(row?.gym_id)!==gym||positiveId(row?.cliente_id)!==customerId||(!Number.isFinite(row.monto)||!Number.isSafeInteger(Math.round(row.monto*100))||Math.round(row.monto*100)/100!==row.monto)||
        !['cliente','plan','metodo','vence','notas'].every(k=>typeof row[k]==='string')){unresolved=true;continue;}
      // pagos.id no es único: conservar todos los campos de la PK real para comparar registros.
      const key=JSON.stringify([id,row.cliente,row.monto,date,row.plan,row.metodo,row.vence,row.notas]);
      if(records.has(key)){records.set(key,null);unresolved=true;continue;}
      records.set(key,{key,id,date,amount:row.monto,plan:field(row.plan),method:field(row.metodo),expires:calendarDate(row.vence),notes:field(row.notas)});
    }
    const rows=[...records.values()].filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date)||collator.compare(b.id,a.id)||a.key.localeCompare(b.key));
    return {status:'ready',rows,unresolved,truncated:source.truncated===true};
  }
  function dateLabel(date) {
    return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  }

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function button(label, action, className = '') {
    const item = el('button', className, label);
    item.type = 'button';
    item.dataset.fcAction = action;
    return item;
  }

  function nameOf(customer) {
    return customer.name || 'Nombre sin registrar';
  }

  function avatar(customer) {
    const words = customer.name.split(/\s+/).filter(Boolean);
    const initials = words.length ? [words[0], ...(words.length > 1 ? [words.at(-1)] : [])].map(word => [...word][0]).join('').toLocaleUpperCase('es') : '·';
    const item = el('span', 'fc-avatar', initials);
    item.setAttribute('aria-hidden', 'true');
    return item;
  }

  function profile(customer, detail, tab, editable) {
    const info = detail.info;
    if (info?.status === 'ready') customer = {...customer,...info};
    const header = el('header', 'fc-profile-header');
    const identity = el('div');
    const title = el('h3', '', nameOf(customer));
    title.tabIndex = -1;
    identity.append(title, el('p', 'fc-meta', 'Referencia ' + customer.id));
    const actions = el('div','fc-profile-actions');
    for (const [label,action,value] of [['Copiar teléfono','copy-phone',customer.phone],['Copiar correo','copy-email',customer.email]]) {
      const control = button(label,action); control.disabled = !value; actions.append(control);
    }
    if(editable){const edit=button('Editar datos','edit-profile');edit.disabled=info?.status!=='ready';actions.append(edit);}
    header.append(avatar(customer), identity, actions);
    const hero = el('section','fc-card fc-hero'); hero.append(header);
    const contacts = el('div','fc-profile-contacts');
    contacts.append(el('span','',customer.email||'Correo sin registrar'),el('span','',customer.phone||'Teléfono sin registrar'));
    hero.append(contacts);
    const tabs = el('nav','fc-profile-tabs'); tabs.setAttribute('aria-label','Secciones del cliente');
    for (const [key,label] of [['overview','Resumen'],['membership','Membresía'],['activity','Actividad'],...(detail.payments?.status!=='restricted'&&detail.payments?[['payments','Pagos']]:[]),['notes','Notas']]) {
      const item=button(label,'tab-'+key); if(key===tab)item.setAttribute('aria-current','page'); tabs.append(item);
    }
    const grid=el('div','fc-profile-grid');
    function card(title, ...children) {
      const item=el('section','fc-card fc-detail-card');item.append(el('h4','',title),...children);return item;
    }
    function state(status, label) {
      const box=el('div','fc-detail-state');box.setAttribute('role','status');
      box.append(el('p','',status==='loading'?'Cargando '+label+'…':'No pudimos cargar '+label+'.'));
      if(status!=='loading')box.append(button('Reintentar ficha','detail-retry'));
      return box;
    }
    const facts = el('dl', 'fc-facts');
    for (const [label, value] of [['Número de cliente', customer.number], ['Teléfono', customer.phone], ['Correo electrónico', customer.email],
      ['Cumpleaños',info?.birthday ? dateLabel(info.birthday) : ''],['Referencia',customer.id]]) {
      const pair = el('div');
      pair.append(el('dt', '', label), el('dd', '', value || 'Sin registrar'));
      facts.append(pair);
    }
    const personal = card('Información personal',info?.status === 'ready' ? facts : state(info?.status,'la información personal'));
    const badge = el('span','fc-status-badge','Sin verificar');
    const membership = card('Membresía',badge,el('p','fc-detail-lead','Vigencia y créditos pendientes de verificar'),
      el('p','fc-meta','Esta ficha todavía no permite confirmar el acceso ni los créditos disponibles. Consulta el historial antes de tomar una decisión.'));
    const activity = detail.attendance;
    let activityContent;
    if(activity?.status !== 'ready') activityContent = state(activity?.status,'las asistencias');
    else {
      activityContent=el('div');
      if(!activity.rows.length) activityContent.append(el('p','fc-meta',activity.unresolved?'No hay registros que puedan mostrarse con certeza.':activity.truncated?'No se recibieron asistencias; el historial no está completo.':'No hay asistencias registradas para este cliente.'));
      const list=el('ul','fc-timeline fc-attendance');
      for(const entry of activity.rows.slice(0,tab==='overview'?4:50)) {
        const li=el('li'),time=el('time','',dateLabel(entry.date));time.dateTime=entry.date;
        const desc=el('div');desc.append(el('strong','','Asistencia registrada'),el('small','',entry.time ? entry.time+' · hora registrada' : 'Hora sin registrar'));
        if(entry.method)desc.append(el('small','',entry.method));li.append(time,desc);list.append(li);
      }
      activityContent.append(list);
      if(activity.truncated)activityContent.append(el('p','fc-meta','Se muestran los últimos registros cargados; el historial puede continuar.'));
      if(activity.unresolved)activityContent.append(el('p','fc-meta','Algunos registros requieren verificación y no se muestran.'));
      if(tab==='overview' && activity.rows.length>4)activityContent.append(button('Ver actividad','tab-activity','fc-text-action'));
    }
    const visits=card('Asistencias registradas',activityContent);
    const bookings=detail.reservations;
    let bookingContent;
    if(bookings?.status !== 'ready') bookingContent=state(bookings?.status,'las reservas');
    else {
      bookingContent=el('div');
      bookingContent.append(el('p','fc-meta','Reservas vinculadas a esta ficha, ordenadas por fecha.'));
      if(!bookings.rows.length) bookingContent.append(el('p','fc-meta',bookings.unresolved?'No hay reservas que puedan mostrarse con certeza.':bookings.truncated?'No se recibieron reservas; el historial no está completo.':'No hay reservas vinculadas a esta ficha.'));
      const list=el('ul','fc-timeline fc-reservations');
      for(const entry of bookings.rows.slice(0,tab==='overview'?4:50)) {
        const li=el('li'),time=el('time','',dateLabel(entry.date));time.dateTime=entry.date;
        const desc=el('div');desc.append(el('strong','',entry.type||'Clase sin especificar'),
          el('small','',entry.time ? entry.time+' · horario registrado' : 'Horario sin registrar'),el('small','',entry.state));
        li.append(time,desc);list.append(li);
      }
      bookingContent.append(list);
      if(bookings.truncated)bookingContent.append(el('p','fc-meta','Se muestran las reservas cargadas por fecha descendente; puede haber más registros.'));
      if(bookings.unresolved)bookingContent.append(el('p','fc-meta','Algunas reservas requieren verificación y no se muestran.'));
      if(tab==='overview' && bookings.rows.length>4)bookingContent.append(button('Ver todas las reservas cargadas','tab-activity','fc-text-action'));
    }
    const reservations=card('Reservas registradas',bookingContent);
    const payments=detail.payments;
    let paymentCard=null;
    if(payments&&payments.status!=='restricted'){
      let content;
      if(payments.status!=='ready')content=state(payments.status,'los pagos vinculados');
      else{
        content=el('div');
        content.append(el('p','fc-meta','Solo pagos asociados a esta ficha. Puede haber pagos anteriores pendientes de vincular.'));
        if(!payments.rows.length)content.append(el('p','fc-meta',payments.unresolved?'No hay pagos que puedan mostrarse con certeza.':payments.truncated?'No se recibieron pagos; el historial no está completo.':'No hay pagos vinculados a esta ficha.'));
        const list=el('ul','fc-timeline fc-payments');
        for(const entry of payments.rows.slice(0,tab==='overview'?3:50)){
          const item=el('li'),time=el('time','',dateLabel(entry.date));time.dateTime=entry.date;
          const desc=el('div');desc.append(el('strong','',new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(entry.amount)+' MXN'),
            el('small','',entry.plan||'Plan sin registrar'),el('small','',entry.method||'Método sin registrar'),
            el('small','',entry.expires?'Vencimiento registrado: '+dateLabel(entry.expires):'Vencimiento no verificable'));
          if(entry.notes)desc.append(el('small','',entry.notes));item.append(time,desc);list.append(item);
        }
        content.append(list);
        if(payments.truncated)content.append(el('p','fc-meta','Se muestran hasta 50 registros recientes; puede haber más pagos.'));
        if(payments.unresolved)content.append(el('p','fc-meta','Algunos registros requieren verificación y no se muestran.'));
        if(tab==='overview'&&payments.rows.length>3)content.append(button('Ver pagos vinculados','tab-payments','fc-text-action'));
      }
      paymentCard=card('Pagos vinculados',content,el('p','fc-meta','Un pago registrado no confirma por sí solo el acceso ni los créditos disponibles.'));
    }
    const notes=card('Notas del cliente',info?.status==='ready' ? el('p','fc-notes',info.notes||'Sin notas registradas.') : state(info?.status,'las notas'));
    if(tab==='overview') grid.append(personal,membership,...(paymentCard?[paymentCard]:[]),reservations,visits,notes);
    if(tab==='membership')grid.append(membership);
    if(tab==='activity')grid.append(reservations,visits);
    if(tab==='notes')grid.append(notes);
    if(tab==='payments'&&paymentCard)grid.append(paymentCard);
    if(tab!=='overview')grid.classList.add('fc-single-section');
    const notice=el('p','fc-action-notice');notice.setAttribute('role','status');
    return [button('← Volver al directorio', 'back', 'fc-back'), hero, tabs, notice, grid];
  }

  function rowElement(customer) {
    const row = el('tr');
    const person = el('th');
    person.scope = 'row';
    const open = button('', 'open', 'fc-person');
    open.dataset.id = customer.id;
    open.setAttribute('aria-label', 'Ver ficha de ' + nameOf(customer) + ', referencia ' + customer.id);
    const caption = el('span');
    caption.append(el('strong', '', nameOf(customer)), el('small', '', 'Referencia ' + customer.id));
    open.append(avatar(customer), caption);
    person.append(open);
    const contact = el('td', 'fc-contact');
    contact.append(el('span', '', customer.email || 'Correo sin registrar'), el('small', '', customer.phone || 'Teléfono sin registrar'));
    const number = el('td', 'fc-number');
    number.append(el('span', 'fc-mobile-label', 'N.º de cliente '), el('span', '', customer.number || 'Sin registrar'));
    row.append(person, contact, number);
    return row;
  }

  function table(rows) {
    const grid = el('table', 'fc-table');
    grid.setAttribute('aria-label', 'Directorio de clientes');
    const thead = grid.createTHead().insertRow();
    for (const label of ['Cliente', 'Contacto', 'N.º de cliente']) {
      const th = el('th', '', label);
      th.scope = 'col';
      thead.append(th);
    }
    const tbody = grid.createTBody();
    tbody.append(...rows.map(rowElement));
    return grid;
  }

  function mount(root, { getSnapshot, onRetry, getDetail, onSelect, onRetryDetail, onEdit }) {
    let source = null;
    let query = '';
    let page = 0;
    let selected = '';
    let tab = 'overview';
    let disposed = false;
    const host = el('section', 'flow-customers');
    host.setAttribute('aria-label', 'Directorio de clientes');
    host.tabIndex = -1;
    root.replaceChildren(host);

    function read() {
      try {
        return project(getSnapshot());
      } catch {
        return { status: 'error' };
      }
    }

    function results() {
      const wrap = host.querySelector('.fc-results');
      const matching = findRows(source.rows, query);
      const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
      page = Math.min(page, pages - 1);
      const first = page * PAGE_SIZE;
      const items = matching.slice(first, first + PAGE_SIZE);
      const count = host.querySelector('.fc-count');
      count.textContent = items.length ? (first + 1) + '–' + (first + items.length) + ' de ' + matching.length : '0 resultados';
      wrap.replaceChildren();
      if (items.length) {
        wrap.append(table(items));
      } else {
        wrap.append(el('p', 'fc-empty', query ? 'Sin coincidencias para esta búsqueda.' : 'No hay identidades disponibles.'));
      }
      if (pages > 1) {
        const nav = el('nav', 'fc-pages');
        nav.setAttribute('aria-label', 'Páginas de clientes');
        const previous = button('Anterior', 'previous');
        previous.disabled = page === 0;
        const next = button('Siguiente', 'next');
        next.disabled = page + 1 === pages;
        nav.append(previous, el('span', '', 'Página ' + (page + 1) + ' de ' + pages), next);
        wrap.append(nav);
      }
    }

    function readDetail() {
      try { return projectDetail(getDetail?.(),source.gym,selected); }
      catch (_) { return {status:'unavailable'}; }
    }
    function draw(focusId, focusProfile = true) {
      host.replaceChildren();
      if (source.status !== 'ready') {
        const messages = { loading: 'Cargando directorio…', error: 'No se pudo cargar el directorio.', unavailable: 'Directorio no disponible para esta sesión.' };
        const state = el('p', 'fc-state', messages[source.status]);
        state.setAttribute('role', 'status');
        host.append(state);
        if (source.status === 'error' && onRetry) host.append(button('Reintentar', 'retry'));
        return;
      }
      const customer = selected && source.rows.find(row => row.id === selected);
      if (customer) {
        host.append(...profile(customer,readDetail(),tab,typeof onEdit==='function'));
        if(focusProfile)host.querySelector('h3').focus();
        return;
      }
      selected = '';
      const card = el('div', 'fc-card');
      const bar = el('div', 'fc-tools');
      const heading = el('h3', '', 'Clientes');
      const title = el('div','fc-directory-title');
      title.append(el('span','fc-eyebrow','Gestión de clientes'),heading,el('p','fc-meta','Personas, antes que registros.'));
      const label = el('label', 'fc-search');
      label.append(el('span', '', 'Buscar cliente'));
      const input = el('input');
      input.type = 'search';
      input.autocomplete = 'off';
      input.placeholder = 'Nombre, referencia o contacto';
      input.value = query;
      label.append(input);
      bar.append(title, label);
      const count = el('p', 'fc-count');
      count.setAttribute('role', 'status');
      card.append(bar, count, el('div', 'fc-results'));
      if (source.truncated) card.append(el('p', 'fc-note', 'Se alcanzó el límite de carga del panel. La búsqueda cubre los registros cargados.'));
      if (source.unresolved) card.append(el('p', 'fc-note', 'Algunos registros requieren verificar su identidad antes de mostrarlos.'));
      host.append(card);
      results();
      if (focusId) (host.querySelector('[data-id="' + focusId + '"]') || input).focus();
    }

    function refresh() {
      if (disposed) return;
      const next = read();
      if (!source || next.gym !== source.gym || next.status !== 'ready') {
        query = '';
        page = 0;
        selected = '';
        tab = 'overview';
      }
      source = next;
      draw();
    }

    function back() {
      const previousId = selected;
      selected = '';
      tab = 'overview'; onSelect?.(null);
      draw(previousId);
    }

    function click(event) {
      const control = event.target.closest('button[data-fc-action]');
      if (!control || !host.contains(control) || control.disabled) return;
      const action = control.dataset.fcAction;
      if (action === 'retry') { onRetry?.(); return; }
      // Comprobar de nuevo el contexto al elegir una fila, incluso si una carga sigue en curso.
      const next = read();
      if (source.status !== 'ready' || next.status !== 'ready' || source.gym !== next.gym) {
        query = '';
        page = 0;
        selected = '';
        source = next;
        draw();
        return;
      }
      source = next;
      if (action === 'back') { back(); return; }
      if (action === 'open') {
        selected = positiveId(control.dataset.id);
        tab = 'overview';
        draw(selected);
        onSelect?.(selected);
        return;
      }
      if (action.startsWith('tab-') && ['overview','membership','activity','payments','notes'].includes(action.slice(4))) {
        tab = action.slice(4); draw(null,false); host.querySelector('[data-fc-action="'+action+'"]').focus(); return;
      }
      if (action === 'detail-retry') { onRetryDetail?.(); return; }
      if (action === 'edit-profile') { if(readDetail().info?.status==='ready')onEdit?.(selected);return; }
      if (action === 'copy-phone' || action === 'copy-email') {
        const person=source.rows.find(row=>row.id===selected), info=readDetail().info;
        const value=(info?.status==='ready'?info:person)?.[action==='copy-phone'?'phone':'email'];
        const gym=source.gym, id=selected, original=getSnapshot();
        Promise.resolve().then(()=>{
          if(disposed || selected!==id || getSnapshot()!==original || read().status!=='ready')return;
          return navigator.clipboard.writeText(value);
        }).then(()=>notify('Contacto copiado.'),()=>notify('No se pudo copiar. Puedes seleccionar el contacto de la ficha.'));
        function notify(text) {
          if(disposed || selected!==id || source.gym!==gym || getSnapshot()!==original || read().status!=='ready')return;
          host.querySelector('.fc-action-notice').textContent=text;
        }
        return;
      }
      page += action === 'next' ? 1 : -1;
      page = Math.max(0, page);
      results();
      const same = host.querySelector('[data-fc-action="' + action + '"]:enabled');
      (same || host.querySelector('.fc-pages button:enabled') || host.querySelector('input')).focus();
    }

    function input(event) {
      if (disposed || !event.target.matches('input[type=search]')) return;
      // La búsqueda también debe invalidarse si la sesión cambió desde el último render.
      let snapshot;
      try { snapshot = getSnapshot(); } catch { refresh(); return; }
      if (snapshot?.status !== 'ready' || positiveId(snapshot.gymId) !== source.gym || positiveId(snapshot.actorGymId) !== source.gym) {
        refresh();
        return;
      }
      query = event.target.value;
      page = 0;
      results();
    }

    function key(event) {
      if (event.key === 'Escape' && selected) {
        event.preventDefault();
        event.stopPropagation();
        host.querySelector('[data-fc-action=back]').click();
      }
    }

    function clear() {
      disposed = true;
      source = null;
      getSnapshot = null;
      onRetry = null;
      getDetail = null; onSelect = null; onRetryDetail = null; onEdit = null;
      query = '';
      selected = '';
      host.removeEventListener('click', click);
      host.removeEventListener('input', input);
      host.removeEventListener('keydown', key);
      host.replaceChildren();
      host.remove();
    }

    host.addEventListener('click', click);
    host.addEventListener('input', input);
    host.addEventListener('keydown', key);
    refresh();
    function refreshDetail() {
      if(disposed || !selected)return;
      const next=read();
      if(next.status!=='ready'||next.gym!==source.gym){refresh();return;}
      const focused=host.contains(document.activeElement) ? document.activeElement.dataset.fcAction : null;
      const headingFocused=document.activeElement===host.querySelector('.fc-profile-header h3');
      source=next;draw(null,false);
      if(focused)host.querySelector('[data-fc-action="'+focused+'"]')?.focus({preventScroll:true});
      else if(headingFocused)host.querySelector('.fc-profile-header h3')?.focus({preventScroll:true});
    }
    function restoreSelection(id) {
      if(disposed)return false;
      const next=read(),identity=positiveId(id);
      if(next.status!=='ready'||next.gym!==source.gym||!identity||!next.rows.some(row=>row.id===identity))return false;
      source=next;selected=identity;draw(null,false);return true;
    }
    return { refresh, refreshDetail, restoreSelection, clear };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { project, findRows, projectDetail, projectPayments };
  if (typeof window !== 'undefined') window.VelumFlowCustomers = Object.freeze({ mount, projectPayments });
})();
