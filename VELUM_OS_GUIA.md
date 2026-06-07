# VELUM Studio — Guía del OS, tu equipo de IA y checklist

**Para:** Roy · **Última actualización:** 7 jun 2026

En una frase: tienes un **Command Center** (panel visual) + un **equipo de 8 agentes de IA** que operan VELUM por áreas, coordinados por **NÚCLEO**, con un **tablero vivo** y **reportes automáticos**. Esta guía explica cómo activarlo, cómo trabajan, y qué falta para vender.

---

## 1. El Command Center (el OS visual)

Es un **panel persistente** que vive en la barra lateral de Cowork (ábrelo y **fíjalo** para tenerlo siempre). Qué hay en él:

- **Núcleo central** — el corazón: misión y salud del sistema, con pulsos de datos.
- **Nodos de agentes** (alrededor) — cada uno es una inteligencia: nombre, estado, objetivo, KPI **real en vivo** (socios, pagos, MRR, leads…) y prioridad. Las líneas que los unen se animan cuando colaboran.
- **Menú izquierdo (estrategia)** — Proyectos (P0/P1), Departamentos, Equipos, Clientes (gyms en vivo desde Supabase), Knowledge base, Workflows.
- **Panel derecho (inteligencia)** — KPIs + feed de **eventos reales** (pagos y altas recientes).

**Cómo usarlo:**
- **Clic en un nodo de agente** → abre su workspace inmersivo (tareas, decisiones, dependencias, métricas, documentos) y **copia su comando** para activarlo en el chat.
- **Clientes** → lee tus gyms reales (miembros, estado).
- **Workflows → Ejecutar** → lanza el parte matutino al instante.

---

## 2. El equipo (roster)

| Agente | Área | Qué hace |
|---|---|---|
| **NÚCLEO** | Coordinación | Jefe de staff: prioriza, reparte y lleva el tablero |
| **FORJA** | Producto / Sistema | Panel, base de datos, edge functions, bugs |
| **VITRINA** | Landing & Web | Landing, storefront, SEO, pricing |
| **ESCUDO** | Seguridad | RLS, aislamiento multi-gym, auditorías |
| **SEÑAL** | App nativa | Capacitor, iOS/Android, tiendas |
| **VOZ** | Marketing | Contenido, campañas, captación |
| **IMPULSO** | Growth / Ventas | Funnel, pricing, adquisición |
| **APOYO** | Soporte / Éxito | Onboarding, retención |

**Cómo activarlos:** escribe `status VELUM` (NÚCLEO te da el parte y reparte) o invoca a uno directo: *"que ESCUDO audite la seguridad"*, *"que VITRINA mejore el landing"*.

---

## 3. Cómo trabajan: el modelo "empleados de tiempo completo"

Piensa en ellos como un equipo que siempre piensa en el bien de VELUM. El flujo de una acción:

1. **NÚCLEO** detecta qué hace falta (del tablero/auditoría) o recibe tu petición.
2. **Activa al agente correcto** y le pasa el contexto.
3. El agente **ejecuta** su trabajo de fondo (edita código, corre SQL/migraciones, diseña, redacta).
4. Reporta a **NÚCLEO**, que actualiza el tablero.
5. **Tú eres la única compuerta:** nada llega a producción sin tu OK.

**Qué pasa solo vs qué decides tú:**
- **Cambios de base de datos** (SQL, migraciones, edge functions, seguridad) → quedan **vivos al instante** (no pasan por git). Por eso los fixes de seguridad o de datos aplican de inmediato.
- **Cambios de archivos** (landing, panel, storefront, app) → se preparan, pero **el `git push` lo haces TÚ** desde tu terminal. Tú decides qué se publica. Comando: `cd ~/Move-System && find .git -name '*.lock' -delete && git push`.

**Autonomía programada (sin que estés):**
- **NÚCLEO corre solo cada mañana (~8 AM)** y deja el parte en `VELUM_REPORTES.md` con la prioridad del día y qué agente la ejecuta.
- Se pueden agregar más "turnos" automáticos (ej. ESCUDO audita seguridad cada lunes, VOZ propone contenido los viernes). Solo pídelo.

**Cómo darles una misión grande:** *"NÚCLEO, pongan al equipo a avanzar el funnel"* → NÚCLEO reparte a IMPULSO + FORJA y te trae el resultado para tu visto bueno.

---

## 4. Dónde llevas el reporte / seguimiento

- **`VELUM_TABLERO.md`** — tablero vivo: Por hacer (P0/P1) · En curso · Hecho. Lo mantiene NÚCLEO.
- **`VELUM_REPORTES.md`** — el parte matutino diario (automático).
- **`VELUM_AUDITORIA_MAESTRA.md`** — estado a fondo por las 10 áreas.
- **El OS** — feed en vivo (derecha) + Proyectos + Workflows.

---

## 5. ✅ Checklist de comercialización

### Ya está listo (no re-trabajar)
- [x] Funnel self-serve construido (registro → plan → pago → gym activado)
- [x] Trial de 7 días gratis en el checkout
- [x] Pricing público + CTAs en el landing
- [x] Aislamiento multi-gym auditado (seguridad sólida)
- [x] Analítica del negocio, centro de ayuda, métricas SaaS
- [x] SEO del storefront (meta/OG/JSON-LD/sitemap/robots)
- [x] Emails transaccionales cableados, crons de push y vencimiento

### Te toca a ti (acciones externas)
- [ ] **Verificar Stripe**: que la secret key y los price IDs estén en el mismo modo (live/test), y que el webhook tenga suscritos `checkout.session.completed`, `invoice.*`, `customer.subscription.*`
- [ ] **Smoke test del funnel**: registrarte como gym de prueba en /registro y confirmar alta + login en /app
- [ ] **Activar Resend** (emails): cuenta + dominio + 2 secrets
- [ ] **Facturapi** (CFDI): cuenta + CSD
- [ ] **Apple**: que termine de procesar la membresía → subir la app
- [ ] **Google**: esperar el D-U-N-S → cuenta Organización → subir la app
- [ ] **Capturas de tienda** (5 por plataforma) + feature graphic
- [ ] **git push** de lo pendiente (checkin, registro, etc.)
- [ ] **Rename Cervus → VELUM** en Stripe (descriptor del cargo)

### El equipo puede adelantar (pídeselo a NÚCLEO)
- [ ] Hardening menor de seguridad (ESCUDO)
- [ ] Presencia y cadencia en redes (VOZ)
- [ ] Base de conocimiento pública (APOYO + VITRINA)
- [ ] Dominio propio por gym (FORJA + VITRINA)
- [ ] Definir 1er canal de adquisición y guion de venta (IMPULSO)

---

## 6. Frases útiles
- `status VELUM` — parte del día (NÚCLEO).
- `que IMPULSO + FORJA avancen el funnel`
- `que ESCUDO haga una auditoría de seguridad`
- `que VOZ arme el calendario de redes de la semana`
- `ya hice X, actualiza el tablero`
