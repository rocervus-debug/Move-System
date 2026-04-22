// move-checkin — Edge Function pública para check-in via QR
// Lookup por qr_token, verifica membresía, registra asistencia.
// No requiere JWT — acceso público con rate limiting básico.
// deploy: supabase functions deploy move-checkin --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.method === 'POST' ? (await req.json().catch(() => ({}))).token : null);

  if (!token) {
    return new Response(JSON.stringify({ error: 'Token requerido.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Look up client by QR token ────────────────────────────────────
  const { data: cliente, error } = await db
    .from('clientes')
    .select('id, nombre, email, estado, membresia, vence, foto_url, gym_id, qr_token')
    .eq('qr_token', token)
    .maybeSingle();

  if (error || !cliente) {
    return new Response(JSON.stringify({ error: 'QR no válido o cliente no encontrado.' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Check membership status ───────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const venceDate = cliente.vence ? new Date(cliente.vence) : null;
  const isActivo = cliente.estado === 'Activo' || cliente.estado === 'Cerrado – Ganado';
  const isVigente = venceDate ? venceDate >= today : false;
  const membershipOk = isActivo && isVigente;

  // ── Check for duplicate check-in today ───────────────────────────
  const todayStr = today.toISOString().slice(0, 10);
  const { data: existing } = await db
    .from('asistencias')
    .select('id, hora')
    .eq('cliente_id', cliente.id)
    .eq('fecha', todayStr)
    .order('created_at', { ascending: false })
    .limit(1);

  const alreadyCheckedIn = existing && existing.length > 0;
  let checkInTime = alreadyCheckedIn ? existing[0].hora : null;

  // ── Register check-in if membership valid and not already in today ─
  if (membershipOk && !alreadyCheckedIn) {
    const now = new Date();
    const hora = now.toTimeString().slice(0, 8);
    await db.from('asistencias').insert({
      cliente_id: cliente.id,
      gym_id: cliente.gym_id,
      fecha: todayStr,
      hora,
      metodo: 'qr',
    });
    checkInTime = hora;
  }

  // ── Get last 5 visits ─────────────────────────────────────────────
  const { data: historial } = await db
    .from('asistencias')
    .select('fecha, hora')
    .eq('cliente_id', cliente.id)
    .order('fecha', { ascending: false })
    .limit(5);

  return new Response(JSON.stringify({
    ok: true,
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      membresia: cliente.membresia,
      estado: cliente.estado,
      vence: cliente.vence,
      foto_url: cliente.foto_url,
    },
    membership_ok: membershipOk,
    already_checked_in: alreadyCheckedIn,
    check_in_time: checkInTime,
    vence_date: cliente.vence,
    historial: historial || [],
  }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
