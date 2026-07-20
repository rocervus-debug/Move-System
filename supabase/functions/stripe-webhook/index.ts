// stripe-webhook — v16: DOS fixes P0 cazados en certificación: (1) recordMemberPago manda package_id (check pago_requires_package), (2) clases_usadas siempre 0 — con null (paquetes ilimitados) el insert violaba NOT NULL y el pago cobrado no se registraba (la causa de las ventas fantasma de mayo). v15: + atribución de referidos (metadata.ref → saas_leads con referrer_id) en el signup SaaS.
// v13/v14: idempotencia DB (pagos únicos por stripe_session_id), monto real en renovaciones,
// upsert de member_subscriptions, dunning, anti-replay. Deno.serve nativo (sin deno.land/std).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature' };
function json(b: unknown, s = 200){ return new Response(JSON.stringify(b),{status:s,headers:{...CORS,'Content-Type':'application/json'}}); }

const SIG_TOLERANCE_SEC = 300; // 5 min, igual que la librería oficial de Stripe (anti-replay)
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const tsNum = parseInt(t, 10);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > SIG_TOLERANCE_SEC) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  const expected = Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== v1.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
async function hashPBKDF2(input: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = btoa(String.fromCharCode(...salt));
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(input), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMat, 256);
  return `v2:${saltB64}:${btoa(String.fromCharCode(...new Uint8Array(bits)))}`;
}
function genSlug(nombre: string): string {
  return (nombre||'gym').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,30) + '-' + Math.random().toString(36).substring(2,6);
}

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
// acct = cuenta conectada del gym. En cobro DIRECTO los objetos (sub, charge, PI) viven en la
// cuenta del gym → hay que leer con Stripe-Account. En cobro de destino (viejo) viven en la
// plataforma → sin header. El webhook decide por event.account (Connect events lo traen).
async function stripeGet(path: string, acct?: string | null): Promise<any> {
  const headers: Record<string,string> = { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Stripe-Version': '2024-11-20.acacia' };
  if (acct) headers['Stripe-Account'] = acct;
  const res = await fetch(`https://api.stripe.com/v1${path}`, { headers });
  return res.json();
}
// Comisión REAL de Stripe (MXN) de un cargo, leída de su balance_transaction. Devuelve null si
// aún no está disponible (no rompe el registro del pago).
async function stripeFeeFromCharge(chargeId?: string | null, acct?: string | null): Promise<number | null> {
  if (!chargeId) return null;
  try {
    const ch = await stripeGet(`/charges/${chargeId}?expand[]=balance_transaction`, acct);
    const bt = ch?.balance_transaction;
    if (bt && typeof bt.fee === 'number') return bt.fee / 100;
  } catch (_) { /* degradar con gracia */ }
  return null;
}
// Igual pero partiendo de un PaymentIntent (storefront / link) → su latest_charge.
async function stripeFeeFromPI(piId?: string | null, acct?: string | null): Promise<number | null> {
  if (!piId) return null;
  try {
    const pi = await stripeGet(`/payment_intents/${piId}?expand[]=latest_charge.balance_transaction`, acct);
    const bt = pi?.latest_charge?.balance_transaction;
    if (bt && typeof bt.fee === 'number') return bt.fee / 100;
  } catch (_) { /* degradar con gracia */ }
  return null;
}

function isDupErr(e: any): boolean { return !!e && (e.code === '23505' || String(e.message||'').includes('duplicate key')); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  // Secreto del segundo destino: el que escucha eventos de CUENTAS CONECTADAS (cobro directo).
  const webhookSecretConnect = Deno.env.get('STRIPE_WEBHOOK_SECRET_CONNECT');
  if (!webhookSecret) return json({ error: 'STRIPE_WEBHOOK_SECRET no configurada.' }, 500);
  const payload = await req.text();
  const sig = req.headers.get('Stripe-Signature') || '';
  // Stripe firma cada evento con el secreto del destino que lo emite. Aceptamos AMBOS:
  // el de la plataforma ("Tu cuenta") y el de cuentas conectadas (cobro directo). Si el
  // segundo no está configurado, se comporta igual que antes (solo plataforma).
  const sigOk = await verifyStripeSignature(payload, sig, webhookSecret)
    || (webhookSecretConnect ? await verifyStripeSignature(payload, sig, webhookSecretConnect) : false);
  if (!sigOk) return json({ error: 'Invalid signature.' }, 401);
  const event = JSON.parse(payload);
  // Cuenta conectada del evento: en cobro DIRECTO los Connect events traen event.account (la
  // cuenta del gym) → se usa para leer sub/charge/PI en su cuenta. En cobro de destino (viejo)
  // viene undefined → se lee en la plataforma. Así el webhook sirve a los DOS modelos.
  const evAcct = (event.account as string) || undefined;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  async function sendEmail(to: string, template: string, data: Record<string,string>) {
    try { await fetch(`${SUPABASE_URL}/functions/v1/velum-email`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${SERVICE_KEY}`}, body: JSON.stringify({ to, template, data }) }); } catch(_) {}
  }

  async function resolveCliente(gymId: number, email: string, name: string, phone: string|null): Promise<{id:number|null, nombre:string, isNew:boolean}> {
    let clienteNombre = name || (email ? email.split('@')[0] : 'Cliente');
    const { data: existing } = await db.from('clientes').select('id, nombre').eq('gym_id', gymId).eq('email', email).maybeSingle();
    if (existing) return { id: existing.id, nombre: existing.nombre || clienteNombre, isNew: false };
    const { data: maxRow } = await db.from('clientes').select('numero_cliente').eq('gym_id', gymId).order('numero_cliente', { ascending: false }).limit(1).maybeSingle();
    const nextNum = (maxRow?.numero_cliente || 0) + 1;
    const { data: nc, error: ce } = await db.from('clientes').insert({ gym_id: gymId, nombre: clienteNombre, email, telefono: phone, numero_cliente: nextNum }).select('id').single();
    if (ce) console.error('cliente insert err:', ce);
    return { id: nc?.id ?? null, nombre: clienteNombre, isNew: true };
  }

  async function recordMemberPago(opts: { gymId:number, clienteNombre:string, phone:string|null, pkgName:string, packageId:number|null, durationDays:number, clasesTotales:number|null, montoMxn:number, feePct:number, feeMxn?:number, stripeFeeMxn?:number|null, subId:string, invoiceId:string }) {
    const { gymId, clienteNombre, phone, pkgName, packageId, durationDays, clasesTotales, montoMxn, feePct, feeMxn, stripeFeeMxn, subId, invoiceId } = opts;
    if (invoiceId) {
      const { data: dup } = await db.from('pagos').select('id').eq('gym_id', gymId).eq('stripe_session_id', invoiceId).maybeSingle();
      if (dup) return;
    }
    let baseDate = new Date();
    const { data: lastPago } = await db.from('pagos').select('vence').eq('gym_id', gymId).eq('cliente', clienteNombre).neq('notas','__sin_pago__').order('fecha',{ascending:false}).limit(1).maybeSingle();
    if (lastPago?.vence) { const cur = new Date(lastPago.vence + 'T12:00:00'); if (cur.getTime() > baseDate.getTime()) baseDate = cur; }
    const venceDate = new Date(baseDate); venceDate.setDate(venceDate.getDate() + (durationDays || 30));
    const comm = (feeMxn != null && Number.isFinite(feeMxn)) ? Math.round(feeMxn) : Math.round(montoMxn * feePct);
    const sFee = (stripeFeeMxn != null && Number.isFinite(stripeFeeMxn)) ? Math.round(stripeFeeMxn) : null;   // comisión Stripe real (MXN)
    // package_id es OBLIGATORIO por el check pago_requires_package — sin él, el insert
    // fallaba silencioso y la mensualidad cobrada no aparecía en los libros (bug cazado 08-jul)
    const { error: pErr } = await db.from('pagos').insert({
      gym_id: gymId, cliente: clienteNombre, monto: montoMxn, fecha: new Date().toISOString().slice(0,10), plan: pkgName,
      package_id: packageId,
      metodo: 'Stripe (Domiciliación)', vence: venceDate.toISOString().slice(0,10), telefono: phone,
      applied_price_mxn: Math.round(montoMxn), list_price_mxn: Math.round(montoMxn), source: 'domiciliacion',
      velum_commission_mxn: comm, stripe_fee_mxn: sFee, net_to_gym_mxn: Math.round(montoMxn - comm - (sFee || 0)),
      stripe_session_id: invoiceId || null, stripe_sub_id: subId, stripe_status: 'active',
      notas: 'Mensualidad domiciliada', clases_totales: clasesTotales, clases_usadas: 0,
    });
    if (pErr && !isDupErr(pErr)) console.error('domiciliacion pago insert err:', pErr);
    return venceDate.toISOString().slice(0,10);
  }

  try {
    switch (event.type) {
      case 'account.updated': {
        const acct = event.data.object;
        const status = acct.charges_enabled && acct.payouts_enabled ? 'enabled' : acct.requirements?.disabled_reason ? 'restricted' : acct.details_submitted ? 'pending' : 'pending';
        const updates: Record<string, unknown> = { stripe_account_status: status, stripe_charges_enabled: !!acct.charges_enabled, stripe_payouts_enabled: !!acct.payouts_enabled, stripe_details_submitted: !!acct.details_submitted, stripe_last_sync_at: new Date().toISOString() };
        if (acct.details_submitted && acct.charges_enabled) updates.stripe_onboarded_at = new Date().toISOString();
        await db.from('gyms').update(updates).eq('stripe_account_id', acct.id);
        break;
      }
      case 'account.application.deauthorized': {
        const acctId = event.account || event.data.object?.id;
        if (acctId) await db.from('gyms').update({ stripe_account_status: 'none', stripe_charges_enabled: false, stripe_payouts_enabled: false, stripe_last_sync_at: new Date().toISOString() }).eq('stripe_account_id', acctId);
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;
        const md = session.metadata || {};

        if (session.mode === 'subscription' && md.velum_signup === 'true') {
          const email = (md.email || session.customer_email || '').toLowerCase().trim();
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const plan = md.plan || 'pro';
          const gymNombre = md.gym_nombre || 'Mi Gym';
          if (!email) { console.error('saas signup sin email'); break; }
          const { data: dupGym } = await db.from('gyms').select('id').eq('stripe_subscription_id', subscriptionId).maybeSingle();
          if (dupGym) { console.log('saas signup duplicado, skip'); break; }
          const { data: dupUser } = await db.from('usuarios').select('id, gym_id').eq('email', email).maybeSingle();
          if (dupUser) {
            await db.from('gyms').update({ subscription_plan: plan, subscription_status: 'active', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, subscription_updated_at: new Date().toISOString() }).eq('id', dupUser.gym_id);
            break;
          }
          const slug = genSlug(gymNombre);
          const { data: planRow } = await db.from('velum_saas_plans').select('max_clientes').eq('id', plan).maybeSingle();
          const { data: newGym, error: gymErr } = await db.from('gyms').insert({
            nombre: gymNombre, slug, plan, owner_email: email, activo: true,
            max_clientes: planRow?.max_clientes ?? null,
            subscription_plan: plan, subscription_status: 'active',
            stripe_customer_id: customerId, stripe_subscription_id: subscriptionId,
            subscription_updated_at: new Date().toISOString(),
          }).select('id').single();
          if (gymErr || !newGym) { console.error('saas crear gym:', gymErr); break; }
          const gymId = newGym.id;
          const secureHash = md.pw_hash ? await hashPBKDF2(md.pw_hash) : await hashPBKDF2(crypto.randomUUID());
          const { error: userErr } = await db.from('usuarios').insert({
            nombre: md.nombre_admin || email.split('@')[0], email, pw_hash: secureHash, password: secureHash,
            pw_version: 2, rol: 'admin', activo: true, gym_id: gymId,
          });
          if (userErr) { console.error('saas crear usuario:', userErr); }
          await db.from('gym_config').insert([
            { key: 'gym_nombre', value: gymNombre, gym_id: gymId },
            { key: 'gym_color', value: '#00D4FF', gym_id: gymId },
            { key: 'gym_theme', value: 'cyan', gym_id: gymId },
            { key: 'moneda', value: 'MXN', gym_id: gymId },
            { key: 'plan', value: plan, gym_id: gymId },
          ]);
          // Atribución de referido: si el registro trajo ?ref, colgar el gym a su referenciador.
          // Nunca rompe el camino del dinero: cualquier error aquí solo se loguea.
          if (md.ref) {
            try {
              const { data: refRow } = await db.from('saas_referrers').select('id').eq('codigo', String(md.ref).toLowerCase()).maybeSingle();
              if (refRow) {
                const { error: refErr } = await db.from('saas_leads').insert({
                  empresa: gymNombre, canal: 'referido-link', etapa: 'trial', gym_id: gymId,
                  referrer_id: refRow.id, contacto: { mail: email },
                  angulo: 'Llegó solo por link de referido',
                });
                if (refErr && !isDupErr(refErr)) console.error('ref attribution insert:', refErr);
                else console.log(`referido atribuido: ${md.ref} -> gym ${gymId}`);
              } else console.warn('ref code desconocido:', md.ref);
            } catch (e) { console.error('ref attribution err:', e); }
          }
          await sendEmail(email, 'welcome', { nombre: md.nombre_admin || gymNombre, gym: 'VELUM', url: 'https://myvelum.app/app' });
          console.log(`SaaS signup ok: ${gymNombre} (${gymId})`);
          break;
        }

        if (session.mode === 'subscription' && md.velum_member_sub === 'true') {
          const gymId = parseInt(md.gym_id || '0', 10);
          const packageId = parseInt(md.package_id || '0', 10);
          const subId = session.subscription as string;
          const customerId = session.customer as string;
          const email = (md.customer_email || session.customer_email || '').toLowerCase().trim();
          if (!gymId || !packageId || !subId) { console.error('member sub: faltan datos'); break; }
          const { data: dup } = await db.from('member_subscriptions').select('id').eq('stripe_subscription_id', subId).maybeSingle();
          if (dup) { console.log('member sub duplicado, skip'); break; }

          const { data: pkg } = await db.from('packages').select('name, num_classes, unlimited_classes, duration_days, price_mxn').eq('id', packageId).maybeSingle();
          const { data: gym } = await db.from('gyms').select('nombre').eq('id', gymId).maybeSingle();
          if (!pkg || !gym) { console.error('member sub: pkg/gym no encontrado'); break; }
          const cli = await resolveCliente(gymId, email, md.customer_name || '', md.customer_phone || null);
          const sub = await stripeGet(`/subscriptions/${subId}`, evAcct);
          const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end*1000).toISOString() : null;
          const feePct = Number(md.velum_fee_pct || '0');

          const { data: ph } = await db.from('member_subscriptions').select('id').eq('gym_id', gymId).eq('package_id', packageId).eq('customer_email', email).is('stripe_subscription_id', null).order('created_at',{ascending:false}).limit(1).maybeSingle();
          const row = {
            cliente_id: cli.id, cliente_nombre: cli.nombre, customer_email: email,
            // Cobro DIRECTO: la sub vive en la cuenta del gym (evAcct). Cobro de destino (viejo):
            // no hay event.account → cae a transfer_data.destination. Nunca guardar null aquí o se
            // rompe cancelar/reactivar (no sabría en qué cuenta está la suscripción).
            stripe_subscription_id: subId, stripe_customer_id: customerId, stripe_account_id: evAcct || (sub?.transfer_data?.destination) || null,
            status: sub?.status || 'active', amount_cents: Math.round(Number(pkg.price_mxn)*100), application_fee_pct: feePct,
            interval: 'month', current_period_end: periodEnd, cancel_at_period_end: !!sub?.cancel_at_period_end, updated_at: new Date().toISOString(),
          };
          if (ph) await db.from('member_subscriptions').update(row).eq('id', ph.id);
          else { const { error: upErr } = await db.from('member_subscriptions').upsert({ gym_id: gymId, package_id: packageId, ...row }, { onConflict: 'stripe_subscription_id' }); if (upErr && !isDupErr(upErr)) console.error('member sub upsert err:', upErr); }

          const clasesTotales = pkg.unlimited_classes ? null : (pkg.num_classes || null);
          const invoiceId = (sub?.latest_invoice && typeof sub.latest_invoice==='string') ? sub.latest_invoice : (session.invoice as string)||'';
          // PRIMER cobro: capturar el fee REAL de Stripe (la factura → su charge → balance_transaction).
          // Sin esto, el primer pago quedaba con net = bruto (los cobros de renovación sí lo capturaban).
          let firstStripeFee: number | null = null;
          try { if (invoiceId) { const firstInv = await stripeGet(`/invoices/${invoiceId}`, evAcct); firstStripeFee = await stripeFeeFromCharge(firstInv?.charge as string, evAcct); } } catch(_) { /* degradar con gracia */ }
          if (cli.id) {
            const vence = await recordMemberPago({ gymId, clienteNombre: cli.nombre, phone: md.customer_phone || null, pkgName: pkg.name, packageId, durationDays: pkg.duration_days||30, clasesTotales, montoMxn: Number(pkg.price_mxn), feePct, stripeFeeMxn: firstStripeFee, subId, invoiceId });
            if (email) {
              await sendEmail(email, 'recibo', { gym: gym.nombre, monto: String(Math.round(Number(pkg.price_mxn))), plan: pkg.name + ' (mensual)', vence: vence || '' });
              if (cli.isNew) {
                const { data: ptRow } = await db.from('clientes').select('portal_token').eq('id', cli.id).maybeSingle();
                const url = ptRow?.portal_token ? `https://myvelum.app/atleta?token=${encodeURIComponent(ptRow.portal_token)}` : 'https://myvelum.app';
                await sendEmail(email, 'welcome', { nombre: cli.nombre, gym: gym.nombre, url });
              }
            }
          }
          console.log(`Domiciliacion ok: gym ${gymId} sub ${subId}`);
          break;
        }

        if (md.source === 'manual_link' && session.mode === 'payment') {
          const mgGymId = parseInt(md.gym_id || '0', 10);
          if (!mgGymId) break;
          const { data: dup } = await db.from('pagos').select('id').eq('stripe_session_id', session.id).maybeSingle();
          if (dup) break;
          const amount = (session.amount_total || 0) / 100;
          const { data: mgGym } = await db.from('gyms').select('subscription_plan').eq('id', mgGymId).maybeSingle();
          const mgPlan = (mgGym?.subscription_plan || '').toLowerCase();
          const feePct = (mgPlan === 'max' || mgPlan === 'owner') ? 0 : 0.02;
          const commission = Math.round(amount * feePct);
          const mlStripeFee = await stripeFeeFromPI(session.payment_intent as string, evAcct);
          const mlFeeR = (mlStripeFee != null && Number.isFinite(mlStripeFee)) ? Math.round(mlStripeFee) : null;
          // Si el link se generó con un PAQUETE del gym, el pago extiende membresía
          // (vence con stacking + clases) igual que una compra de storefront.
          // Sin paquete (cobro libre): is_legacy=true satisface el CHECK
          // pago_requires_package y vence=hoy (un cobro suelto no extiende membresía).
          const mlPkgId = parseInt(md.package_id || '0', 10) || null;
          let mlPlan = md.descripcion || 'Pago';
          let mlVence = new Date().toISOString().slice(0,10);
          let mlClases: number | null = null;
          if (mlPkgId) {
            const { data: mlPkg } = await db.from('packages')
              .select('name, num_classes, unlimited_classes, duration_days')
              .eq('id', mlPkgId).eq('gym_id', mgGymId).maybeSingle();
            if (mlPkg) {
              mlPlan = mlPkg.name;
              mlClases = mlPkg.unlimited_classes ? null : (mlPkg.num_classes || null);
              // Stacking: si el cliente aún tiene vigencia, el paquete extiende desde ahí.
              let baseDate = new Date();
              const { data: lastPago } = await db.from('pagos').select('vence')
                .eq('gym_id', mgGymId).eq('cliente', md.cliente || '')
                .neq('notas','__sin_pago__').order('fecha',{ascending:false}).limit(1).maybeSingle();
              if (lastPago?.vence) {
                const cur = new Date(lastPago.vence + 'T12:00:00');
                if (cur.getTime() > baseDate.getTime()) baseDate = cur;
              }
              const venceDate = new Date(baseDate);
              venceDate.setDate(venceDate.getDate() + (mlPkg.duration_days || 30));
              mlVence = venceDate.toISOString().slice(0,10);
            }
          }
          const { error: mlErr } = await db.from('pagos').insert({
            gym_id: mgGymId, cliente: md.cliente || 'Cliente', monto: amount,
            fecha: new Date().toISOString().slice(0,10), plan: mlPlan, metodo: 'Stripe (Link)',
            vence: mlVence, package_id: mlPkgId, is_legacy: !mlPkgId,
            clases_totales: mlClases, clases_usadas: 0,
            applied_price_mxn: Math.round(amount), list_price_mxn: Math.round(amount), source: 'manual_link',
            velum_commission_mxn: commission, stripe_fee_mxn: mlFeeR, net_to_gym_mxn: Math.round(amount - commission - (mlFeeR||0)),
            stripe_session_id: session.id, notas: `Link de pago manual${md.cliente ? ' — ' + md.cliente : ''}`,
          });
          if (mlErr && !isDupErr(mlErr)) console.error('manual_link pago:', mlErr);
          break;
        }

        const gymId = parseInt(md.gym_id || '0', 10);
        const packageId = parseInt(md.package_id || '0', 10);
        if (!gymId || !packageId) { console.error('webhook: sin gym_id/package_id'); break; }
        await db.from('storefront_orders').update({ status: 'paid', stripe_payment_intent_id: session.payment_intent, paid_at: new Date().toISOString(), raw_event: event }).eq('stripe_session_id', session.id);
        const { data: order } = await db.from('storefront_orders').select('*').eq('stripe_session_id', session.id).single();
        if (!order) break;
        const { data: pkg } = await db.from('packages').select('name, num_classes, unlimited_classes, duration_days, price_mxn').eq('id', packageId).single();
        const { data: gym } = await db.from('gyms').select('nombre').eq('id', gymId).single();
        if (!pkg || !gym) break;
        const cli = await resolveCliente(gymId, order.customer_email, order.customer_name || '', order.customer_phone || null);
        const clienteId = cli.id; const clienteNombre = cli.nombre;
        if (clienteId) await db.from('storefront_orders').update({ cliente_id: clienteId }).eq('id', order.id);
        if (clienteId) {
          let baseDate = new Date();
          const { data: lastPago } = await db.from('pagos').select('vence').eq('gym_id', gymId).eq('cliente', clienteNombre).neq('notas','__sin_pago__').order('fecha',{ascending:false}).limit(1).maybeSingle();
          if (lastPago?.vence) { const cur = new Date(lastPago.vence + 'T12:00:00'); if (cur.getTime() > baseDate.getTime()) baseDate = cur; }
          const venceDate = new Date(baseDate); venceDate.setDate(venceDate.getDate() + (pkg.duration_days || 30));
          const monto = Number(pkg.price_mxn);
          const comm = Math.round((order.application_fee_cents || 0) / 100);
          const sfStripeFee = await stripeFeeFromPI(session.payment_intent as string, evAcct);
          const sfFeeR = (sfStripeFee != null && Number.isFinite(sfStripeFee)) ? Math.round(sfStripeFee) : null;
          const clasesTotales = pkg.unlimited_classes ? null : (pkg.num_classes || null);
          const { error: pErr } = await db.from('pagos').insert({ gym_id: gymId, cliente: clienteNombre, monto, fecha: new Date().toISOString().slice(0,10), plan: pkg.name, metodo: 'Stripe (Storefront)', vence: venceDate.toISOString().slice(0,10), telefono: order.customer_phone || null, package_id: packageId, applied_price_mxn: Math.round(monto), list_price_mxn: Math.round(monto), source: 'storefront', velum_commission_mxn: comm, stripe_fee_mxn: sfFeeR, net_to_gym_mxn: Math.round(monto-comm-(sfFeeR||0)), stripe_session_id: session.id, notas: `Compra online — ${order.customer_email}`, clases_totales: clasesTotales, clases_usadas: 0 });
          if (pErr && !isDupErr(pErr)) console.error('pago insert err:', pErr);
          if (order.customer_email) {
            await sendEmail(order.customer_email, 'recibo', { gym: gym.nombre, monto: String(Math.round(monto)), plan: pkg.name, vence: venceDate.toISOString().slice(0,10) });
            if (cli.isNew) {
              const { data: ptRow } = await db.from('clientes').select('portal_token').eq('id', clienteId).maybeSingle();
              const url = ptRow?.portal_token ? `https://myvelum.app/atleta?token=${encodeURIComponent(ptRow.portal_token)}` : 'https://myvelum.app';
              await sendEmail(order.customer_email, 'welcome', { nombre: clienteNombre, gym: gym.nombre, url });
            }
          }
        }
        if (order.application_fee_cents) {
          await db.from('commission_payouts').insert({ gym_id: gymId, order_id: order.id, stripe_session_id: session.id, amount_cents: order.application_fee_cents, currency: order.currency || 'mxn', status: 'collected', collected_at: new Date().toISOString() }).then(({ error }) => { if (error && !isDupErr(error)) console.warn('commission:', error.message); });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object;
        const subId = inv.subscription as string;
        if (!subId) break;
        const { data: ms } = await db.from('member_subscriptions').select('*').eq('stripe_subscription_id', subId).maybeSingle();
        if (ms) {
          const periodEnd = inv.lines?.data?.[0]?.period?.end || inv.period_end;
          await db.from('member_subscriptions').update({ status: 'active', last_invoice_status: 'paid', current_period_end: periodEnd ? new Date(periodEnd*1000).toISOString() : ms.current_period_end, cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq('id', ms.id);
          if (inv.billing_reason === 'subscription_cycle' && ms.cliente_id) {
            const { data: pkg } = await db.from('packages').select('name, num_classes, unlimited_classes, duration_days, price_mxn').eq('id', ms.package_id).maybeSingle();
            if (pkg) {
              const clasesTotales = pkg.unlimited_classes ? null : (pkg.num_classes || null);
              const realMonto = (typeof inv.amount_paid === 'number' ? inv.amount_paid : Math.round(Number(pkg.price_mxn)*100)) / 100;
              const realFee = (typeof inv.application_fee_amount === 'number') ? inv.application_fee_amount/100 : undefined;
              const stripeFeeMxn = await stripeFeeFromCharge(inv.charge as string, evAcct);
              await recordMemberPago({ gymId: ms.gym_id, clienteNombre: ms.cliente_nombre, phone: null, pkgName: pkg.name, packageId: ms.package_id, durationDays: pkg.duration_days||30, clasesTotales, montoMxn: realMonto, feePct: Number(ms.application_fee_pct||0), feeMxn: realFee, stripeFeeMxn, subId, invoiceId: inv.id });
            }
          }
          break;
        }
        const periodEnd = inv.lines?.data?.[0]?.period?.end || inv.period_end;
        await db.from('gyms').update({ subscription_status: 'active', subscription_current_period_end: periodEnd ? new Date(periodEnd*1000).toISOString() : null, subscription_updated_at: new Date().toISOString() }).eq('stripe_subscription_id', subId);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const subId = inv.subscription as string;
        if (!subId) break;
        const { data: ms } = await db.from('member_subscriptions').select('id, gym_id, customer_email, cliente_nombre').eq('stripe_subscription_id', subId).maybeSingle();
        if (ms) {
          await db.from('member_subscriptions').update({ status: 'past_due', last_invoice_status: 'payment_failed', updated_at: new Date().toISOString() }).eq('id', ms.id);
          const payUrl = inv.hosted_invoice_url || '';
          if (ms.customer_email && payUrl) {
            const { data: gymRow } = await db.from('gyms').select('nombre').eq('id', ms.gym_id).maybeSingle();
            await sendEmail(ms.customer_email, 'pago_fallido', { nombre: ms.cliente_nombre || '', gym: gymRow?.nombre || 'tu gimnasio', monto: String(Math.round((inv.amount_due || 0)/100)), url: payUrl });
          }
          break;
        }
        await db.from('gyms').update({ subscription_status: 'past_due', subscription_updated_at: new Date().toISOString() }).eq('stripe_subscription_id', subId);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const statusMap: Record<string,string> = { active:'active', past_due:'past_due', canceled:'canceled', unpaid:'past_due', trialing:'trialing', incomplete:'incomplete', incomplete_expired:'canceled' };
        const { data: ms } = await db.from('member_subscriptions').select('id').eq('stripe_subscription_id', sub.id).maybeSingle();
        if (ms) {
          await db.from('member_subscriptions').update({ status: statusMap[sub.status] || sub.status, cancel_at_period_end: !!sub.cancel_at_period_end, current_period_end: sub.current_period_end ? new Date(sub.current_period_end*1000).toISOString() : null, canceled_at: sub.canceled_at ? new Date(sub.canceled_at*1000).toISOString() : null, updated_at: new Date().toISOString() }).eq('id', ms.id);
          break;
        }
        await db.from('gyms').update({ subscription_status: statusMap[sub.status] || sub.status, subscription_current_period_end: sub.current_period_end ? new Date(sub.current_period_end*1000).toISOString() : null, subscription_updated_at: new Date().toISOString() }).eq('stripe_subscription_id', sub.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { data: ms } = await db.from('member_subscriptions').select('id').eq('stripe_subscription_id', sub.id).maybeSingle();
        if (ms) {
          await db.from('member_subscriptions').update({ status: 'canceled', cancel_at_period_end: false, canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', ms.id);
          break;
        }
        await db.from('gyms').update({ subscription_status: 'canceled', subscription_updated_at: new Date().toISOString() }).eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        await db.from('storefront_orders').update({ status: event.type === 'checkout.session.expired' ? 'expired' : 'failed', raw_event: event }).eq('stripe_session_id', session.id);
        if (session.mode === 'subscription' && session.metadata?.velum_member_sub === 'true') {
          const email = (session.metadata?.customer_email || session.customer_email || '').toLowerCase().trim();
          const gymId = parseInt(session.metadata?.gym_id || '0', 10);
          const packageId = parseInt(session.metadata?.package_id || '0', 10);
          if (email && gymId && packageId) {
            await db.from('member_subscriptions').delete().eq('gym_id', gymId).eq('package_id', packageId).eq('customer_email', email).is('stripe_subscription_id', null).eq('status','incomplete');
          }
        }
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error('webhook error:', e);
    return json({ error: 'Handler failed', detail: String((e as Error).message || e) }, 500);
  }
  return json({ received: true });
});
