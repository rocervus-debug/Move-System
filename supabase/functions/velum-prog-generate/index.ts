import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateBatch(
  fechas: string[],
  tipo: string,
  equipo: string,
  bloque: string,
  nivel: string,
  objetivo: string,
  notas: string,
  plantillaEjemplo: string,
  monthName: string,
  diasNombres: string,
  ANTHROPIC_API_KEY: string,
): Promise<Array<{fecha: string; contenido: string; notas: string}>> {

  const systemPrompt = `Eres un coach de alto rendimiento con más de 15 años de experiencia programando para gimnasios boutique, CrossFit boxes y centros de entrenamiento funcional.

Tu programación es:
- PROGRESIVA: cada semana construye sobre la anterior con lógica de periodización
- ESPECÍFICA: nombres exactos de ejercicios, cargas en kg o %1RM, tiempos precisos
- PROFESIONAL: usa terminología técnica correcta (AMRAP, EMOM, tempo, RPE)
- PRÁCTICA: adaptada al equipo disponible y nivel del grupo

Respondes SIEMPRE con JSON válido y nada más — sin texto introductorio, sin explicaciones, sin markdown extra.`;

  // Build the format instruction section — use example template if provided
  const formatoSection = plantillaEjemplo && plantillaEjemplo.trim()
    ? `FORMATO OBLIGATORIO — Analiza el siguiente ejemplo y replica EXACTAMENTE su estructura, secciones, emojis y estilo. Varía SOLO los ejercicios, cargas y circuitos (nunca el formato):

--- EJEMPLO DE SESIÓN ---
${plantillaEjemplo.trim()}
--- FIN DEL EJEMPLO ---

Reglas de formato:
1. Usa las mismas secciones, en el mismo orden, con los mismos emojis/encabezados del ejemplo
2. Mantén el mismo nivel de detalle (si el ejemplo especifica %1RM, tú también debes hacerlo)
3. Respeta la longitud y estilo de redacción del ejemplo`
    : `FORMATO OBLIGATORIO POR SESIÓN — Usa exactamente estas etiquetas y un salto de línea entre secciones:

🔥 WARM UP (10 min):
[2-3 ejercicios de activación específicos, con tiempo o rondas]

💪 BLOQUE PRINCIPAL:
[Ejercicio principal: series × reps @ carga o %1RM / RPE]
[Accesorio 1: series × reps]
[Accesorio 2: series × reps]
[Accesorio 3 si aplica: series × reps]

⚡ FINALIZADOR (10-12 min):
[Tipo: AMRAP / EMOM / For Time / Chipper — descripción completa del circuito]

🧘 COOL DOWN:
[1-2 estiramientos estáticos específicos, 30-60 seg cada uno]`;

  const userPrompt = `Genera el programa de ${tipo} para las siguientes sesiones de ${monthName}.

CONTEXTO DEL GIMNASIO:
- Disciplina: ${tipo}
- Equipo disponible: ${equipo || 'Barras olímpicas, discos, mancuernas (5-40kg), kettlebells, remos, assault bike, cajas pliométricas, bandas, TRX'}
- Bloque de entrenamiento: ${bloque || 'Base / Acumulación'}
- Nivel de atletas: ${nivel || 'Mixto (principiante a avanzado)'}
- Objetivo principal: ${objetivo || `Desarrollo integral de capacidad en ${tipo} con progresión mensual`}
- Días de entrenamiento: ${diasNombres}
- Notas del coach: ${notas || 'Ninguna'}

FECHAS (${fechas.length} sesiones):
${fechas.join('\n')}

${formatoSection}

REGLAS DE CALIDAD:
1. Progresión coherente: si hay varias sesiones, que haya progresión de carga o volumen
2. Especifica cargas reales: "Back Squat 4×5 @ 75-80% 1RM" no "sentadillas con peso"
3. El finalizador debe ser variado (no siempre el mismo formato)
4. "notas": una línea con el enfoque fisiológico de la sesión (ej: "Énfasis en fuerza máxima / deload en volumen / trabajo de potencia")

RESPONDE SOLO CON ESTE JSON:
{
  "programas": [
    {
      "fecha": "YYYY-MM-DD",
      "contenido": "[sesión completa con el formato especificado arriba]",
      "notas": "Enfoque fisiológico de la sesión"
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
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const aiResp = await response.json();

  if (aiResp.stop_reason === 'max_tokens') {
    throw new Error('Respuesta truncada — reduce el número de fechas por lote');
  }

  const rawText = (aiResp.content?.[0]?.text || '').trim();

  const jsonStr = rawText
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();

  let result;
  try {
    result = JSON.parse(jsonStr);
  } catch (_) {
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        result = JSON.parse(match[0]);
      } catch (_2) {
        throw new Error(`JSON inválido. stop_reason=${aiResp.stop_reason}. Preview: ${rawText.substring(0, 300)}`);
      }
    } else {
      throw new Error(`Sin JSON en respuesta. stop_reason=${aiResp.stop_reason}. Preview: ${rawText.substring(0, 300)}`);
    }
  }

  return result.programas || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      tipo,
      año,
      mes,
      dias_semana,
      fechas: fechasDirectas, // optional: pass exact dates directly (for week generation)
      equipo,
      objetivo,
      bloque,
      nivel,
      notas,
      plantilla_ejemplo,
    } = await req.json();

    if (!tipo) {
      return new Response(JSON.stringify({ error: 'Falta parámetro: tipo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let fechas: string[] = [];

    // If fechas provided directly, use them
    if (Array.isArray(fechasDirectas) && fechasDirectas.length > 0) {
      fechas = fechasDirectas;
    } else {
      // Fallback: compute from año/mes/dias_semana
      if (año === undefined || mes === undefined || !Array.isArray(dias_semana)) {
        return new Response(JSON.stringify({ error: 'Faltan parámetros: (fechas) o (año, mes, dias_semana)' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const daysInMonth = new Date(año, mes + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(año, mes, d);
        const dow = (dt.getDay() + 6) % 7;
        if (dias_semana.includes(dow)) {
          const mm = String(mes + 1).padStart(2, '0');
          const dd = String(d).padStart(2, '0');
          fechas.push(`${año}-${mm}-${dd}`);
        }
      }
    }

    if (fechas.length === 0) {
      return new Response(JSON.stringify({ programas: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    // Get month name from first date
    const firstDate = new Date(fechas[0] + 'T12:00:00');
    const monthName = firstDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    const DIAS_ES = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    let diasNombres = '';
    if (Array.isArray(dias_semana) && dias_semana.length > 0) {
      diasNombres = dias_semana.map((d: number) => DIAS_ES[d]).join(', ');
    } else {
      // Infer from the dates
      const dows = new Set(fechas.map(f => {
        const dt = new Date(f + 'T12:00:00');
        return (dt.getDay() + 6) % 7;
      }));
      diasNombres = Array.from(dows).map((d: number) => DIAS_ES[d]).join(', ');
    }

    // Split into batches of max 5 sessions for high-quality output
    const BATCH_SIZE = 5;
    const batches: string[][] = [];
    for (let i = 0; i < fechas.length; i += BATCH_SIZE) {
      batches.push(fechas.slice(i, i + BATCH_SIZE));
    }

    const allProgramas: Array<{fecha: string; contenido: string; notas: string}> = [];
    for (const batch of batches) {
      const batchResult = await generateBatch(
        batch, tipo, equipo || '', bloque || '', nivel || '', objetivo || '', notas || '',
        plantilla_ejemplo || '',
        monthName, diasNombres, ANTHROPIC_API_KEY
      );
      allProgramas.push(...batchResult);
    }

    const fechasSet = new Set(fechas);
    const filtered = allProgramas.filter(p => fechasSet.has(p.fecha));

    return new Response(JSON.stringify({ programas: filtered }), {
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
