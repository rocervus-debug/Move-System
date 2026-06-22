// velum-stripe-balance — Saldo y depósitos (payouts) de la cuenta Stripe conectada del gym.
// Devuelve: Disponible / Pendiente / En tránsito + lista de payouts con estado y fecha estimada.
// Seguridad: el gym_id sale del JWT verificado del panel (no del body) → un gym solo ve lo suyo.
// deploy: supabase functions deploy velum-stripe-balance --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── base64url helpers ────────────────────────────────────────────────
function b64urlToStr(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}
function b64urlToBytes(b64url: string): Uint8Array {
  const s = b64urlToStr(b64url);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// ── Verifica el JWT HS256 del panel (firmado por move-login con SUPABASE_JWT_SECRET) ──
async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'HMAC', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const payload = JSON.parse(b64urlToStr(p));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Stripe REST helper (cuenta conectada vía header Stripe-Account) ──
async function stripeGet(path: string, secretKey: string, stripeAccount: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${secretKey}`, 'Stripe-Account': stripeAccount },
  });
  return res.json();
}

function sumMxn(arr: Array<{ amount: number; currency: string }> | undefined): number {
  if (!Array.isArray(arr)) return 0;
  return arr
    .filter((b) => (b.currency || '').toLowerCase() === 'mxn')
    .reduce((acc, b) => acc + (b.amount || 0), 0) / 100;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // El ecosistema Stripe desplegado usa STRIPE_SECRET_KEY (webhook); charge usa el alias PLATFORM.
  const platformSecret = Deno.env.get('STRIPE_SECRET_KEY') || Deno.env.get('STRIPE_PLATFORM_SECRET_KEY');
  const jwtSecret      = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');

  if (!jwtSecret) return json({ error: 'Auth no configurada en el servidor.' }, 500);

  // ── Autenticación PRIMERO: gym_id sale del JWT verificado (no filtra config a anónimos) ──
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'No autenticado.' }, 401);

  const claims = await verifyJWT(token, jwtSecret);
  if (!claims) return json({ error: 'Sesión inválida o expirada.' }, 401);

  const gymId = claims.gym_id;
  const rol   = String(claims.app_rol || '');
  if (!gymId) return json({ error: 'Token sin gym_id.' }, 401);
  if (!['admin', 'staff', 'superadmin'].includes(rol)) {
    return json({ error: 'Sin permiso para ver el saldo.' }, 403);
  }

  // Stripe aún no configurado a nivel plataforma → trátalo como "no conectado" (UI muestra CTA)
  if (!platformSecret) return json({ connected: false, reason: 'stripe_not_configured' });

  // ── Cuenta Stripe conectada del gym ──
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // La cuenta Stripe conectada vive en gyms.stripe_account_id (PK = id), no en gym_config.
  const { data: gymRow } = await db
    .from('gyms')
    .select('stripe_account_id, stripe_payouts_enabled')
    .eq('id', gymId)
    .maybeSingle();

  if (!gymRow?.stripe_account_id) {
    return json({ connected: false });
  }
  const acct = gymRow.stripe_account_id;

  // ── Saldo + payouts en paralelo ──
  try {
    const [balance, payouts] = await Promise.all([
      stripeGet('balance', platformSecret, acct),
      stripeGet('payouts?limit=12', platformSecret, acct),
    ]);

    if (balance?.error || payouts?.error) {
      console.error('stripe error', balance?.error || payouts?.error);
      return json({ connected: true, error: 'No se pudo leer el saldo de Stripe.' }, 200);
    }

    const available_mxn = sumMxn(balance.available);
    const pending_mxn   = sumMxn(balance.pending);

    const list = Array.isArray(payouts.data) ? payouts.data : [];
    const in_transit_mxn = list
      .filter((p: { status: string }) => p.status === 'in_transit' || p.status === 'pending')
      .reduce((acc: number, p: { amount: number }) => acc + (p.amount || 0), 0) / 100;

    const payoutsOut = list.map((p: Record<string, number | string>) => ({
      amount_mxn:   (Number(p.amount) || 0) / 100,
      status:       p.status,                 // paid | in_transit | pending | failed | canceled
      arrival_date: p.arrival_date ? new Date(Number(p.arrival_date) * 1000).toISOString().slice(0, 10) : null,
      created:      p.created ? new Date(Number(p.created) * 1000).toISOString().slice(0, 10) : null,
    }));

    // próximo depósito = el payout más cercano que aún no cae (pending/in_transit)
    const next = payoutsOut
      .filter((p) => p.status === 'in_transit' || p.status === 'pending')
      .sort((a, b) => String(a.arrival_date).localeCompare(String(b.arrival_date)))[0] || null;

    return json({
      connected: true,
      currency: 'mxn',
      available_mxn,
      pending_mxn,
      in_transit_mxn,
      next_payout: next,
      payouts: payoutsOut,
    });
  } catch (e) {
    console.error('velum-stripe-balance', e);
    return json({ connected: true, error: 'Error consultando Stripe.' }, 200);
  }
});
