// move-email-reminder — Envía recordatorios de vencimiento por email
// Usa Resend API (gratis hasta 100 emails/día)
// Configurar: supabase secrets set RESEND_API_KEY=re_xxxx

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY');

  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada. Ve a supabase.com/dashboard/project/savzjanpydyjtrgdkllx/settings/vault' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const gymId   = body.gym_id;
    const dias    = body.dias || 7; // días antes del vencimiento
    const fromEmail = body.from_email || 'noreply@myvelum.app';
    const gymNombre = body.gym_nombre || 'Tu Gym';

    // Calcular rango de fechas
    const hoy  = new Date(); hoy.setHours(0,0,0,0);
    const limite = new Date(hoy); limite.setDate(hoy.getDate() + dias);
    const hoyStr    = hoy.toISOString().slice(0,10);
    const limiteStr = limite.toISOString().slice(0,10);

    // El vencimiento vive en `pagos` (la tabla `clientes` NO tiene estado/membresia/vence).
    let pagoQuery = db.from('pagos')
      .select('cliente, plan, vence, gym_id')
      .gte('vence', hoyStr)
      .lte('vence', limiteStr);
    if (gymId) pagoQuery = pagoQuery.eq('gym_id', gymId);

    const { data: pagosRows, error } = await pagoQuery;
    if (error) throw error;

    // Un cliente puede tener varios pagos en el rango → quedarnos con el vencimiento más reciente.
    const porCliente = new Map<string, { cliente: string; plan: string; vence: string; gym_id: any }>();
    for (const p of (pagosRows || [])) {
      if (!p.vence || !p.cliente) continue;
      const key = `${p.gym_id}::${p.cliente}`;
      const prev = porCliente.get(key);
      if (!prev || p.vence > prev.vence) porCliente.set(key, p as any);
    }
    const vencimientos = [...porCliente.values()];

    // El email está en `clientes` — lo resolvemos por nombre + gym_id.
    const nombres = [...new Set(vencimientos.map(v => v.cliente))];
    const cliByKey = new Map<string, { nombre: string; email: string; gym_id: any }>();
    if (nombres.length) {
      let cliQuery = db.from('clientes').select('nombre, email, gym_id').in('nombre', nombres);
      if (gymId) cliQuery = cliQuery.eq('gym_id', gymId);
      const { data: cliRows } = await cliQuery;
      (cliRows || []).forEach((c: any) => { if (c.email) cliByKey.set(`${c.gym_id}::${c.nombre}`, c); });
    }

    const conEmail = vencimientos
      .map(v => {
        const c = cliByKey.get(`${v.gym_id}::${v.cliente}`);
        return (c && c.email && c.email.includes('@'))
          ? { nombre: v.cliente, email: c.email, membresia: v.plan, vence: v.vence }
          : null;
      })
      .filter(Boolean) as Array<{ nombre: string; email: string; membresia: string; vence: string }>;
    let enviados = 0, errores = 0;

    for (const cliente of conEmail) {
      const venceDate = new Date(cliente.vence + 'T12:00:00');
      const diasRestantes = Math.round((venceDate.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      const urgencia = diasRestantes <= 2 ? '🚨' : diasRestantes <= 5 ? '⚠️' : '📅';

      const emailBody = {
        from: `${gymNombre} <${fromEmail}>`,
        to: [cliente.email],
        subject: `${urgencia} Tu membresía vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} — ${gymNombre}`,
        html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f9f7;margin:0;padding:20px;}
  .card{background:#fff;border-radius:16px;padding:32px;max-width:500px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,.08);}
  .header{background:linear-gradient(135deg,#0F6E56,#1D9E75);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;}
  .gym-name{font-size:13px;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:3px;text-transform:uppercase;}
  .title{font-size:28px;font-weight:800;color:#fff;margin:8px 0 4px;}
  .badge{display:inline-block;background:rgba(255,255,255,.15);border-radius:99px;padding:4px 14px;font-size:12px;color:#fff;}
  .body{font-size:15px;color:#374151;line-height:1.7;}
  .alert{background:${diasRestantes <= 2 ? '#fef2f2' : diasRestantes <= 5 ? '#fffbeb' : '#f0fdf4'};border-left:4px solid ${diasRestantes <= 2 ? '#ef4444' : diasRestantes <= 5 ? '#f59e0b' : '#10b981'};border-radius:0 8px 8px 0;padding:16px;margin:20px 0;}
  .cta{display:block;background:#1D9E75;color:#fff;text-decoration:none;border-radius:10px;padding:14px 28px;text-align:center;font-weight:700;font-size:15px;margin:24px 0;}
  .footer{font-size:12px;color:#9ca3af;text-align:center;margin-top:20px;}
</style></head>
<body>
<div class="card">
  <div class="header">
    <div class="gym-name">${gymNombre}</div>
    <div class="title">${urgencia} Membresía por vencer</div>
    <span class="badge">${cliente.membresia || 'Membresía'}</span>
  </div>
  <div class="body">
    <p>Hola <strong>${cliente.nombre}</strong>,</p>
    <div class="alert">
      <strong>Tu membresía vence el ${venceDate.toLocaleDateString('es-MX', {weekday:'long',day:'numeric',month:'long',year:'numeric'})}.</strong><br>
      ${diasRestantes === 0 ? 'Vence hoy.' : `Faltan <strong>${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}</strong> para el vencimiento.`}
    </div>
    <p>Para seguir entrenando sin interrupciones, renueva tu membresía antes de que expire.</p>
    <p>Si ya renovaste, ignora este mensaje.</p>
  </div>
  <div class="footer">© ${new Date().getFullYear()} ${gymNombre} · Sistema VELUM</div>
</div>
</body></html>`,
      };

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(emailBody),
      });

      if (res.ok) enviados++;
      else { errores++; console.error('Resend error:', await res.text()); }
    }

    return new Response(JSON.stringify({
      ok: true,
      total_clientes: conEmail.length,
      enviados,
      errores,
      mensaje: `${enviados} emails enviados de ${conEmail.length} clientes con email válido que vencen en ${dias} días`,
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
