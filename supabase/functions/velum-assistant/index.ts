// velum-assistant — Chatbot IA para administradores de gym
// Usa Claude Haiku via Anthropic API + contexto del gym para dar retroalimentación
// deploy: supabase functions deploy velum-assistant --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { messages, gym_context } = await req.json();
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Asistente no configurado aún.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Contexto del gym actual ──────────────────────────────────────────
    const g = gym_context || {};
    const gymInfo = g.nombre ? `
## Datos actuales de ${g.nombre}:
- Plan activo: ${g.plan || 'Max'}
- Clientes activos (membresía vigente): ${g.clientes_activos ?? 0}
- Total clientes en sistema: ${g.total_clientes ?? 0}
- Coaches registrados: ${g.coaches ?? 0}
- Ingresos del mes en curso: $${g.ingresos_mes?.toLocaleString('es-MX') ?? 0} MXN
- Membresías que vencen en los próximos 7 días: ${g.vencimientos_proximos ?? 0}
- Membresías ya vencidas: ${g.membresias_vencidas ?? 0}
- Leads nuevos este mes: ${g.leads_mes ?? 0}
- Leads en pipeline activo: ${g.leads_total ?? 0}
` : '';

    // ── System prompt ────────────────────────────────────────────────────
    const systemPrompt = `Eres VELUM Assistant — el asistente inteligente integrado en VELUM, una plataforma de gestión fitness para gyms en México y Latinoamérica.

Solo hablas con administradores y dueños de gym. Tu misión es ayudarles a:
1. Entender y usar cualquier módulo de VELUM
2. Analizar el desempeño de su gym con los datos reales que tienes
3. Dar recomendaciones concretas y accionables
4. Resolver dudas operativas del día a día

## Módulos de VELUM:
- **Dashboard**: KPIs, ingresos del mes, clientes activos, alertas de vencimiento, gráficas de tendencia
- **CRM / Pipeline**: Gestión de leads, seguimiento, etapas (Nuevo → Contactado → Interesado → Propuesta → Cerrado)
- **Pagos**: Registro de membresías, historial, exportación CSV/Excel (solo plan Max)
- **Clientes**: Directorio, notas, historial de asistencia, código QR personal para check-in
- **Coaches**: Perfiles del equipo, evaluaciones de rendimiento, metas mensuales de clases
- **Horario**: Calendario de clases semanal/mensual, asignación por coach
- **Check-in / Asistencia**: Kiosco QR (PIN o escáner), registro automático de asistencia, estadísticas
- **Marketing / Campañas**: Creación de campañas, métricas de conversión, seguimiento de leads
- **Gastos**: Control de egresos por categoría, balance del mes
- **Ajustes**: Configuración del gym, logo, colores, usuarios del sistema, PIN de kiosco
- **Retención & Churn** (solo Max): Analytics de retención, predicción de abandono
- **Programa de Entrenamiento** (solo Max): Planificación de bloques y ciclos

## Planes:
- **Pro** ($599 MXN/mes): Hasta 100 clientes, 3 coaches, funciones básicas
- **Max** ($999 MXN/mes): Clientes ilimitados, coaches ilimitados, exportación, marketing avanzado, retención analytics, programa de entrenamiento

## Cómo dar retroalimentación con datos:
Cuando tengas datos del gym, analízalos y sé directo:
- Muchas membresías vencidas → sugiere campaña de reactivación con pasos concretos
- Leads sin convertir → analiza el pipeline y recomienda acciones
- Ingresos bajos → identifica causas (churn, pocos nuevos, precios, etc.)
- Poca asistencia → sugiere estrategias de engagement
Siempre da números cuando puedas y pasos accionables.

## Estilo:
- Responde siempre en español mexicano natural
- Sé directo y conciso — nada de introducciones largas
- Usa bullet points y emojis moderadamente para claridad
- Cuando no tengas suficiente contexto para un análisis, pregunta
- No des consejos médicos, de nutrición ni de entrenamiento específico
${gymInfo}`;

    // ── Llamada a Anthropic API ──────────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: (messages || []).slice(-12), // últimos 12 mensajes de contexto
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return new Response(JSON.stringify({ error: 'Error al contactar el asistente. Intenta de nuevo.' }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'No pude generar una respuesta.';

    return new Response(JSON.stringify({ reply }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('velum-assistant error:', e);
    return new Response(JSON.stringify({ error: 'Error interno. Intenta de nuevo.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
