// stripe-checkout-create — v14: on_behalf_of = cuenta del gym (merchant of record = gym, white-label)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey' };
const APP_URL = 'https://myvelum.app';
const VELUM_FEE_PCT = 0.02;
const ZERO_FEE_PLANS = new Set(['max', 'owner']);
const MEMBER_LIMITS: Record<string, number> = { pro: 60, basic: 60, free: 50 };

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
function getClientIP(req: Request): string { const h = req.headers; return ((h.get('cf-connecting-ip') || h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0]) || 'unknown').trim(); }
async function checkRateLimit(db: any, key: string, max: number, win: number): Promise<boolean> { const { data } = await db.rpc('check_rate_limit', { p_key: key, p_max_per_window: max, p_window_seconds: win, p_block_seconds: 0 }); return data !== false; }
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
function sanitizeDescriptor(name: string): string {
  let s = (name||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9 ]/g,'').trim().slice(0,20);
  if (s.length < 5) s = (s + ' VELUM').slice(0,20).trim();
  return s;
}
function safeReturnTo(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try { const u = new URL(url); if (u.origin === APP_URL) return url; } catch(_) {}
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) return json({ error: 'Stripe no configurado.' }, 500);
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const ip = getClientIP(req);
    const ok = await checkRateLimit(db, `checkout_ip:${ip}`, 20, 60);
    if (!ok) return json({ error: 'Demasiados intentos.' }, 429);

    const body = await req.json();
    const { slug, package_id, customer, session_id: visitorSession, return_to } = body;
    if (!slug || !package_id || !customer?.email) return json({ error: 'slug, package_id y customer.email son requeridos.' }, 400);

    const { data: sf, error: sfErr } = await db.from('gym_storefront').select('gym_id, slug, is_enabled').eq('slug', slug.toLowerCase()).maybeSingle();
    if (sfErr) { console.error('sf:', sfErr); return json({ error: 'Error consultando storefront.' }, 500); }
    if (!sf || !sf.is_enabled) return json({ error: 'Storefront no disponible.' }, 404);

    const { data: gym, error: gymErr } = await db.from('gyms').select('id, nombre, stripe_account_id, stripe_charges_enabled, subscription_plan').eq('id', sf.gym_id).maybeSingle();
    if (gymErr) return json({ error: 'Error gym.' }, 500);
    if (!gym?.stripe_account_id) return json({ error: 'El gym aún no ha conectado Stripe.' }, 400);
    if (!gym.stripe_charges_enabled) return json({ error: 'El gym aún no puede aceptar cobros.' }, 400);

    const { data: pkg } = await db.from('packages').select('id, name, price_mxn, num_classes, duration_days, gym_id, is_active, billing_type').eq('id', package_id).maybeSingle();
    if (!pkg || pkg.gym_id !== sf.gym_id || !pkg.is_active) return json({ error: 'Paquete no disponible.' }, 400);
    const { data: listing } = await db.from('storefront_listings').select('id, is_public').eq('package_id', package_id).eq('gym_id', sf.gym_id).maybeSingle();
    if (!listing?.is_public) return json({ error: 'Paquete no está publicado.' }, 400);

    const isRecurring = pkg.billing_type === 'recurring';

    const planLc = (gym.subscription_plan || '').toLowerCase();
    if (planLc in MEMBER_LIMITS) {
      const { data: existingCli } = await db.from('clientes').select('id').eq('gym_id', gym.id).eq('email', (customer.email || '').toLowerCase()).maybeSingle();
      if (!existingCli) {
        const { count } = await db.from('clientes').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id);
        if ((count || 0) >= MEMBER_LIMITS[planLc]) {
          return json({ error: 'Este gym alcanzó su capacidad de miembros por ahora. Contáctalos directamente para inscribirte.' }, 403);
        }
      }
    }

    const amountCents = Math.round(Number(pkg.price_mxn) * 100);
    if (amountCents < 1000) return json({ error: 'Monto mínimo $10 MXN.' }, 400);

    const plan = (gym.subscription_plan || '').toLowerCase();
    const feePct = ZERO_FEE_PLANS.has(plan) ? 0 : VELUM_FEE_PCT;
    const feeCents = feePct > 0 ? Math.max(1, Math.round(amountCents * feePct)) : 0;

    const descriptor = sanitizeDescriptor(gym.nombre);
    const returnTo = safeReturnTo(return_to);
    const successUrl = returnTo
      ? (returnTo + (returnTo.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}')
      : `${APP_URL}/storefront-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = returnTo || `${APP_URL}/g/${slug}?canceled=1`;

    const productName = `${gym.nombre} — ${pkg.name}`;
    const productDesc = pkg.num_classes ? `${pkg.num_classes} clases · ${pkg.duration_days} días` : `${pkg.duration_days} días de acceso`;

    const sharedMeta = { gym_id: String(gym.id), package_id: String(pkg.id), slug, customer_email: customer.email, customer_name: customer.name || '', customer_phone: customer.phone || '', visitor_session: visitorSession || '' };

    if (isRecurring) {
      const subData: Record<string, unknown> = {
        transfer_data: { destination: gym.stripe_account_id },
        on_behalf_of: gym.stripe_account_id,
        metadata: { ...sharedMeta, velum_member_sub: 'true', velum_fee_pct: String(feePct) },
      };
      if (feePct > 0) subData.application_fee_percent = Number((feePct * 100).toFixed(4));

      const session = await stripeFetch('/checkout/sessions', 'POST', {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ quantity: 1, price_data: { currency: 'mxn', unit_amount: amountCents, recurring: { interval: 'month' }, product_data: { name: productName, description: `Mensualidad domiciliada · ${productDesc}` } } }],
        subscription_data: subData,
        customer_email: customer.email,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { ...sharedMeta, velum_member_sub: 'true' },
        locale: 'es',
      }, stripeSecret) as { id: string; url: string };

      await db.from('member_subscriptions').insert({
        gym_id: gym.id, package_id: pkg.id, cliente_nombre: customer.name || null, customer_email: customer.email,
        status: 'incomplete', amount_cents: amountCents, application_fee_pct: feePct, interval: 'month',
        stripe_account_id: gym.stripe_account_id,
      });

      return json({ ok: true, session_id: session.id, checkout_url: session.url, recurring: true });
    }

    const paymentIntentData: Record<string, unknown> = {
      transfer_data: { destination: gym.stripe_account_id },
      on_behalf_of: gym.stripe_account_id,
      statement_descriptor: descriptor,
      metadata: { gym_id: String(gym.id), package_id: String(pkg.id), customer_email: customer.email, customer_name: customer.name || '', velum_platform: 'true', velum_fee_pct: String(feePct) },
    };
    if (feeCents > 0) paymentIntentData.application_fee_amount = feeCents;

    const session = await stripeFetch('/checkout/sessions', 'POST', {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ quantity: 1, price_data: { currency: 'mxn', unit_amount: amountCents, product_data: { name: productName, description: productDesc } } }],
      payment_intent_data: paymentIntentData,
      customer_email: customer.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: sharedMeta,
      locale: 'es',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    }, stripeSecret) as { id: string; url: string };

    await db.from('storefront_orders').insert({
      gym_id: gym.id, package_id: pkg.id, stripe_session_id: session.id, stripe_account_id: gym.stripe_account_id,
      customer_email: customer.email, customer_name: customer.name || null, customer_phone: customer.phone || null,
      amount_cents: amountCents, application_fee_cents: feeCents, currency: 'mxn',
      status: 'pending', metadata: { visitor_session: visitorSession || null, source: returnTo ? 'atleta_renewal' : 'storefront', fee_pct: feePct },
    });

    return json({ ok: true, session_id: session.id, checkout_url: session.url });
  } catch (e) {
    console.error('stripe-checkout-create:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
