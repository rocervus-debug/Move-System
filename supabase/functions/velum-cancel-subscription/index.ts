// velum-cancel-subscription — v3 (propuesta, patch mínimo de la auditoría de cobros):
//   1. Se valida `exp` del JWT (token vencido → 401); antes solo se verificaba la firma.
//   2. Se chequea el error del update a gyms (se loguea; la cancelación en Stripe ya
//      ocurrió, así que se sigue devolviendo ok — el webhook sincroniza el estado).
//   3. Migrado a Deno.serve nativo (sin deno.land/std). Resto intacto.
// El admin de un gym cancela SU suscripción (al final del periodo).
// Auth: JWT propio (HS256) con app_rol y gym_id. Solo admin/superadmin. Cancela solo su gym.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey' };
function json(b: unknown, s = 200){ return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

function decodeJWT(t: string): Record<string, unknown> | null {
  try { const [, p] = t.split('.'); const pad = '='.repeat((4 - p.length % 4) % 4); return JSON.parse(atob((p + pad).replace(/-/g,'+').replace(/_/g,'/'))); } catch { return null; }
}
async function verifyJWT(t: string, secret: string): Promise<boolean> {
  try { const [h, p, s] = t.split('.'); const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']); const pad = '='.repeat((4 - s.length % 4) % 4); const sig = Uint8Array.from(atob((s + pad).replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)); return await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(`${h}.${p}`)); } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!jwtSecret || !stripeKey) return json({ error: 'Config server incompleta.' }, 500);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !await verifyJWT(token, jwtSecret)) return json({ error: 'No autorizado.' }, 401);
  const claims = decodeJWT(token);
  if (!claims) return json({ error: 'Token inválido.' }, 401);
  // Validar expiración: un token vencido no autoriza nada.
  const exp = Number(claims.exp);
  if (Number.isFinite(exp) && exp < Math.floor(Date.now() / 1000)) return json({ error: 'Sesión expirada.' }, 401);
  const rol = String(claims.app_rol || '');
  const gymId = claims.gym_id;
  if (!['admin', 'superadmin'].includes(rol)) return json({ error: 'Solo el dueño/admin puede cancelar.' }, 403);
  if (!gymId) return json({ error: 'Sesión sin gym.' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: gym } = await db.from('gyms').select('stripe_subscription_id, subscription_status').eq('id', gymId).maybeSingle();
  if (!gym?.stripe_subscription_id) return json({ error: 'No hay una suscripción activa para cancelar.' }, 400);
  if (gym.subscription_status === 'owner') return json({ error: 'Esta cuenta es de cortesía, no tiene suscripción de cobro.' }, 400);

  // Cancela al final del periodo: el gym conserva acceso hasta que termine lo ya pagado / el trial.
  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${gym.stripe_subscription_id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'cancel_at_period_end=true',
  });
  const sub = await r.json();
  if (!r.ok) return json({ error: sub.error?.message || 'Error al cancelar en Stripe.' }, 502);

  const end = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
  // Stripe ya canceló: si el update local falla, se loguea pero se responde ok
  // (customer.subscription.updated del webhook re-sincroniza el estado).
  const { error: updErr } = await db.from('gyms').update({ subscription_updated_at: new Date().toISOString() }).eq('id', gymId);
  if (updErr) console.error(`velum-cancel-subscription: update gyms falló (gym ${gymId}):`, updErr);
  return json({ ok: true, cancel_at_period_end: true, period_end: end, status: sub.status });
});
