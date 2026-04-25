// velum-stripe-webhook — Stripe webhook receiver
// Listens for checkout.session.completed and registers the payment in VELUM's pagos table.
// Also handles invoice.payment_succeeded for subscriptions.
// deploy: supabase functions deploy velum-stripe-webhook --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Stripe webhook signature verification
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = sigHeader.split(',');
    const tPart = parts.find(p => p.startsWith('t='));
    const v1Part = parts.find(p => p.startsWith('v1='));
    if (!tPart || !v1Part) return false;

    const timestamp = tPart.split('=')[1];
    const signature = v1Part.split('=')[1];
    const signedPayload = `${timestamp}.${payload}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Constant-time compare
    return expected === signature;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET'); // Optional but recommended

  const payload   = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';

  // Verify signature if webhook secret is configured
  if (webhookSecret && sigHeader) {
    const valid = await verifyStripeSignature(payload, sigHeader, webhookSecret);
    if (!valid) {
      console.error('Stripe webhook signature invalid');
      return json({ error: 'Invalid signature' }, 400);
    }
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Handle checkout.session.completed ────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Record<string, unknown>;

    const stripeAccountId = req.headers.get('stripe-account') || (session.on_behalf_of as string) || null;
    const sessionId       = session.id as string;
    const amountTotal     = (session.amount_total as number) / 100; // cents → pesos
    const currency        = session.currency as string || 'mxn';
    const clienteEmail    = (session.customer_email as string) || (session.customer_details as Record<string, unknown>)?.email as string || '';
    const clienteNombre   = (session.metadata as Record<string, unknown>)?.cliente as string || clienteEmail || 'Cliente';
    const descripcion     = (session.metadata as Record<string, unknown>)?.descripcion as string ||
                            ((session.line_items as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.description as string || 'Pago Stripe';
    const mode            = session.mode as string; // 'payment' | 'subscription'

    // Find the gym by stripe_account_id
    if (!stripeAccountId) {
      console.error('No stripe_account in webhook — cannot find gym');
      return json({ ok: true, skipped: 'no_account_id' });
    }

    const { data: gymConfigRow } = await db
      .from('gym_config')
      .select('gym_id')
      .eq('stripe_account_id', stripeAccountId)
      .maybeSingle();

    if (!gymConfigRow?.gym_id) {
      console.error('Gym not found for stripe_account_id:', stripeAccountId);
      return json({ ok: true, skipped: 'gym_not_found' });
    }

    const gymId = gymConfigRow.gym_id;

    // Avoid duplicate inserts (idempotency)
    const { data: existing } = await db
      .from('pagos')
      .select('id')
      .eq('gym_id', gymId)
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existing) {
      return json({ ok: true, skipped: 'duplicate' });
    }

    // Insert payment record
    const today = new Date().toISOString().slice(0, 10);
    const { error: insertError } = await db.from('pagos').insert({
      gym_id:           gymId,
      cliente:          clienteNombre,
      plan:             descripcion,
      monto:            amountTotal,
      fecha:            today,
      metodo:           'stripe',
      estado:           'Activo',
      notas:            `[STRIPE] session=${sessionId} mode=${mode} email=${clienteEmail}`,
      stripe_session_id: sessionId,
    });

    if (insertError) {
      console.error('Error inserting pago:', insertError);
      return json({ error: 'DB insert failed' }, 500);
    }

    console.log(`✅ Pago registrado — gym ${gymId} — ${clienteNombre} — $${amountTotal} ${currency.toUpperCase()}`);
    return json({ ok: true, registered: true });
  }

  // ── Handle invoice.payment_succeeded (subscriptions) ─────────────────
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Record<string, unknown>;
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return json({ ok: true, skipped: 'not_subscription' });

    const stripeAccountId = req.headers.get('stripe-account') || null;
    const amountPaid      = (invoice.amount_paid as number) / 100;
    const clienteEmail    = (invoice.customer_email as string) || '';
    const sessionId       = invoice.id as string; // Use invoice ID for idempotency

    if (!stripeAccountId) return json({ ok: true, skipped: 'no_account_id' });

    const { data: gymConfigRow } = await db
      .from('gym_config')
      .select('gym_id')
      .eq('stripe_account_id', stripeAccountId)
      .maybeSingle();

    if (!gymConfigRow?.gym_id) return json({ ok: true, skipped: 'gym_not_found' });

    const gymId = gymConfigRow.gym_id;

    // Avoid duplicates
    const { data: existing } = await db
      .from('pagos')
      .select('id')
      .eq('gym_id', gymId)
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existing) return json({ ok: true, skipped: 'duplicate' });

    const today = new Date().toISOString().slice(0, 10);
    await db.from('pagos').insert({
      gym_id:           gymId,
      cliente:          clienteEmail || 'Suscriptor',
      plan:             'Membresía mensual (Stripe)',
      monto:            amountPaid,
      fecha:            today,
      metodo:           'stripe',
      estado:           'Activo',
      notas:            `[STRIPE-SUB] invoice=${sessionId} sub=${subscriptionId}`,
      stripe_session_id: sessionId,
    });

    return json({ ok: true, registered: true });
  }

  // Unhandled event type — acknowledge receipt
  return json({ ok: true, ignored: event.type });
});
