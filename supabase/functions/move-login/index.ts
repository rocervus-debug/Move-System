// move-login — Edge Function para autenticación de MOVE Sistema Interno
// v11: usa SUPABASE_JWT_SECRET para firmar (PostgREST lo verifica con la misma key → RLS gym_id funciona)
// deploy: supabase functions deploy move-login --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_ATTEMPTS   = 5;
const WINDOW_MINUTES = 15;

// ── Pure Web Crypto JWT signer (HS256) ───────────────────────────────
async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const header = { alg: 'HS256', typ: 'JWT' };
  const sigInput = `${encode(header)}.${encode(payload)}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${sigInput}.${sigB64}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  try {
    const { email, pw_hash } = await req.json();

    if (!email || !pw_hash) {
      return new Response(JSON.stringify({ error: 'Faltan campos.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // PostgREST verifica JWTs con SUPABASE_JWT_SECRET — debemos firmar con la misma key
    // para que auth.jwt() retorne nuestros claims (gym_id, app_rol) en las políticas RLS.
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');

    if (!jwtSecret) {
      console.error('JWT secret not set (SUPABASE_JWT_SECRET or MOVE_JWT_SECRET)');
      return new Response(JSON.stringify({ error: 'Configuración de servidor incompleta.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Rate limiting: check recent failed attempts ────────────────────
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

    const { count: emailAttempts } = await db
      .from('login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('email', normalizedEmail)
      .eq('success', false)
      .gte('attempted_at', windowStart);

    const { count: ipAttempts } = await db
      .from('login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('success', false)
      .gte('attempted_at', windowStart);

    if ((emailAttempts ?? 0) >= MAX_ATTEMPTS || (ipAttempts ?? 0) >= MAX_ATTEMPTS * 2) {
      return new Response(JSON.stringify({
        error: `Demasiados intentos fallidos. Espera ${WINDOW_MINUTES} minutos e intenta de nuevo.`,
        locked: true,
      }), {
        status: 429, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Validate credentials ──────────────────────────────────────────
    const { data: user, error } = await db
      .from('usuarios')
      .select('id, nombre, email, rol, gym_id, activo, pw_version')
      .eq('email', normalizedEmail)
      .eq('pw_hash', pw_hash)
      .eq('activo', true)
      .maybeSingle();

    if (error) {
      console.error('DB error:', error);
      return new Response(JSON.stringify({ error: 'Error de base de datos.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!user) {
      // Log failed attempt
      await db.from('login_attempts').insert({ email: normalizedEmail, ip, success: false });
      return new Response(JSON.stringify({ error: 'Correo o contraseña incorrectos.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Log successful attempt
    await db.from('login_attempts').insert({ email: normalizedEmail, ip, success: true });

    // ── Build JWT (Supabase RLS compatible) + pw_version ─────────────
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: 'authenticated',
      iss: 'supabase',
      iat: now,
      exp: now + 60 * 60 * 24,
      sub: String(user.id),
      email: user.email,
      role: 'authenticated',
      gym_id: user.gym_id,
      app_rol: user.rol,
      pw_version: user.pw_version ?? 1,
    };

    const token = await signJWT(payload, jwtSecret);

    return new Response(JSON.stringify({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        gym_id: user.gym_id,
        pw_version: user.pw_version ?? 1,
      },
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('move-login error:', e);
    return new Response(JSON.stringify({ error: 'Error interno.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
