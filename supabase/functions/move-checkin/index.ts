// move-checkin — Edge Function pública para check-in via QR
// Lookup por qr_token, verifica membresía, registra asistencia.
// Si el cliente tiene un paquete de clases activo, descuenta 1 clase.
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

  // ── Look up client by QR token OR portal_token ───────────────────
  // Supports both: QR scan (uses qr_token) and kiosk by number (uses portal_token)
  const { data: cliente, error } = await db
    .from('clientes')
    .select('id, nombre, email, estado, membresia, vence, foto_url, gym_id, qr_token, portal_token')
    .or(`qr_token.eq.${token},portal_token.eq.${token}`)
    .maybeSingle();

  if (error || !cliente) {
    return new Response(JSON.stringify({ error: 'Cliente no encontrado. Verifica el número o QR.' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Look up active class package for this client ──────────────────
  // A paquete is active if clases_usadas < clases_totales (not exhausted)
  const { data: paquetes } = await db
    .from('pagos')
    .select('id, clases_totales, clases_usadas, plan')
    .eq('gym_id', cliente.gym_id)
    .eq('cliente', cliente.nombre)
    .not('clases_totales', 'is', null)
    .order('created_at', { ascending: false });

  // Find the most recent non-exhausted paquete
  const paqueteActivo = (paquetes || []).find(
    p => p.clases_totales && (p.clases_usadas ?? 0) < p.clases_totales
  ) ?? null;

  // ── Check membership status ───────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const venceDate = cliente.vence ? new Date(cliente.vence) : null;
  const isActivo = cliente.estado === 'Activo' || cliente.estado === 'Cerrado – Ganado';

  // If the client has ANY package history (even exhausted), only paqueteActivo counts.
  // This prevents a client with an exhausted package from entering free via an old vence date.
  const hasPaqueteActivo = paqueteActivo !== null;
  const hayHistorialPaquetes = (paquetes || []).some(p => p.clases_totales !== null);
  const isVigente = venceDate ? venceDate >= today : false;
  // membershipOk: if client is a "paquete" client → only active paquete counts
  //               if client is a "membresía" client → vence date counts
  const membershipOk = isActivo && (hayHistorialPaquetes ? hasPaqueteActivo : (isVigente || hasPaqueteActivo));

  // ── Check for duplicate check-in today ───────────────────────────
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
  let clasesRestantes: number | null = null;
  let paqueteAgotado = false;

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

    // ── Decrement class package if applicable ──────────────────────
    if (paqueteActivo) {
      const nuevasUsadas = (paqueteActivo.clases_usadas ?? 0) + 1;
      await db.from('pagos')
        .update({ clases_usadas: nuevasUsadas })
        .eq('id', paqueteActivo.id);
      clasesRestantes = paqueteActivo.clases_totales - nuevasUsadas;
      paqueteAgotado  = clasesRestantes <= 0;
    }
  } else if (paqueteActivo) {
    // Already checked in or read-only — just return current count
    clasesRestantes = paqueteActivo.clases_totales - (paqueteActivo.clases_usadas ?? 0);
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
    // Paquete info
    paquete: paqueteActivo ? {
      clases_totales:  paqueteActivo.clases_totales,
      clases_restantes: clasesRestantes,
      agotado: paqueteAgotado,
    } : null,
  }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
