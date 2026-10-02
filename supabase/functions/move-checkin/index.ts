// move-checkin — v29: una reserva marcada "No asistió" (que ya gastó la clase)
// pasa a "Llegó" si la persona escanea tarde; antes se trataba como llegada sin
// reserva y se cobraba dos veces.
// v28: el paquete se descuenta con la MISMA regla que la lista de
// la clase (trigger trg_paquete_consumo en reservas) y del paquete que VENCE
// PRIMERO. Antes este era el ÚNICO camino que descontaba y lo hacía del paquete
// más NUEVO: las clases del viejo se vencían sin usar.
//
// Edge Function pública para check-in via QR. Lookup por qr_token o portal_token,
// verifica membresía desde pagos, registra asistencia.
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

  const { data: pagos } = await db
    .from('pagos')
    .select('id, clases_totales, clases_usadas, plan, vence, monto')
    .eq('gym_id', cliente.gym_id)
    .eq('cliente', cliente.nombre)
    .order('created_at', { ascending: false })
    .limit(20);

  const pagosList = pagos || [];

  // "Hoy" en hora de México — Deno corre en UTC.
  const ahora = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
  const today = new Date(todayStr + 'T12:00:00');
  const noVencido = (p: any) => {
    if (!p.vence) return true;
    const d = new Date(p.vence + 'T12:00:00');
    return !isNaN(d.getTime()) && d >= today;
  };

  // El paquete lo decide la base (paquete_para_consumo): con clases, vigente y
  // el que VENCE PRIMERO. Es la misma función que usa el trigger de reservas.
  const { data: pagoIdFifo } = await db.rpc('paquete_para_consumo', {
    p_gym: cliente.gym_id, p_cliente_id: cliente.id, p_nombre: cliente.nombre, p_fecha: todayStr,
  });
  let paqueteActivo: any = null;
  if (pagoIdFifo) {
    const { data: pk } = await db.from('pagos')
      .select('id, clases_totales, clases_usadas, plan, vence').eq('id', pagoIdFifo).maybeSingle();
    paqueteActivo = pk ?? null;
  }

  const membresiaVigente = pagosList.some(
    (p: any) => !p.clases_totales && p.vence && noVencido(p)
  );

  const membershipOk = paqueteActivo !== null || membresiaVigente;

  const pagoConVence = pagosList.find((p: any) => p.vence) ?? null;
  const vence        = pagoConVence?.vence ?? null;

  const { data: existing } = await db
    .from('asistencias')
    .select('id, hora')
    .eq('cliente_id', cliente.id)
    .eq('fecha', todayStr)
    .order('created_at', { ascending: false })
    .limit(1);

  const alreadyCheckedIn = existing && existing.length > 0;
  let checkInTime = alreadyCheckedIn ? existing[0].hora : null;

  let clasesRestantes: number | null = null;
  let paqueteAgotado = false;
  let pagoConsumido: number | null = null;

  if (membershipOk && !alreadyCheckedIn) {
    const hora = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date());
    await db.from('asistencias').insert({
      cliente_id: cliente.id, gym_id: cliente.gym_id, fecha: todayStr, hora, metodo: 'qr',
    });
    checkInTime = hora;

    // ¿Tenía clase reservada hoy? Entonces el QR solo marca "llegó" y el trigger
    // de reservas descuenta. Si la dueña ya le había dado "Llegó" desde la lista,
    // la clase ya se cobró: no se descuenta otra vez.
    const { data: reservasHoy } = await db.from('reservas')
      .select('id, estado, pago_id')
      .eq('gym_id', cliente.gym_id).eq('cliente_id', cliente.id).eq('fecha', todayStr)
      .in('estado', ['reservado', 'checkin', 'ausente'])
      .order('clase_hora', { ascending: true });

    const yaCobrada = (reservasHoy || []).find((r: any) => r.estado === 'checkin');
    // 'ausente' = la marcaron "No asistió" y llegó tarde: se pasa a checkin; el
    // trigger no vuelve a cobrar porque la reserva ya trae su pago_id.
    const pendiente = (reservasHoy || []).find((r: any) => r.estado === 'reservado')
                   ?? (reservasHoy || []).find((r: any) => r.estado === 'ausente');

    if (yaCobrada) {
      pagoConsumido = yaCobrada.pago_id ?? null;
    } else if (pendiente) {
      const { data: upd } = await db.from('reservas')
        .update({ estado: 'checkin' }).eq('id', pendiente.id)
        .select('pago_id').maybeSingle();
      pagoConsumido = upd?.pago_id ?? null;
    } else if (paqueteActivo) {
      // Sin reserva (gym de piso, entra por QR): se descuenta aquí, del mismo
      // paquete que eligió la regla de la base.
      await db.from('pagos')
        .update({ clases_usadas: (paqueteActivo.clases_usadas ?? 0) + 1 })
        .eq('id', paqueteActivo.id);
      pagoConsumido = paqueteActivo.id;
    }
  }

  // Lo que se le muestra al cliente: lo que REALMENTE quedó en su paquete.
  const idMostrar = pagoConsumido ?? paqueteActivo?.id ?? null;
  if (idMostrar) {
    const { data: pk } = await db.from('pagos')
      .select('clases_totales, clases_usadas').eq('id', idMostrar).maybeSingle();
    if (pk && pk.clases_totales) {
      clasesRestantes = pk.clases_totales - (pk.clases_usadas ?? 0);
      paqueteAgotado  = clasesRestantes <= 0;
      if (paqueteActivo) paqueteActivo.clases_totales = pk.clases_totales;
    }
  }

  const { data: historial } = await db
    .from('asistencias')
    .select('fecha, hora')
    .eq('cliente_id', cliente.id)
    .order('fecha', { ascending: false })
    .limit(5);

  return new Response(JSON.stringify({
    ok: true,
    cliente: { id: cliente.id, nombre: cliente.nombre, vence, plan: pagoConVence?.plan ?? null },
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
