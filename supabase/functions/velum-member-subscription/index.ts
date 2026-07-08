// velum-member-subscription — v5 (propuesta, corrige P1×2 de la auditoría de cobros):
//   P1-1  Idempotencia del placeholder: antes de insertar la fila 'incomplete' se busca
//         una existente (mismo gym+package+email, sin stripe_subscription_id) y se
//         reutiliza en vez de insertar otra. El error del insert/update YA se chequea:
//         si falla, se devuelve 500 (nada de fallo silencioso).
//   P1-2  Se puebla cliente_id en el placeholder cuando el cliente ya existe en
//         `clientes` (lookup por gym_id + email).
//   Además: verifyJWT ahora valida `exp` (token vencido → 403) y se migró a Deno.serve
//   nativo (sin deno.land/std). Lógica de cancel/reactivate intacta.
// deploy: supabase functions deploy velum-member-subscription --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey' };
const APP_URL = 'https://myvelum.app';
const ZERO_FEE_PLANS = new Set(['max', 'owner']);
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
async function stripeFetch(path: string, method: string, body: Record<string, unknown> | undefined, secretKey: string) {
  const params = body ? new URLSearchParams(flatten(body)).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method, headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-11-20.acacia' }, body: params });
  const j = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(j).slice(0,300)}`);
  return j;
}
function decodeJWT(token: string): Record<string, unknown> | null {
  try { const [, p] = token.split('.'); const pad = '='.repeat((4 - p.length % 4) % 4); return JSON.parse(atob((p + pad).replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}
async function verifyJWT(token: string, secret: string): Promise<boolean> {
  try {
    const [h, p, s] = token.split('.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const pad = '='.repeat((4 - s.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${h}.${p}`));
  } catch { return false; }
}
async function adminClaims(req: Request, jwtSecret: string): Promise<Record<string, unknown> | null> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !jwtSecret || !await verifyJWT(token, jwtSecret)) return null;
  const claims = decodeJWT(token);
  if (!claims) return null;
  // Validar expiración: un token vencido no autoriza nada.
  const exp = Number(claims.exp);
  if (Number.isFinite(exp) && exp < Math.floor(Date.now() / 1000)) return null;
  const rol = claims.app_rol as string;
  if (!['admin','superadmin'].includes(rol)) return null;
  return claims;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const jwtSecret    = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
    if (!stripeSecret) return json({ error: 'Stripe no configurado.' }, 500);
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const action = (body.action || 'cancel') as string;

    if (action === 'create_link') {
      const claims = await adminClaims(req, jwtSecret || '');
      if (!claims) return json({ error: 'No autorizado.' }, 403);
      const gymId = claims.gym_id as number;
      const packageId = parseInt(body.package_id || '0', 10);
      const customer = body.customer || {};
      const email = (customer.email || '').toLowerCase().trim();
      if (!gymId || !packageId || !email) return json({ error: 'gym, package_id y email son requeridos.' }, 400);

      const { data: pkg } = await db.from('packages').select('id, name, price_mxn, duration_days, num_classes, gym_id, is_active, billing_type').eq('id', packageId).maybeSingle();
      if (!pkg || pkg.gym_id !== gymId || !pkg.is_active) return json({ error: 'Paquete no disponible.' }, 400);
      if (pkg.billing_type !== 'recurring') return json({ error: 'Ese paquete no es de mensualidad domiciliada.' }, 400);

      const { data: gym } = await db.from('gyms').select('id, nombre, stripe_account_id, stripe_charges_enabled, subscription_plan').eq('id', gymId).maybeSingle();
      if (!gym?.stripe_account_id) return json({ error: 'El gym aún no ha conectado Stripe.' }, 400);
      if (!gym.stripe_charges_enabled) return json({ error: 'El gym aún no puede aceptar cobros con Stripe.' }, 400);

      const amountCents = Math.round(Number(pkg.price_mxn) * 100);
      if (amountCents < 1000) return json({ error: 'Monto mínimo $10 MXN.' }, 400);
      const plan = (gym.subscription_plan || '').toLowerCase();
      const feePct = ZERO_FEE_PLANS.has(plan) ? 0 : 0.02;

      const meta = { gym_id: String(gymId), package_id: String(pkg.id), customer_email: email, customer_name: customer.name || '', customer_phone: customer.phone || '', velum_member_sub: 'true', velum_fee_pct: String(feePct) };
      const subData: Record<string, unknown> = { transfer_data: { destination: gym.stripe_account_id }, on_behalf_of: gym.stripe_account_id, metadata: meta };
      if (feePct > 0) subData.application_fee_percent = Number((feePct * 100).toFixed(4));

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
      }, stripeSecret) as { id: string; url: string };

      // Poblar cliente_id si el atleta ya existe en este gym (lookup por email).
      const { data: cliRow } = await db.from('clientes').select('id').eq('gym_id', gymId).eq('email', email).maybeSingle();
      const clienteId = cliRow?.id ?? null;

      // Idempotencia: si ya hay un placeholder 'incomplete' sin suscripción para este
      // gym+paquete+email, se reutiliza (se refresca) en vez de insertar otro.
      const placeholderRow = {
        cliente_id: clienteId,
        cliente_nombre: customer.name || null,
        customer_email: email,
        status: 'incomplete',
        amount_cents: amountCents,
        application_fee_pct: feePct,
        interval: 'month',
        stripe_account_id: gym.stripe_account_id,
        updated_at: new Date().toISOString(),
      };
      const { data: existing } = await db.from('member_subscriptions').select('id')
        .eq('gym_id', gymId).eq('package_id', pkg.id).eq('customer_email', email)
        .eq('status', 'incomplete').is('stripe_subscription_id', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      let phErr = null as { message?: string } | null;
      if (existing) {
        const { error } = await db.from('member_subscriptions').update(placeholderRow).eq('id', existing.id);
        phErr = error;
      } else {
        const { error } = await db.from('member_subscriptions').insert({ gym_id: gymId, package_id: pkg.id, ...placeholderRow });
        phErr = error;
      }
      if (phErr) {
        // Sin placeholder no dejamos correr el flujo a ciegas: error explícito.
        console.error('member_subscriptions placeholder err:', phErr);
        return json({ error: 'No se pudo registrar la suscripción pendiente. Intenta de nuevo.' }, 500);
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
      const claims = await adminClaims(req, jwtSecret || '');
      if (claims && ((claims.gym_id as number) === ms.gym_id || claims.app_rol === 'superadmin')) authorized = true;
    }
    if (!authorized) return json({ error: 'No autorizado.' }, 403);

    if (action === 'cancel') {
      const sub = await stripeFetch(`/subscriptions/${subscriptionId}`, 'POST', { cancel_at_period_end: true }, stripeSecret);
      await db.from('member_subscriptions').update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('id', ms.id);
      return json({ ok: true, cancel_at_period_end: true, current_period_end: sub?.current_period_end ? new Date(sub.current_period_end*1000).toISOString() : ms.current_period_end });
    }
    if (action === 'reactivate') {
      await stripeFetch(`/subscriptions/${subscriptionId}`, 'POST', { cancel_at_period_end: false }, stripeSecret);
      await db.from('member_subscriptions').update({ cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq('id', ms.id);
      return json({ ok: true, cancel_at_period_end: false });
    }
    return json({ error: 'Acción no válida.' }, 400);
  } catch (e) {
    console.error('velum-member-subscription:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
