// velum-saas-setup — v3 (propuesta, corrige P1 de la auditoría de cobros):
//   P1  Candado REAL (antes el comentario decía "protegido" pero no validaba nada):
//       ahora exige header `x-internal-secret` == env VELUM_INTERNAL_SECRET, O un JWT
//       custom válido (firma HMAC-SHA256 + exp) con app_rol='superadmin'. Fail-closed:
//       si el env no existe, el camino del header nunca autoriza; sin JWT superadmin
//       válido la respuesta es 403 siempre.
//       NOTA PARA ROY: hay que crear el secret VELUM_INTERNAL_SECRET en Supabase
//       (Edge Functions → Secrets) para poder usar el camino del header.
//   Además: Math.round(plan.price_mxn * 100) al crear el precio (evita centavos
//   flotantes) y migrado a Deno.serve nativo (sin deno.land/std).
// deploy: supabase functions deploy velum-saas-setup --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-internal-secret' };
function json(b: unknown, s=200){ return new Response(JSON.stringify(b),{status:s,headers:{...CORS,'Content-Type':'application/json'}}); }
function flatten(obj: Record<string, unknown>, prefix=''): Record<string,string>{
  const out: Record<string,string> = {};
  for (const [k,v] of Object.entries(obj)){
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v===null||v===undefined) continue;
    if (typeof v==='object' && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string,unknown>, key));
    else out[key] = String(v);
  }
  return out;
}
async function stripeFetch(path: string, method: string, body: Record<string,unknown>|undefined, key: string){
  const params = body ? new URLSearchParams(flatten(body)).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method, headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/x-www-form-urlencoded', 'Stripe-Version':'2024-11-20.acacia' }, body: params });
  const j = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(j).slice(0,300)}`);
  return j;
}

// ── JWT custom (HS256): firma + exp + rol — mismo patrón que velum-stripe-balance ──
function b64urlToStr(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}
function b64urlToBytes(b64url: string): Uint8Array {
  const s = b64urlToStr(b64url);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
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

// Constant-time compare para el secret interno (evita timing leaks).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isAuthorized(req: Request): Promise<boolean> {
  // Camino 1: secret interno (solo si el env EXISTE; si no, fail-closed).
  const internalSecret = Deno.env.get('VELUM_INTERNAL_SECRET');
  const headerSecret = req.headers.get('x-internal-secret') || '';
  if (internalSecret && headerSecret && timingSafeEqual(headerSecret, internalSecret)) return true;

  // Camino 2: JWT custom superadmin (firma + exp + rol).
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
    // Candado: sin secret interno válido NI JWT superadmin → 403 siempre.
    if (!await isAuthorized(req)) return json({ error: 'No autorizado.' }, 403);

    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) return json({ error: 'STRIPE_SECRET_KEY no configurada.' }, 500);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession:false, autoRefreshToken:false } });

    // Solo crea los que falten (idempotente)
    const { data: plans } = await db.from('velum_saas_plans').select('*').eq('is_active', true);
    const results: any[] = [];
    for (const plan of (plans||[])){
      if (plan.stripe_price_id){ results.push({ id: plan.id, status: 'ya existía', price_id: plan.stripe_price_id }); continue; }
      // Crear producto
      const product = await stripeFetch('/products', 'POST', {
        name: plan.nombre,
        description: `Suscripción mensual VELUM — Plan ${plan.nombre}`,
        metadata: { velum_plan: plan.id },
      }, stripeSecret) as { id: string };
      // Crear precio recurrente mensual (centavos enteros, siempre)
      const price = await stripeFetch('/prices', 'POST', {
        product: product.id,
        unit_amount: Math.round(Number(plan.price_mxn) * 100),
        currency: 'mxn',
        recurring: { interval: 'month' },
        metadata: { velum_plan: plan.id },
      }, stripeSecret) as { id: string };
      await db.from('velum_saas_plans').update({ stripe_product_id: product.id, stripe_price_id: price.id }).eq('id', plan.id);
      results.push({ id: plan.id, status: 'creado', product_id: product.id, price_id: price.id });
    }
    return json({ ok: true, results });
  } catch (e) {
    console.error('velum-saas-setup:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
