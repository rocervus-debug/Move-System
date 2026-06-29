// storefront-lead v3 — captura leads + rate limiting por IP + honeypot + topes de longitud
// deploy: supabase functions deploy storefront-lead --no-verify-jwt
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Topes de longitud (evitan payloads enormes / abuso de almacenamiento)
const CAP = { name: 120, email: 160, phone: 40, day: 40, time: 40, message: 2000, utm: 120 };
const clip = (v: unknown, n: number): string | null => {
  const s = (v == null ? '' : String(v)).trim();
  return s ? s.slice(0, n) : null;
};

function getClientIP(req: Request): string {
  const h = req.headers;
  const candidate = h.get('cf-connecting-ip')
    || h.get('x-real-ip')
    || (h.get('x-forwarded-for') || '').split(',')[0];
  const ip = (candidate || '').trim();
  return ip || 'unknown';
}

async function checkRateLimit(db: any, key: string, max: number, windowSec: number, blockSec = 0): Promise<boolean> {
  const { data, error } = await db.rpc('check_rate_limit', {
    p_key: key, p_max_per_window: max, p_window_seconds: windowSec, p_block_seconds: blockSec,
  });
  if (error) { console.error('rate limit error:', error); return true; } // fail-open
  return data === true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const body = await req.json();
    const {
      slug, type, name, email, phone,
      preferred_day, preferred_time, message, package_id,
      session_id, utm_source, utm_medium, utm_campaign, hp
    } = body;

    // Honeypot: un bot rellena el campo oculto → respondemos "ok" sin guardar nada.
    if (hp) {
      return new Response(JSON.stringify({ ok: true, deduplicated: true }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit: 5 leads por IP por hora
    const ip = getClientIP(req);
    const ipOk = await checkRateLimit(db, `sf_lead_ip:${ip}`, 5, 3600, 0);
    if (!ipOk) {
      return new Response(JSON.stringify({ error: 'Demasiados intentos. Intenta más tarde.' }), {
        status: 429, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (!slug || !type) {
      return new Response(JSON.stringify({ error: 'slug y type son requeridos' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (!['trial_class','more_info','newsletter','callback'].includes(type)) {
      return new Response(JSON.stringify({ error: 'type inválido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Saneado + topes de longitud
    const cName  = clip(name, CAP.name);
    const cEmail = clip(email, CAP.email);
    const cPhone = clip(phone, CAP.phone);
    const cDay   = clip(preferred_day, CAP.day);
    const cTime  = clip(preferred_time, CAP.time);
    const cMsg   = clip(message, CAP.message);

    if (cEmail && !EMAIL_RE.test(cEmail)) {
      return new Response(JSON.stringify({ error: 'El email no es válido.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (type === 'newsletter' && !cEmail) {
      return new Response(JSON.stringify({ error: 'email requerido para newsletter' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (type !== 'newsletter' && !cEmail && !cPhone) {
      return new Response(JSON.stringify({ error: 'email o teléfono requerido' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: sf } = await db
      .from('gym_storefront').select('gym_id')
      .eq('slug', String(slug).toLowerCase()).eq('is_enabled', true).single();
    if (!sf) {
      return new Response(JSON.stringify({ error: 'Storefront no encontrado' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (cEmail) {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
      const { data: dupe } = await db
        .from('storefront_leads').select('id')
        .eq('gym_id', sf.gym_id).eq('visitor_email', cEmail).eq('type', type)
        .gte('created_at', oneHourAgo).maybeSingle();
      if (dupe) {
        return new Response(JSON.stringify({ ok: true, deduplicated: true, lead_id: dupe.id }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: created, error } = await db.from('storefront_leads').insert({
      gym_id: sf.gym_id, type,
      visitor_name: cName,
      visitor_email: cEmail,
      visitor_phone: cPhone,
      preferred_day: cDay,
      preferred_time: cTime,
      message: cMsg,
      package_id: package_id || null,
      session_id: clip(session_id, 80),
      utm_source: clip(utm_source, CAP.utm),
      utm_medium: clip(utm_medium, CAP.utm),
      utm_campaign: clip(utm_campaign, CAP.utm),
    }).select('id').single();

    if (error) {
      console.error('storefront-lead insert error:', error);
      return new Response(JSON.stringify({ error: 'No se pudo guardar el lead' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, lead_id: created?.id }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('storefront-lead error:', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
