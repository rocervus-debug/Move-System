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

      const gym_codigo = (url.searchParams.get('gym')      || body.gym      || '').trim().toLowerCase();
      const numero     = parseInt(url.searchParams.get('numero') || body.numero || '0', 10);
      const password   = url.searchParams.get('pwd')       || body.password  || '';

      if (!gym_codigo || !numero || !password) {
        return new Response(JSON.stringify({ error: 'Token requerido' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: codigoRows, error: gErr } = await supabase
        .from('gym_config')
        .select('gym_id, value')
        .eq('key', 'portal_codigo')
        .ilike('value', gym_codigo);

      if (gErr || !codigoRows || codigoRows.length === 0) {
        return new Response(JSON.stringify({ error: 'Gym no encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const found_gym_id = codigoRows[0].gym_id;

      const { data: pwdRow } = await supabase
        .from('gym_config')
        .select('value')
        .eq('gym_id', found_gym_id)
        .eq('key', 'portal_password')
        .single();

      if (!pwdRow?.value || pwdRow.value !== password) {
        return new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data, error: cErr } = await supabase
        .from('clientes')
        .select('id, nombre, email, telefono, gym_id, portal_token, numero_cliente')
        .eq('gym_id', found_gym_id)
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

    // Calculate current week range (Monday – Sunday)
    const todayDate     = new Date();
    const dow           = todayDate.getDay();
    const mondayOffset  = dow === 0 ? -6 : 1 - dow;
    const monday        = new Date(todayDate);
    monday.setDate(todayDate.getDate() + mondayOffset);
    const sunday        = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const semanaInicio  = monday.toISOString().slice(0, 10);
    const semanaFin     = sunday.toISOString().slice(0, 10);

    // Gym config
    const { data: cfgRows } = await supabase
      .from('gym_config')
      .select('key, value')
      .eq('gym_id', gym_id)
      .in('key', ['gym_nombre', 'gym_logo', 'portal_codigo', 'planes_portal', 'stripe_habilitado']);

    const cfg: Record<string, string> = {};
    (cfgRows || []).forEach((r: any) => { cfg[r.key] = r.value; });

    // Pagos
    const { data: pagos } = await supabase
      .from('pagos')
      .select('id, plan, monto, fecha, vence, clases_totales, clases_usadas, notas')
      .eq('cliente', cliente.nombre)
      .eq('gym_id', gym_id)
      .neq('notas', '__sin_pago__')
      .order('fecha', { ascending: false })
      .limit(10);

    const pagosList     = pagos || [];
    const pagoReciente  = pagosList[0] || null;
    const paqueteActivo = pagosList.find((p: any) =>
      p.clases_totales && (p.clases_usadas ?? 0) < p.clases_totales
    );

    const vence         = pagoReciente?.vence || null;
    const venceDate     = vence ? new Date(vence + 'T12:00:00') : null;
    const todayD        = new Date(today + 'T12:00:00');
    const diasRestantes = venceDate
      ? Math.max(0, Math.ceil((venceDate.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24)))
      : null;
    const membresiaOk   = paqueteActivo
      ? true
      : (venceDate ? venceDate >= todayD : false);

    // Full week programs
    const { data: programasSemana } = await supabase
      .from('programas')
      .select('tipo, contenido, notas, fecha')
      .eq('gym_id', gym_id)
      .gte('fecha', semanaInicio)
      .lte('fecha', semanaFin);

    // Today derived from week data
    const programasHoy = (programasSemana || []).filter((p: any) => p.fecha === today);

    // Check-ins (last 50 for accurate streak)
    const { data: checkins } = await supabase
      .from('asistencias')
      .select('fecha, hora, metodo')
      .eq('cliente_id', cliente.id)
      .eq('gym_id', gym_id)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(50);

    // Purchasable plans from gym config
    let planes: any[] = [];
    try { planes = JSON.parse(cfg['planes_portal'] || '[]'); } catch (_) {}

    return new Response(JSON.stringify({
      cliente: {
        id:             cliente.id,
        nombre:         cliente.nombre,
        email:          cliente.email,
        tel:            cliente.telefono,
        numero_cliente: cliente.numero_cliente,
        portal_token:   cliente.portal_token,
        plan:           pagoReciente?.plan || null,
        vence,
        activo:         membresiaOk,
        diasRestantes,
        membresiaOk,
      },
      gym: {
        id:               gym_id,
        nombre:           cfg['gym_nombre']    || 'VELUM Gym',
        logo:             cfg['gym_logo']      || null,
        codigo:           cfg['portal_codigo'] || null,
        stripeHabilitado: cfg['stripe_habilitado'] === 'true',
      },
      paquete: paqueteActivo ? {
        plan:            paqueteActivo.plan,
        clasesTotal:     paqueteActivo.clases_totales,
        clasesUsadas:    paqueteActivo.clases_usadas ?? 0,
        clasesRestantes: paqueteActivo.clases_totales - (paqueteActivo.clases_usadas ?? 0),
      } : null,
      programasHoy: programasHoy.map((p: any) => ({
        tipo: p.tipo, contenido: p.contenido, notas: p.notas, fecha: p.fecha,
      })),
      programasSemana: (programasSemana || []).map((p: any) => ({
        tipo: p.tipo, contenido: p.contenido, notas: p.notas, fecha: p.fecha,
      })),
      checkins: (checkins || []).map((c: any) => ({
        fecha: c.fecha, hora: c.hora, metodo: c.metodo,
      })),
      planes,
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
