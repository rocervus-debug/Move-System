window.CoreCobros = (function core(){
  'use strict';
  const mxn = new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'});
  const money = value => value != null && Number.isFinite(Number(value)) ? mxn.format(value) : 'Por confirmar';
  const html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const date = value => {
    if (!value) return 'Por confirmar';
    const d = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('es-MX',{day:'numeric',month:'long',timeZone:'America/Mexico_City'}) : 'Por confirmar';
  };
  const host = () => document.getElementById('domi-body');
  const context = () => ({gym:MOVE_GYM_ID, id:currentUser?.id, token:currentUser?.jwt, role:currentUser?.rol});
  const current = ctx => ctx && ctx.gym === MOVE_GYM_ID && ctx.token === currentUser?.jwt && ctx.id === currentUser?.id && ctx.role === currentUser?.rol;
  const canCreate = () => !!currentUser?.jwt && !!MOVE_GYM_ID && ['admin','superadmin'].includes(currentUser.rol) && !_pvImpersonando();
  let version = 0, panel = null, dialog = null, catalogReturn = null;
  function reset(){
    version++;
    dialog?.close();
    panel = null;
    catalogReturn = null;
    if (host()) host().replaceChildren();
  }
  async function pages(query){
    const result = [], size = 200;
    for (let start = 0; ; start += size){
      const {data,error} = await query().range(start,start+size-1);
      if (error || !Array.isArray(data)) throw Error('No se pudieron cargar los datos.');
      result.push(...data);
      if (data.length < size) return result;
    }
  }
  function scoped(table,columns,ctx){
    return window.supabaseClient.from(table).select(columns).eq('gym_id',ctx.gym);
  }
  async function account(ctx){
    const {data,error} = await window.supabaseClient.from('gyms')
      .select('stripe_account_id,stripe_account_status,stripe_charges_enabled,stripe_details_submitted').eq('id',ctx.gym).maybeSingle();
    if (error || !data) throw Error('No se pudo consultar la cuenta.');
    return data;
  }
  const ready = a => !!(a?.stripe_account_id && a.stripe_charges_enabled);
  function makeRows(paid,links,subs){
    const sessions = new Set(paid.map(p => p.stripe_session_id).filter(Boolean));
    const rows = paid.map(p => ({kind:'paid',name:p.cliente,plan:p.plan||p.metodo,status:'Pagado',amount:p.monto,at:p.created_at||p.fecha,data:p}));
    links.filter(l => !sessions.has(l.session_id) && new Date(l.vence) > new Date()).forEach(l =>
      rows.push({kind:'link',name:l.cliente,plan:l.descripcion,status:'Pendiente de pago',amount:l.monto,at:l.created_at,data:l}));
    subs.filter(s => ['past_due','incomplete'].includes(s.status)).forEach(s =>
      rows.push({kind:'sub',name:s.cliente_nombre||s.customer_email,plan:s.packages?.name||'Mensualidad',status:s.status==='past_due'?'Requiere atención':'Pendiente de activación',amount:s.amount_cents == null ? null : s.amount_cents/100,at:s.updated_at,data:s}));
    return rows.sort((a,b) => String(b.at||'').localeCompare(String(a.at||'')));
  }
  async function render(){
    const target = host(), ctx = context(), request = ++version;
    panel = null;
    if (!target) return;
    if (!ctx.token || !ctx.gym || roleBlocksView('domiciliados')) { target.replaceChildren(); return; }
    target.innerHTML = '<p class="nothing" role="status">Cargando cobros…</p>';
    const at = new Date().toISOString();
    const since = new Date(Date.now()-45*86400000).toISOString().slice(0,10);
    const [a,b,p,l,s] = await Promise.allSettled([
      account(ctx), _pvStripeData(),
      pages(()=>scoped('pagos','id,cliente,monto,fecha,created_at,metodo,plan,source,stripe_session_id,stripe_balance_transaction_id,stripe_fee_mxn,velum_commission_mxn,net_to_gym_mxn,stripe_available_on',ctx).ilike('metodo','Stripe%').gte('fecha',since).order('id')),
      pages(()=>scoped('payment_links','token,session_id,cliente,monto,descripcion,vence,created_at',ctx).gt('vence',at).order('token')),
      pages(()=>scoped('member_subscriptions','id,cliente_nombre,customer_email,status,current_period_end,cancel_at_period_end,amount_cents,stripe_subscription_id,packages(name),updated_at',ctx).in('status',['active','past_due','incomplete','trialing']).order('id'))
    ]);
    if (!current(ctx) || version!==request) return;
    const balance = b.value?.connected && !b.value.error ? b.value : null;
    panel = {ctx,account:a.value,balance,subs:s.value,paid:p.value,
      rows:makeRows(p.value||[],p.status==='fulfilled'?l.value||[]:[],s.value||[]),
      incomplete:[p,l,s].some(r=>r.status==='rejected'),filter:'Todos',limit:25};
    paint();
  }
  function btn(action,label,cls='linkbtn'){
    return `<button type="button" class="${cls}" data-act="${action}">${label}</button>`;
  }
  function setup(a){
    if (!a) return '<p class="message">No pudimos consultar la activación de cobros. '+btn('reload','Reintentar')+'</p>';
    if (ready(a)) return '';
    const started = !!a.stripe_account_id, review = started && a.stripe_details_submitted && a.stripe_account_status!=='restricted';
    const title = review?'Stripe está revisando tu cuenta':started?'Completa los datos de tu gimnasio':'Recibe pagos con tarjeta';
    const hint = review?'Puedes revisar el estado de la activación aquí.':'Conecta la cuenta bancaria donde quieres recibir tus depósitos.';
    return `<section class="pay-card setup"><h2>${title}</h2><p class="hint">${hint}</p>${canCreate()?btn(review?'sync':'activate',review?'Ver estado':started?'Completar datos':'Activar cobros','primary'):''}</section>`;
  }
  function paint(){
    const state = panel;
    if (!state || !current(state.ctx)) return;
    const {balance,rows,filter,limit} = state, next = balance?.next_payout, m = balance?.month_summary;
    const need = rows.filter(r=>r.status==='Requiere atención');
    const month = new Date().toLocaleDateString('es-MX',{month:'long',year:'numeric',timeZone:'America/Mexico_City'});
    const tabNames = ['Todos','Pagados','Pendientes'];
    const filtered = rows.map((r,i)=>({r,i})).filter(({r})=>filter==='Todos'||(filter==='Pagados'?r.kind==='paid':filter==='Atención'?r.status==='Requiere atención':r.kind!=='paid'));
    host().innerHTML = `<div class="titlebar"><div><h1>Cobros</h1><p class="date">${html(month)} · MXN</p></div>${ready(state.account)&&canCreate()?btn('create','＋ Crear cobro','primary'):''}</div>
      ${setup(state.account)}
      <section class="summary" aria-label="Resumen de cobros"><div class="pay-card deposit"><p class="eyebrow">Próximo depósito</p>
      <p class="big">${next?money(next.amount_mxn):'—'}</p><p class="hint">${next?'Fecha estimada · '+date(next.arrival_date):balance?'Sin depósito programado':state.account && !state.account.stripe_account_id?'Se mostrará cuando empieces a cobrar.':'Fecha por confirmar'}</p>${balance?btn('bank','Ver depósito →'):''}</div>
      <div class="pay-card metrics"><p class="eyebrow">Cobrado este mes</p><p class="big">${m?money(m.gross_mxn):'—'}</p><p class="hint">${m?`${m.count} ${m.count===1?'pago confirmado':'pagos confirmados'} · antes de comisiones`:state.account && !state.account.stripe_account_id?'Cuenta por activar':'Resumen de Stripe no disponible'}</p></div></section>
      ${!balance && state.account?.stripe_account_id?`<p class="message">${_pvImpersonando()?'El saldo está disponible en la sesión del gimnasio.':'No pudimos cargar el saldo de Stripe. '+btn('reload','Reintentar')}</p>`:''}
      ${need.length?`<div class="attention"><span class="noticeicon">!</span><div><strong>${need.length===1?'Una mensualidad requiere atención':need.length+' mensualidades requieren atención'}</strong><p class="hint">Revisa el pago pendiente con tu cliente.</p></div>${btn('review','Revisar →')}</div>`:''}
      <section><h2>Movimientos</h2><p class="hint">Cobros recientes y pendientes</p>
      <div class="filters" aria-label="Filtrar movimientos">${(filter==='Atención'?[...tabNames,filter]:tabNames).map(t=>`<button data-filter="${t}" aria-pressed="${t===filter}">${t}</button>`).join('')}</div>
      ${state.incomplete?`<p class="message" role="status">Hay movimientos que no pudimos cargar. ${btn('reload','Reintentar')}</p>`:''}
      <div class="ledger">${filtered.slice(0,limit).map(({r,i})=>{
        const name = r.name || 'Cliente', initials=name.trim().split(/\s+/).slice(0,2).map(w=>w.charAt(0)).join('').toUpperCase();
        return `<button class="item" data-row="${i}"><span class="avatar" aria-hidden="true">${html(initials)}</span><span><span class="name">${html(name)}</span><span class="sub">${html(r.plan||'Cobro')}</span></span><span class="tag ${r.kind==='paid'?'':'waiting'}">${r.status}</span><span class="sum">${money(r.amount)}</span><span class="arrow" aria-hidden="true">›</span></button>`;
      }).join('') || (state.incomplete?'':'<p class="nothing">Sin movimientos con este filtro.</p>')}</div>${filtered.length>limit?btn('more','Ver más movimientos'):''}</section>
      ${channels(state.paid)}
      ${state.subs?.length?`<details><summary>Administrar mensualidades (${state.subs.length})</summary><div class="details-list">${state.subs.map(_domiSubRow).join('')}</div></details>`:''}`;
    host().onclick = async event => {
      const target=event.target.closest('button');
      if (!target || panel!==state || !current(state.ctx)) return;
      if (target.dataset.filter){state.filter=target.dataset.filter;state.limit=25;paint();host().querySelector('[aria-pressed="true"]')?.focus();return;}
      if (target.dataset.row!=null){detail(rows[Number(target.dataset.row)]);return;}
      switch (target.dataset.act){
        case 'review':state.filter='Atención';state.limit=25;paint();host().querySelector('[aria-pressed="true"]')?.focus();break;
        case 'more':state.limit+=25;paint();break;
        case 'reload':render();break;
        case 'bank':bankDetails(balance);break;
        case 'create':create();break;
        case 'activate':if(canCreate()) conectarStripe();break;
        case 'sync':
          if (!canCreate()) return;
          target.disabled=true;
          try {await edge('stripe-account-sync',{},state.ctx);if(current(state.ctx)) await render();}
          catch {if(current(state.ctx)) toast('No se pudo actualizar el estado. Vuelve a intentar.','✕');}
          finally {target.disabled=false;}
          break;
      }
    };
  }
  function openBox(title,body){
    dialog?.close();
    const box=document.createElement('dialog');
    box.className='vc-pay';box.setAttribute('aria-labelledby','vc-title');
    box.innerHTML=`<div class="line"><h2 id="vc-title">${html(title)}</h2><button type="button" class="close" aria-label="Cerrar">×</button></div>${body}`;
    box.querySelector('.close').onclick=()=>box.close();
    box.addEventListener('close',()=>{box.remove();if(dialog===box)dialog=null;},{once:true});
    document.body.append(box);dialog=box;box.showModal();return box;
  }
  function facts(items){
    return `<dl class="detail">${items.map(([key,value])=>`<div><dt>${html(key)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl>`;
  }
  function bankDetails(b){
    const m=b.month_summary;
    const states={paid:'Depositado',in_transit:'En camino',pending:'Programado',failed:'Falló',canceled:'Cancelado'};
    openBox('Depósitos',facts([['Cuenta de destino',b.bank?.last4?'Terminación '+b.bank.last4:'Por confirmar'],['Disponible en Stripe',money(b.available_mxn)],['En camino al banco',money(b.in_transit_mxn)]])+
      (m?`<h3>Resumen del mes</h3>${facts([['Cobros brutos',money(m.gross_mxn)],['Comisiones de procesamiento',money(m.fee_mxn)],['Reembolsos',money(m.refunds_net_mxn)],['Disputas',money(m.disputes_net_mxn)],['Neto del mes',money(m.net_mxn)]])}`:'')+
      `<h3>Depósitos recientes</h3>${b.payouts?.length?facts(b.payouts.map(p=>[date(p.arrival_date)+' · '+(states[p.status]||'Por confirmar'),money(p.amount_mxn)])):'<p class="hint">Aún no hay depósitos registrados.</p>'}`);
  }
  function detail(row){
    const p=row.data, items=[['Cliente',row.name||'Cliente'],['Concepto',row.plan||'Cobro'],['Estado',row.status],['Importe',money(row.amount)]];
    let share='';
    if (row.kind==='paid'){
      const settled=_pvNeto(p).confirmado;
      items.push(['Fecha de pago',date(p.fecha)],['Tarifa de Stripe',settled?money(p.stripe_fee_mxn):'Por confirmar']);
      if (settled && Number(p.velum_commission_mxn)>0) items.push(['Comisión histórica de VELUM',money(p.velum_commission_mxn)]);
      items.push(['Neto del cobro',settled?money(p.net_to_gym_mxn):'Por confirmar'],['Disponible en Stripe',date(p.stripe_available_on)]);
    } else if (row.kind==='link'){
      items.push(['Vigencia',date(p.vence)]);
      if (/^[A-Za-z0-9_-]{16,64}$/.test(p.token) && new Date(p.vence)>new Date()) share=`${location.origin}/pagar/${p.token}`;
    } else {items.push(['Correo del cliente',p.customer_email||'Por confirmar']);}
    const box=openBox('Detalle del movimiento', facts(items)+(share?shareFields():''));
    if(share) configureShare(box,share);
  }
  async function edge(name,body,ctx){
    if (!current(ctx) || !canCreate()) throw Error('Vuelve a iniciar sesión en tu gimnasio.');
    const res=await fetch(`${supabaseUrl}/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:window._ANON_KEY||'',Authorization:'Bearer '+ctx.token},body:JSON.stringify(body)});
    const data=await res.json();
    if (!res.ok || data.error) throw Error(data.error||'No se pudo completar la operación.');
    return data;
  }
  function shareFields(){
    return `<label class="field">Enlace para tu cliente<input class="fieldinput" name="url" readonly></label><div class="actions">${btn('copy','Copiar enlace','primary')}<a class="linkbtn" target="_blank" rel="noopener noreferrer">Abrir WhatsApp ↗</a></div><p class="hint" role="status"></p>`;
  }
  function configureShare(box,url){
    const field=box.querySelector('[name=url]');field.value=url;
    box.querySelector('a').href='https://wa.me/?text='+encodeURIComponent('Aquí puedes completar tu pago en VELUM: '+url);
    box.querySelector('[data-act=copy]').onclick=async()=>{
      const status=box.querySelector('[role=status]');
      try {await navigator.clipboard.writeText(url);status.textContent='Enlace copiado.';}
      catch {field.focus();field.select();status.textContent='Selecciona Copiar para compartir el enlace.';}
    };
  }
  function shareUrl(value){
    if (typeof value!=='string') throw Error('No se recibió el enlace de cobro.');
    const url=new URL(value);
    if (url.protocol!=='https:' || url.username || url.password || ![location.hostname,'myvelum.app','checkout.stripe.com'].includes(url.hostname)) throw Error('No se pudo verificar el enlace de cobro.');
    return url.href;
  }
  function resume(){
    const saved=catalogReturn;
    catalogReturn=null;
    if (saved && current(saved.ctx)) create(saved.name,true,saved.email);
  }
  async function create(name='',monthly=false,email=''){
    if (!canCreate()) {toast('Se necesita acceso de administración del gimnasio para crear un cobro.','✕');return;}
    const ctx=context();
    const box=openBox('Crear cobro','<p class="hint" role="status">Cargando tu catálogo…</p>');
    let plans,a;
    try {
      [plans,a]=await Promise.all([
        pages(()=>scoped('packages','id,name,price_mxn,billing_type',ctx).eq('is_active',true).order('sort_order').order('id')),account(ctx)
      ]);
    } catch {
      if(current(ctx) && box.open) {
        box.querySelector('[role=status]').innerHTML='No pudimos cargar los datos del cobro. '+btn('retry','Reintentar');
        box.querySelector('[data-act=retry]').onclick=()=>create(name,monthly,email);
      }
      return;
    }
    if (!current(ctx) || !box.open) return;
    if (!ready(a)){
      box.querySelector('[role=status]').outerHTML=setup(a);
      const action=box.querySelector('[data-act]');
      if(action) action.onclick=async()=>{
        if(!current(ctx) || !canCreate()) return;
        if(action.dataset.act==='activate'){box.close();conectarStripe();return;}
        action.disabled=true;
        try {await edge('stripe-account-sync',{},ctx);if(current(ctx) && box.open) create(name,monthly,email);}
        catch {if(current(ctx)) toast('No pudimos consultar la activación. Vuelve a intentar.','✕');}
        finally {action.disabled=false;}
      };
      return;
    }
    const members=(typeof clientesDB!=='undefined'?clientesDB:[]).filter(c=>String(c.gym_id)===String(ctx.gym));
    const f=document.createElement('form');
    f.innerHTML=`<label class="field">Cliente<input name="member" class="fieldinput" list="vc-members" required maxlength="160" placeholder="Nombre del cliente"></label>
      <datalist id="vc-members">${members.map(c=>`<option value="${html(c.nombre)}"></option>`).join('')}</datalist>
      <fieldset class="vc-types"><legend>Tipo de cobro</legend><div class="choice"><label><input type="radio" name="frequency" value="once"> Pago único</label><label><input type="radio" name="frequency" value="month"> Mensualidad</label></div></fieldset>
      <label class="field">Concepto<select class="fieldinput" name="plan"></select></label>
      <div class="vc-free"><label class="field">Monto en MXN<input class="fieldinput" name="amount" type="number" min="10" step="0.01" inputmode="decimal"></label><label class="field">Descripción<input class="fieldinput" name="description" maxlength="200" placeholder="Por ejemplo, clase individual"></label></div>
      <div class="vc-new" hidden><p class="hint">Crea una mensualidad en tu catálogo para poder cobrarla.</p>${btn('addplan','Crear mensualidad')}</div>
      <label class="field"><span class="vc-email-label"></span><input class="fieldinput" type="email" name="email" autocomplete="email"></label>
      <p class="hint vc-total" aria-live="polite"></p><p class="hint vc-first" hidden>El primer pago se realiza cuando el cliente autoriza la mensualidad.</p><p class="message" role="alert"></p><button class="primary wide" type="submit">Generar enlace</button>`;
    box.querySelector('[role=status]').replaceWith(f);
    const fields=f.elements, submit=f.querySelector('[type=submit]'), err=f.querySelector('[role=alert]');
    fields.member.value=name;
    fields.frequency.value=monthly?'month':'once';
    const customer=()=>members.find(c=>String(c.nombre||'').trim().toLowerCase()===fields.member.value.trim().toLowerCase());
    fields.email.value=email || customer()?.email || '';
    let previousEmail=fields.email.value;
    fields.member.oninput=()=>{
      if(!fields.email.value || fields.email.value===previousEmail) fields.email.value=customer()?.email||'';
      previousEmail=customer()?.email||'';
    };
    const recurring=()=>fields.frequency.value==='month';
    function price(){
      const free=fields.plan.value==='free';
      f.querySelector('.vc-free').hidden=!free;
      fields.amount.required=fields.description.required=free;
      fields.amount.disabled=fields.description.disabled=!free;
      const p=plans.find(p=>String(p.id)===fields.plan.value);
      f.querySelector('.vc-total').textContent=p?`Importe del enlace · ${money(p.price_mxn)} MXN${recurring()?' al mes':''}`:'';
      submit.disabled=!free && (!p || Number(p.price_mxn)<10);
      if(p && Number(p.price_mxn)<10) err.textContent='El mínimo para cobrar con tarjeta es $10 MXN.';
      else err.textContent='';
    }
    function options(){
      const rec=recurring(), list=plans.filter(p=>(p.billing_type==='recurring')===rec);
      fields.plan.innerHTML=list.map(p=>`<option value="${html(p.id)}">${html(p.name)} · ${money(p.price_mxn)}</option>`).join('')+
        (rec?(list.length?'':'<option value="">Sin mensualidades activas</option>'):'<option value="free">Monto libre</option>');
      f.querySelector('.vc-new').hidden=!rec || !!list.length;
      fields.email.required=rec;
      f.querySelector('.vc-first').hidden=!rec;
      f.querySelector('.vc-email-label').textContent=rec?'Correo del cliente':'Correo del cliente (opcional)';
      price();
    }
    f.querySelectorAll('[name=frequency]').forEach(r=>r.onchange=options);
    fields.plan.onchange=price;
    f.querySelector('[data-act=addplan]').onclick=()=>{
      if(!current(ctx) || !canCreate()) return;
      catalogReturn={ctx,name:fields.member.value,email:fields.email.value};
      box.close();openModal('paquete');
      const billing=document.getElementById('pk-cobro');
      if(billing){billing.value='recurring';billing.dispatchEvent(new Event('change',{bubbles:true}));}
    };
    options();
    fields.member.focus();
    let sending=false;
    f.onsubmit=async event=>{
      event.preventDefault();
      if(sending || submit.disabled || !current(ctx) || !canCreate() || !f.reportValidity()) return;
      const rec=recurring(), member=fields.member.value.trim(), address=fields.email.value.trim(), free=fields.plan.value==='free';
      if(!member || (free && !fields.description.value.trim())){err.textContent='Escribe el nombre y el concepto del cobro.';return;}
      const body=rec?{action:'create_link',package_id:fields.plan.value,customer:{name:member,email:address}}:
        {tipo:'pago_unico',cliente_nombre:member,cliente_email:address||undefined,...(free?{monto:Number(fields.amount.value),descripcion:fields.description.value.trim()}:{package_id:Number(fields.plan.value)})};
      sending=true;submit.disabled=true;submit.textContent='Generando enlace…';err.textContent='';
      try{
        const result=await edge(rec?'velum-member-subscription':'velum-stripe-charge',body,ctx);
        if(!current(ctx)) return;
        if(!result.ok) throw Error('No se pudo generar el enlace.');
        const url=shareUrl(rec?result.checkout_url:result.url);
        if(box.open){
          const resultBox=openBox('Enlace listo',`<p class="hint">${rec?'La mensualidad comenzará cuando':'El cobro se confirmará cuando'} ${html(member)} complete el pago.</p>`+shareFields());
          configureShare(resultBox,url);
        }
        if(host()?.closest('.view')?.classList.contains('active')) render();
      } catch(e){
        if(current(ctx) && box.open) err.textContent=e.message||'No se pudo generar el enlace.';
      } finally {
        sending=false;submit.disabled=false;submit.textContent='Generar enlace';
      }
    };
  }
  function mobileCharge(){
    if (!canCreate() || !gymConfig?.stripe_account_id) {openModal('pago');return;}
    const box=openBox('Cobrar',`<div class="vc-methods">${btn('online','Crear un enlace de cobro','primary')}${btn('manual','Registrar un pago recibido','secondary')}</div>`);
    box.querySelector('[data-act=online]').onclick=()=>create();
    box.querySelector('[data-act=manual]').onclick=()=>{box.close();openModal('pago');};
  }
  function channels(paid){
    if (!paid) return '';
    const period=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit'}).format(new Date());
    const names={storefront:'Tienda en línea',app:'App del socio',domiciliacion:'Mensualidades',links:'Enlaces de pago'};
    const totals=new Map();
    for(const p of paid){
      if(!String(p.fecha).startsWith(period)) continue;
      const key=_pvCanal(p);
      totals.set(key,(totals.get(key)||0)+Math.round(Number(p.monto)*100));
    }
    if(!totals.size) return '';
    return `<details><summary>Cobros del mes por canal</summary>${facts(Array.from(totals,([k,v])=>[names[k],money(v/100)]))}</details>`;
  }
  return {render,create,canCreate,reset,resume,mobileCharge};
})();
