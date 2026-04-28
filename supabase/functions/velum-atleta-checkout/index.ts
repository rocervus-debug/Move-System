// velum-atleta-checkout — Creates a Stripe Checkout session for athlete portal purchases
// deploy: supabase functions deploy velum-atleta-checkout --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'Stripe no configurado' }, 500);

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    const { portal_token, plan_id } = body;
    if (!portal_token || !plan_id) {
      return json({ error: 'portal_token y plan_id son requeridos' }, 400);
    }

    // Get client by portal_token
    const { data: cliente, error: cErr } = await supabase
      .from('clientes')
      .select('id, nombre, email, gym_id, portal_token')
      .eq('portal_token', portal_token)
      .single();

    if (cErr || !cliente) return json({ error: 'Cliente no encontrado' }, 404);

    const gym_id = cliente.gym_id;

    // Get gym config
    const { data: cfgRows } = await supabase
      .from('gym_config')
      .select('key, value')
      .eq('gym_id', gym_id)
      .in('key', ['stripe_account_id', 'planes_portal', 'gym_nombre']);

    const cfg: Record<string, string> = {};
    (cfgRows || []).forEach((r: any) => { cfg[r.key] = r.value; });

    const stripeAccountId = cfg['stripe_account_id'];
    if (!stripeAccountId) {
      return json({ error: 'El gym no tiene pagos en línea habilitados' }, 400);
    }

    // Find the requested plan
    let planes: any[] = [];
    try { planes = JSON.parse(cfg['planes_portal'] || '[]'); } catch (_) {}

    const plan = planes.find((p: any) => p.id === plan_id);
    if (!plan) return json({ error: 'Plan no encontrado' }, 404);

    const gymName = cfg['gym_nombre'] || 'VELUM Gym';
    const siteUrl = Deno.env.get('SITE_URL') || 'https://myvelum.app';

    // Build description
    const description = plan.tipo === 'paquete'
      ? `Paquete de ${plan.clases} clases`
      : `Membresía ${plan.dias} días`;

    // Create Stripe Checkout Session (destination charge → transfer to gym)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name:        `${plan.nombre} — ${gymName}`,
            description: description,
          },
          unit_amount: Math.round(plan.precio * 100), // MXN centavos
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${siteUrl}/atleta?token=${portal_token}&payment=success&plan_id=${plan_id}`,
      cancel_url:  `${siteUrl}/atleta?token=${portal_token}&payment=cancelled`,
      customer_email: cliente.email || undefined,
      metadata: {
        portal_token,
        cliente_id:  cliente.id,
        gym_id,
        plan_id,
        plan_nombre: plan.nombre,
        plan_tipo:   plan.tipo,
        plan_dias:   String(plan.dias   || 0),
        plan_clases: String(plan.clases || 0),
        plan_precio: String(plan.precio),
      },
      payment_intent_data: {
        transfer_data: { destination: stripeAccountId },
        metadata: {
          portal_token,
          gym_id,
          plan_id,
        },
      },
    });

    console.log(`✅ Checkout created — ${cliente.nombre} — ${plan.nombre} — $${plan.precio}`);
    return json({ url: session.url, session_id: session.id });

  } catch (err) {
    console.error('velum-atleta-checkout error:', err);
    return json({ error: String((err as Error).message || err) }, 500);
  }
});
