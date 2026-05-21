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

## Reglas de formato — MUY IMPORTANTE:
- NUNCA uses markdown: sin asteriscos (**), sin guiones de markdown, sin #headers
- Para respuestas normales: texto plano, párrafos cortos, máximo 3 párrafos
- Cuando des un ENTRENAMIENTO, usa EXACTAMENTE este formato con SALTOS DE LÍNEA reales entre cada elemento:

CALENTAMIENTO
Trote ligero - 3 min
Movilidad dinámica - 5 min
Bodyweight squats - 2x15

TRABAJO PRINCIPAL
Sentadillas - 4x10
Press de banca - 3x8
Remo con mancuerna - 3x12

ENFRIAMIENTO
Estiramientos estáticos - 5 min

REGLAS CRÍTICAS — NO NEGOCIABLES:
- Cada sección en su PROPIA LÍNEA en MAYÚSCULAS
- Cada ejercicio en su PROPIA LÍNEA con formato: "Nombre - NxN" o "Nombre - Xs"
- NUNCA pongas todo en una sola línea
- NUNCA uses comas para separar ejercicios
- Sin emojis, sin asteriscos, sin paréntesis explicativos
- Nombres de ejercicios en español

## Comportamiento:
- Responde en español, directo y concreto
- Usa los datos reales del atleta cuando sea relevante
- Sé como un coach real: sin relleno, sin frases motivacionales vacías
- Si no tienes datos suficientes, dilo en una línea y ofrece alternativa
- Recuerda el historial completo y mantén coherencia

Máximo tokens útiles, no palabras de relleno.`;

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
        max_tokens: 900,
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
