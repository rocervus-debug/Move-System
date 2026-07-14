// move-checkin — Edge Function pública para check-in via QR
// Lookup por qr_token o portal_token, verifica membresía desde pagos, registra asistencia.
// Si el cliente tiene un paquete de clases activo, descuenta 1 clase.
// No requiere JWT — acceso público con rate limiting básico.
// deploy: supabase functions deploy move-checkin --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.method === 'POST' ? (await req.json().catch(() => ({}))).token : null);

  if (!token) {
    return new Response(JSON.stringify({ error: 'Token requerido.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // El token se interpola en un filtro .or() de PostgREST; validamos el formato (alfanumérico,
  // guion y guion bajo) para que no pueda inyectar condiciones extra (',', '.', '(', ')').
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(token))) {
    return new Response(JSON.stringify({ error: 'Token inválido.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Look up client by QR token OR portal_token ───────────────────
  // NOTE: clientes table has: id, nombre, email, gym_id, qr_token, portal_token
  //       NO estado/membresia/vence/foto_url — those come from pagos
  const { data: cliente, error } = await db
    .from('clientes')
    .select('id, nombre, email, gym_id, qr_token, portal_token')
    .or(`qr_token.eq.${token},portal_token.eq.${token}`)
    .maybeSingle();

  if (error || !cliente) {
    return new Response(JSON.stringify({ error: 'Cliente no encontrado. Verifica el número o QR.' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Look up pagos for membership status and class packages ─────────
  const { data: pagos } = await db
    .from('pagos')
    .select('id, clases_totales, clases_usadas, plan, vence, monto')
    .eq('gym_id', cliente.gym_id)
    .eq('cliente', cliente.nombre)
    .order('created_at', { ascending: false })
    .limit(20);

  const pagosList = pagos || [];

  // ── Regla de acceso (fix 2026-07-14, reporte de Krajo) ─────────────
  // Un pago da acceso SOLO si:
  //   · membresía por tiempo (sin clases_totales): vence >= hoy
  //   · paquete de clases: quedan clases Y (sin vence O vence >= hoy)
  // Antes, tener clases sin usar daba acceso aunque la fecha ya hubiera
  // vencido — planes tipo "Mensual 3 días x semana" (12 clases + vence)
  // dejaban entrar a gente vencida.
  // "Hoy" en hora de México — Deno corre en UTC: a partir de las 18:00 (UTC-6)
  // la fecha UTC ya es mañana → negaba acceso vespertino a quien vence hoy y
  // guardaba asistencias con fecha corrida.
  const ahora = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
  // Ancla a mediodía igual que vence+'T12:00:00' → comparación puramente de fecha
  const today = new Date(todayStr + 'T12:00:00');
  const noVencido = (p: any) => {
    if (!p.vence) return true;
    const d = new Date(p.vence + 'T12:00:00');
    return !isNaN(d.getTime()) && d >= today;
  };

  // Paquete válido más reciente: con clases restantes y no vencido por fecha
  const paqueteActivo = pagosList.find(
    (p: any) => p.clases_totales && (p.clases_usadas ?? 0) < p.clases_totales && noVencido(p)
  ) ?? null;

  // Membresía por tiempo vigente (pagos sin conteo de clases)
  const membresiaVigente = pagosList.some(
    (p: any) => !p.clases_totales && p.vence && noVencido(p)
  );

  const membershipOk = paqueteActivo !== null || membresiaVigente;

  // Vence para mostrar en el kiosco: el del pago más reciente con fecha
  const pagoConVence = pagosList.find((p: any) => p.vence) ?? null;
  const vence        = pagoConVence?.vence ?? null;

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
    // Hora local de México (antes toTimeString() en UTC: 8:22am quedaba como 14:22)
    const hora = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date());
    await db.from('asistencias').insert({
      cliente_id: cliente.id,
      gym_id:     cliente.gym_id,
      fecha:      todayStr,
      hora,
      metodo:     'qr',
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
      id:     cliente.id,
      nombre: cliente.nombre,
      vence,
      plan:   pagoConVence?.plan ?? null,
    },
    membership_ok:      membershipOk,
    already_checked_in: alreadyCheckedIn,
    check_in_time:      checkInTime,
    vence_date:         vence,
    historial:          historial || [],
    paquete: paqueteActivo ? {
      clases_totales:   paqueteActivo.clases_totales,
      clases_restantes: clasesRestantes,
      agotado:          paqueteAgotado,
    } : null,
  }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
