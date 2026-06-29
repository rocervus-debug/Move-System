// storefront-ia-chat — v4: Aura (persona) + endurecimiento anti-abuso de costo
//   (rate-limit por IP y por sesión, honeypot, tope de nº de mensajes y longitud).
// deploy: supabase functions deploy storefront-ia-chat --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

const PRICE_IN = 1.00;
const PRICE_OUT = 5.00;
const PRICE_CACHE_READ = 0.10;

// Límites anti-abuso (el endpoint es público y llama a una API que cuesta dinero)
const MAX_MESSAGES   = 40;    // si el cliente manda más, la conversación es anómala
const KEEP_MESSAGES  = 24;    // historial que realmente mandamos a Claude
const MAX_MSG_CHARS  = 2000;  // tope por mensaje
const IA_IP_PER_HOUR   = 40;  // mensajes por IP por hora
const IA_SESS_PER_HOUR = 30;  // mensajes por sesión por hora

function getClientIP(req: Request): string {
  const h = req.headers;
  const candidate = h.get('cf-connecting-ip')
    || h.get('x-real-ip')
    || (h.get('x-forwarded-for') || '').split(',')[0];
  return ((candidate || '').trim()) || 'unknown';
}

async function checkRateLimit(db: any, key: string, max: number, windowSec: number, blockSec = 0): Promise<boolean> {
  const { data, error } = await db.rpc('check_rate_limit', {
    p_key: key, p_max_per_window: max, p_window_seconds: windowSec, p_block_seconds: blockSec,
  });
  if (error) { console.error('rate limit error:', error); return true; } // fail-open
  return data === true;
}

function normalizeDay(d: string): string {
  const s = (d || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s === 'lunes') return 'Lunes';
  if (s === 'martes') return 'Martes';
  if (s === 'miercoles') return 'Miércoles';
  if (s === 'jueves') return 'Jueves';
  if (s === 'viernes') return 'Viernes';
  if (s === 'sabado') return 'Sábado';
  if (s === 'domingo') return 'Domingo';
  return d || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const { slug, session_id, messages, visitor_email, visitor_phone, visitor_name, hp } = await req.json();

    // Honeypot: un bot rellena el campo oculto → respondemos neutro sin llamar a la IA.
    if (hp) {
      return new Response(JSON.stringify({ reply: 'Gracias, en un momento te atendemos.' }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (!slug || !session_id || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'slug, session_id y messages son requeridos.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (messages.length > MAX_MESSAGES) {
      return new Response(JSON.stringify({ error: 'Conversación demasiado larga. Recarga la página para empezar de nuevo.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Recortar historial + capar longitud por mensaje (controla el costo de tokens)
    const trimmed = messages.slice(-KEEP_MESSAGES).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content || '').slice(0, MAX_MSG_CHARS),
    }));

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'IA no configurada.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Rate limit por IP y por sesión ANTES de llamar a la API que cuesta dinero
    const ip = getClientIP(req);
    const [ipOk, sessOk] = await Promise.all([
      checkRateLimit(db, `sf_ia_ip:${ip}`, IA_IP_PER_HOUR, 3600, 0),
      checkRateLimit(db, `sf_ia_sess:${session_id}`, IA_SESS_PER_HOUR, 3600, 0),
    ]);
    if (!ipOk || !sessOk) {
      return new Response(JSON.stringify({ error: 'Demasiados mensajes seguidos. Intenta de nuevo en un rato.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // ── Cargar TODO el contexto del gym ──
    const { data: sf } = await db
      .from('gym_storefront')
      .select('gym_id, slug, description, highlights, address, city, state, hours_text, years_open, social_whatsapp, free_first_month, trial_class_enabled')
      .eq('slug', slug.toLowerCase()).eq('is_enabled', true).single();

    if (!sf) {
      return new Response(JSON.stringify({ error: 'Storefront no encontrado.' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: cfgRows } = await db
      .from('gym_config').select('key, value')
      .eq('gym_id', sf.gym_id).in('key', ['gym_nombre', 'gym_tagline']);
    const cfg: Record<string, string> = {};
    (cfgRows || []).forEach((r: any) => { cfg[r.key] = r.value; });
    const gymName = cfg['gym_nombre'] || 'el gym';

    // Packages
    const { data: listings } = await db
      .from('storefront_listings')
      .select('id, public_name, public_description, packages!inner(name, description, price_mxn, duration_days, num_classes, unlimited_classes)')
      .eq('gym_id', sf.gym_id).eq('is_public', true).order('sort_order', { ascending: true });

    const pkgsContext = (listings || []).map((l: any) => {
      const p = l.packages;
      const dur = p.duration_days === 1 ? '1 día' : `${p.duration_days} días`;
      const inc = p.unlimited_classes ? 'clases ilimitadas' : (p.num_classes ? `${p.num_classes} clases` : '');
      return `- listing_id ${l.id}: \"${l.public_name || p.name}\" — $${p.price_mxn} MXN · ${dur} · ${inc}`;
    }).join('\n');

    // Coaches
    const { data: coachRows } = await db
      .from('coaches').select('nombre, rol, clases')
      .eq('gym_id', sf.gym_id).eq('activo', true).limit(20);
    const coachesContext = (coachRows || []).map((c: any) =>
      `- ${c.nombre}${c.rol ? ' (' + c.rol + ')' : ''}${c.clases ? ' — imparte: ' + c.clases : ''}`
    ).join('\n');

    // Horario semanal + tipos de clase únicos
    const { data: horarios } = await db
      .from('horarios').select('dia, hora, tipo, coach_nombre, cupo')
      .eq('gym_id', sf.gym_id);

    const tiposUnicos = new Set<string>();
    const horarioByDay: Record<string, string[]> = {};
    (horarios || []).forEach((h: any) => {
      if (h.tipo) tiposUnicos.add(h.tipo);
      const dia = normalizeDay(h.dia);
      if (!horarioByDay[dia]) horarioByDay[dia] = [];
      horarioByDay[dia].push(`${h.hora || ''} ${h.tipo || ''}${h.coach_nombre ? ' (con ' + h.coach_nombre + ')' : ''}`.trim());
    });
    const tiposClase = Array.from(tiposUnicos);
    const horarioContext = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
      .filter(d => horarioByDay[d] && horarioByDay[d].length)
      .map(d => `  ${d}: ${horarioByDay[d].slice(0, 6).join(', ')}`)
      .join('\n');

    const highlightsText = Array.isArray(sf.highlights) && sf.highlights.length
      ? sf.highlights.map((h: string) => `- ${h}`).join('\n')
      : 'No especificados.';

    const location = [sf.address, sf.city, sf.state].filter(Boolean).join(', ');

    // ── System prompt: Aura, persona del equipo ──
    const systemPrompt = `Eres Aura, la asistente de ${gymName}, integrada en su página pública. Te presentas SIEMPRE como Aura (parte del equipo, con calidez humana); NUNCA te describas como \"IA\", \"bot\", \"modelo\" ni \"Coach IA\". Si te preguntan qué eres, di que eres Aura, la asistente del gym, y que estás para ayudar.

Estás hablando con un PROSPECTO que está considerando contratarse. NO es cliente todavía.

## DATOS DEL GYM:
Nombre: ${gymName}
${cfg['gym_tagline'] ? 'Tagline: ' + cfg['gym_tagline'] : ''}
${sf.description ? 'Descripción: ' + sf.description : ''}
${sf.years_open ? 'Años abierto: ' + sf.years_open : ''}
${location ? 'Ubicación: ' + location : ''}
${sf.hours_text ? 'Horario de atención: ' + sf.hours_text : ''}
${sf.trial_class_enabled ? 'Ofrece CLASE DE PRUEBA GRATIS — puedes ofrecerla.' : ''}
${sf.free_first_month ? 'PROMO ACTIVA: Primer mes GRATIS.' : ''}

## TIPOS DE CLASE QUE OFRECE EL GYM:
${tiposClase.length > 0 ? tiposClase.map(t => '- ' + t).join('\n') : 'No hay clases configuradas todavía.'}

## HORARIO SEMANAL (extracto):
${horarioContext || 'Horario no disponible.'}

## COACHES DEL EQUIPO:
${coachesContext || 'Equipo no especificado.'}

## QUÉ INCLUYE LA EXPERIENCIA:
${highlightsText}

## PAQUETES DISPONIBLES (precios reales MXN):
${pkgsContext || 'No hay paquetes públicos.'}

## TU OBJETIVO:
1. Conocer la meta del prospecto (perder peso, ganar fuerza, condición, deporte específico)
2. Conocer su nivel actual y disponibilidad semanal
3. Recomendar EL tipo de clase y paquete que mejor le encaje (usa nombres EXACTOS)
4. Resolver dudas con info real del gym
5. Cerrar suavemente hacia la compra

## REGLAS DE FORMATO:
- Respuestas CORTAS: máximo 3 oraciones por mensaje
- Sin markdown (sin **, sin #, sin emojis exagerados)
- Español MX, tú (no usted)

## REGLAS CRÍTICAS — NO NEGOCIABLES:
- NUNCA inventes tipos de clase que no estén en la lista de arriba. Si el gym no ofrece CrossFit y el usuario pregunta, dile \"No tenemos CrossFit pero tenemos [tipos reales] que cubren ese estilo\".
- NUNCA inventes precios, horarios, coaches o promociones.
- Si el usuario pregunta algo que NO tienes en este contexto (ej. ubicación específica de un local, edad mínima, etc.), dile: \"Para esa info específica te recomiendo contactar al gym directamente${sf.social_whatsapp ? ' por WhatsApp' : ''}\"
- Cuando recomiendes un paquete, usa el nombre EXACTO de la lista
- NO uses palabras hype \"¡Increíble!\" \"¡Excelente!\" \"¡Genial!\"

Si el prospecto quiere comprar, dile que puede dar click al botón \"Reservar\" del paquete recomendado en la página.${sf.trial_class_enabled ? ' O si prefiere probar antes, hay un botón \"Reservar clase gratis\" arriba.' : ''}`;

    // ── Llamar Claude API (usa el historial recortado) ──
    const claudeMessages = trimmed;
    const t0 = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return new Response(JSON.stringify({ error: 'Error con el servicio de IA.' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const data = await response.json();
    const reply: string = data.content?.[0]?.text || 'No pude responder. Intenta de nuevo.';
    const usage = data.usage || {};
    const tokensIn = usage.input_tokens || 0;
    const tokensOut = usage.output_tokens || 0;
    const tokensCached = usage.cache_read_input_tokens || 0;
    const costUSD = (tokensIn / 1_000_000) * PRICE_IN + (tokensCached / 1_000_000) * PRICE_CACHE_READ + (tokensOut / 1_000_000) * PRICE_OUT;

    // Detectar listing recomendado
    let recommendedListingId: number | null = null;
    if (listings && listings.length) {
      for (const l of listings as any[]) {
        const name = l.public_name || l.packages.name;
        if (name && reply.toLowerCase().includes(name.toLowerCase())) {
          recommendedListingId = l.id;
          break;
        }
      }
    }

    // Persistir (historial recortado para no inflar la fila)
    const fullMessages = [...trimmed, { role: 'assistant', content: reply, ts: new Date().toISOString() }];
    const { data: existing } = await db
      .from('ia_conversations_public')
      .select('id, total_input_tokens, total_cached_tokens, total_output_tokens, estimated_cost_usd')
      .eq('session_id', session_id).eq('gym_id', sf.gym_id).maybeSingle();

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
      await db.from('ia_conversations_public').update({
        messages: fullMessages,
        total_input_tokens: (existing.total_input_tokens || 0) + tokensIn,
        total_cached_tokens: (existing.total_cached_tokens || 0) + tokensCached,
        total_output_tokens: (existing.total_output_tokens || 0) + tokensOut,
        estimated_cost_usd: Number((existing.estimated_cost_usd || 0)) + costUSD,
        listing_recommended: recommendedListingId,
        last_message_at: new Date().toISOString(),
        visitor_email: visitor_email || undefined,
        visitor_phone: visitor_phone || undefined,
        visitor_name: visitor_name || undefined,
      }).eq('id', existing.id);
    } else {
      const { data: created } = await db.from('ia_conversations_public').insert({
        gym_id: sf.gym_id, session_id, messages: fullMessages,
        total_input_tokens: tokensIn, total_cached_tokens: tokensCached,
        total_output_tokens: tokensOut, estimated_cost_usd: costUSD,
        listing_recommended: recommendedListingId,
        visitor_email, visitor_phone, visitor_name,
      }).select('id').single();
      conversationId = created?.id || '';
    }

    return new Response(JSON.stringify({
      reply,
      recommended_listing_id: recommendedListingId,
      conversation_id: conversationId,
      class_types: tiposClase,
      latencyMs: Date.now() - t0,
      usage: { in: tokensIn, out: tokensOut, cached: tokensCached, cost_usd: costUSD.toFixed(5) },
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('storefront-ia-chat error:', err);
    return new Response(JSON.stringify({ error: 'Error interno.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
