// velum-trial-nurture — v1: secuencia de activación para gyms en trial (día 0/1/3/6).
// Corre 1×/día vía pg_cron. Idempotente por (gym_id, step) en velum_trial_emails.
// Envía a través de velum-email (raw subject/html) con el service key.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-cron-secret, Authorization' };
function json(b: unknown, s = 200){ return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
function esc(s: unknown){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const BRAND = '#00D4FF';
const PANEL_URL = 'https://myvelum.app/VELUM_Sistema_Interno.html';
const WA_URL = 'https://wa.me/525666073955';

function shell(title: string, bodyHtml: string){
  return `<div style="font-family:Inter,Arial,sans-serif;background:#040C14;color:#E8EDF5;padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#08121E;border:1px solid rgba(0,212,255,.15);border-radius:16px;padding:28px;">
      <div style="font-weight:800;font-size:20px;letter-spacing:1px;color:${BRAND};margin-bottom:18px;">VELUM</div>
      <h1 style="font-size:19px;margin:0 0 14px;color:#E8EDF5;">${esc(title)}</h1>
      ${bodyHtml}
      <div style="margin-top:24px;font-size:11px;color:#3A5A6A;">Enviado por VELUM · myvelum.app · Responde a este correo o escríbenos por WhatsApp.</div>
    </div>
  </div>`;
}
const btn = (url: string, label: string) => `<a href="${esc(url)}" style="display:inline-block;margin-top:14px;background:${BRAND};color:#001828;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none;">${esc(label)}</a>`;
const p = (t: string) => `<p style="color:#7ABFCC;line-height:1.65;margin:0 0 12px;">${t}</p>`;
const wa = (texto: string, label: string) => `<a href="${WA_URL}?text=${encodeURIComponent(texto)}" style="color:${BRAND};font-weight:700;text-decoration:none;">${esc(label)}</a>`;

// Cada paso: ventana de edad del gym en días [desde, hasta) y su correo
const STEPS: Array<{ step: string; desde: number; hasta: number; build: (g: { nombre: string }) => { subject: string; html: string } }> = [
  { step: 'd0', desde: 0, hasta: 1, build: (g) => ({
    subject: `${g.nombre} ya está en VELUM — empieza con estos 3 pasos`,
    html: shell(`¡Bienvenido! Tu cuenta ya está lista`, [
      p(`Tienes 7 días para probar VELUM completo con <strong style="color:#E8EDF5;">${esc(g.nombre)}</strong>. El mejor primer día se ve así:`),
      p(`<strong style="color:#E8EDF5;">1.</strong> Carga tus primeros 10 clientes (2 minutos con el asistente guiado).<br/>
         <strong style="color:#E8EDF5;">2.</strong> Activa el check-in QR para verlos llegar.<br/>
         <strong style="color:#E8EDF5;">3.</strong> Registra tu primer pago y mira el dashboard moverse.`),
      p(`¿Tienes tu lista en Excel o en otra app? ${wa('Hola! Acabo de crear mi cuenta en VELUM y quiero migrar mi lista de clientes','Mándanosla por WhatsApp')} y la cargamos por ti hoy mismo, gratis.`),
      btn(PANEL_URL, 'Entrar a mi panel →'),
    ].join('')),
  }) },
  { step: 'd1', desde: 1, hasta: 2, build: (g) => ({
    subject: `¿Cargamos tus clientes por ti? Es gratis`,
    html: shell(`El paso que lo cambia todo`, [
      p(`Los gyms que cargan a sus clientes en las primeras 48 horas son los que ven a VELUM trabajar de verdad: vencimientos detectados, cobros registrados, asistencia visible.`),
      p(`Si no lo has hecho, no lo pelees con el teclado: ${wa('Hola! Quiero que me ayuden a cargar mis clientes a VELUM (migración gratis)','mándanos tu Excel, foto de tu libreta o lo que tengas por WhatsApp')} y nuestro equipo deja a <strong style="color:#E8EDF5;">${esc(g.nombre)}</strong> operando hoy. Sin costo.`),
      btn(PANEL_URL, 'Cargar clientes yo mismo →'),
    ].join('')),
  }) },
  { step: 'd3', desde: 3, hasta: 4, build: (g) => ({
    subject: `Lo que ${g.nombre} ya puede hacer en automático`,
    html: shell(`3 cosas que quizá no has probado`, [
      p(`<strong style="color:#E8EDF5;">El Assistant IA</strong> — pregúntale "¿cómo va mi retención?" o "¿quién está por vencer?" y responde con tus datos reales.`),
      p(`<strong style="color:#E8EDF5;">Cobros con Stripe</strong> — links de pago y mensualidades domiciliadas, con 0% de comisión de VELUM.`),
      p(`<strong style="color:#E8EDF5;">El calendario de vencimientos</strong> — ve quién se va antes de que se vaya, y escríbele a tiempo.`),
      btn(PANEL_URL, 'Probarlo ahora →'),
    ].join('')),
  }) },
  { step: 'd6', desde: 6, hasta: 8, build: (g) => ({
    subject: `Tu prueba termina pronto — decide con calma`,
    html: shell(`Quedan 2 días de prueba`, [
      p(`El día 8 se activa tu plan Max ($999 MXN/mes, todo incluido, sin contrato). Si VELUM le está sirviendo a <strong style="color:#E8EDF5;">${esc(g.nombre)}</strong>, no tienes que hacer nada.`),
      p(`Si algo no te convenció, ${wa('Hola! Estoy en mi prueba de VELUM y tengo dudas antes de que termine','cuéntanos qué faltó por WhatsApp')} — a veces es un ajuste de 5 minutos. Y si prefieres cancelar, se hace en un mensaje, sin letras chiquitas.`),
      btn(PANEL_URL, 'Entrar a mi panel →'),
    ].join('')),
  }) },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Auth: service key o secreto de cron (mismo patrón que velum-email)
  let authed = false;
  const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (bearer && bearer === SERVICE_KEY) authed = true;
  if (!authed) {
    const secret = req.headers.get('x-cron-secret') || '';
    const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').maybeSingle();
    if (cfg && secret && secret === cfg.value) authed = true;
  }
  if (!authed) return json({ error: 'unauthorized' }, 401);

  // Gyms en trial (Stripe marca 'trialing' durante los 7 días)
  const { data: gyms, error } = await db.from('gyms')
    .select('id, nombre, owner_email, created_at, subscription_status, activo')
    .eq('subscription_status', 'trialing').eq('activo', true);
  if (error) return json({ error: error.message }, 500);

  const sent: Array<{ gym_id: number; step: string }> = [];
  const skipped: Array<{ gym_id: number; reason: string }> = [];

  for (const g of gyms || []) {
    if (!g.owner_email) { skipped.push({ gym_id: g.id, reason: 'sin owner_email' }); continue; }
    const ageDays = (Date.now() - new Date(g.created_at).getTime()) / 86400000;
    for (const s of STEPS) {
      if (ageDays < s.desde || ageDays >= s.hasta) continue;
      // Idempotencia: reclamar el paso antes de enviar; 23505 = ya enviado
      const { error: insErr } = await db.from('velum_trial_emails').insert({ gym_id: g.id, step: s.step });
      if (insErr) { if (insErr.code !== '23505') skipped.push({ gym_id: g.id, reason: insErr.message }); continue; }
      const mail = s.build({ nombre: g.nombre || 'tu gym' });
      const r = await fetch(`${SUPABASE_URL}/functions/v1/velum-email`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: g.owner_email, subject: mail.subject, html: mail.html }),
      });
      if (r.ok) sent.push({ gym_id: g.id, step: s.step });
      else {
        // Si el envío falló, liberar el paso para reintentar mañana
        await db.from('velum_trial_emails').delete().eq('gym_id', g.id).eq('step', s.step);
        skipped.push({ gym_id: g.id, reason: `email ${r.status}` });
      }
    }
  }
  return json({ ok: true, revisados: (gyms || []).length, enviados: sent, saltados: skipped });
});
