// velum-stripe-balance — v2: Saldo, depósitos y CONFIGURACIÓN de payout de la cuenta conectada.
// Devuelve: Disponible / Pendiente / En tránsito + payouts + horario de depósito + banco (last4).
// Política VELUM (decisión Roy 08-jul): depósito automático SEMANAL los VIERNES para todos los
// gyms — esta función lo AUTO-CORRIGE si la cuenta tiene otro horario (self-healing, idempotente).
// Seguridad: el gym_id sale del JWT verificado del panel (no del body) → un gym solo ve lo suyo.
// Migrado a Deno.serve nativo (deno.land/std provoca timeouts de bundling al desplegar).
// deploy: supabase functions deploy velum-stripe-balance --no-verify-jwt
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

// ── Stripe REST helpers ──────────────────────────────────────────────
// GET con Stripe-Account (recursos DE la cuenta conectada: balance, payouts)
async function stripeGet(path: string, secretKey: string, stripeAccount?: string) {
  const headers: Record<string, string> = { 'Authorization': `Bearer ${secretKey}` };
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'GET', headers });
  return res.json();
}
// POST form-encoded como plataforma (actualizar settings de la cuenta conectada)
async function stripePost(path: string, secretKey: string, form: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  return res.json();
}

function sumMxn(arr: Array<{ amount: number; currency: string }> | undefined): number {
  if (!Array.isArray(arr)) return 0;
  return arr
    .filter((b) => (b.currency || '').toLowerCase() === 'mxn')
    .reduce((acc, b) => acc + (b.amount || 0), 0) / 100;
}

// ── Resumen NETO del mes en curso desde balance_transactions de la cuenta conectada.
// Cada transacción de cobro trae el `fee` REAL de Stripe y el `net` que se depositará
// (con on_behalf_of=gym, la comisión la absorbe el gym). Así el panel muestra el monto
// real a depositar, no el bruto — evita el conflicto "no me depositaron lo que dice".
async function monthNetSummary(secretKey: string, acct: string) {
  // Inicio del mes en hora de México (UTC-6) → unix segundos.
  const now = new Date();
  const mx = new Date(now.getTime() - 6 * 3600 * 1000);
  const firstUtc = Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), 1, 6, 0, 0); // 00:00 CDMX
  const gte = Math.floor(firstUtc / 1000);
  let gross = 0, fee = 0, net = 0, count = 0;
  let starting_after = '';
  // Paginación con tope de seguridad (10 páginas = 1000 cobros/mes).
  for (let page = 0; page < 10; page++) {
    const q = `balance_transactions?type=charge&limit=100&created[gte]=${gte}` +
      (starting_after ? `&starting_after=${starting_after}` : '');
    const res = await stripeGet(q, secretKey, acct);
    const data = Array.isArray(res?.data) ? res.data : [];
    for (const t of data) {
      if ((t.currency || '').toLowerCase() !== 'mxn') continue;
      gross += (t.amount || 0);
      fee   += (t.fee || 0);
      net   += (t.net || 0);
      count += 1;
    }
    if (!res?.has_more || !data.length) break;
    starting_after = data[data.length - 1].id;
  }
  return { gross_mxn: gross / 100, fee_mxn: fee / 100, net_mxn: net / 100, count };
}

Deno.serve(async (req: Request) => {
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

  // ── Saldo + payouts + cuenta (schedule y banco) en paralelo ──
  try {
    const [balance, payouts, account, monthSummary] = await Promise.all([
      stripeGet('balance', platformSecret, acct),
      stripeGet('payouts?limit=12', platformSecret, acct),
      stripeGet(`accounts/${acct}`, platformSecret), // llamada de plataforma, sin header
      monthNetSummary(platformSecret, acct).catch((e) => { console.error('monthNetSummary', e); return null; }),
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

    // ── Horario de depósito: política = semanal los viernes. Auto-corregir si difiere. ──
    let schedule = account?.settings?.payouts?.schedule || null;
    let schedule_updated = false;
    if (!account?.error && schedule &&
        (schedule.interval !== 'weekly' || schedule.weekly_anchor !== 'friday')) {
      const upd = await stripePost(`accounts/${acct}`, platformSecret, {
        'settings[payouts][schedule][interval]': 'weekly',
        'settings[payouts][schedule][weekly_anchor]': 'friday',
      });
      if (upd?.error) {
        // No romper la respuesta: reportar el horario actual y dejar log para revisar.
        console.error('velum-stripe-balance: no se pudo fijar payout semanal', acct, upd.error);
      } else {
        schedule = upd?.settings?.payouts?.schedule || schedule;
        schedule_updated = true;
      }
    }

    // ── Banco destino (last4 + nombre) para mostrar "depósito a ****1234" ──
    let bank: { last4: string; bank_name: string | null } | null = null;
    const ext = account?.external_accounts?.data;
    if (Array.isArray(ext) && ext.length) {
      const ba = ext.find((e: { object: string }) => e.object === 'bank_account') || ext[0];
      if (ba) bank = { last4: String(ba.last4 || ''), bank_name: ba.bank_name || null };
    }

    return json({
      connected: true,
      currency: 'mxn',
      available_mxn,
      pending_mxn,
      in_transit_mxn,
      next_payout: next,
      payouts: payoutsOut,
      payout_schedule: schedule ? {
        interval: schedule.interval,               // weekly = política VELUM
        weekly_anchor: schedule.weekly_anchor ?? null,
        delay_days: schedule.delay_days ?? null,
      } : null,
      schedule_updated,
      bank,
      payouts_enabled: account?.payouts_enabled ?? gymRow.stripe_payouts_enabled ?? null,
      // Resumen del mes con montos REALES de Stripe (bruto / comisión / neto a depositar).
      month_summary: monthSummary,
    });
  } catch (e) {
    console.error('velum-stripe-balance', e);
    return json({ connected: true, error: 'Error consultando Stripe.' }, 200);
  }
});
