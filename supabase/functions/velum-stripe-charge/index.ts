// velum-stripe-charge — v16 (propuesta, corrige P0×2 + P1 de la auditoría de cobros):
//   P0-1  AUTH obligatoria: JWT custom verificado (firma HMAC-SHA256 + exp) y el gym_id
//         sale de los CLAIMS, nunca del body. Solo admin/superadmin del gym.
//   P0-2  Fee por plan (igual que stripe-checkout-create): max/owner → 0%, resto → 2%.
//         Se elimina el 1.5% hardcodeado.
//   P1    Arquitectura: la sesión de checkout se crea a NIVEL PLATAFORMA con
//         payment_intent_data[transfer_data][destination] + on_behalf_of (mismo patrón
//         que stripe-checkout-create), y con metadata source='manual_link' + gym_id +
//         cliente + descripcion para que la rama existente de stripe-webhook v15
//         registre el pago en `pagos` automáticamente.
//   Además: migrado a Deno.serve nativo (sin deno.land/std), monto validado con
//   Math.round(Number(monto)*100) y mínimo 1000 centavos, expires_at a 30 min.
//   NOTA: se ELIMINA el modo 'suscripcion' de esta función. Una suscripción manual sin
//   package_id no es compatible con la rama velum_member_sub del webhook (requiere
//   package_id) y quedaría sin registrar. Las mensualidades domiciliadas se generan con
//   velum-member-subscription (action create_link) sobre un paquete recurring.
// deploy: supabase functions deploy velum-stripe-charge --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
const APP_URL = 'https://myvelum.app';
const VELUM_FEE_PCT = 0.02;                       // fee estándar de plataforma
const ZERO_FEE_PLANS = new Set(['max', 'owner']); // planes sin comisión (igual que stripe-checkout-create)

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── JWT custom (HS256) — mismo patrón que velum-stripe-balance ──────────────
function b64urlToStr(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}
function b64urlToBytes(b64url: string): Uint8Array {
  const s = b64urlToStr(b64url);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
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
    // Validar expiración: un token vencido no sirve.
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Stripe helper (a nivel plataforma, SIN header Stripe-Account) ────────────
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) v.forEach((item, i) => { if (typeof item === 'object') Object.assign(out, flatten(item as Record<string, unknown>, `${key}[${i}]`)); else out[`${key}[${i}]`] = String(item); });
    else if (typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}
async function stripeFetch(path: string, method: string, body: Record<string, unknown> | undefined, secretKey: string, stripeAccount?: string) {
  const params = body ? new URLSearchParams(flatten(body)).toString() : undefined;
  const headers: Record<string,string> = { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-11-20.acacia' };
  // Cobro DIRECTO: crear en la cuenta del gym → el gym paga su comisión de Stripe (recibe el neto).
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount;
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method, headers, body: params });
  const j = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}
function sanitizeDescriptor(name: string): string {
  let s = (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 20);
  if (s.length < 5) s = (s + ' VELUM').slice(0, 20).trim();
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // El ecosistema Stripe desplegado usa STRIPE_SECRET_KEY; PLATFORM queda como alias de respaldo.
    const platformSecret = Deno.env.get('STRIPE_SECRET_KEY') || Deno.env.get('STRIPE_PLATFORM_SECRET_KEY');
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');

    if (!platformSecret) return json({ error: 'Stripe no configurado en el servidor.' }, 500);
    if (!jwtSecret) return json({ error: 'Auth no configurada en el servidor.' }, 500);

    // ── AUTH: el gym sale del JWT, jamás del body ────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'No autenticado.' }, 401);
    const claims = await verifyJWT(token, jwtSecret);
    if (!claims) return json({ error: 'Sesión inválida o expirada.' }, 401);
    const gymId = claims.gym_id as number;
    const rol = String(claims.app_rol || '');
    if (!gymId) return json({ error: 'Token sin gym_id.' }, 401);
    if (!['admin', 'superadmin'].includes(rol)) {
      return json({ error: 'Solo admin/superadmin pueden generar links de cobro.' }, 403);
    }

    // ── Body ─────────────────────────────────────────────────────────────────
    let body: {
      tipo?: string;
      monto?: number | string;   // MXN (ej: 999 o 999.50) — se ignora si viene package_id
      descripcion?: string;      // ej: "Mensualidad Mayo" — se ignora si viene package_id
      package_id?: number | string; // cobrar un PAQUETE del gym: precio del servidor + extiende membresía
      cliente_nombre?: string;
      cliente_email?: string;
    };
    try { body = await req.json(); } catch { return json({ error: 'Body inválido.' }, 400); }

    const { tipo = 'pago_unico', monto, descripcion, package_id, cliente_nombre, cliente_email } = body;

    if (tipo === 'suscripcion') {
      // El modo suscripción se retiró de esta función: sin package_id el webhook no puede
      // registrar la mensualidad. Usar velum-member-subscription con un paquete recurring.
      return json({ error: 'El cobro recurrente se genera desde Domiciliación (paquete de mensualidad), no desde link manual.' }, 400);
    }

    // Con paquete: el precio y la descripción salen del SERVIDOR (nunca del cliente).
    // Sin paquete: cobro libre — monto/descripción del body, validados.
    const pkgId = parseInt(String(package_id || '0'), 10) || 0;
    let amountCents = 0;
    let desc = '';
    if (!pkgId) {
      const montoNum = Number(monto);
      if (!Number.isFinite(montoNum) || montoNum <= 0) return json({ error: 'Monto inválido.' }, 400);
      amountCents = Math.round(montoNum * 100);
      if (amountCents < 1000) return json({ error: 'Monto mínimo $10 MXN.' }, 400);
      if (!descripcion || !String(descripcion).trim()) return json({ error: 'Descripción requerida.' }, 400);
      desc = String(descripcion).trim();
    }

    // ── Gym: cuenta conectada + plan (para el fee) ───────────────────────────
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: gym, error: gymErr } = await db
      .from('gyms')
      .select('id, nombre, stripe_account_id, stripe_charges_enabled, subscription_plan')
      .eq('id', gymId)
      .maybeSingle();

    if (gymErr || !gym) return json({ error: 'No se encontró el gym.' }, 404);
    if (!gym.stripe_account_id) {
      return json({ error: 'Este gym no tiene Stripe conectado. Ve a Configuración → Stripe para conectar tu cuenta.' }, 400);
    }
    if (!gym.stripe_charges_enabled) {
      return json({ error: 'Tu cuenta de Stripe aún no puede aceptar cobros (completa la verificación en Stripe).' }, 400);
    }

    // ── Paquete (opcional): validar que sea DEL GYM, activo y de pago único ──
    if (pkgId) {
      const { data: pkg } = await db
        .from('packages')
        .select('id, name, price_mxn, billing_type, is_active')
        .eq('id', pkgId)
        .eq('gym_id', gymId)   // aislamiento multi-tenant: nunca un paquete de otro gym
        .maybeSingle();
      if (!pkg) return json({ error: 'Paquete no encontrado en este gym.' }, 404);
      if (pkg.is_active === false) return json({ error: 'Ese paquete está inactivo.' }, 400);
      if (pkg.billing_type === 'recurring') {
        return json({ error: 'Ese paquete es de domiciliación (cobro recurrente). Genera su link desde Domiciliación.' }, 400);
      }
      amountCents = Math.round(Number(pkg.price_mxn) * 100);
      if (!Number.isFinite(amountCents) || amountCents < 1000) {
        return json({ error: 'El precio del paquete es inválido o menor a $10 MXN.' }, 400);
      }
      desc = pkg.name;
    }

    // Fee por plan, idéntico a stripe-checkout-create: max/owner → 0, resto → 2%.
    const plan = (gym.subscription_plan || '').toLowerCase();
    const feePct = ZERO_FEE_PLANS.has(plan) ? 0 : VELUM_FEE_PCT;
    const feeCents = feePct > 0 ? Math.max(1, Math.round(amountCents * feePct)) : 0;

    const gymNombre = gym.nombre || 'Gym';
    const descriptor = sanitizeDescriptor(gymNombre);

    // ── Sesión de checkout a NIVEL PLATAFORMA (transfer al gym) ──────────────
    // metadata.source='manual_link' + gym_id + cliente + descripcion (+ package_id si el
    // cobro es de un paquete) → la rama manual_link de stripe-webhook registra el pago
    // en `pagos`; con paquete además extiende la membresía (vence + clases).
    const meta: Record<string, string> = {
      source: 'manual_link',
      gym_id: String(gymId),
      cliente: cliente_nombre || 'Cliente',
      descripcion: desc,
    };
    if (pkgId) meta.package_id = String(pkgId);
    // Cobro DIRECTO en la cuenta del gym (gym paga su fee de Stripe). Sin transfer_data/on_behalf_of.
    const paymentIntentData: Record<string, unknown> = {
      statement_descriptor: descriptor,
      metadata: { ...meta, velum_platform: 'true', velum_fee_pct: String(feePct) },
    };
    if (feeCents > 0) paymentIntentData.application_fee_amount = feeCents;

    const sessionBody: Record<string, unknown> = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'mxn',
          unit_amount: amountCents,
          product_data: {
            name: desc,
            description: `${gymNombre} — ${cliente_nombre || 'Cliente'}`,
          },
        },
      }],
      payment_intent_data: paymentIntentData,
      // /storefront-success → success-storefront.html: confirma el pago consultando
      // storefront-order-status (NO /success-payment, que es la bienvenida de registro de gym).
      success_url: `${APP_URL}/storefront-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/app`,
      metadata: meta,
      locale: 'es',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // el link expira en 30 min
    };
    if (cliente_email) sessionBody.customer_email = cliente_email;

    const session = await stripeFetch('/checkout/sessions', 'POST', sessionBody, platformSecret, gym.stripe_account_id) as {
      id: string; url: string; expires_at: number;
    };

    return json({
      ok: true,
      url: session.url,
      session_id: session.id,
      expires_at: session.expires_at,
      fee_pct: feePct,
    });
  } catch (e) {
    console.error('velum-stripe-charge:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
