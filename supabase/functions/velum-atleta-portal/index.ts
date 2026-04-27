import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    let cliente: any = null;

    // ── MODE 1: Token (magic link) ──────────────────────────────────
    const token = url.searchParams.get('token');
    if (token) {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, email, telefono, gym_id, portal_token, numero_cliente')
        .eq('portal_token', token)
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Portal no encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      cliente = data;
    }

    // ── MODE 2: Login (gym_codigo + numero_cliente + password) ───────
    if (!cliente) {
      let body: any = {};
      try { body = await req.json(); } catch (_) {}

      const gym_codigo    = (url.searchParams.get('gym')      || body.gym      || '').trim().toLowerCase();
      const numero        = parseInt(url.searchParams.get('numero') || body.numero || '0', 10);
      const password      = url.searchParams.get('pwd')       || body.password  || '';

      if (!gym_codigo || !numero || !password) {
        return new Response(JSON.stringify({ error: 'Token requerido' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Find gym by portal_codigo
      const { data: gymRow, error: gErr } = await supabase
        .from('gym_config')
        .select('gym_id, portal_password, portal_codigo')
        .ilike('portal_codigo', gym_codigo)
        .single();

      if (gErr || !gymRow) {
        return new Response(JSON.stringify({ error: 'Gym no encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Validate password
      if (!gymRow.portal_password || gymRow.portal_password !== password) {
        return new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Find client by numero_cliente within this gym
      const { data, error: cErr } = await supabase
        .from('clientes')
        .select('id, nombre, email, telefono, gym_id, portal_token, numero_cliente')
        .eq('gym_id', gymRow.gym_id)
        .eq('numero_cliente', numero)
        .single();

      if (cErr || !data) {
        return new Response(JSON.stringify({ error: 'Número de socio no encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      cliente = data;
    }

    // ── BUILD PORTAL RESPONSE ────────────────────────────────────────
    const gym_id = cliente.gym_id;
    const today  = new Date().toISOString().slice(0, 10);

    const { data: gymCfg } = await supabase
      .from('gym_config')
      .select('gym_nombre, gym_logo, portal_codigo')
      .eq('gym_id', gym_id)
      .single();

    const { data: pagos } = await supabase
      .from('pagos')
      .select('id, plan, monto, fecha, vence, clases_totales, clases_usadas, notas')
      .eq('cliente', cliente.nombre)
      .eq('gym_id', gym_id)
      .neq('notas', '__sin_pago__')
      .order('fecha', { ascending: false })
      .limit(10);

    const pagosList    = pagos || [];
    const pagoReciente = pagosList[0] || null;
    const paqueteActivo = pagosList.find((p: any) =>
      p.clases_totales && (p.clases_usadas ?? 0) < p.clases_totales
    );

    const vence     = pagoReciente?.vence || null;
    const venceDate = vence ? new Date(vence + 'T12:00:00') : null;
    const todayDate = new Date(today + 'T12:00:00');
    const diasRestantes = venceDate
      ? Math.max(0, Math.ceil((venceDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)))
      : null;
    const membresiaOk = paqueteActivo
      ? true
      : (venceDate ? venceDate >= todayDate : false);

    const { data: programasHoy } = await supabase
      .from('programas')
      .select('tipo, contenido, notas')
      .eq('gym_id', gym_id)
      .eq('fecha', today);

    const { data: checkins } = await supabase
      .from('asistencias')
      .select('fecha, hora, metodo')
      .eq('cliente_id', cliente.id)
      .eq('gym_id', gym_id)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(10);

    return new Response(JSON.stringify({
      cliente: {
        id:             cliente.id,
        nombre:         cliente.nombre,
        email:          cliente.email,
        tel:            cliente.telefono,
        numero_cliente: cliente.numero_cliente,
        plan:           pagoReciente?.plan || null,
        vence,
        activo:         membresiaOk,
        diasRestantes,
        membresiaOk,
      },
      gym: {
        nombre:  gymCfg?.gym_nombre   || 'VELUM Gym',
        logo:    gymCfg?.gym_logo     || null,
        codigo:  gymCfg?.portal_codigo || null,
      },
      paquete: paqueteActivo ? {
        plan:            paqueteActivo.plan,
        clasesTotal:     paqueteActivo.clases_totales,
        clasesUsadas:    paqueteActivo.clases_usadas ?? 0,
        clasesRestantes: paqueteActivo.clases_totales - (paqueteActivo.clases_usadas ?? 0),
      } : null,
      programasHoy: (programasHoy || []).map((p: any) => ({
        tipo:     p.tipo,
        contenido: p.contenido,
        notas:    p.notas,
      })),
      checkins: (checkins || []).map((c: any) => ({
        fecha:  c.fecha,
        hora:   c.hora,
        metodo: c.metodo,
      })),
      generadoEn: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('velum-atleta-portal error:', err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
