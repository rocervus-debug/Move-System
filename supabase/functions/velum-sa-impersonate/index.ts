// velum-sa-impersonate — Emite un JWT de "contexto" para que el SUPERADMIN opere como si
// estuviera dentro de otro gym (ver su saldo Stripe real, generar cobros, etc.).
// SOLO superadmin. El JWT emitido lleva gym_id=objetivo (así las edge functions que sacan
// el gym_id del token operan sobre el gym correcto) + trazabilidad (imp + real_gym_id).
// Deno.serve nativo. deploy: supabase functions deploy velum-sa-impersonate --no-verify-jwt --use-api
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ── base64url helpers ────────────────────────────────────────────────
function b64urlToStr(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}
function b64urlToBytes(b64url: string): Uint8Array {
  return Uint8Array.from(b64urlToStr(b64url), (c) => c.charCodeAt(0));
}

// ── Verifica el JWT HS256 del panel (firma + exp) y devuelve claims ──
async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(b64urlToStr(p));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Firma HS256 (idéntica a move-login: claims sin acentos → btoa está OK) ──
async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = { alg: 'HS256', typ: 'JWT' };
  const sigInput = `${encode(header)}.${encode(payload)}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${sigInput}.${sigB64}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const jwtSecret   = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
  if (!jwtSecret) return json({ error: 'Auth no configurada.' }, 500);

  // ── Autenticación: el solicitante debe ser SUPERADMIN (verificado por firma, no por body) ──
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'No autenticado.' }, 401);
  const claims = await verifyJWT(token, jwtSecret);
  if (!claims) return json({ error: 'Sesión inválida o expirada.' }, 401);
  if (String(claims.app_rol || '') !== 'superadmin') {
    return json({ error: 'Solo superadmin puede cambiar de contexto.' }, 403);
  }

  // ── gym objetivo ──
  let body: { target_gym_id?: number | string };
  try { body = await req.json(); } catch { return json({ error: 'Body inválido.' }, 400); }
  const gid = parseInt(String(body.target_gym_id ?? ''), 10);
  if (!gid) return json({ error: 'target_gym_id requerido.' }, 400);

  // Verificar que el gym existe (no emitir tokens para gyms inexistentes)
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: gym } = await db.from('gyms').select('id').eq('id', gid).maybeSingle();
  if (!gym) return json({ error: 'Gym no encontrado.' }, 404);

  // ── JWT de contexto: mismos claims que move-login, con gym_id=objetivo + trazabilidad ──
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'authenticated',
    iss: 'supabase',
    iat: now,
    exp: now + 60 * 60 * 3,               // 3 h — ventana corta para el contexto
    sub: String(claims.sub || ''),
    email: String(claims.email || ''),
    role: 'authenticated',
    gym_id: gid,                          // ← el gym que el superadmin está viendo
    app_rol: 'superadmin',               // sigue siendo superadmin (solo cambia el contexto)
    pw_version: claims.pw_version ?? 1,
    imp: true,                            // marca de impersonación (trazabilidad)
    real_gym_id: claims.gym_id ?? null,   // gym real de la sesión del superadmin
  };
  const newToken = await signJWT(payload, jwtSecret);
  return json({ token: newToken, gym_id: gid });
});
