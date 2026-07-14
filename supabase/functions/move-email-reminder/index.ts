// move-email-reminder — Envía recordatorios de vencimiento por email (Resend)
// v17 (2026-07-14, hardening ESCUDO): antes era PÚBLICA con service role — cualquiera
// podía leer pagos/clientes de TODOS los gyms y mandar correos desde el dominio VELUM.
//   · JWT custom obligatorio (HS256 + exp) con rol admin/superadmin
//   · gym_id sale de los claims, NUNCA del body (superadmin sí puede override)
//   · gym_nombre/nombres escapados en el HTML (anti-inyección/phishing)
//   · from fijo del dominio verificado; "hoy" en hora de México
// deploy: supabase functions deploy move-email-reminder --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── JWT custom (HS256) — mismo patrón que velum-stripe-charge ──
function b64urlToStr(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}
function b64urlToBytes(b64url: string): Uint8Array {
  const s = b64urlToStr(b64url);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'HMAC', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const payload = JSON.parse(b64urlToStr(p));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// Escapar texto que se interpola en el HTML del correo
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY');
  const jwtSecret   = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');

  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
  if (!jwtSecret) {
    return new Response(JSON.stringify({ error: 'JWT secret no configurado.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  // ── Auth obligatoria: JWT del panel con rol admin/superadmin ──
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const claims = token ? await verifyJWT(token, jwtSecret) : null;
  const rol = String(claims?.app_rol || '');
  if (!claims || !['admin', 'superadmin'].includes(rol)) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    // gym_id de los CLAIMS — el body solo puede sobreescribirlo un superadmin
    const gymId = rol === 'superadmin' && body.gym_id ? Number(body.gym_id) : Number(claims.gym_id);
    if (!gymId || Number.isNaN(gymId)) {
      return new Response(JSON.stringify({ error: 'gym_id inválido en el token.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
    const dias = Math.min(Math.max(parseInt(body.dias, 10) || 7, 1), 60);

    // Nombre del gym: de la DB (no del body) — y escapado al interpolar
    const { data: cfgRow } = await db.from('gym_config')
      .select('value').eq('gym_id', gymId).eq('key', 'gym_nombre').maybeSingle();
    const gymNombre = (cfgRow?.value || body.gym_nombre || 'Tu Gym').slice(0, 80);
    // From fijo del dominio verificado; solo el display name es del gym (sin <> ni comillas)
    const fromEmail = 'noreply@myvelum.app';
    const fromName  = gymNombre.replace(/[<>"']/g, '').trim() || 'VELUM';

    // "Hoy" en hora de México (Deno corre en UTC)
    const hoyStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const hoy = new Date(hoyStr + 'T12:00:00');
    const limite = new Date(hoy); limite.setDate(hoy.getDate() + dias);
    const limiteStr = limite.toISOString().slice(0, 10);

    // El vencimiento vive en `pagos` — SIEMPRE filtrado por el gym del token.
    const { data: pagosRows, error } = await db.from('pagos')
      .select('cliente, plan, vence, gym_id')
      .eq('gym_id', gymId)
      .gte('vence', hoyStr)
      .lte('vence', limiteStr);
    if (error) throw error;

    // Un cliente puede tener varios pagos en el rango → el vencimiento más lejano gana.
    const porCliente = new Map<string, { cliente: string; plan: string; vence: string }>();
    for (const p of (pagosRows || [])) {
      if (!p.vence || !p.cliente) continue;
      const prev = porCliente.get(p.cliente);
      if (!prev || p.vence > prev.vence) porCliente.set(p.cliente, p as any);
    }
    const vencimientos = [...porCliente.values()];

    // El email está en `clientes` — por nombre + gym del token.
    const nombres = [...new Set(vencimientos.map(v => v.cliente))];
    const cliByNombre = new Map<string, string>();
    if (nombres.length) {
      const { data: cliRows } = await db.from('clientes')
        .select('nombre, email').eq('gym_id', gymId).in('nombre', nombres);
      (cliRows || []).forEach((c: any) => { if (c.email) cliByNombre.set(c.nombre, c.email); });
    }

    const conEmail = vencimientos
      .map(v => {
        const email = cliByNombre.get(v.cliente);
        return (email && email.includes('@'))
          ? { nombre: v.cliente, email, membresia: v.plan, vence: v.vence }
          : null;
      })
      .filter(Boolean) as Array<{ nombre: string; email: string; membresia: string; vence: string }>;
    let enviados = 0, errores = 0;

    for (const cliente of conEmail) {
      const venceDate = new Date(cliente.vence + 'T12:00:00');
      const diasRestantes = Math.round((venceDate.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      const urgencia = diasRestantes <= 2 ? 'Urgente' : diasRestantes <= 5 ? 'Importante' : 'Recordatorio';

      const emailBody = {
        from: `${fromName} <${fromEmail}>`,
        to: [cliente.email],
        subject: `${urgencia}: tu membresía vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} — ${fromName}`,
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
  .footer{font-size:12px;color:#9ca3af;text-align:center;margin-top:20px;}
</style></head>
<body>
<div class="card">
  <div class="header">
    <div class="gym-name">${esc(gymNombre)}</div>
    <div class="title">Membresía por vencer</div>
    <span class="badge">${esc(cliente.membresia || 'Membresía')}</span>
  </div>
  <div class="body">
    <p>Hola <strong>${esc(cliente.nombre)}</strong>,</p>
    <div class="alert">
      <strong>Tu membresía vence el ${esc(venceDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}.</strong><br>
      ${diasRestantes === 0 ? 'Vence hoy.' : `Faltan <strong>${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}</strong> para el vencimiento.`}
    </div>
    <p>Para seguir entrenando sin interrupciones, renueva tu membresía antes de que expire.</p>
    <p>Si ya renovaste, ignora este mensaje.</p>
  </div>
  <div class="footer">© ${new Date().getFullYear()} ${esc(gymNombre)} · Sistema VELUM</div>
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
