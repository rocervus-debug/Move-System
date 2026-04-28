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
    const session     = event.data.object as Record<string, unknown>;
    const sessionId   = session.id as string;
    const amountTotal = (session.amount_total as number) / 100;
    const currency    = (session.currency as string) || 'mxn';
    const metadata    = (session.metadata as Record<string, string>) || {};
    const mode        = session.mode as string;
    const today       = new Date().toISOString().slice(0, 10);

    // ── PATH A: Athlete portal purchase (destination charge via velum-atleta-checkout)
    //    Identified by portal_token + gym_id in metadata
    if (metadata.portal_token && metadata.gym_id) {
      const portalToken = metadata.portal_token;
      const gymId       = metadata.gym_id;
      const planNombre  = metadata.plan_nombre  || 'Plan';
      const planTipo    = metadata.plan_tipo    || 'membresia';
      const planDias    = parseInt(metadata.plan_dias   || '0', 10);
      const planClases  = parseInt(metadata.plan_clases || '0', 10);

      // Idempotency — check across all gyms since destination charges have no gym in header
      const { data: existing } = await db
        .from('pagos').select('id').eq('stripe_session_id', sessionId).maybeSingle();
      if (existing) return json({ ok: true, skipped: 'duplicate' });

      // Look up the client
      const { data: cliente } = await db
        .from('clientes').select('id, nombre')
        .eq('portal_token', portalToken).maybeSingle();

      if (!cliente) {
        console.error('Portal purchase: cliente not found for token', portalToken);
        return json({ ok: true, skipped: 'cliente_not_found' });
      }

      // Vence date for memberships
      let vence: string | null = null;
      if (planTipo === 'membresia' && planDias > 0) {
        const venceDate = new Date();
        venceDate.setDate(venceDate.getDate() + planDias);
        vence = venceDate.toISOString().slice(0, 10);
      }

      const { error: insertErr } = await db.from('pagos').insert({
        gym_id:            gymId,
        cliente:           cliente.nombre,
        plan:              planNombre,
        monto:             amountTotal,
        fecha:             today,
        vence:             vence,
        clases_totales:    planTipo === 'paquete' && planClases > 0 ? planClases : null,
        clases_usadas:     planTipo === 'paquete' && planClases > 0 ? 0           : null,
        metodo:            'stripe',
        estado:            'Activo',
        notas:             `[PORTAL] session=${sessionId} plan=${metadata.plan_id || ''}`,
        stripe_session_id: sessionId,
      });

      if (insertErr) {
        console.error('Portal purchase insert error:', insertErr);
        return json({ error: 'DB insert failed' }, 500);
      }

      console.log(`✅ Portal pago — gym ${gymId} — ${cliente.nombre} — ${planNombre} — $${amountTotal}`);
      return json({ ok: true, registered: true, source: 'portal' });
    }

    // ── PATH B: Regular gym checkout (direct charge on connected account)
    const stripeAccountId = req.headers.get('stripe-account') || (session.on_behalf_of as string) || null;
    const clienteEmail    = (session.customer_email as string)
      || ((session.customer_details as Record<string, unknown>)?.email as string) || '';
    const clienteNombre   = metadata?.cliente || clienteEmail || 'Cliente';
    const descripcion     = metadata?.descripcion || 'Pago Stripe';

    if (!stripeAccountId) {
      console.error('No stripe_account in webhook — cannot find gym');
      return json({ ok: true, skipped: 'no_account_id' });
    }

    const { data: gymConfigRow } = await db
      .from('gym_config').select('gym_id')
      .eq('stripe_account_id', stripeAccountId).maybeSingle();

    if (!gymConfigRow?.gym_id) {
      console.error('Gym not found for stripe_account_id:', stripeAccountId);
      return json({ ok: true, skipped: 'gym_not_found' });
    }

    const gymId = gymConfigRow.gym_id;

    const { data: existing } = await db
      .from('pagos').select('id')
      .eq('gym_id', gymId).eq('stripe_session_id', sessionId).maybeSingle();
    if (existing) return json({ ok: true, skipped: 'duplicate' });

    const { error: insertError } = await db.from('pagos').insert({
      gym_id:            gymId,
      cliente:           clienteNombre,
      plan:              descripcion,
      monto:             amountTotal,
      fecha:             today,
      metodo:            'stripe',
      estado:            'Activo',
      notas:             `[STRIPE] session=${sessionId} mode=${mode} email=${clienteEmail}`,
      stripe_session_id: sessionId,
    });

    if (insertError) {
      console.error('Error inserting pago:', insertError);
      return json({ error: 'DB insert failed' }, 500);
    }

    console.log(`✅ Pago registrado — gym ${gymId} — ${clienteNombre} — $${amountTotal} ${currency.toUpperCase()}`);
    return json({ ok: true, registered: true, source: 'gym' });
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
