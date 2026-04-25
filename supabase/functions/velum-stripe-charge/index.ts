// velum-stripe-charge — Genera un link de pago (Stripe Checkout) para un atleta.
// Soporta: pago único (membresía, paquete) y suscripción mensual.
// deploy: supabase functions deploy velum-stripe-charge

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Stripe API helper
async function stripeRequest(
  path: string,
  method: string,
  body: Record<string, string>,
  secretKey: string,
  stripeAccount?: string,
) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount;

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers,
    body: method !== 'GET' ? new URLSearchParams(body).toString() : undefined,
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const platformSecret = Deno.env.get('STRIPE_PLATFORM_SECRET_KEY');

  if (!platformSecret) return json({ error: 'Stripe no configurado en el servidor.' }, 500);

  let body: {
    gym_id?: string | number;
    tipo?: 'pago_unico' | 'suscripcion';
    monto?: number;          // MXN (entero, ej: 999)
    descripcion?: string;    // ej: "Mensualidad Mayo"
    cliente_nombre?: string;
    cliente_email?: string;
    intervalo?: 'month' | 'week'; // para suscripción
  };
  try { body = await req.json(); } catch { return json({ error: 'Body inválido.' }, 400); }

  const { gym_id, tipo = 'pago_unico', monto, descripcion, cliente_nombre, cliente_email, intervalo = 'month' } = body;

  if (!gym_id)       return json({ error: 'gym_id requerido.' }, 400);
  if (!monto || monto < 10) return json({ error: 'Monto mínimo: $10 MXN.' }, 400);
  if (!descripcion)  return json({ error: 'Descripción requerida.' }, 400);

  // ── Get gym's Stripe account ──────────────────────────────────────
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: config, error: cfgErr } = await db
    .from('gym_config')
    .select('stripe_account_id, nombre_gym')
    .eq('gym_id', gym_id)
    .maybeSingle();

  if (cfgErr || !config) return json({ error: 'No se encontró la configuración del gym.' }, 404);
  if (!config.stripe_account_id) {
    return json({ error: 'Este gym no tiene Stripe conectado. Ve a Configuración → Stripe para conectar tu cuenta.' }, 400);
  }

  const stripeAccount = config.stripe_account_id;
  const gymNombre     = config.nombre_gym || 'Gym';

  const appFeeAmount = Math.round(monto * 100 * 0.015); // 1.5% platform fee (VELUM)
  const unitAmount   = monto * 100; // cents

  const BASE_URL = 'https://myvelum.app';

  let sessionData: Record<string, string>;

  if (tipo === 'suscripcion') {
    // ── Create Price (recurring) ──────────────────────────────────
    const priceRes = await stripeRequest('prices', 'POST', {
      'currency': 'mxn',
      'unit_amount': String(unitAmount),
      'recurring[interval]': intervalo,
      'product_data[name]': descripcion || 'Membresía',
    }, platformSecret, stripeAccount);

    if (priceRes.error) return json({ error: `Stripe (price): ${priceRes.error.message}` }, 400);

    sessionData = {
      'mode': 'subscription',
      'line_items[0][price]': priceRes.id,
      'line_items[0][quantity]': '1',
      'subscription_data[application_fee_percent]': '1.5',
      'success_url': `${BASE_URL}/success-payment?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${BASE_URL}/app`,
      'currency': 'mxn',
    };
    if (cliente_email) sessionData['customer_email'] = cliente_email;
    if (cliente_nombre) sessionData['metadata[cliente]'] = cliente_nombre;

  } else {
    // ── Pago único ────────────────────────────────────────────────
    sessionData = {
      'mode': 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'mxn',
      'line_items[0][price_data][unit_amount]': String(unitAmount),
      'line_items[0][price_data][product_data][name]': descripcion,
      'line_items[0][price_data][product_data][description]': `${gymNombre} — ${cliente_nombre || 'Cliente'}`,
      'payment_intent_data[application_fee_amount]': String(appFeeAmount),
      'success_url': `${BASE_URL}/success-payment?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${BASE_URL}/app`,
    };
    if (cliente_email) sessionData['customer_email'] = cliente_email;
    if (cliente_nombre) sessionData['metadata[cliente]'] = cliente_nombre;
  }

  // ── Create Checkout Session ───────────────────────────────────────
  const session = await stripeRequest(
    'checkout/sessions', 'POST', sessionData, platformSecret, stripeAccount
  );

  if (session.error) {
    return json({ error: `Stripe (session): ${session.error.message}` }, 400);
  }

  return json({
    ok: true,
    url: session.url,
    session_id: session.id,
    expires_at: session.expires_at,
  });
});
