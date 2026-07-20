// velum-saas-cancel — cancela una suscripción SaaS (gym → VELUM) en Stripe, desde VELUM HQ.
// Por defecto cancela YA (inmediato); con at_period_end=true la deja correr hasta el fin del ciclo.
// El webhook (customer.subscription.deleted/updated) refleja el estado en gyms. Solo superadmin.
// deploy: supabase functions deploy velum-saas-cancel --no-verify-jwt

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-internal-secret' };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

// ── Auth: mismo patrón que velum-saas-charge / velum-saas-info ──
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (!await isAuthorized(req)) return json({ error: 'No autorizado (solo superadmin).' }, 403);
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY no configurada.' }, 500);

    const body = await req.json().catch(() => ({}));
    const subId = String(body.subscription_id || '').trim();
    const atPeriodEnd = body.at_period_end === true;
    if (!subId.startsWith('sub_')) return json({ error: 'subscription_id inválido.' }, 400);

    let res: Response;
    if (atPeriodEnd) {
      // Deja correr hasta el fin del ciclo (el gym ya pagó el mes).
      res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-11-20.acacia' },
        body: 'cancel_at_period_end=true',
      });
    } else {
      // Cancela YA (para limpiar pruebas: deja de cobrar de inmediato).
      res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Stripe-Version': '2024-11-20.acacia' },
      });
    }
    const sub = await res.json();
    if (!res.ok) throw new Error(sub.error?.message || `Stripe ${res.status}`);
    return json({ ok: true, status: sub.status, cancel_at_period_end: !!sub.cancel_at_period_end });
  } catch (e) {
    console.error('velum-saas-cancel:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
