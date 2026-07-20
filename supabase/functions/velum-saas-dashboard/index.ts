// velum-saas-dashboard — panel GLOBAL de cobranza SaaS (gym → VELUM) para VELUM HQ.
// Agrega desde Stripe (plataforma): suscripciones (MRR, activos, morosos) + historial de cobros.
// Las domiciliaciones de atletas viven en cuentas CONECTADAS → no aparecen aquí (esto es solo
// lo que los gyms le pagan a VELUM). Solo lectura, solo superadmin.
// deploy: supabase functions deploy velum-saas-dashboard --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-internal-secret' };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

// ── Auth: mismo patrón que velum-saas-info / velum-saas-charge ──
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

const ACTIVE = new Set(['active', 'trialing']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (!await isAuthorized(req)) return json({ error: 'No autorizado (solo superadmin).' }, 403);
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY no configurada.' }, 500);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

    // Mapas para nombrar cada cobro: por sub_id, por customer_id, y por id (todos los gyms)
    const { data: gyms } = await db.from('gyms').select('id, nombre, stripe_subscription_id, stripe_customer_id');
    const bySub = new Map<string, { id: number; nombre: string }>();
    const byCust = new Map<string, { id: number; nombre: string }>();
    const byId = new Map<number, { id: number; nombre: string }>();
    for (const g of (gyms || [])) {
      const rec = { id: g.id, nombre: g.nombre };
      byId.set(g.id, rec);
      if (g.stripe_subscription_id) bySub.set(g.stripe_subscription_id, rec);
      if (g.stripe_customer_id) byCust.set(g.stripe_customer_id, rec);
    }
    // subId → nombre resuelto (se llena al procesar las subs; sirve para nombrar las facturas)
    const subName = new Map<string, string>();
    const nameFor = (subId?: string, custId?: string, meta?: any): { id: number | null; nombre: string } => {
      if (subId && bySub.has(subId)) return bySub.get(subId)!;
      if (subId && subName.has(subId)) return { id: null, nombre: subName.get(subId)! };
      if (custId && byCust.has(custId)) return byCust.get(custId)!;
      const gid = parseInt(String(meta?.gym_id || '0'), 10);
      if (gid && byId.has(gid)) return byId.get(gid)!;
      if (gid) return { id: gid, nombre: meta?.gym_nombre || `Gym ${gid}` };
      return { id: null, nombre: meta?.gym_nombre || 'Sin gym (prueba)' };
    };

    // Suscripciones de plataforma (= lo que los gyms pagan a VELUM)
    const subsRes = await stripeGet('/subscriptions?status=all&limit=100&expand[]=data.items.data.price', stripeKey);
    const subs = (subsRes?.data || []).map((s: any) => {
      const item = s.items?.data?.[0];
      const g = nameFor(s.id, typeof s.customer === 'string' ? s.customer : s.customer?.id, s.metadata);
      subName.set(s.id, g.nombre); // para nombrar las facturas de esta sub
      return {
        gym_id: g.id, gym_nombre: g.nombre,
        status: s.status,
        amount_mxn: (typeof item?.price?.unit_amount === 'number') ? Math.round(item.price.unit_amount / 100) : null,
        current_period_end: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString().slice(0, 10) : null,
        cancel_at_period_end: !!s.cancel_at_period_end,
      };
    });

    const activos = subs.filter((s: any) => ACTIVE.has(s.status));
    const morosos = subs.filter((s: any) => s.status === 'past_due');
    const mrr = activos.reduce((t: number, s: any) => t + (s.amount_mxn || 0), 0);

    // Historial de cobros (últimas 30 facturas de plataforma)
    const invRes = await stripeGet('/invoices?limit=30', stripeKey);
    const now = new Date();
    const mesActual = now.toISOString().slice(0, 7);
    let cobradoMes = 0;
    const pagos = (invRes?.data || []).map((i: any) => {
      const g = nameFor(typeof i.subscription === 'string' ? i.subscription : i.subscription?.id, typeof i.customer === 'string' ? i.customer : i.customer?.id, i.metadata);
      const fecha = i.created ? new Date(i.created * 1000).toISOString().slice(0, 10) : null;
      const monto = Math.round((i.amount_paid ?? 0) / 100);
      if (i.status === 'paid' && fecha && fecha.slice(0, 7) === mesActual) cobradoMes += monto;
      return { date: fecha, gym_nombre: g.nombre, amount_mxn: monto, status: i.status, url: i.hosted_invoice_url || null };
    });

    return json({
      ok: true,
      resumen: {
        mrr, activos: activos.length, morosos: morosos.length,
        cobrado_mes: cobradoMes,
        total_gyms_con_sub: subs.filter((s: any) => s.status !== 'canceled' && s.status !== 'incomplete_expired').length,
      },
      subs: subs.filter((s: any) => !['canceled', 'incomplete_expired'].includes(s.status))
        .sort((a: any, b: any) => (a.status === 'past_due' ? -1 : 0) - (b.status === 'past_due' ? -1 : 0)),
      pagos,
    });
  } catch (e) {
    console.error('velum-saas-dashboard:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
