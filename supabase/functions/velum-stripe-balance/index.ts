import { verifyPanelSession } from '../_shared/panel-session.ts';
// velum-stripe-balance — v4: relleno de pagos.stripe_available_on Y stripe_fee_mxn
// (v3 leía la balance_transaction y tiraba el fee: el neto quedaba inflado). Fecha en que
// Stripe libera cada cobro) para mostrar al gym cuándo cae su depósito.
// v2: Saldo, depósitos y CONFIGURACIÓN de payout de la cuenta conectada.
// Devuelve: Disponible / Pendiente / En tránsito + payouts + horario de depósito + banco (last4).
// Política VELUM (decisión Roy 08-jul): depósito automático SEMANAL los VIERNES para todos los
// gyms — esta función lo AUTO-CORRIGE si la cuenta tiene otro horario (self-healing, idempotente).
// Seguridad: el gym_id sale del JWT verificado del panel (no del body) → un gym solo ve lo suyo.
// Migrado a Deno.serve nativo (deno.land/std provoca timeouts de bundling al desplegar).
// deploy: supabase functions deploy velum-stripe-balance --no-verify-jwt
import { stripeSettlement, withDestinationPayment } from '../_shared/stripe-settlement.ts';
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

// ── Stripe REST helpers ──────────────────────────────────────────────
// GET con Stripe-Account (recursos DE la cuenta conectada: balance, payouts)
async function stripeGet(path: string, secretKey: string, stripeAccount?: string, version?: string) {
  const headers: Record<string, string> = { 'Authorization': `Bearer ${secretKey}` };
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount;
  if (version) headers['Stripe-Version'] = version;
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
  let gross = 0, fee = 0, refunds = 0, disputes = 0, count = 0;
  let cursor = '';
  // A dispute can have both a withdrawal and a reinstatement. Use the signed
  // net posted to this account, including any fee Stripe applied to the adjustment.
  const seen = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const q = `balance_transactions?limit=100&created[gte]=${gte}` +
      (cursor ? `&starting_after=${encodeURIComponent(cursor)}` : '');
    const res = await stripeGet(q, secretKey, acct);
    if (!Array.isArray(res?.data) || typeof res.has_more !== 'boolean') throw Error('Resumen de Stripe incompleto');
    for (const t of res.data) {
      if (t.currency !== 'mxn' || seen.has(t.id)) continue;
      if (!t.id || !Number.isSafeInteger(t.net) || !Number.isSafeInteger(t.fee) ||
          !Number.isSafeInteger(t.amount) || t.net !== t.amount - t.fee) throw Error('Movimiento de Stripe incompleto');
      seen.add(t.id);
      if (t.type === 'charge' || t.type === 'payment') {
        gross += t.amount;
        fee += t.fee;
        count++;
      } else if (['refund', 'refund_failure', 'partial_capture_reversal'].includes(t.reporting_category) ||
                 ['refund', 'payment_refund', 'refund_failure', 'payment_failure_refund'].includes(t.type)) {
        refunds += t.net;
      } else if (['dispute', 'dispute_reversal'].includes(t.reporting_category)) {
        disputes += t.net;
      }
    }
    if (!res.has_more) {
      return { gross_mxn: gross / 100, fee_mxn: fee / 100, refunds_net_mxn: refunds / 100,
        disputes_net_mxn: disputes / 100, net_mxn: (gross - fee + refunds + disputes) / 100, count };
    }
    const next = res.data.at(-1)?.id;
    if (!next || next === cursor) break;
    cursor = next;
  }
  throw Error('Paginación del resumen de Stripe incompleta');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // El ecosistema Stripe desplegado usa STRIPE_SECRET_KEY (webhook); charge usa el alias PLATFORM.
  const platformSecret = Deno.env.get('STRIPE_SECRET_KEY') || Deno.env.get('STRIPE_PLATFORM_SECRET_KEY');

  // ── Autenticación PRIMERO: gym_id sale del JWT verificado (no filtra config a anónimos) ──
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'No autenticado.' }, 401);

  const claims = await verifyPanelSession(token);
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

    const list: Array<{ status: string; amount: number; arrival_date: number; created: number }> = Array.isArray(payouts.data) ? payouts.data : [];
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

    // ── Relleno self-healing de fecha de depósito Y comisión (acotado) ──
    // La balance_transaction trae AMBOS datos; antes se leía solo available_on y se
    // tiraba bt.fee, así que esos pagos quedaban con net_to_gym = bruto y el panel
    // prometía más dinero del que Stripe iba a depositar. Tope por corrida para no
    // alargar la respuesta del panel; lo que falte se completa la próxima vez.
    let backfilled = 0;
    try {
      const { data: faltantes } = await db.from('pagos')
        .select('id, stripe_session_id, monto, velum_commission_mxn')
        .eq('gym_id', gymId)
        .is('stripe_balance_transaction_id', null)
        .not('stripe_session_id', 'is', null)
        .order('fecha', { ascending: false })
        .limit(40);
      for (const pg of (faltantes || [])) {
        const sid = String(pg.stripe_session_id || '');
        const invoice = sid.startsWith('in_');
        if (!invoice && !sid.startsWith('cs_')) continue;
        const path = invoice ? `invoices/${encodeURIComponent(sid)}?expand[]=charge.balance_transaction`
          : `checkout/sessions/${encodeURIComponent(sid)}?expand[]=payment_intent.latest_charge.balance_transaction`;
        try {
          let direct = true;
          let obj = await stripeGet(path, platformSecret, acct, '2024-11-20.acacia');
          if (obj.error?.code === 'resource_missing') {
            obj = await stripeGet(path, platformSecret, undefined, '2024-11-20.acacia');
            direct = false;
          }
          let charge = invoice ? obj.charge : obj.payment_intent?.latest_charge;
          if (!direct && charge?.transfer_data?.destination !== acct) continue;
          if (!direct) {
            charge = await withDestinationPayment(charge, (path, account) =>
              stripeGet(path.slice(1), platformSecret, account, '2024-11-20.acacia'));
          }
          const fields = stripeSettlement(charge, Math.round(Number(pg.monto) * 100),
            Math.round(Number(pg.velum_commission_mxn || 0) * 100), direct);
          if (fields.stripe_balance_transaction_id) {
            const { error } = await db.from('pagos').update(fields).eq('gym_id', gymId)
              .eq('id', pg.id).is('stripe_balance_transaction_id', null);
            if (!error) backfilled++;
          }
        } catch { /* Retry the payment on a later visit. */ }
      }
    } catch (e) { console.warn('backfill available_on:', e); }

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
      backfilled_available_on: backfilled,
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
