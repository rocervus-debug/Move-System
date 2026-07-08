// stripe-connect-onboard — v2 (propuesta, patch mínimo de la auditoría de cobros):
//   1. Se valida `exp` del JWT (token vencido → 401); antes solo se verificaba la firma.
//   2. Se chequea el error del update a gyms tras crear la cuenta en Stripe: si falla,
//      log CLARO con el account id para rescate manual (la cuenta ya existe en Stripe
//      pero no quedó ligada en la DB; sin este log se crearía otra en el siguiente
//      intento y la primera quedaría huérfana).
//   3. Migrado a Deno.serve nativo (sin deno.land/std). Resto intacto.
// Genera link de onboarding de Stripe Connect Express para un gym.
// Si el gym no tiene stripe_account_id, lo crea primero.
// Requiere JWT admin/superadmin del gym.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const APP_URL = 'https://myvelum.app';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function stripeFetch(path: string, method: string, body?: Record<string, unknown>, secretKey?: string) {
  const params = body ? new URLSearchParams(flatten(body)).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-11-20.acacia',
    },
    body: params,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const [, p] = token.split('.');
    const pad = '='.repeat((4 - p.length % 4) % 4);
    const b64 = (p + pad).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

async function verifyJWT(token: string, secret: string): Promise<boolean> {
  try {
    const [h, p, s] = token.split('.');
    const sigInput = `${h}.${p}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const pad = '='.repeat((4 - s.length % 4) % 4);
    const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
    const sigBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(sigInput));
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
    if (!stripeSecret) return json({ error: 'STRIPE_SECRET_KEY no configurada en Supabase.' }, 500);
    if (!jwtSecret) return json({ error: 'JWT secret no configurada.' }, 500);

    // Validar JWT admin
    const auth = req.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return json({ error: 'Falta JWT.' }, 401);
    if (!await verifyJWT(token, jwtSecret)) return json({ error: 'JWT inválido.' }, 401);
    const claims = decodeJWT(token);
    if (!claims) return json({ error: 'JWT no decodificable.' }, 401);
    // Validar expiración: un token vencido no autoriza nada.
    const exp = Number(claims.exp);
    if (Number.isFinite(exp) && exp < Math.floor(Date.now() / 1000)) return json({ error: 'Sesión expirada.' }, 401);
    const gymId = claims.gym_id as number;
    const appRol = claims.app_rol as string;
    if (!gymId) return json({ error: 'Sin gym_id en JWT.' }, 401);
    if (!['admin', 'superadmin'].includes(appRol)) return json({ error: 'Solo admin/superadmin pueden conectar Stripe.' }, 403);

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Buscar gym
    const { data: gym, error: gymErr } = await db.from('gyms').select('id, nombre, stripe_account_id').eq('id', gymId).single();
    if (gymErr || !gym) return json({ error: 'Gym no encontrado.' }, 404);

    let accountId = gym.stripe_account_id;

    // Crear account si no existe
    if (!accountId) {
      const userEmail = (claims.email as string) || `gym${gymId}@velum.local`;
      const account = await stripeFetch('/accounts', 'POST', {
        type: 'express',
        country: 'MX',
        email: userEmail,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          name: gym.nombre,
          product_description: 'Gimnasio / Estudio fitness — paquetes de clases y mensualidades',
          mcc: '7997', // Membership clubs (sports, recreation, athletic), country clubs, private golf courses
        },
        metadata: { gym_id: String(gymId), velum_platform: 'true' },
        settings: {
          payouts: { schedule: { interval: 'daily' } },
        },
      }, stripeSecret) as { id: string };
      accountId = account.id;
      const { error: updErr } = await db.from('gyms').update({
        stripe_account_id: accountId,
        stripe_account_status: 'pending',
        stripe_last_sync_at: new Date().toISOString(),
      }).eq('id', gymId);
      if (updErr) {
        // La cuenta YA existe en Stripe pero no quedó ligada en la DB.
        // Log de rescate: ligar a mano gyms.stripe_account_id = <accountId> para gym <gymId>.
        console.error(`stripe-connect-onboard RESCATE MANUAL: cuenta Stripe ${accountId} creada para gym ${gymId} pero el update a gyms falló:`, updErr);
      }
    }

    // Generar Account Link de onboarding
    const link = await stripeFetch('/account_links', 'POST', {
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${APP_URL}/app#stripe-onboarding-refresh`,
      return_url: `${APP_URL}/app#stripe-onboarded`,
      collect: 'eventually_due',
    }, stripeSecret) as { url: string; expires_at: number };

    return json({ ok: true, account_id: accountId, onboarding_url: link.url, expires_at: link.expires_at });
  } catch (e) {
    console.error('stripe-connect-onboard:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
