// velum-cron-push — v6: recordatorios automáticos (clase de hoy + vencimiento próximo).
// Manda por DOS canales: push NATIVO (FCM, app iOS/Android) y web-push (PWA), + email en vencimiento.
// Protegido por x-cron-secret (tabla cron_config). Disparado por pg_cron (?job=class / ?job=expiry).
// Deno.serve nativo (sin deno.land/std).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── FCM (HTTP v1) — mismo patrón que velum-push-send ──
function toB64u(bytes: Uint8Array) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function s2b(s: string) { return toB64u(new TextEncoder().encode(s)); }
function pem2(pem: string) { const b = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, ''); return Uint8Array.from(atob(b), c => c.charCodeAt(0)); }
async function fcmAccessToken(sa: any): Promise<string | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const h = s2b(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const c = s2b(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const si = h + '.' + c;
    const k = await crypto.subtle.importKey('pkcs8', pem2(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, new TextEncoder().encode(si)));
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: si + '.' + toB64u(sig) }) });
    const j = await r.json();
    return j.access_token || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const secret = req.headers.get('x-cron-secret') || '';
  const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').maybeSingle();
  if (!cfg || !secret || secret !== cfg.value) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const job = url.searchParams.get('job') || 'all';
  const out: Record<string, unknown> = {};

  // Service account de Firebase para FCM
  let sa: any = null;
  try { sa = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}'); } catch { sa = null; }
  const fcmProject = sa?.project_id;
  const accessToken = (sa && sa.client_email) ? await fcmAccessToken(sa) : null;

  // Envía FCM a los clientes (por portal_token) que tengan push_token nativo.
  async function sendFcmByPortalTokens(portalTokens: string[], title: string, body: string, view: string) {
    const uniq = [...new Set(portalTokens.filter(Boolean))];
    if (!uniq.length || !accessToken || !fcmProject) return { enviados: 0, con_token: 0 };
    const { data: clis } = await db.from('clientes').select('push_token').in('portal_token', uniq).not('push_token', 'is', null);
    const tokens = [...new Set((clis || []).map((c: any) => c.push_token).filter(Boolean))];
    let enviados = 0;
    const muertos: string[] = [];
    for (const t of tokens) {
      const msg = { message: { token: t, notification: { title, body }, data: { view }, android: { priority: 'high', notification: { sound: 'default' } }, apns: { payload: { aps: { sound: 'default', badge: 1 } } } } };
      try {
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${fcmProject}/messages:send`, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
        if (r.ok) enviados++;
        else { const e = await r.json().catch(() => ({})); const code = e?.error?.details?.[0]?.errorCode || ''; if (code === 'UNREGISTERED' || code === 'NOT_FOUND') muertos.push(t); }
      } catch { /* red */ }
    }
    if (muertos.length) await db.from('clientes').update({ push_token: null, push_platform: null }).in('push_token', muertos);
    return { enviados, con_token: tokens.length };
  }
  // Web-push (PWA) — canal existente
  async function sendWebPush(portalTokens: string[], titulo: string, body: string, tag: string) {
    const uniq = [...new Set(portalTokens.filter(Boolean))];
    if (!uniq.length) return { enviados: 0 };
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/velum-web-push`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY }, body: JSON.stringify({ portal_tokens: uniq, titulo, body, tag }) });
      return await r.json().catch(() => ({}));
    } catch (e) { return { error: String((e as Error).message || e) }; }
  }
  async function sendEmail(to: string, template: string, data: Record<string, string>) {
    try { await fetch(`${SUPABASE_URL}/functions/v1/velum-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ to, template, data }) }); } catch (_) { /* noop */ }
  }

  try {
    if (job === 'expiry' || job === 'all') {
      const { data: rows } = await db.rpc('clients_expiring_in', { days: 3 });
      const list = (rows || []) as Array<{ portal_token: string; gym_id: number; email: string | null; nombre: string | null }>;
      const ptoks = list.map(r => r.portal_token);
      out.expiry_fcm = await sendFcmByPortalTokens(ptoks, 'Tu membresía vence pronto', 'Te quedan 3 días. Renueva desde la app para no perder tu lugar.', 'membresia');
      out.expiry_web = await sendWebPush(ptoks, 'Tu membresía vence pronto', 'Te quedan 3 días. Renueva desde la app para no perder tu lugar.', 'expiry');
      const withEmail = list.filter(r => r.email);
      if (withEmail.length) {
        const gymIds = [...new Set(withEmail.map(r => r.gym_id))];
        const { data: cfgRows } = await db.from('gym_config').select('gym_id, value').eq('key', 'gym_nombre').in('gym_id', gymIds);
        const gymName: Record<string, string> = {};
        (cfgRows || []).forEach((r: any) => { gymName[r.gym_id] = r.value; });
        let sent = 0;
        for (const r of withEmail) { await sendEmail(r.email as string, 'vencimiento', { nombre: r.nombre || '', gym: gymName[r.gym_id] || 'tu gym', url: `https://myvelum.app/atleta?token=${encodeURIComponent(r.portal_token)}` }); sent++; }
        out.expiry_email = { sent };
      }
    }

    if (job === 'class' || job === 'all') {
      const todayMX = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
      const { data: res } = await db.from('reservas').select('portal_token, clase_tipo, clase_hora, estado').eq('fecha', todayMX).not('portal_token', 'is', null);
      const active = (res || []).filter((r: any) => !/cancel|ausente/i.test(r.estado || ''));
      const ptoks = active.map((r: any) => r.portal_token);
      // Cuerpo genérico (una por token); el detalle de tipo/hora se personaliza cuando hay 1 sola.
      const body = 'No olvides tu clase reservada de hoy. ¡Te esperamos!';
      out.class_fcm = await sendFcmByPortalTokens(ptoks, 'Tienes clase hoy', body, 'clases');
      out.class_web = await sendWebPush(ptoks, 'Tienes clase hoy', body, 'class');
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, job, ...out }), { headers: { 'Content-Type': 'application/json' } });
});
