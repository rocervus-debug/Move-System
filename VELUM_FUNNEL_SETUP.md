# VELUM — Setup del Embudo y Backend de Ventas (Fase 5)

> Documento operativo. Configura cada parte en orden. Tiempo total: 4-6 horas (de un solo jalón) o 1-2 días en bloques.
> **(FLUJO — Funnel & Automation Agent · LAZO Growth Studio)**

---

## 🗺️ El embudo VELUM completo (de DM a cliente)

```
ETAPA 1 — ATRACCIÓN
└─ Contenido IG/FB/LinkedIn + DMs cold/warm
   ↓
ETAPA 2 — CAPTURA
└─ DM con respuesta → mover a WhatsApp
   ↓
ETAPA 3 — NUTRICIÓN
└─ Mensaje WA-01 → calificación → agenda demo
   ↓
ETAPA 4 — CONVERSIÓN
└─ Demo 20 min → oferta Founding Gyms → cierre
   ↓
ETAPA 5 — RETENCIÓN
└─ Onboarding 1-a-1 → uso → testimonio mes 1 → caso mes 3
```

| Etapa | Herramienta | Métrica clave | Target Mes 1 |
|---|---|---|---|
| 1. Atracción | IG/FB/LinkedIn orgánico | Visitas al perfil | 500+ |
| 2. Captura | DMs IG → WhatsApp Business | Leads en CRM | 25-30 |
| 3. Nutrición | WhatsApp + Calendly | Demos agendadas | 8-10 |
| 4. Conversión | Zoom/Meet + Stripe | Founding Gyms cerrados | 6-10 |
| 5. Retención | Email + WhatsApp | Activos día 30 | 100% |

---

## ⚙️ PARTE 1 — WhatsApp Business Setup

### 1.1 Crear cuenta WhatsApp Business

```
[ ] Descargar app "WhatsApp Business" (DIFERENTE a la app normal de WhatsApp)
[ ] Crear cuenta con número dedicado a VELUM
    → Recomendación: número nuevo dedicado (no tu personal)
    → Si usas tu personal, separa con etiquetas
[ ] Verificar el número
```

**¿Qué número usar?**

| Opción | Pro | Contra |
|---|---|---|
| Tu personal | Sin costo, ya tienes contactos | Vida personal mezclada con negocio |
| **Número nuevo (Telcel/AT&T prepago)** ✅ | Separación profesional | $300-500 MXN one-time |
| WhatsApp Cloud API (técnico) | Multi-agente, escalable | Setup técnico, requiere FB Business verificado |

**Recomendación FLUJO:** número nuevo dedicado. La separación profesional > $400 MXN.

### 1.2 Configurar perfil de empresa

```
[ ] Foto perfil: misma que IG (foto perfil VELUM ✦)
[ ] Nombre: "VELUM | Sistema operativo del fitness"
[ ] Categoría: "Software"
[ ] Descripción:
    "Sistema de gestión para tu negocio fitness. Membresías,
    check-in QR, pagos e IA dual. Desde $499 MXN/mes.
    Demo gratis en 15 min."
[ ] Email: [tu email empresarial]
[ ] Sitio web: https://myvelum.app
[ ] Dirección: México (sin dirección física específica)
[ ] Horario: Lun-Vie 9am-7pm (CDMX)
```

### 1.3 Mensajes automáticos (CRÍTICO)

WhatsApp Business permite 3 tipos de mensajes auto:

#### A) Mensaje de bienvenida (cuando alguien escribe por primera vez)

```
Settings → Tools → Welcome message → Activar
```

**Texto:**
```
Hola, gracias por escribir a VELUM ✦

Soy [Roy], en breve te respondo personalmente.

Mientras tanto, si quieres adelantar:
1️⃣ Cuéntame el tipo de negocio fitness que llevas (gym, estudio, box, centro)
2️⃣ ¿Cuántos miembros activos tienen ahora mismo?

Y si ya quieres ver VELUM en vivo, agenda demo aquí:
📅 [LINK CALENDLY]

Atento por aquí.
```

#### B) Mensaje fuera de horario (Lun-Vie 9-7, sáb-dom completo)

```
Settings → Tools → Away message → Activar
Schedule: Custom → Lun-Vie 7pm-9am + Sáb-Dom todo el día
```

**Texto:**
```
Hola, gracias por tu mensaje.

VELUM responde en horario laboral (Lun-Vie, 9am-7pm CDMX).
Mañana primera hora te respondo.

Si quieres adelantar y agendar demo gratis (15 min):
📅 [LINK CALENDLY]

Atento mañana.
```

#### C) Respuestas rápidas (canned responses)

```
Settings → Tools → Quick replies
```

Configurar 6 respuestas con shortcuts (escribes "/info" y se pega el mensaje):

| Shortcut | Cuando usarlo | Mensaje |
|---|---|---|
| `/info` | Pregunta general sobre VELUM | Ver VELUM_SCRIPTS_VENTA.md sección 2.1 |
| `/precio` | Pregunta sobre costo | "PRO $599 / MAX $999. Founding Gyms: $499 lifetime con 50% off (quedan X cupos). ¿Te muestro cómo funciona?" |
| `/demo` | Pidió demo | "Perfecto. Agenda en mi calendario: [LINK]. La demo es 100% en vivo, 15-20 min." |
| `/casos` | Pregunta por casos reales | Ver scripts |
| `/precupo` | Recordar urgencia | "Quedan [X] de 10 cupos Founding Gyms a $499 lifetime. Cuando se llenen vuelve a $999." |
| `/lonkad` | Link al onboarding | "Aquí tu link de Founding Gym: [LINK]. Cualquier duda, aquí estoy." |

### 1.4 Etiquetas de WhatsApp (chip de organización)

```
Settings → Manage chats → Labels → Create
```

Crear estas 7 etiquetas (asígnalas en cada chat):

| Etiqueta | Color | Cuándo |
|---|---|---|
| 🟦 Lead nuevo | Azul | Primer contacto, sin contestar |
| 🟨 En conversación | Amarillo | Respondió, calificando |
| 🟧 Demo agendada | Naranja | Está en calendario |
| 🟩 Founding Gym | Verde | Cerrado y pagando |
| 🟥 Perdido | Rojo | No avanzó (anotar razón) |
| 🟪 Pendiente seguimiento | Morado | Le toca follow-up |
| ⬛ No es ICP | Negro | No califica (no tiene miembros, etc.) |

### 1.5 Link directo de WhatsApp (wa.me)

Para usar en bio IG, Beacons, ads, etc:

```
https://wa.me/52[TUNUMERO]?text=Hola%2C%20vi%20VELUM%20y%20quiero%20info
```

Reemplaza `[TUNUMERO]` con tu número sin espacios ni código país (52 al inicio = México).

**Texto precargado:** "Hola, vi VELUM y quiero info"

Esto pre-llena el mensaje cuando alguien hace clic — convierte en 30%+ más alto que un link sin texto.

---

## ⚙️ PARTE 2 — Calendly Setup

### 2.1 Crear cuenta y configurar evento

```
[ ] Crear cuenta gratis en calendly.com
[ ] Conectar Google Calendar (para evitar dobles bookings)
[ ] Crear nuevo evento:
    Tipo: One-on-one
    Nombre: "Demo VELUM (15 min)"
    Duración: 15 minutos
    Color: Verde (matching brand)
    URL personalizada: calendly.com/[tunombre]/demo-velum
```

### 2.2 Configurar disponibilidad

```
[ ] Disponibilidad: Lunes a Viernes
[ ] Horarios: 10am-2pm + 4pm-7pm (CDMX)
[ ] Buffer entre demos: 15 min (para tomar notas)
[ ] Mínimo aviso: 2 horas (que no agenden 5 min antes)
[ ] Máximo en avance: 14 días
```

### 2.3 Preguntas de calificación (críticas)

Calendly te deja agregar preguntas antes del agendamiento. Configurar estas 4:

```
PREGUNTA 1 (obligatoria, texto):
"¿Cuál es el nombre de tu negocio fitness?"

PREGUNTA 2 (obligatoria, opciones):
"Tipo de negocio:"
○ Gym tradicional
○ Box CrossFit / Funcional / Hyrox
○ Estudio (pilates, yoga, barre, pole)
○ Centro de boxeo / artes marciales
○ Spinning / cycling
○ Baile fitness / Zumba
○ Otro

PREGUNTA 3 (obligatoria, opciones):
"Cuántos miembros activos tienes?"
○ Menos de 30
○ 30-100
○ 100-200
○ Más de 200

PREGUNTA 4 (opcional, texto largo):
"¿Cuál es tu mayor dolor operativo hoy?"
[texto libre]
```

**¿Por qué estas preguntas?**

- P1 te da contexto inmediato
- P2 te dice qué vertical para personalizar la demo
- P3 califica tamaño (menos de 30 → no es ICP, demo más corta o desviar)
- P4 te da el ángulo para abrir la demo (vas directo al pain)

### 2.4 Email de confirmación + recordatorios

Calendly manda automático. Personaliza:

**Subject de confirmación:**
```
Confirmado: tu demo de VELUM con Roy ✦
```

**Cuerpo de confirmación:**
```
¡Hola [Nombre]!

Tu demo de VELUM está confirmada para [fecha y hora].

Antes de la llamada, te paso 2 cosas:

1. Link de la videollamada: [auto-generado]
2. Para que aproveches la demo, ten a la mano:
   - Tu sistema actual (Excel/CRM/lo que uses)
   - 2 preguntas reales de tu negocio (te muestro la IA respondiéndolas en vivo)

Cualquier ajuste, responde este email o escríbeme por WhatsApp:
📱 [tu WhatsApp]

Atento.
Roy de VELUM ✦
```

**Recordatorios automáticos:**
- 24 horas antes
- 1 hora antes (con link a videollamada)

### 2.5 Conectar Calendly con Zoom / Google Meet

```
[ ] Calendly → Settings → Integrations → Conectar Zoom (o Google Meet)
[ ] Cada evento creará automáticamente la sala
[ ] El link va incluido en el email de confirmación
```

---

## ⚙️ PARTE 3 — Notion CRM VELUM (Pipeline)

### 3.1 Estructura de la database

Crear nueva database en Notion: **"VELUM Pipeline"**

**16 propiedades:**

| Propiedad | Tipo | Opciones / Notas |
|---|---|---|
| Nombre del negocio | Title | — |
| Owner | Text | Nombre del dueño |
| Etapa | Select | Lead / Contactado / Respondió / Demo agendada / Demo hecha / Founding Gym / Perdido |
| Vertical | Select | CrossFit-Funcional / Pilates-Yoga / Boxeo-MMA / Spinning / Gym tradicional / Baile fitness / Otro |
| Ciudad | Select | CDMX / MTY / GDL / Querétaro / León / Puebla / Mérida / Otra |
| Tamaño | Select | <30 / 30-100 / 100-200 / 200+ |
| Fuente | Select | IG cold / IG warm / WhatsApp directo / Referido / Calendly orgánico / FB / LinkedIn |
| Plan interesado | Select | PRO / MAX / MAX-Founding |
| Valor mensual | Number (MXN) | 499 / 599 / 999 |
| IG handle | URL | — |
| WhatsApp | Phone | — |
| Email | Email | — |
| Fecha primer contacto | Date | — |
| Última interacción | Date | — |
| Próximo paso | Text | ¡SIEMPRE definido! |
| Notas | Text largo | Observación específica + objeciones |

### 3.2 Vistas a crear (esto es lo que más usas)

```
[ ] Vista 1: KANBAN POR ETAPA (default — la que más vas a usar)
    → Group by: Etapa
    → Card properties: Nombre, Vertical, Ciudad, Tamaño, Próximo paso
    → Sort by: Última interacción (desc)

[ ] Vista 2: TABLA "Sin actividad 3+ días"
    → Filter: Última interacción > hace 3 días AND Etapa != "Founding Gym" AND Etapa != "Perdido"
    → Sort: Última interacción (asc — los más viejos primero)
    → ⚠️ Esta es la que revisas DIARIO

[ ] Vista 3: CALENDARIO "Demos esta semana"
    → Filter: Etapa = "Demo agendada"
    → Sort by: Fecha próximo paso

[ ] Vista 4: CONTADOR "Founding Gyms cerrados"
    → Filter: Etapa = "Founding Gym"
    → Vista tipo Gallery
    → Title visible para urgencia (X / 10)

[ ] Vista 5: TABLA "Pipeline completo por valor"
    → Sort by: Valor mensual (desc)
    → Filter: Etapa = "Respondió" OR "Demo agendada" OR "Demo hecha"
    → Para priorizar follow-ups por tamaño de oportunidad
```

### 3.3 Plantilla de entrada de lead (1 click → llenar)

Crear "Template" del Notion:

```
Cuando agregues un lead nuevo, plantilla pre-llena:
- Etapa: Lead
- Próximo paso: "Enviar primer DM"
- Fecha primer contacto: [hoy]
- Última interacción: [hoy]

Solo llenas:
- Nombre del negocio
- Owner (si lo conoces)
- Vertical
- Ciudad
- IG handle
```

### 3.4 Reglas de uso del CRM (no negociables)

1. **Cada lead se registra en menos de 24 horas** desde el primer contacto
2. **Cada lead tiene "Próximo paso" definido** SIEMPRE — sin excepción
3. **"Última interacción" se actualiza cada vez** que mandas/recibes mensaje
4. **"Notas" captura objeciones reales** — eso alimenta NORTE para iteración semanal
5. **Lead sin actividad 3+ días = emergencia** → revisión diaria de la vista 2

---

## ⚙️ PARTE 4 — Validar Pixel Meta + Google Analytics

Tu landing (myvelum.app) **ya tiene GA4** configurado (`G-KVWQ7L8SS3`). Pero falta el Pixel de Meta para campañas futuras.

### 4.1 Verificar GA4 funcionando

```
[ ] Abre myvelum.app en incognito
[ ] Ve a Google Analytics → Reports → Realtime
[ ] Deberías ver tu visita en tiempo real
[ ] Si no aparece: revisar ID en index.html y permisos de la propiedad
```

### 4.2 Instalar Pixel de Meta (5 minutos)

```
[ ] Ir a business.facebook.com → Events Manager
[ ] Crear nuevo Pixel: "VELUM Pixel"
[ ] Copiar Pixel ID (formato: 17 dígitos)
[ ] Pegar el código en <head> de myvelum.app
```

**Código a pegar (reemplaza YOUR_PIXEL_ID):**

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR_PIXEL_ID');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->
```

### 4.3 Eventos a trackear (cuando lanzas Meta Ads en mes 2)

| Evento | Cuándo dispara | Para qué |
|---|---|---|
| `PageView` | Todas las páginas | Audiencia retargeting |
| `Lead` | Click en "Demo gratis" | Optimizar campañas a leads |
| `InitiateCheckout` | Click en "Founding Gym" | Optimizar a intent de compra |
| `Purchase` | Después de Stripe success | Medir ROAS real |

Esto se implementa en mes 2 (con META). Por ahora solo PageView basta.

---

## ⚙️ PARTE 5 — Sistema de Follow-ups Automáticos

VÍNCULO ya escribió los mensajes. FLUJO los conecta a tiempos automáticos.

### 5.1 Para WhatsApp (semi-automático)

WhatsApp Business no tiene auto-follow-ups (sería abuso). Pero MOTOR + tú podemos crear un sistema:

```
Notion CRM → Vista 2 "Sin actividad 3+ días"
             ↓
     Revisar diariamente (5 min en rutina matutina)
             ↓
     Para cada lead viejo → enviar mensaje correspondiente:
     - 3 días desde demo → mensaje VÍNCULO T+3
     - 7 días desde demo → mensaje VÍNCULO T+7
     - 3 días desde DM original sin respuesta → mensaje VÍNCULO no-respuesta
```

### 5.2 Para email (automático con Mailchimp)

Para los leads que dejen email (vía Calendly o WhatsApp):

```
[ ] Crear cuenta Mailchimp gratis
[ ] Crear lista: "VELUM Leads"
[ ] Crear automation: "Trigger: Subscribe → Send sequence"
```

**Secuencia de 4 emails post-demo no cerrada:**

| Email | Trigger | Contenido | Día |
|---|---|---|---|
| #1 | Demo confirmada | Bienvenida + qué llevar a la demo | 0 |
| #2 | Demo no cerró | Resumen de la demo + ROI calculator | T+1 |
| #3 | Demo no cerró | Caso MOVE detallado | T+3 |
| #4 | Demo no cerró | Última oportunidad cupos Founding | T+7 |

(Los textos completos están en VÍNCULO scripts. Solo se copian a Mailchimp.)

### 5.3 Stripe — automatización post-cierre

Cuando un Founding Gym paga:

```
Stripe → Webhook → Email automático:

1. Email de confirmación con link de onboarding (Calendly)
2. Email de welcome con primeros pasos en VELUM
3. WhatsApp manual: "Bienvenido a VELUM, te paso el link de tu cuenta"
```

---

## 🔄 PARTE 6 — Routing completo: cómo fluye un lead

```
┌─────────────────────────────────────────────────────┐
│ 1. PROSPECT VE CONTENIDO IG                         │
│    → Click en bio → Beacons.ai                      │
└─────────────────────────────────────────────────────┘
                       ↓
        ┌──────────────┴──────────────┐
        ↓                             ↓
┌─────────────────┐           ┌──────────────────┐
│ Click WhatsApp  │           │ Click "Agenda     │
│ → wa.me/...     │           │ Demo" → Calendly  │
└─────────────────┘           └──────────────────┘
        ↓                             ↓
┌─────────────────┐           ┌──────────────────┐
│ Mensaje auto    │           │ Email de confirm  │
│ bienvenida WA   │           │ + recordatorios   │
└─────────────────┘           └──────────────────┘
        ↓                             ↓
┌─────────────────┐           ┌──────────────────┐
│ Roy responde    │           │ Calendly crea     │
│ → califica      │           │ entry en Calendar │
│ → mover a CRM   │           │ + datos a CRM     │
│ Notion          │           │                   │
└─────────────────┘           └──────────────────┘
        ↓                             ↓
        └──────────────┬──────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ DEMO 20 MIN (script de VÍNCULO)                     │
│ Wow moments de IA × 2                               │
│ Cierre con oferta Founding Gyms                     │
└─────────────────────────────────────────────────────┘
        ↓                             ↓
   Cierra YES                     Pidió tiempo
        ↓                             ↓
┌──────────────────┐           ┌──────────────────┐
│ Stripe checkout  │           │ Etiqueta: Pendien │
│ → onboarding 1-1 │           │ → Mailchimp seq   │
│ → testimonio M+1 │           │ → Follow-up T+1/3/7│
└──────────────────┘           └──────────────────┘
```

---

## 📊 PARTE 7 — Métricas y Reportes Semanales

### 7.1 Dashboard semanal (revisar cada viernes con NORTE)

| Métrica | Fuente | Target Mes 1 | Cómo se calcula |
|---|---|---|---|
| Visitas a perfil IG | IG Insights | 500+ | Auto |
| Clicks en bio link (Beacons) | Beacons Analytics | 100+ | Auto |
| Conversaciones WhatsApp iniciadas | Conteo manual | 30 | Etiquetas WA |
| Leads en CRM | Notion count | 30 | Auto |
| Demos agendadas | Calendly | 8-10 | Auto |
| Demos hechas | Calendly | 6-8 | Manual mark "occurred" |
| Founding Gyms cerrados | Notion | 5+ | Filtro Etapa |
| Tasa cierre demo→FG | Calculado | 50%+ | Cerrados / hechas |

### 7.2 Funnel weekly review (template para cada viernes)

```
SEMANA DEL [fecha]:

Top of funnel:
- Visitas perfil: [X]
- Leads CRM nuevos: [X]
- Tasa visita→lead: [X]%

Middle:
- Conversaciones WhatsApp: [X]
- Demos agendadas: [X]
- Tasa lead→demo: [X]%

Bottom:
- Demos hechas: [X]
- Founding Gyms cerrados: [X]
- Tasa demo→cierre: [X]%

CUELLO DE BOTELLA IDENTIFICADO: [dónde se pierde más]
ACCIÓN PARA SEMANA SIGUIENTE: [qué cambiar]
```

---

## ⚠️ ERRORES COMUNES A EVITAR

1. **No registrar leads en CRM** — "se quedan en mi cabeza" → 30 días después tienes 50 leads y no recuerdas a ninguno. Regla: TODOS van al CRM en menos de 24h.

2. **No definir "Próximo paso"** — un lead sin próximo paso es un lead muerto. Si no sabes qué hacer con él, ponlo en "Perdido" y muévelo.

3. **Querer auto-responder TODO con bots** — para Founding Gyms los primeros 10 los cierra Roy personalmente. Sin SDR, sin chatbot, sin nada. La fricción humana cierra mejor en B2B early-stage.

4. **No cerrar en la demo** — si el prospect dice "déjame pensarlo", NUNCA cierres la llamada sin recoger objeciones específicas. Sin objeciones documentadas, no hay follow-up efectivo.

5. **Mandar follow-ups genéricos** — "Hola, hago check-in" no funciona. Cada follow-up referencia ALGO específico de la demo. (Ejemplo: "Mencionaste que pierdes 5 clientes/mes — solo el módulo de IA te lo resuelve").

6. **No medir nada** — sin métricas semanales no sabes qué optimizar. El review del viernes es no negociable.

7. **Calendly sin preguntas de calificación** — recibes demos de personas que NO son ICP. Las 4 preguntas filtran el 30% de demos perdidas.

---

## 📋 CHECKLIST FINAL — Orden de implementación

### Día 1 (2 horas)
```
[ ] WhatsApp Business descargado y configurado (Parte 1.1-1.2)
[ ] Mensaje de bienvenida + away activos (Parte 1.3)
[ ] 6 quick replies configurados (Parte 1.3)
[ ] 7 etiquetas creadas (Parte 1.4)
[ ] Link wa.me con texto precargado generado (Parte 1.5)
```

### Día 2 (1 hora)
```
[ ] Calendly creado con evento "Demo VELUM 15 min" (Parte 2.1-2.2)
[ ] 4 preguntas de calificación configuradas (Parte 2.3)
[ ] Email de confirmación personalizado (Parte 2.4)
[ ] Zoom/Meet conectado (Parte 2.5)
[ ] Probar agendamiento end-to-end (tú agendas con tu otro email)
```

### Día 3 (2 horas)
```
[ ] Notion CRM con 16 propiedades (Parte 3.1)
[ ] 5 vistas creadas (Parte 3.2)
[ ] Template de lead nuevo configurado (Parte 3.3)
[ ] Pixel Meta instalado en myvelum.app (Parte 4.2)
[ ] GA4 verificado (Parte 4.1)
```

### Día 4 (30 min)
```
[ ] Mailchimp creado con lista "VELUM Leads"
[ ] Automation post-demo importada con 4 emails de VÍNCULO
[ ] Probar todo el flow: visita IG → click bio → WhatsApp → CRM → Calendly → demo
```

---

## 🎯 RESULTADO ESPERADO POST-SETUP

Cuando todo esté en pie:

✅ Cualquier persona que haga clic en tu bio IG llega a Beacons → puede elegir WhatsApp o Calendly
✅ WhatsApp responde automático con mensaje de bienvenida + agenda demo
✅ Calendly hace 4 preguntas que califican al prospect ANTES de la demo
✅ Cada conversación se trackea en CRM con etapa, próximo paso y notas
✅ Demos agendadas aparecen en tu calendario con preguntas pre-respondidas
✅ Stripe procesa Founding Gyms automáticamente
✅ Mailchimp manda follow-ups si la demo no cierra
✅ Cada viernes ves dashboard de métricas y dónde está el cuello de botella

**Tiempo total que ahorras vs. hacerlo manual:** ~10 horas/semana cuando llegues a 30+ leads.

---

**(FLUJO — Funnel & Automation Agent)**

Backend de ventas listo para Roy. Cuando esto esté en pie, cada lead tiene un destino claro y nada se pierde.
