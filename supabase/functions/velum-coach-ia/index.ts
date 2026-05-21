// velum-coach-ia — Coach IA personalizado para atletas del portal
// Usa Claude Haiku via Anthropic API + contexto del atleta (programa, streak, medidas, reservas)
// deploy: supabase functions deploy velum-coach-ia --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { messages, context, portal_token } = await req.json();
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Coach IA no configurado aún.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Athlete context ──────────────────────────────────────────────────
    const c = context || {};
    const nombre = c.nombre || 'atleta';
    const streak = c.streak ?? 0;
    const metaSemanal = c.meta_semanal ?? 3;
    const clasesMes = c.clases_mes ?? 0;
    const programaSemana = c.programa_semana || 'No hay programa esta semana.';
    const proximaClase = c.proxima_clase ? `Próxima clase reservada: ${c.proxima_clase}` : 'Sin próxima clase reservada.';

    // ── System prompt ────────────────────────────────────────────────────
    const systemPrompt = `Eres el Coach IA personal de ${nombre}, integrado en su portal de atletismo.

Tu misión es ayudar a ${nombre} a entrenar mejor, mantenerse motivado y alcanzar sus metas fitness. Tienes acceso a su información real:

## Datos actuales de ${nombre}:
- Racha actual: ${streak} días seguidos
- Meta semanal de clases: ${metaSemanal} clases
- Clases este mes: ${clasesMes}
- ${proximaClase}

## Programa de esta semana:
${programaSemana}

## Cómo debes comportarte:
- Responde siempre en español, de forma directa, motivadora y concisa
- Usa los datos reales del atleta cuando sea relevante
- Si te piden un entrenamiento en casa, da uno estructurado y específico (calentamiento, ejercicios con series/reps, enfriamiento)
- Si te preguntan por el programa del gym, usa el programa de esta semana que tienes arriba
- Sé como un coach real: concreto, sin relleno, sin frases motivacionales vacías
- Máximo 3-4 párrafos por respuesta, preferiblemente menos
- Si no tienes datos suficientes para algo, dilo claramente y sugiere cómo conseguirlos

Recuerda el historial completo de la conversación y mantén coherencia.`;

    // ── Build messages for Claude ────────────────────────────────────────
    const claudeMessages = (messages || []).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // ── Call Claude API ──────────────────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return new Response(JSON.stringify({ error: 'Error al conectar con el servicio de IA.' }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'No pude generar una respuesta. Intenta de nuevo.';

    return new Response(JSON.stringify({ reply }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('velum-coach-ia error:', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
