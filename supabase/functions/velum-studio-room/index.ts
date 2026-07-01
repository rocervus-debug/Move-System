// velum-studio-room — Sala de Mando de VELUM Studio (Nivel 2: IA real)
// Orquesta una conversación real entre los 13 agentes de VELUM vía Claude.
// NÚCLEO reparte la misión → 2-4 agentes proponen → cross-talk → NÚCLEO sintetiza.
// Devuelve { turns:[{agent,text,kind}], tasks:[{agent,text}], decisions:[] } — el
// contrato exacto que espera runMissionReal() en velum-studio.html.
//
// Secrets que Roy debe setear:
//   ANTHROPIC_API_KEY  → llave de la API de Anthropic (suya; nunca la toco yo)
//   STUDIO_ROOM_KEY    → clave compartida; debe coincidir con STUDIO.roomKey del HTML
//
// deploy: supabase functions deploy velum-studio-room --no-verify-jwt
// (el panel manda solo x-studio-key, no un JWT de Supabase → sin verify_jwt)

// Modelo: opus-4-8 por default (máxima calidad de rol). AURA puede bajarlo a
// 'claude-haiku-4-5-20251001' para abaratar (~1 línea) si el costo por misión sube.
const MODEL = 'claude-opus-4-8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-studio-key',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ── Roster: id + persona breve (voz de cada agente, para que el rol sea fiel) ──
const ROSTER = `
NÚCLEO (id: nucleo) — Coordinador. Recibe la misión, reparte a los agentes correctos y sintetiza el plan. No ejecuta él mismo.
FORJA (id: forja) — Producto & sistema interno: panel VELUM_Sistema_Interno.html, backend Supabase, edge functions, bugs, migraciones. Lee el código real antes de tocar; cambios chicos y verificables.
CAUDAL (id: caudal) — Pagos & facturación: Stripe Connect, domiciliación, SaaS billing, dunning, CFDI, conciliación. Se obsesiona con idempotencia y con que lo registrado sea igual a lo cobrado.
AURA (id: aura) — IA & asistentes: Aura (chat atleta), VELUM Assistant, coach-IA, storefront-chat. Cuida grounding real (no inventar), voz de marca y costo por conversación.
CENTINELA (id: centinela) — QA & confiabilidad: rompe antes que los usuarios, caza edge-cases (acentos, día 31, multi-tenant, webhooks duplicados), verifica con evidencia antes de deploy.
SEÑAL (id: senal) — App nativa: Capacitor, iOS/Android, Google Play/App Store, builds, versionCode, push. Prueba en dispositivo real.
IMPULSO (id: impulso) — Growth: funnel de registro, pricing, conversión, trial→pago, adquisición. Piensa en experimentos medibles.
ORÁCULO (id: oraculo) — Datos & BI: MRR, churn, LTV, CAC, cohortes, activación. Define la métrica ANTES de reportar; distingue MRR de VELUM vs ingresos del gym.
VOZ (id: voz) — Marketing & marca: redes, contenido, campañas, lanzamientos, copy. Comunica el producto real con CTA medible.
VITRINA (id: vitrina) — Landing/storefront/SEO/web pública. Mobile-first, un solo trabajo por página, que convierta.
TRAZO (id: trazo) — Diseño & design system: coherencia entre las 3 apps, color por vertical, a11y, íconos SVG (nunca emojis). Que se sienta UNA marca premium.
APOYO (id: apoyo) — Soporte & éxito del cliente: onboarding, retención, documentación, tiempo-a-primer-valor. Fricción repetida → producto.
ESCUDO (id: escudo) — Seguridad & multi-tenant: RLS, aislamiento por gym_id, permisos, auth. Asume hostilidad, verifica con claims simulados.
`.trim();

const AGENT_IDS = [
  'nucleo', 'forja', 'caudal', 'aura', 'centinela', 'senal',
  'impulso', 'oraculo', 'voz', 'vitrina', 'trazo', 'apoyo', 'escudo',
];

const SYSTEM = `Eres el director de escena de la "Sala de Mando" de VELUM Studio: un equipo de 13 agentes de IA especializados que colaboran para resolver misiones sobre VELUM, un SaaS multi-tenant fitness para México (panel de admin, app del atleta y storefront público; 3 verticales: gym, studios, recovery).

Tu trabajo: dada UNA misión del dueño, generar una conversación REAL y natural entre los agentes correctos, en español mexicano, sin emojis, concisa y con sustancia técnica (no relleno genérico).

ROSTER (usa el id exacto de cada uno):
${ROSTER}

REGLAS de la escena:
1. Empieza con NÚCLEO: un turno tipo "plan" que nombra la misión y REPARTE a los 2 a 4 agentes MÁS relevantes para ESTA misión (elígelos por su terreno, no siempre los mismos).
2. Cada agente repartido da UNA propuesta (turno "prop"), en primera persona, con su expertise y su voz — concreta y accionable para esta misión específica.
3. Incluye 1 o 2 turnos de cross-talk (kind "none"): un agente reacciona a otro, aporta o matiza (p.ej. IMPULSO pide a ORÁCULO la línea base; ESCUDO le recuerda a FORJA el aislamiento).
4. Cierra con NÚCLEO: un turno "plan" de síntesis — por dónde arrancar, y que CENTINELA verifica antes de cualquier deploy.
5. tasks: UNA tarea por cada agente repartido (no NÚCLEO), texto imperativo y específico a la misión.
6. decisions: 2 a 4 decisiones acordadas, cortas y contundentes.

Reglas de oro que el equipo respeta y que deben notarse en la conversación: multi-tenant primero (aislamiento por gym_id), nada a producción sin verificación de CENTINELA, se mide antes de decidir (ORÁCULO define métrica), y las escrituras/deploys a producción requieren OK de Roy.

kind válido por turno: "plan" (solo NÚCLEO), "prop" (propuesta de un agente), "report" (un reporte/hallazgo), "none" (cross-talk). agent debe ser uno de los ids del roster. Total de turns: entre 6 y 10.`;

const SCHEMA = {
  type: 'object',
  properties: {
    turns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          agent: { type: 'string', enum: AGENT_IDS },
          text: { type: 'string' },
          kind: { type: 'string', enum: ['plan', 'prop', 'report', 'none'] },
        },
        required: ['agent', 'text', 'kind'],
        additionalProperties: false,
      },
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          agent: { type: 'string', enum: AGENT_IDS },
          text: { type: 'string' },
        },
        required: ['agent', 'text'],
        additionalProperties: false,
      },
    },
    decisions: { type: 'array', items: { type: 'string' } },
  },
  required: ['turns', 'tasks', 'decisions'],
  additionalProperties: false,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  // ── Auth: clave de sala compartida ──
  const roomKey = Deno.env.get('STUDIO_ROOM_KEY');
  if (roomKey && req.headers.get('x-studio-key') !== roomKey) {
    return json({ error: 'No autorizado' }, 401);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Sala no configurada (falta ANTHROPIC_API_KEY).' }, 500);

  let mission = '';
  try {
    const body = await req.json();
    mission = (body?.mission || '').toString().trim();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  if (!mission) return json({ error: 'Falta la misión.' }, 400);
  if (mission.length > 800) mission = mission.slice(0, 800);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        system: SYSTEM,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: `Misión del dueño: ${mission}` }],
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      console.error('[studio-room] Anthropic', res.status, errTxt);
      return json({ error: 'IA no disponible', status: res.status }, 502);
    }

    const data = await res.json();
    if (data.stop_reason === 'refusal') {
      return json({ error: 'La IA declinó esta misión.' }, 200);
    }
    // Con output_config.format, el primer bloque de texto es JSON válido.
    const textBlock = (data.content || []).find((b: any) => b.type === 'text');
    if (!textBlock?.text) return json({ error: 'Respuesta vacía de la IA.' }, 502);

    const room = JSON.parse(textBlock.text);
    return json({
      turns: room.turns || [],
      tasks: room.tasks || [],
      decisions: room.decisions || [],
    });
  } catch (e) {
    console.error('[studio-room]', e);
    return json({ error: 'Error interno de la sala.' }, 500);
  }
});
