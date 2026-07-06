// velum-payment — v16: + código de referido (metadata[ref]) para atribución en el webhook.
// Migrado a Deno.serve nativo (deno.land/std provoca timeouts de bundling al desplegar).
// v15: trial de 7 días. Lee price_id de velum_saas_plans. Crea Checkout subscription para registro de gym.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization' };
function json(b: unknown, s=200){ return new Response(JSON.stringify(b),{status:s,headers:{...CORS,'Content-Type':'application/json'}}); }

const TRIAL_DAYS = 7;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json({ error: 'Stripe no configurado. Contacta soporte@myvelum.app' }, 400);
  try {
    const body = await req.json();
    const { plan, gym_nombre, email, pw_hash, nombre_admin, tel_whatsapp, ref } = body;
    if (!plan || !email || !gym_nombre) return json({ error: 'Faltan campos requeridos.' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession:false, autoRefreshToken:false } });

    const { data: planRow } = await db.from('velum_saas_plans').select('stripe_price_id, nombre, price_mxn').eq('id', plan).eq('is_active', true).maybeSingle();
    if (!planRow?.stripe_price_id) return json({ error: `Plan '${plan}' no disponible para cobro.` }, 400);

    const { data: existsUser } = await db.from('usuarios').select('id').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (existsUser) return json({ error: 'Este correo ya está registrado. Inicia sesión.' }, 409);

    const origin = req.headers.get('origin') || 'https://myvelum.app';
    const sessionBody = new URLSearchParams({
      'payment_method_types[]': 'card',
      'mode': 'subscription',
      'line_items[0][price]': planRow.stripe_price_id,
      'line_items[0][quantity]': '1',
      'customer_email': email.toLowerCase().trim(),
      'success_url': `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${origin}/registro.html?cancelled=1`,
      'metadata[velum_signup]': 'true',
      'metadata[gym_nombre]': gym_nombre,
      'metadata[email]': email.toLowerCase().trim(),
      'metadata[pw_hash]': pw_hash || '',
      'metadata[nombre_admin]': nombre_admin || email.split('@')[0],
      'metadata[tel_whatsapp]': tel_whatsapp || '',
      'metadata[plan]': plan,
      'subscription_data[trial_period_days]': String(TRIAL_DAYS),
      'subscription_data[metadata][velum_signup]': 'true',
      'subscription_data[metadata][gym_nombre]': gym_nombre,
      'subscription_data[metadata][plan]': plan,
      'locale': 'es',
      'allow_promotion_codes': 'true',
    });
    // Código de referido: viaja en metadata y el webhook lo atribuye al crear el gym
    if (ref && /^[a-z0-9-]{3,60}$/.test(String(ref))) sessionBody.append('metadata[ref]', String(ref));

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: sessionBody.toString(),
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(session.error?.message || 'Error de Stripe');

    return json({ url: session.url, session_id: session.id });
  } catch (e: any) {
    console.error('velum-payment:', e);
    return json({ error: e.message || 'Error interno' }, 500);
  }
});
