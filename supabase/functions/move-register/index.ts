// move-register — Edge Function para registro de nuevos gyms
// Usa service_role para bypassear RLS en las inserciones iniciales.
// deploy: supabase functions deploy move-register --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { gymNombre, plan, nombre, email, pw_hash } = await req.json();

    // ── Basic validation ──────────────────────────────────────────────
    if (!gymNombre || !nombre || !email || !pw_hash) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      return new Response(JSON.stringify({ error: 'Correo inválido.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Init service-role client (bypasses RLS) ───────────────────────
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── 1. Check email uniqueness ─────────────────────────────────────
    const { data: existing } = await db
      .from('usuarios')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: 'Este correo ya está registrado.' }), {
        status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Generate gym slug ──────────────────────────────────────────
    const slug = gymNombre
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      .substring(0, 30)
      + '-' + Math.random().toString(36).substring(2, 6);

    const planLimits: Record<string, number> = { free: 50, basic: 200, pro: 9999 };
    const maxClientes = planLimits[plan] ?? 200;

    // ── 3. Create gym ─────────────────────────────────────────────────
    const { data: newGym, error: gymErr } = await db
      .from('gyms')
      .insert({
        nombre: gymNombre,
        slug,
        plan: plan || 'basic',
        owner_email: email.toLowerCase().trim(),
        activo: true,
        max_clientes: maxClientes,
      })
      .select('id, nombre')
      .single();

    if (gymErr || !newGym) {
      console.error('Error creando gym:', gymErr);
      return new Response(JSON.stringify({ error: 'Error creando el gym: ' + (gymErr?.message || 'desconocido') }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const gymId = newGym.id;

    // ── 4. Create admin user ──────────────────────────────────────────
    const { data: newUser, error: userErr } = await db
      .from('usuarios')
      .insert({
        nombre,
        email: email.toLowerCase().trim(),
        pw_hash,
        password: pw_hash,   // keep both columns in sync
        rol: 'admin',
        activo: true,
        gym_id: gymId,
      })
      .select('id, nombre, email, rol, gym_id')
      .single();

    if (userErr || !newUser) {
      // Rollback gym
      await db.from('gyms').delete().eq('id', gymId);
      console.error('Error creando usuario:', userErr);
      return new Response(JSON.stringify({ error: 'Error creando el usuario: ' + (userErr?.message || 'desconocido') }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── 5. Seed default gym_config ────────────────────────────────────
    const defaultConfig = [
      { key: 'gym_nombre',  value: gymNombre,     gym_id: gymId },
      { key: 'acento',      value: '#00b4d8',     gym_id: gymId },
      { key: 'tema',        value: 'dark',        gym_id: gymId },
      { key: 'moneda',      value: 'MXN',         gym_id: gymId },
      { key: 'plan',        value: plan || 'basic', gym_id: gymId },
    ];
    await db.from('gym_config').insert(defaultConfig);

    // ── 6. Return success ─────────────────────────────────────────────
    return new Response(JSON.stringify({
      ok: true,
      gym_id: gymId,
      gym_nombre: gymNombre,
      user: {
        id: newUser.id,
        nombre: newUser.nombre,
        email: newUser.email,
        rol: newUser.rol,
        gym_id: gymId,
      },
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('move-register error:', e);
    return new Response(JSON.stringify({ error: 'Error interno del servidor.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
