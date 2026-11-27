// deploy: supabase functions deploy velum-member-subscription --no-verify-jwt
import { verifyPanelSession } from '../_shared/panel-session.ts';
import { cancelPendingCheckout, PendingCheckoutError } from '../_shared/cancel-pending-checkout.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey' };
const APP_URL = 'https://myvelum.app';
function json(b: unknown, s = 200){ return new Response(JSON.stringify(b),{status:s,headers:{...CORS,'Content-Type':'application/json'}}); }

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) v.forEach((item, i) => { if (typeof item === 'object') Object.assign(out, flatten(item as Record<string, unknown>, `${key}[${i}]`)); else out[`${key}[${i}]`] = String(item); });
    else if (typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}
async function stripeFetch(path: string, method: string, body: Record<string, unknown> | undefined, secretKey: string, stripeAccount?: string) {
  const params = body ? new URLSearchParams(flatten(body)).toString() : undefined;
  const headers: Record<string,string> = { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-11-20.acacia' };
  // Cobro DIRECTO: crear/operar en la cuenta del gym → el gym es el comercio y Stripe le
  // descuenta su comisión (recibe el neto). Sin header = opera en la plataforma (cobros viejos).
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount;
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method, headers, body: params });
  const j = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(j).slice(0,300)}`);
  return j;
}
async function adminClaims(req:Request){
  const auth=req.headers.get('Authorization') || '';
  if(!auth.startsWith('Bearer ')) return null;
  const claims=await verifyPanelSession(auth.slice(7));
  return claims && ['admin','superadmin'].includes(String(claims.app_rol)) ? claims : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY') || '';
    if (!stripeSecret) return json({ error: 'Stripe no configurado.' }, 500);
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const action = (body.action || 'cancel') as string;

    if (action === 'cancel_pending') {
      const claims = await adminClaims(req);
      if (!claims || !claims.gym_id) return json({error:'Necesitas acceso de administración del gimnasio.'},403);
      try {
        const result = await cancelPendingCheckout(db, Number(claims.gym_id), body,
          (path, method, acct) => stripeFetch(path, method, undefined, stripeSecret, acct));
        return json({ok:true, ...result});
      } catch (err) {
        if (err instanceof PendingCheckoutError) return json({error:err.message},err.status);
        console.error('cancel_pending: conciliación incompleta');
        return json({error:'No pudimos verificar la cancelación. Revisa el estado y vuelve a intentar.'},502);
      }
    }

    if (action === 'create_link') {
      const claims = await adminClaims(req);
      if (!claims) return json({ error: 'No autorizado.' }, 403);
      const gymId = claims.gym_id as number;
      const packageId = parseInt(body.package_id || '0', 10);
      const customer = body.customer || {};
      const email = (customer.email || '').toLowerCase().trim();
      if (!gymId || !packageId || !email) return json({ error: 'gym, package_id y email son requeridos.' }, 400);

      const { data: pkg } = await db.from('packages').select('id, name, price_mxn, duration_days, num_classes, gym_id, is_active, billing_type').eq('id', packageId).maybeSingle();
      if (!pkg || pkg.gym_id !== gymId || !pkg.is_active) return json({ error: 'Paquete no disponible.' }, 400);
      if (pkg.billing_type !== 'recurring') return json({ error: 'Ese paquete no es de mensualidad domiciliada.' }, 400);

      const { data: gym } = await db.from('gyms').select('id, nombre, stripe_account_id, stripe_charges_enabled').eq('id', gymId).maybeSingle();
      if (!gym?.stripe_account_id) return json({ error: 'El gym aún no ha conectado Stripe.' }, 400);
      if (!gym.stripe_charges_enabled) return json({ error: 'El gym aún no puede aceptar cobros con Stripe.' }, 400);

      const amountCents = Math.round(Number(pkg.price_mxn) * 100);
      if (amountCents < 1000) return json({ error: 'Monto mínimo $10 MXN.' }, 400);

      // Reutilizar la sesión abierta conserva un solo enlace al reenviar la misma solicitud.
      const {data: pending, error: lookupError} = await db.from('member_subscriptions')
        .select('stripe_checkout_session_id,amount_cents').eq('gym_id',gymId).eq('package_id',pkg.id)
        .eq('customer_email',email).eq('status','incomplete').eq('stripe_account_id',gym.stripe_account_id)
        .is('stripe_subscription_id',null).not('stripe_checkout_session_id','is',null)
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      if (lookupError) return json({error:'No pudimos consultar los enlaces existentes.'},503);
      if (pending && pending.amount_cents === amountCents) {
        const existing = await stripeFetch('/checkout/sessions/'+encodeURIComponent(pending.stripe_checkout_session_id),'GET',undefined,stripeSecret,gym.stripe_account_id);
        if (existing.status==='open' && existing.url) return json({ok:true,checkout_url:existing.url,session_id:existing.id});
        if (existing.status==='complete') return json({error:'El cliente ya completó el pago. Actualiza los movimientos.'},409);
      }
      const meta = { core_checkout: 'tracked', gym_id: String(gymId), package_id: String(pkg.id), customer_email: email, customer_name: customer.name || '', customer_phone: customer.phone || '', velum_member_sub: 'true', velum_fee_pct: '0' };
      // Stripe procesa la domiciliación directamente en la cuenta del gimnasio.
      const subData: Record<string, unknown> = { metadata: meta };

      const session = await stripeFetch('/checkout/sessions', 'POST', {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ quantity: 1, price_data: { currency: 'mxn', unit_amount: amountCents, recurring: { interval: 'month' }, product_data: { name: `${gym.nombre} — ${pkg.name}`, description: 'Mensualidad domiciliada' } } }],
        subscription_data: subData,
        customer_email: email,
        success_url: `${APP_URL}/storefront-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}`,
        metadata: meta,
        locale: 'es',
      }, stripeSecret, gym.stripe_account_id) as { id: string; url: string };

      // Poblar cliente_id si el atleta ya existe en este gym (lookup por email).
      const { data: cliRow } = await db.from('clientes').select('id').eq('gym_id', gymId).eq('email', email).maybeSingle();
      const clienteId = cliRow?.id ?? null;

      const {error: saveError} = await db.from('member_subscriptions').insert({
        gym_id:gymId, package_id:pkg.id, cliente_id:clienteId, cliente_nombre:customer.name || null,
        customer_email:email, status:'incomplete', amount_cents:amountCents, application_fee_pct:0,
        interval:'month', stripe_account_id:gym.stripe_account_id, stripe_checkout_session_id:session.id,
      });
      if (saveError) {
        await stripeFetch('/checkout/sessions/'+session.id+'/expire','POST',undefined,stripeSecret,gym.stripe_account_id);
        return json({error:'No se pudo guardar el enlace. Intenta de nuevo.'},500);
      }

      return json({ ok: true, checkout_url: session.url, session_id: session.id });
    }

    const subscriptionId = body.subscription_id as string;
    const portalToken = body.portal_token as string | undefined;
    if (!subscriptionId) return json({ error: 'subscription_id requerido.' }, 400);

    const { data: ms } = await db.from('member_subscriptions').select('*').eq('stripe_subscription_id', subscriptionId).maybeSingle();
    if (!ms) return json({ error: 'Suscripción no encontrada.' }, 404);

    let authorized = false;
    if (portalToken) {
      const { data: cli } = await db.from('clientes').select('id').eq('portal_token', portalToken).maybeSingle();
      if (cli && cli.id === ms.cliente_id) authorized = true;
    }
    if (!authorized) {
      const claims = await adminClaims(req);
      if (claims && ((claims.gym_id as number) === ms.gym_id || claims.app_rol === 'superadmin')) authorized = true;
    }
    if (!authorized) return json({ error: 'No autorizado.' }, 403);

    // Sub nuevo (cobro directo) vive en la cuenta del gym; sub viejo (cobro de destino) vive en
    // la plataforma. Intentamos en la cuenta del gym y, si no existe ahí, caemos a plataforma.
    async function subUpdate(bodyU: Record<string, unknown>) {
      try { return await stripeFetch(`/subscriptions/${subscriptionId}`, 'POST', bodyU, stripeSecret, ms.stripe_account_id || undefined); }
      catch { return await stripeFetch(`/subscriptions/${subscriptionId}`, 'POST', bodyU, stripeSecret); }
    }
    if (action === 'cancel') {
      const sub = await subUpdate({ cancel_at_period_end: true });
      await db.from('member_subscriptions').update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('id', ms.id);
      return json({ ok: true, cancel_at_period_end: true, current_period_end: sub?.current_period_end ? new Date(sub.current_period_end*1000).toISOString() : ms.current_period_end });
    }
    if (action === 'reactivate') {
      await subUpdate({ cancel_at_period_end: false });
      await db.from('member_subscriptions').update({ cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq('id', ms.id);
      return json({ ok: true, cancel_at_period_end: false });
    }
    return json({ error: 'Acción no válida.' }, 400);
  } catch (e) {
    console.error('velum-member-subscription:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
