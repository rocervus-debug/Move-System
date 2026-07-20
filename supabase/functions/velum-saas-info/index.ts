// velum-saas-info — lee de Stripe la suscripción SaaS (gym → VELUM) y su historial de facturas,
// para mostrarlo en VELUM HQ. Solo lectura. Protegida: solo superadmin (JWT HS256) o secret interno.
// deploy: supabase functions deploy velum-saas-info --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-internal-secret' };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

// ── Auth: mismo patrón que velum-saas-setup / velum-saas-charge ──
function b64urlToStr(b: string): string { let x = b.replace(/-/g, '+').replace(/_/g, '/'); while (x.length % 4) x += '='; return atob(x); }
function b64urlToBytes(b: string): Uint8Array { const s = b64urlToStr(b); return Uint8Array.from(s, (c) => c.charCodeAt(0)); }
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

async function stripeGet(path: string, key: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, { headers: { 'Authorization': `Bearer ${key}`, 'Stripe-Version': '2024-11-20.acacia' } });
  return res.json();
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
    if (!gymId) return json({ error: 'gym_id requerido.' }, 400);

    const { data: gym } = await db.from('gyms').select('id, nombre, stripe_subscription_id, stripe_customer_id, subscription_status').eq('id', gymId).maybeSingle();
    if (!gym) return json({ error: 'Gym no encontrado.' }, 404);
    if (!gym.stripe_subscription_id) return json({ ok: true, has_sub: false });

    // Suscripción (monto, estado, próximo corte)
    const sub = await stripeGet(`/subscriptions/${gym.stripe_subscription_id}?expand[]=items.data.price`, stripeKey);
    if (sub?.error) return json({ ok: true, has_sub: false, note: 'Suscripción no encontrada en Stripe.' });
    const item = sub?.items?.data?.[0];
    const unit = item?.price?.unit_amount;
    const subscription = {
      status: sub?.status || null,
      amount_mxn: (typeof unit === 'number') ? Math.round(unit / 100) : null,
      currency: item?.price?.currency || 'mxn',
      interval: item?.price?.recurring?.interval || 'month',
      current_period_end: sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: !!sub?.cancel_at_period_end,
      canceled_at: sub?.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    };

    // Historial de facturas (últimas 12)
    const inv = await stripeGet(`/invoices?subscription=${gym.stripe_subscription_id}&limit=12`, stripeKey);
    const invoices = (inv?.data || []).map((i: any) => ({
      date: i.created ? new Date(i.created * 1000).toISOString().slice(0, 10) : null,
      amount_mxn: Math.round((i.amount_paid ?? i.amount_due ?? 0) / 100),
      status: i.status || null,               // paid / open / void / uncollectible / draft
      number: i.number || null,
      url: i.hosted_invoice_url || null,
    }));

    return json({ ok: true, has_sub: true, subscription, invoices });
  } catch (e) {
    console.error('velum-saas-info:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
