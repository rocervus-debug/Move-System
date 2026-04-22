// move-login — Edge Function para autenticación de MOVE Sistema Interno
// Valida credenciales, genera JWT firmado con MOVE_JWT_SECRET para RLS.
// deploy: supabase functions deploy move-login --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

  try {
    const { email, pw_hash } = await req.json();

    if (!email || !pw_hash) {
      return new Response(JSON.stringify({ error: 'Faltan campos.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Init service-role client (bypasses RLS for credential check) ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const jwtSecret   = Deno.env.get('MOVE_JWT_SECRET')!;

    if (!jwtSecret) {
      console.error('MOVE_JWT_SECRET not set');
      return new Response(JSON.stringify({ error: 'Configuración de servidor incompleta.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Look up user by email + pw_hash ────────────────────────────────
    const { data: user, error } = await db
      .from('usuarios')
      .select('id, nombre, email, rol, gym_id, activo')
      .eq('email', email.toLowerCase().trim())
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
      return new Response(JSON.stringify({ error: 'Correo o contraseña incorrectos.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Build JWT payload (Supabase RLS compatible) ────────────────────
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: 'authenticated',
      iss: 'supabase',
      iat: now,
      exp: now + 60 * 60 * 24, // 24 hours
      sub: String(user.id),
      email: user.email,
      role: 'authenticated',
      gym_id: user.gym_id,
      app_rol: user.rol,
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
