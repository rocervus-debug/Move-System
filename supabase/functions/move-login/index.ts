// move-login — v35: sanitiza el correo del lado SERVIDOR + Deno.serve nativo.
//
// INCIDENTE 12-ago-2026 (Ares Gym): el email se guardó con U+2060 (word joiner)
// invisible al pegarlo desde WhatsApp; el lookup por email exacto no encontraba
// la cuenta y devolvía 401 "Correo o contraseña incorrectos" con el correo bien
// escrito. El panel ya limpia el correo, pero esta capa protege también a la app
// nativa, a clientes viejos en caché y a cualquier integración futura.
//
// Migrado a Deno.serve nativo: deno.land/std provoca timeouts de bundling al
// desplegar (regla del manual de VELUM).
// deploy: supabase functions deploy move-login --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const MAX_ATTEMPTS   = 5;
const WINDOW_MINUTES = 15;

// Quita caracteres INVISIBLES que se cuelan al pegar (zero-width space/non-joiner/
// joiner, word joiner U+2060, BOM U+FEFF, espacio duro U+00A0) + trim + lower.
function limpiarEmail(v: unknown): string {
  return String(v ?? '')
    .replace(/[​-‍⁠﻿ ]/g, '')
    .trim()
    .toLowerCase();
}

async function hashPBKDF2(input: string): Promise<string> {
  const salt   = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = btoa(String.fromCharCode(...salt));
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(input), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMat, 256);
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `v2:${saltB64}:${hashB64}`;
}
async function verifyPBKDF2(input: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3 || parts[0] !== 'v2') return false;
    const salt = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
    const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(input), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMat, 256);
    const derived = btoa(String.fromCharCode(...new Uint8Array(bits)));
    return derived === parts[2];
  } catch { return false; }
}

async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encode = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header   = { alg: 'HS256', typ: 'JWT' };
  const sigInput = `${encode(header)}.${encode(payload)}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${sigInput}.${sigB64}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  try {
    const { email, pw_hash } = await req.json();
    if (!email || !pw_hash) return new Response(JSON.stringify({ error: 'Faltan campos.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    // v35: limpieza defensiva (antes: email.toLowerCase().trim() — no quitaba invisibles)
    const normalizedEmail = limpiarEmail(email);
    if (!normalizedEmail) return new Response(JSON.stringify({ error: 'Faltan campos.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const jwtSecret   = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
    if (!jwtSecret) return new Response(JSON.stringify({ error: 'Config server incompleta.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count: emailAttempts } = await db.from('login_attempts').select('*', { count: 'exact', head: true }).eq('email', normalizedEmail).eq('success', false).gte('attempted_at', windowStart);
    const { count: ipAttempts } = await db.from('login_attempts').select('*', { count: 'exact', head: true }).eq('ip', ip).eq('success', false).gte('attempted_at', windowStart);
    if ((emailAttempts ?? 0) >= MAX_ATTEMPTS || (ipAttempts ?? 0) >= MAX_ATTEMPTS * 2) {
      return new Response(JSON.stringify({ error: `Demasiados intentos fallidos. Espera ${WINDOW_MINUTES} minutos.`, locked: true }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: user, error } = await db.from('usuarios').select('id, nombre, email, rol, gym_id, activo, pw_version, pw_hash').eq('email', normalizedEmail).eq('activo', true).maybeSingle();
    if (error) { console.error('DB error:', error); return new Response(JSON.stringify({ error: 'Error de base de datos.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
    if (!user) {
      await db.from('login_attempts').insert({ email: normalizedEmail, ip, success: false });
      // Log interno para diagnóstico: distingue "cuenta inexistente" de "password mala".
      // La RESPUESTA sigue siendo genérica a propósito (no revelar si el correo existe).
      console.log('login_fail motivo=cuenta_no_encontrada email=' + normalizedEmail);
      return new Response(JSON.stringify({ error: 'Correo o contraseña incorrectos.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const version = user.pw_version ?? 1;
    let passwordOk = false;
    if (version >= 2 && typeof user.pw_hash === 'string' && user.pw_hash.startsWith('v2:')) {
      passwordOk = await verifyPBKDF2(pw_hash, user.pw_hash);
    } else {
      passwordOk = user.pw_hash === pw_hash;
    }
    if (!passwordOk) {
      await db.from('login_attempts').insert({ email: normalizedEmail, ip, success: false });
      console.log('login_fail motivo=password_incorrecta user_id=' + user.id);
      return new Response(JSON.stringify({ error: 'Correo o contraseña incorrectos.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (version < 2) {
      try {
        const newHash = await hashPBKDF2(pw_hash);
        await db.from('usuarios').update({ pw_hash: newHash, pw_version: 2 }).eq('id', user.id);
      } catch (e) { console.error('pw upgrade err:', e); }
    }

    if (user.gym_id) {
      const { data: gym } = await db.from('gyms').select('subscription_status').eq('id', user.gym_id).maybeSingle();
      const allowedStatuses = ['active', 'trialing', 'owner'];
      if (gym && !allowedStatuses.includes(gym.subscription_status ?? '')) {
        return new Response(JSON.stringify({ error: 'Tu suscripción no está activa.', subscription_status: gym.subscription_status }), { status: 402, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    await db.from('login_attempts').insert({ email: normalizedEmail, ip, success: true });

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: 'authenticated', iss: 'supabase', iat: now, exp: now + 60 * 60 * 24,
      sub: String(user.id), email: user.email, role: 'authenticated',
      gym_id: user.gym_id, app_rol: user.rol, pw_version: 2,
    };
    const token = await signJWT(payload, jwtSecret);
    return new Response(JSON.stringify({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, gym_id: user.gym_id, pw_version: 2 },
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('move-login error:', e);
    return new Response(JSON.stringify({ error: 'Error interno.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
