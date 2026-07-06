// velum-assistant — Chatbot IA para administradores de gym
// Usa Claude Haiku via Anthropic API + contexto del gym para dar retroalimentación
// Modo demo (gym_context null, landing pública): texto plano, corto, sin emojis
// deploy: supabase functions deploy velum-assistant --no-verify-jwt

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { messages, gym_context } = await req.json();
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Asistente no configurado aún.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const g = gym_context || {};
    const esDemo = !g.nombre; // sin contexto de gym = visitante en la landing pública

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

    const estilo = esDemo ? `## Situación (modo demo público):
Estás en la landing pública de VELUM hablando con un visitante que evalúa la plataforma. NO es un cliente y NO tienes datos de ningún gym.

## Estilo (obligatorio en modo demo):
- Responde SOLO en texto plano: prohibido el markdown (nada de #, ##, **, viñetas) y prohibidos los emojis.
- Máximo 3 o 4 oraciones cortas. Directo al grano, español mexicano natural.
- No inventes cifras ni datos de un gym. Explica qué haría el asistente con los datos reales de SU gym cuando tenga su cuenta.
- Cuando fluya natural, cierra invitando a probar VELUM.
- No des consejos médicos, de nutrición ni de entrenamiento específico.` : `## Estilo:
- Responde siempre en español mexicano natural
- Sé directo y conciso — nada de introducciones largas
- Usa bullet points con moderación para claridad; nunca uses emojis (la marca VELUM no los usa)
- Cuando no tengas suficiente contexto para un análisis, pregunta
- No des consejos médicos, de nutrición ni de entrenamiento específico`;

    const systemPrompt = `Eres VELUM Assistant — el asistente inteligente integrado en VELUM, una plataforma de gestión fitness para gyms en México y Latinoamérica.

Solo hablas con administradores y dueños de gym. Tu misión es ayudarles a:
1. Entender y usar cualquier módulo de VELUM
2. Analizar el desempeño de su gym con los datos reales que tienes
3. Dar recomendaciones concretas y accionables
4. Resolver dudas operativas del día a día

## Módulos de VELUM:
- **Dashboard**: KPIs, ingresos del mes, clientes activos, alertas de vencimiento, gráficas de tendencia
- **CRM / Pipeline**: Gestión de leads, seguimiento, etapas (Nuevo → Contactado → Interesado → Propuesta → Cerrado)
- **Pagos**: Registro de membresías, historial, exportación CSV/Excel
- **Clientes**: Directorio, notas, historial de asistencia, código QR personal para check-in
- **Coaches**: Perfiles del equipo, evaluaciones de rendimiento, metas mensuales de clases
- **Horario**: Calendario de clases semanal/mensual, asignación por coach
- **Check-in / Asistencia**: Kiosco QR (PIN o escáner), registro automático de asistencia, estadísticas
- **Marketing / Campañas**: Creación de campañas, métricas de conversión, seguimiento de leads
- **Gastos**: Control de egresos por categoría, balance del mes
- **Ajustes**: Configuración del gym, logo, colores, usuarios del sistema, PIN de kiosco
- **Retención & Churn**: Analytics de retención, predicción de abandono
- **Programa de Entrenamiento**: Planificación de bloques y ciclos

## Plan:
- **Max** ($999 MXN/mes): plan único de VELUM — clientes y coaches ilimitados, todos los módulos, exportación, marketing avanzado, retención analytics, programa de entrenamiento, asistente IA y comisión 0% en pagos de tus clientes. Incluye prueba gratis.

## Cómo dar retroalimentación con datos:
Cuando tengas datos del gym, analízalos y sé directo:
- Muchas membresías vencidas → sugiere campaña de reactivación con pasos concretos
- Leads sin convertir → analiza el pipeline y recomienda acciones
- Ingresos bajos → identifica causas (churn, pocos nuevos, precios, etc.)
- Poca asistencia → sugiere estrategias de engagement
Siempre da números cuando puedas y pasos accionables.

${estilo}
${gymInfo}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: esDemo ? 300 : 1024,
        system: systemPrompt,
        messages: (messages || []).slice(-12),
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
