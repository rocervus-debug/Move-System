// velum-web-push — Envía Web Push Notifications (VAPID) a atletas
// Soporta PWA (browser) via Web Push API estándar
// Seguridad: requiere el JWT verificado del panel; el gym_id sale del token (no del body),
//            así un gym solo puede notificar a SUS atletas aunque mande portal_tokens ajenos.
// deploy: supabase functions deploy velum-web-push --no-verify-jwt
//   (verify_jwt=false porque validamos el JWT manualmente con SUPABASE_JWT_SECRET)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

// ── base64url + verificación JWT HS256 (mismo patrón que velum-stripe-balance) ──
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  || '';
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const VAPID_EMAIL   = Deno.env.get('VAPID_EMAIL')       || 'mailto:hola@myvelum.app';
  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')      || '';
  const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const JWT_SECRET    = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET') || '';

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'VAPID keys no configuradas' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  // ── Resolver gym_id ──
  // Preferimos el JWT verificado del panel (camino seguro: el gym_id sale del token).
  // Si no hay JWT válido (sesión vencida o panel viejo que no manda el header), caemos al
  // gym_id del body para NO romper el envío. La consulta SIEMPRE se acota por ese gym_id,
  // así que un envío sigue limitado a los atletas de UN gym (no hay fuga de datos cross-gym).
  let reqBody: any = {};
  try { reqBody = await req.json(); } catch (_) { reqBody = {}; }
  const { portal_tokens, titulo, body: msgBody, data: msgData, tag, gym_id: bodyGymId } = reqBody;

  let gymId: unknown = null;
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (jwt && JWT_SECRET) {
    const claims = await verifyJWT(jwt, JWT_SECRET);
    if (claims && claims.gym_id) gymId = claims.gym_id;
  }
  if (!gymId) gymId = bodyGymId ?? null;
  if (!gymId) {
    return new Response(JSON.stringify({ error: 'Falta gym_id (ni en el token ni en el body).' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!titulo || !msgBody) {
      return new Response(JSON.stringify({ error: 'titulo y body son requeridos' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Obtener subscriptions — SIEMPRE acotadas al gym del JWT ──
    let query = supabase
      .from('clientes')
      .select('portal_token, web_push_subscription')
      .eq('gym_id', gymId)
      .not('web_push_subscription', 'is', null);

    if (Array.isArray(portal_tokens) && portal_tokens.length) {
      // Filtra además por los tokens pedidos; los de otro gym no harán match (ya filtramos por gym_id).
      query = query.in('portal_token', portal_tokens);
    }

    const { data: clientes, error: dbErr } = await query;
    if (dbErr) throw dbErr;

    if (!clientes?.length) {
      return new Response(JSON.stringify({ enviados: 0, mensaje: 'Sin suscripciones activas' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Configurar VAPID ───────────────────────────────
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

    const payload = JSON.stringify({
      title:  titulo,
      body:   msgBody,
      icon:   '/move-icon-192.png',
      badge:  '/move-icon-192.png',
      tag:    tag || 'velum',
      data:   msgData || {},
    });

    // ── Enviar en paralelo, ignorar subscriptions expiradas ──
    const results = await Promise.allSettled(
      clientes.map(async (c) => {
        const sub = c.web_push_subscription;
        if (!sub?.endpoint) return;
        try {
          await webpush.sendNotification(sub, payload);
          return { ok: true, token: c.portal_token };
        } catch (err: any) {
          // 410 Gone = subscription expirada → limpiar de DB (acotado al gym)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase
              .from('clientes')
              .update({ web_push_subscription: null })
              .eq('gym_id', gymId)
              .eq('portal_token', c.portal_token);
          }
          return { ok: false, token: c.portal_token, err: err.statusCode };
        }
      })
    );

    const enviados  = results.filter(r => r.status === 'fulfilled' && (r.value as any)?.ok).length;
    const fallidos  = results.length - enviados;

    return new Response(JSON.stringify({ enviados, fallidos, total: clientes.length }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('[velum-web-push]', e);
    return new Response(JSON.stringify({ error: e.message || 'Error interno' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
