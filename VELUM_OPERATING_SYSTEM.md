# VELUM Operating System (VELUM-OS)

> Cómo se construye VELUM a calidad de empresa seria. Este documento es el
> contrato de trabajo entre Roy (visión) y Claude (ejecución). Objetivo:
> que **toda** idea de Roy se materialice al más alto nivel, cazando errores
> antes de que cuesten, y sin que nada llegue a producción sin verificarse.
>
> Estado: BORRADOR v1 — pendiente de aprobación de Roy.

---

## 0. Principios (lo no negociable)

1. **Diseñar antes de construir.** Ninguna tarea no-trivial se codea sin una spec aprobada.
2. **Los errores se cazan en la idea, no en producción.** La etapa cara es codear; la barata es preguntar. Preguntamos primero.
3. **Nada está "hecho" sin verificación adversaria.** "Funciona en mi cabeza" no cuenta. Se prueba, se rompe, se revisa.
4. **Roy aprueba lo irreversible.** Deploys y escrituras a producción requieren OK explícito, cada vez.
5. **El sistema aprende.** Cada decisión y estándar se registra en memoria; no repetimos errores.
6. **Honestidad sobre el estado.** Si algo falla, se dice con evidencia. No se maquilla.

---

## 1. El pipeline: por aquí pasa TODO cambio

```
INTENT ─► SPEC ─► PLAN ─► BUILD ─► VERIFY ─► RECORD
 idea    spec    quién   ejecución  gate     memoria
 cruda   precisa toca    real con   adversario (decisiones
 de Roy  + riesgos qué,   skills     (romper +  + estándares)
         + criterios orden reales    seguridad
         de aceptación      + tests)
```

Cada etapa tiene **entrada, salida y dueño**. No se avanza a la siguiente sin cerrar la anterior.

### Etapa 1 — INTENT (Roy)
- **Entrada:** la idea, como salga (aunque venga incompleta o con errores).
- **Salida:** el intent capturado tal cual.
- Regla: Roy no tiene que traerlo perfecto. Ese es el trabajo de la etapa 2.

### Etapa 2 — SPEC (Claude) — *el cazador de errores*
Antes de tocar código, Claude convierte el intent en una spec de 1 página:
- **Qué es** (en una frase) y **por qué** (el problema real que resuelve).
- **Criterios de aceptación** (cómo sabremos que quedó bien; medibles).
- **Alcance** (qué SÍ y qué NO).
- **Riesgos / lo que puede romper** (multi-tenant, pagos, seguridad, migraciones).
- **Preguntas / contradicciones** que Claude detecta en la idea.
- **Áreas/agentes** que participan.

> **Aquí se elimina el 80% de los errores.** Si la idea de Roy tiene un hueco, una
> contradicción o un supuesto falso, se detecta aquí y se resuelve *antes* de codear.
> Claude NO construye hasta que la spec quede aprobada por Roy (una línea: "va").

### Etapa 3 — PLAN (NÚCLEO / Claude)
- **Salida:** qué agentes/áreas tocan, en qué orden, con qué dependencias.
- Aquí es donde encaja el **VELUM Studio**: su conversación es una forma de generar/estresar este plan. Un plan del Studio puede exportarse como *orden de trabajo* (ver §4).

### Etapa 4 — BUILD (skills de área)
- Ejecución real por el especialista correcto: FORJA (panel/backend), CAUDAL (pagos), ESCUDO (seguridad/RLS), SEÑAL (app), etc.
- Reglas de build en §3 (Manual de Ingeniería).
- Cambios chicos y verificables; comentarios en español.

### Etapa 5 — VERIFY (CENTINELA + gates) — *nadie se salta esto*
Un cambio no es "hecho" hasta pasar:
- `node --check` sobre el JS tocado (o el linter/typecheck del lenguaje).
- **Verificación en preview** para cambios observables (no "confía en mí": captura/log real).
- **Simulación de claims JWT** para cambios de RLS (`begin; set local request.jwt.claims …; rollback;`).
- Gate de **code-review** (skill real) para lógica no trivial.
- Gate de **security-review** (skill real / ESCUDO) para cualquier cosa que toque auth, RLS, pagos o datos entre gyms.
- Edge-cases de rigor VELUM: acentos/ñ, día 31 en rangos de fecha, webhooks duplicados, multi-tenant.

### Etapa 6 — RECORD (memoria)
- Decisiones, gotchas nuevos y estándares → archivos de memoria + `MEMORY.md`.
- Si un cambio de frontend requiere `git push`, se hace (con OK) y se anota.

---

## 2. Definition of Done (DoD) — cuándo algo cuenta como terminado

Una tarea está "hecha" solo si **todas** se cumplen:

- [ ] Cumple los criterios de aceptación de la spec.
- [ ] Respeta el Manual de Ingeniería (§3).
- [ ] Pasó el/los gate(s) de VERIFY que apliquen.
- [ ] No introduce regresiones en caminos críticos.
- [ ] Se verificó con evidencia (captura/log/prueba), no de palabra.
- [ ] Lo irreversible (deploy/escritura prod) fue aprobado por Roy.
- [ ] La decisión/estándar quedó registrada si aporta al futuro.

---

## 3. Manual de Ingeniería VELUM (reglas no negociables)

Estas reglas hacen que la calidad sea **consistente sin importar cómo se fraseó la idea**.

**Multi-tenant / Seguridad (lo más sagrado)**
- Todo query/feature respeta aislamiento por `gym_id`. Nunca asumir un solo gym.
- RLS con `is_superadmin()` / `auth_gym_id()` / `auth_app_rol()`. Cambios de RLS se prueban con claims simulados.
- Cuidado con SELECT `is_active=true` que choquen con soft-deletes (la fila debe seguir visible bajo alguna policy).
- Nada que exponga datos de un gym a otro. ESCUDO revisa antes de salir.

**Auth**
- Auth custom (no Supabase Auth): `move-login` (panel), `velum-atleta-auth` (atleta), JWT HS256.
- Gotcha vivo: firmar JWT con `btoa(string)` rompe con acentos/ñ (PGRST303 401). UTF-8 encode con `TextEncoder` antes de base64url.

**Edge functions**
- Desplegar con `Deno.serve` nativo. `import deno.land/std` causa timeouts de bundling en el deploy por MCP.
- Idempotencia en webhooks: índices únicos a nivel DB + tolerar código `23505`.
- Las API keys y secrets son de Roy; Claude nunca los genera ni los pega en el cliente.

**App nativa**
- El `www` es artefacto de `atleta.html` vía `build.js` — no se edita a mano.

**Producto / UI**
- Sin emojis en UI — íconos SVG (preferencia firme de Roy).
- Theming aditivo por `gyms.vertical` (gym cyan / studios champagne / recovery salvia). Nunca forkear UI por vertical.

**Proceso**
- Escrituras/deploys a producción → OK explícito de Roy, cada vez.
- `git push`: Claude puede hacerlo cuando Roy lo pide, agregando SOLO los archivos del cambio (nunca PDFs/marketing/temp).

---

## 4. El puente Studio → Ejecución (el "pizarrón → taller")

VELUM Studio (la Oficina) es el **pizarrón**: genera un plan multi-ángulo rápido. Este chat / Claude Code es el **taller**: ejecuta de verdad.

**El puente (versión de calidad, no autonomía ciega):**
1. En el Studio, una misión produce `{turns, tasks, decisions}`.
2. Botón "Exportar orden de trabajo" → empaqueta misión + tareas + decisiones en un brief estructurado (Markdown/JSON).
3. Ese brief entra al pipeline como **INTENT/PLAN** → pasa por SPEC → BUILD → VERIFY con gates.

> Deliberadamente **no** hacemos "click → cambios en producción sin revisión". Eso es
> lo contrario de calidad de empresa seria. El humano + los gates son la garantía.
> (Una versión futura totalmente autónoma sería con Managed Agents, pero SIEMPRE
> detrás de review — no antes de tenerlo.)

---

## 5. Los 13 agentes: de roleplay a roles reales

En el Studio son personajes; en el pipeline son **skills reales con contexto del proyecto**:

| Etapa | Agentes/roles |
|---|---|
| SPEC / PLAN | NÚCLEO (coordina, cuestiona) |
| BUILD | FORJA (panel/backend), CAUDAL (pagos), AURA (IA), SEÑAL (app), VITRINA (web), TRAZO (diseño), VOZ (marketing), IMPULSO (growth), APOYO (soporte) |
| VERIFY | CENTINELA (QA/romper), ESCUDO (seguridad/RLS), ORÁCULO (mide impacto) |
| RECORD | NÚCLEO (tablero + memoria) |

---

## 6. Roadmap de construcción (ladrillo por ladrillo)

Orden recomendado por impacto en calidad:

1. **Gate INTENT→SPEC** (mayor impacto: caza errores de raíz). Un flujo/comando repetible.
2. **Manual de Ingeniería + DoD** (este doc formalizado y aplicado en cada VERIFY).
3. **Gates de VERIFY obligatorios** (code-review + security-review cableados al flujo).
4. **Puente Studio → orden de trabajo.**
5. (Futuro) Orquestación multi-agente real para tareas grandes, siempre con gates.

---

*Este documento evoluciona. Cada mejora al proceso se registra aquí y en memoria.*
