// velum-push-send — Envía push NATIVO (iOS + Android) vía Firebase Cloud Messaging HTTP v1.
// - Un solo emisor para las dos plataformas: FCM manda a Android nativo y a iOS (subiendo
//   la llave APNs a Firebase). El token FCM del dispositivo vive en clientes.push_token.
// - Seguridad multi-tenant: el gym_id sale del JWT verificado (no del body), así un gym solo
//   puede notificar a SUS atletas aunque mande cliente_ids ajenos. Mismo patrón que velum-web-push.
// - Deno.serve NATIVO (sin deno.land/std) para no provocar timeouts de bundling al desplegar.
//
// Secret requerido (lo pone Roy en Supabase, nunca en código):
//   FIREBASE_SERVICE_ACCOUNT = JSON completo de la service account de Firebase.
//
// deploy: supabase functions deploy velum-push-send --no-verify-jwt
//   (verify_jwt=false porque validamos el JWT del panel manualmente con SUPABASE_JWT_SECRET)
//
// Body POST (JSON):
//   { cliente_ids?: number[],   // a quién; si se omite → todos los del gym con token
//     title: string, body: string,
//     data?: Record<string,string>,  // p.ej. { view: "clases" } para navegar al abrir
//     dry_run?: boolean }       // true = no envía, solo cuenta destinatarios
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── base64url helpers ──
function b64urlToStr(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}
function b64urlToBytes(b64url: string): Uint8Array {
  const s = b64urlToStr(b64url);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s));
}

// ── Verificación del JWT del panel (HS256) — gym_id del token ──
async function verifyPanelJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
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

// ── OAuth2 de Google: firma un JWT RS256 con la service account y lo cambia por access_token ──
function pemToPkcs8Bytes(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
                 .replace(/-----END PRIVATE KEY-----/, '')
                 .replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
async function getFcmAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = strToB64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = strToB64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8Bytes(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput),
  ));
  const assertion = `${signingInput}.${bytesToB64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error('OAuth FCM falló: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const JWT_SECRET   = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET') || '';
  const SA_RAW       = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '';

  if (!SA_RAW) return json({ error: 'FIREBASE_SERVICE_ACCOUNT no configurada' }, 500);
  let sa: { project_id: string; client_email: string; private_key: string };
  try { sa = JSON.parse(SA_RAW); } catch { return json({ error: 'FIREBASE_SERVICE_ACCOUNT no es JSON válido' }, 500); }

  // ── Auth: JWT del panel (staff/admin) → gym_id del token ──
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const claims = token ? await verifyPanelJWT(token, JWT_SECRET) : null;
  if (!claims) return json({ error: 'No autorizado' }, 401);
  const gymId = Number(claims.gym_id);
  const rol = String(claims.app_rol || '');
  if (!gymId || !['admin', 'staff', 'superadmin', 'coach'].includes(rol)) {
    return json({ error: 'Rol sin permiso para notificar' }, 403);
  }

  let payload: { cliente_ids?: number[]; title?: string; body?: string; data?: Record<string, string>; dry_run?: boolean };
  try { payload = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }
  const { cliente_ids, title, body, data, dry_run } = payload;
  if (!dry_run && (!title || !body)) return json({ error: 'title y body son obligatorios' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Destinatarios: SIEMPRE acotados al gym del token (aislamiento multi-tenant)
  let q = sb.from('clientes').select('id, push_token, push_platform')
            .eq('gym_id', gymId).not('push_token', 'is', null);
  if (Array.isArray(cliente_ids) && cliente_ids.length) q = q.in('id', cliente_ids);
  const { data: targets, error: qErr } = await q;
  if (qErr) return json({ error: 'Error leyendo destinatarios: ' + qErr.message }, 500);

  const recipients = (targets || []).filter((t) => t.push_token);
  if (dry_run) return json({ ok: true, dry_run: true, destinatarios: recipients.length });
  if (!recipients.length) return json({ ok: true, enviados: 0, nota: 'Sin tokens registrados' });

  // Access token de FCM (una vez por invocación)
  let accessToken: string;
  try { accessToken = await getFcmAccessToken(sa); }
  catch (e) { return json({ error: (e as Error).message }, 502); }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  let enviados = 0, fallidos = 0;
  const tokensMuertos: string[] = [];
  const errores: Array<{ code: string; msg: string }> = [];

  for (const r of recipients) {
    const message = {
      message: {
        token: r.push_token,
        notification: { title, body },
        data: data || {},
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      },
    };
    try {
      const res = await fetch(fcmUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      if (res.ok) { enviados++; }
      else {
        fallidos++;
        const err = await res.json().catch(() => ({}));
        const code = err?.error?.details?.[0]?.errorCode || err?.error?.status || String(res.status);
        if (errores.length < 3) errores.push({ code: String(code), msg: (err?.error?.message || '').slice(0, 140) });
        // Token de verdad inválido/desregistrado → limpiar. (INVALID_ARGUMENT NO se limpia:
        // suele ser un problema del mensaje/APNs, no del token.)
        if (code === 'UNREGISTERED' || code === 'NOT_FOUND' || res.status === 404) {
          tokensMuertos.push(r.push_token);
        }
      }
    } catch { fallidos++; }
  }

  // Limpieza: borrar tokens muertos (siempre acotado al gym)
  if (tokensMuertos.length) {
    await sb.from('clientes').update({ push_token: null, push_platform: null })
            .eq('gym_id', gymId).in('push_token', tokensMuertos);
  }

  return json({ ok: true, enviados, fallidos, tokens_limpiados: tokensMuertos.length, errores });
});
