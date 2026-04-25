// velum-stripe-callback — Stripe Connect OAuth callback
// Exchanges authorization code for stripe_user_id and stores in gym_config.
// Requires valid VELUM JWT (admin only).
// deploy: supabase functions deploy velum-stripe-callback

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
  const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripePlatformKey = Deno.env.get('STRIPE_PLATFORM_SECRET_KEY');

  if (!stripePlatformKey) return json({ error: 'Stripe no configurado. Contacta soporte.' }, 500);

  // ── Verify JWT ────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return json({ error: 'No autorizado.' }, 401);

  let body: { code?: string; gym_id?: string | number };
  try { body = await req.json(); } catch { return json({ error: 'Body inválido.' }, 400); }

  const { code, gym_id } = body;
  if (!code || !gym_id) return json({ error: 'Faltan parámetros: code y gym_id.' }, 400);

  // ── Exchange code with Stripe ─────────────────────────────────────
  const stripeRes = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_secret: stripePlatformKey,
      code: code as string,
      grant_type: 'authorization_code',
    }),
  });

  const stripeData = await stripeRes.json();
  if (stripeData.error) {
    return json({ error: `Stripe error: ${stripeData.error_description || stripeData.error}` }, 400);
  }

  const stripeAccountId: string = stripeData.stripe_user_id;
  if (!stripeAccountId) return json({ error: 'No se obtuvo el ID de cuenta de Stripe.' }, 400);

  // ── Store in gym_config ───────────────────────────────────────────
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: dbError } = await db
    .from('gym_config')
    .update({
      stripe_account_id: stripeAccountId,
      stripe_account_connected_at: new Date().toISOString(),
    })
    .eq('gym_id', gym_id);

  if (dbError) {
    console.error('DB error storing stripe_account_id:', dbError);
    return json({ error: 'Error al guardar la conexión con Stripe.' }, 500);
  }

  return json({ ok: true, stripe_account_id: stripeAccountId });
});
