// velum-saas-charge — genera un Checkout de suscripción SaaS (gym → VELUM) para un gym que YA existe
// (founding gyms). Precio por-gym (default $649 MXN/mes, de por vida). Cobro NORMAL de plataforma
// (VELUM es el comercio; el fee de Stripe lo paga VELUM). NO es cobro directo/Connect.
// Protegida: solo superadmin (JWT custom HS256) o secret interno. deploy: --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-internal-secret' };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

const DEFAULT_FOUNDING_MXN = 649;

// ── Auth: mismo patrón que velum-saas-setup (superadmin JWT HS256 o secret interno) ──
function b64urlToStr(b64url: string): string { let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/'); while (b64.length % 4) b64 += '='; return atob(b64); }
function b64urlToBytes(b64url: string): Uint8Array { const s = b64urlToStr(b64url); return Uint8Array.from(s, (c) => c.charCodeAt(0)); }
async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.'); if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(b64urlToStr(p));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
function timingSafeEqual(a: string, b: string): boolean { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function isAuthorized(req: Request): Promise<boolean> {
  const internalSecret = Deno.env.get('VELUM_INTERNAL_SECRET');
  const headerSecret = req.headers.get('x-internal-secret') || '';
  if (internalSecret && headerSecret && timingSafeEqual(headerSecret, internalSecret)) return true;
  const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
  if (!jwtSecret) return false;
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const claims = await verifyJWT(token, jwtSecret);
  return !!claims && String(claims.app_rol || '') === 'superadmin';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (!await isAuthorized(req)) return json({ error: 'No autorizado (solo superadmin).' }, 403);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY no configurada.' }, 500);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const gymId = parseInt(String(body.gym_id || '0'), 10);
    const amountMxn = Math.round(Number(body.amount_mxn || DEFAULT_FOUNDING_MXN));
    if (!gymId) return json({ error: 'gym_id requerido.' }, 400);
    if (!(amountMxn >= 100 && amountMxn <= 20000)) return json({ error: 'Monto fuera de rango ($100–$20,000).' }, 400);

    const { data: gym } = await db.from('gyms').select('id, nombre, owner_email, subscription_status, stripe_subscription_id').eq('id', gymId).maybeSingle();
    if (!gym) return json({ error: 'Gym no encontrado.' }, 404);
    // Idempotencia: no generar un segundo cobro si ya tiene una suscripción SaaS viva.
    if (gym.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(String(gym.subscription_status || ''))) {
      return json({ error: `${gym.nombre} ya tiene una suscripción SaaS activa (${gym.subscription_status}). Cancélala antes de generar otra.` }, 409);
    }

    const origin = req.headers.get('origin') || 'https://myvelum.app';
    const amountCents = amountMxn * 100;
    const sessionBody = new URLSearchParams({
      'payment_method_types[]': 'card',
      'mode': 'subscription',
      // Precio inline (ad-hoc): founding es por-gym, no un plan público del catálogo.
      'line_items[0][price_data][currency]': 'mxn',
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': `VELUM — Suscripción Founding (${gym.nombre})`,
      'line_items[0][quantity]': '1',
      'success_url': `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${origin}/?saas_cancelled=1`,
      // El webhook usa velum_saas_existing para ACTUALIZAR un gym existente (no crear uno nuevo).
      'metadata[velum_saas_existing]': 'true',
      'metadata[gym_id]': String(gymId),
      'metadata[plan]': 'max',
      'metadata[founding_amount_mxn]': String(amountMxn),
      'subscription_data[metadata][velum_saas_existing]': 'true',
      'subscription_data[metadata][gym_id]': String(gymId),
      'subscription_data[metadata][plan]': 'max',
      'subscription_data[metadata][founding_amount_mxn]': String(amountMxn),
      'locale': 'es',
    });
    if (gym.owner_email) sessionBody.append('customer_email', String(gym.owner_email).toLowerCase().trim());

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-11-20.acacia' },
      body: sessionBody.toString(),
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(session.error?.message || 'Error de Stripe');

    return json({ ok: true, url: session.url, session_id: session.id, gym: gym.nombre, amount_mxn: amountMxn });
  } catch (e) {
    console.error('velum-saas-charge:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
