# VELUM — Organigrama y plan de equipo para crecimiento óptimo
**Fecha:** 2026-07-03 · Complemento de `VELUM_AUDITORIA_LANZAMIENTO.md`

## Filosofía: empresa híbrida humano + agentes

VELUM no contrata como una empresa normal porque no ES una empresa normal: ya tiene un
departamento de ingeniería, marketing, QA, diseño y BI funcionando (los 13 agentes bajo
VELUM-OS) a costo ~cero. Los humanos se contratan SOLO para lo que exige confianza,
relación y responsabilidad personal: **vender, dar la cara, y decidir**.

Regla de hierro: **cada contratación se dispara por una métrica, no por una fecha, y se
paga con el MRR que desbloquea.**

---

## El organigrama objetivo (etapa 3, ~80–200 clientes)

```
                      Roy — CEO
        ┌─────────────────┼──────────────────┐
    COMERCIAL         CLIENTE            PRODUCTO & TEC
    (adquirir)        (retener)          (construir)
    ├ Account Exec    ├ CS Lead          ├ Dev full-stack
    │  (cadenas)      │  (onboarding)    │  (con VELUM-OS)
    └ SDR comisión    └ CS #2            └ 13 agentes IA
                         (soporte)          (FORJA·VOZ·ESCUDO…)
    ─────────────────────────────────────────────────────
    Externos: contador · legal fiscal · pauta (por proyecto)
```

---

## Los puestos, en orden de contratación

### Etapa 0 — HOY (0–10 clientes, MRR $0–8k) · headcount: 1

**Roy — CEO/Founder.** Ventas founder-led, decisiones de producto, la cara del negocio.
Los agentes cubren: ingeniería (FORJA/CAUDAL/ESCUDO/SEÑAL/AURA), QA (CENTINELA),
marketing (VOZ/VITRINA/IMPULSO), diseño (TRAZO), datos (ORÁCULO), material de soporte
(APOYO), coordinación (NÚCLEO). **Contrataciones: cero.** Todo peso disponible va a
pauta y a gasolina para demos.

### Etapa 1 — Tracción (10–30 clientes, MRR $8–25k) · headcount: 2

**1. Customer Success / Onboarding — medio tiempo → completo**
- **Disparador:** cuando soporte+onboarding te quiten >10 h/semana de venta, o al cliente #10 — lo que pase primero.
- **Misión:** que todo gym nuevo cargue sus clientes en 48 h y nadie se dé de baja por sentirse solo.
- **Hace:** llamada de bienvenida, migración de Excel, WhatsApp nivel 1, seguimiento de activación, detectar en riesgo de churn.
- **Perfil:** ex-recepción/manager de gym o estudio; empático, ordenado, WhatsApp-nativo. No técnico — los agentes le preparan guías y respuestas.
- **Sueldo:** $8–12k MXN medio tiempo → $14–18k completo.
- **KPI:** activación ≥60% (trials que cargan ≥10 clientes en 48 h) · churn <4%/mes · primera respuesta <2 h hábiles.

### Etapa 2 — Crecimiento (30–80 clientes, MRR $25–65k) · headcount: 3–4

**2. SDR / Vendedor a comisión**
- **Disparador:** cuando tengas guion de demo probado (≥20% de cierre en tus propias demos) y CAC medido. Nunca antes — un vendedor sin playbook quema mercado.
- **Misión:** llenar tu calendario de demos primero; luego cerrar él mismo.
- **Hace:** prospección (la lista Bajío y las que siguen), llamadas en frío, WhatsApp, agendar demos, cerrar Pro/Max.
- **Perfil:** vendedor de terreno con hambre, idealmente del mundo fitness; se le paga por resultado.
- **Compensación:** base chica ($6–8k) + 20–25% del primer año de cada cliente cerrado. Un buen mes (6 cierres Max) le deja ~$20k+.
- **KPI:** 40 demos agendadas/mes · cierre ≥15% · CAC < 3× ticket mensual.

**3. Contador / fiscal (externo, iguala)**
- **Disparador:** primer mes con >$25k de ingresos propios, o cuando 2+ clientes pidan factura.
- **Hace:** contabilidad, declaraciones, CFDI de VELUM (la facturación a clientes la automatizo yo cuando el volumen lo pida).
- **Costo:** $2.5–4k MXN/mes iguala.

### Etapa 3 — Escala (80–200 clientes, MRR $65–160k) · headcount: 5–7

**4. Ingeniero full-stack**
- **Disparador:** cuando el roadmap tenga 3+ frentes paralelos urgentes o entres a cadenas con requerimientos a contrato (SLA, integraciones).
- **Misión:** velocidad paralela. NO reemplaza a los agentes: **trabaja con VELUM-OS** (el pipeline, /spec y los gates ya están documentados para un humano nuevo). Su ventaja sobre un dev normal: llega a una fábrica andando.
- **Perfil:** full-stack pragmático (JS/TS, Postgres, Stripe); que le entusiasme trabajar con agentes, no que los tolere. Sentido de producto > pureza de código.
- **Sueldo:** $35–60k MXN según seniority (o menos + equity si encuentras al indicado).
- **KPI:** lead time de feature <2 semanas · cero incidentes de seguridad · uptime 99.9%.

**5. CS #2 — soporte** ($12–16k): absorbe el WhatsApp para que el CS Lead se dedique a onboarding y retención proactiva. Disparador: >120 tickets/mes o CS Lead saturado.

**6. Account Executive — cadenas** ($15k base + comisión agresiva): el deck de cadenas es tu palanca de crecimiento no-lineal; un contrato de 15 sucursales = 15 clientes de golpe. Disparador: 2+ conversaciones de cadena activas que tú ya no puedas atender con la profundidad que merecen.

### Etapa 4 — Empresa (200+ clientes / cadenas firmadas, MRR $160k+) · headcount: 8–12

- **Head of Sales** (dirige SDR+AE; tú sales del pipeline diario)
- **Head of Customer Success** (dirige CS; dueño del churn)
- **Dev #2** (móvil/integraciones)
- **Ops/Admin** (facturación, nómina, proveedores)
- Roy → CEO de verdad: estrategia, cadenas grandes, partnerships (Stripe, federaciones, franquicias), y decidir si esto se escala con inversión o con flujo propio.

---

## Mapa agentes ↔ departamentos (el "headcount invisible")

| Departamento | Agentes | Equivalente humano ahorrado |
|---|---|---|
| Ingeniería | FORJA, CAUDAL, ESCUDO, SEÑAL, AURA | 2–3 devs (~$90–150k/mes) |
| QA | CENTINELA | 1 QA (~$25k/mes) |
| Marketing | VOZ, VITRINA, IMPULSO | 1–2 marketers (~$40k/mes) |
| Diseño | TRAZO | 1 diseñador (~$25k/mes) |
| Datos/BI | ORÁCULO | 1 analista (~$30k/mes) |
| Soporte (material) | APOYO | base de conocimiento viva |
| Coordinación | NÚCLEO + VELUM-OS | jefe de proyecto |

**~$210–270k MXN/mes de nómina que VELUM no paga.** Esa es la ventaja estructural: un
competidor necesita ~$3M MXN/año de nómina para moverse a tu velocidad. La condición
para que siga siendo cierta: los humanos que contrates deben multiplicar a los agentes
(usarlos), no duplicarlos.

## Costo de nómina acumulado por etapa (MXN/mes)

| Etapa | Clientes | Nómina humana | MRR esperado | Regla |
|---|---|---|---|---|
| 0 | 0–10 | $0 | $0–8k | Todo a pauta y demos |
| 1 | 10–30 | $8–18k | $8–25k | CS se paga con 15 clientes |
| 2 | 30–80 | $20–35k | $25–65k | Vendedor se paga solo (comisión) |
| 3 | 80–200 | $80–130k | $65–160k | Nómina ≤ 60% del MRR |
| 4 | 200+ | $150–250k | $160k+ | Nómina ≤ 50% del MRR |
