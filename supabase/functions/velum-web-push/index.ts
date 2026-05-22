// velum-web-push — Envía Web Push Notifications (VAPID) a atletas
// Soporta PWA (browser) via Web Push API estándar
// deploy: supabase functions deploy velum-web-push --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  || '';
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const VAPID_EMAIL   = Deno.env.get('VAPID_EMAIL')       || 'mailto:hola@myvelum.app';
  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')      || '';
  const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'VAPID keys no configuradas' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    /**
     * Input esperado:
     *   { gym_id?, portal_tokens?, titulo, body, data?, tag? }
     *
     *   - Si portal_tokens[] → envía solo a esos atletas
     *   - Si gym_id (sin tokens) → envía a todos los atletas del gym
     */
    const { gym_id, portal_tokens, titulo, body: msgBody, data: msgData, tag } = body;

    if (!titulo || !msgBody) {
      return new Response(JSON.stringify({ error: 'titulo y body son requeridos' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Obtener subscriptions ──────────────────────────
    let query = supabase
      .from('clientes')
      .select('portal_token, web_push_subscription')
      .not('web_push_subscription', 'is', null);

    if (portal_tokens?.length) {
      query = query.in('portal_token', portal_tokens);
    } else if (gym_id) {
      query = query.eq('gym_id', gym_id);
    } else {
      return new Response(JSON.stringify({ error: 'Se requiere gym_id o portal_tokens' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
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
          // 410 Gone = subscription expirada → limpiar de DB
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase
              .from('clientes')
              .update({ web_push_subscription: null })
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
