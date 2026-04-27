import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      tipo,          // e.g. "Strength", "Hyrox", "Box"
      año,           // number e.g. 2026
      mes,           // 0-indexed number e.g. 3 = April
      dias_semana,   // number[] e.g. [0,2,4] (0=Mon, 6=Sun)
      equipo,
      objetivo,
      bloque,
      nivel,
      notas,
    } = await req.json();

    if (!tipo || año === undefined || mes === undefined || !Array.isArray(dias_semana)) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros: tipo, año, mes, dias_semana' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build list of dates this month that match dias_semana
    const fechas: string[] = [];
    const daysInMonth = new Date(año, mes + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(año, mes, d);
      const dow = (dt.getDay() + 6) % 7; // Mon=0, Sun=6
      if (dias_semana.includes(dow)) {
        const mm = String(mes + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        fechas.push(`${año}-${mm}-${dd}`);
      }
    }

    if (fechas.length === 0) {
      return new Response(JSON.stringify({ programas: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    const monthName = new Date(año, mes, 1)
      .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    // Map day index to Spanish name for context
    const DIAS_ES = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    const diasNombres = dias_semana.map((d: number) => DIAS_ES[d]).join(', ');

    const sesionesTotal = fechas.length;
    const semanas = Math.ceil(sesionesTotal / dias_semana.length);

    const systemPrompt = `Eres un coach de alto rendimiento especializado en programación de entrenamiento.
Creas programas progresivos, prácticos y bien estructurados para gimnasios.
Respondes SIEMPRE con JSON válido y nada más — sin texto introductorio, sin explicaciones, sin markdown extra.`;

    const userPrompt = `Genera el programa de entrenamiento de ${tipo} para ${monthName}.

CONTEXTO:
- Disciplina: ${tipo}
- Equipo disponible: ${equipo || 'Equipo estándar de gimnasio (barras, mancuernas, máquinas cardio)'}
- Bloque de entrenamiento: ${bloque || 'Base / Acumulación'}
- Nivel de clientes: ${nivel || 'Mixto'}
- Objetivo: ${objetivo || `Desarrollar capacidad en ${tipo} con progresión mensual`}
- Días de entrenamiento: ${diasNombres}
- Notas del coach: ${notas || 'Ninguna'}

FECHAS A CUBRIR (${sesionesTotal} sesiones en ${semanas} semanas):
${fechas.join('\n')}

REGLAS DE PROGRAMACIÓN:
1. Progresión lógica: semana 1 = base, semana 2 = volumen, semana 3 = intensidad, semana 4 = deload
2. Varía el ejercicio principal cada sesión
3. Cada sesión usa este formato compacto (etiquetas exactas, sin saltos de línea innecesarios):
   WARM UP: [2-3 ejercicios con duración]
   BLOQUE PRINCIPAL: [ejercicio principal + 2-3 accesorios con series×reps/carga]
   FINALIZADOR: [1 circuito o metcon de 8-12 min]
   COOL DOWN: [1-2 estiramientos clave]
4. Cada sesión: MÁXIMO 120 palabras en total — sé directo y accionable
5. "notas": enfoque de la sesión en 1 línea máximo

RESPONDE SOLO CON ESTE JSON (sin texto antes ni después):
{
  "programas": [
    {
      "fecha": "YYYY-MM-DD",
      "contenido": "contenido completo de la sesión aquí",
      "notas": "nota breve del coach"
    }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errText}`);
    }

    const aiResp = await response.json();
    const rawText = (aiResp.content?.[0]?.text || '').trim();

    // Strip possible markdown code fences
    const jsonStr = rawText
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/\s*```$/m, '')
      .trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (_) {
      // Try to extract JSON object from the response
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error('No se pudo parsear la respuesta de IA como JSON');
    }

    // Validate and filter: only return fechas that were requested
    const fechasSet = new Set(fechas);
    if (result.programas) {
      result.programas = result.programas.filter((p: { fecha: string }) => fechasSet.has(p.fecha));
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('velum-prog-generate error:', err);
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
