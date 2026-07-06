# Upgrade del ecosistema de agentes — CHANGELOG
**Fecha:** 2026-07-03 · **Alcance:** 31 SKILL.md (17 LAZO + 14 VELUM) · Auditoría de 8
dimensiones (identidad, triggers, criterio, few-shots, anti-patrones, formato, coordinación,
robustez en modelo menor) → reescritura total en 7 lotes.

## El patrón aplicado a TODOS

1. Description con **exclusiones de ruteo** ("NO lo uses para X → usa Y" / "Desempate: ...").
2. Identidad de una frase que lo distingue de los demás.
3. Criterio comprimido a reglas concretas y números (nada de "sé creativo/estratégico").
4. **≥2 few-shots** input→output (la dimensión más débil del ecosistema: promedio 3/10 antes).
5. Anti-patrones explícitos por agente.
6. Coordinación **bidireccional** con formato de handoff.
7. Formato de entrega estandarizado + firma.
8. **Cero estado de negocio hardcodeado** (el estado vive en tablero/tracker/DB, no en prompts)
   · cero emojis · México/MXN parejo · voz de cada agente conservada.

## Cambios por agente (líneas antes → después · lo esencial)

### VELUM (14)
| Agente | Δ | Cambio de fondo |
|---|---|---|
| NÚCLEO | 53→104 | Mapa de reparto con los 13 (antes 7: dinero caía en FORJA); exclusión mutua con CENTRO; tablero con sección [ESPERANDO A ROY]; reconciliación forzada si tablero >7 días |
| IMPULSO | 26→81 | Pricing canónico verificado contra DB (cotizaba Pro $599 muerto); ancla $33/día; BANT-lite; handoff a APOYO |
| VITRINA | 28→79 | "Precios se publican, no se deciden" (gate /spec+IMPULSO); terreno real (páginas por vertical, GA4); gates con evidencia |
| SEÑAL | 25→85 | Describía trámites de hace un año; ahora: PENDIENTES como acumulador, Flujo 6, device real con ambos tipos de socio, closed testing 12×14 |
| FORJA | 28→92 | Cableado a /spec + gate ESCUDO + Flujo 1; gotchas completos (btoa/UTF-8, Deno.serve, día 31, 23505, www artefacto) |
| ESCUDO | 31→101 | Flujo 2 (cadencia semanal + protocolo de fuga LFPDPPP); formato [SEV]; claims simulados con ambos roles |
| VOZ | 29→91 | Dueño del mensaje VELUM; LAZO como subcontratista de formato; Flujo 7 (pilares, GA4, 1 aprendizaje/ciclo) |
| APOYO | 24→96 | Flujos 3+5 ejecutables (activación 48h, checkpoints d7/d30, SLAs, clasificación bug/duda/dinero/datos); lección Functional Gym |
| CAUDAL | 28→108 | Pro is_active=false ("no reactivar ni cotizar"); 0% comisión documentado en código; diagrama webhook; CFDI mínimo |
| AURA | 30→93 | Tabla modelo-por-tarea; prompts viven en el código; eval antes/después obligatoria |
| CENTINELA | 24→102 | Plantilla de finding [P0/P1/P2]; veto formal (P0 abierto = deploy no se ofrece); es el VERIFY del Flujo 1 |
| ORÁCULO | 23→98 | Definiciones canónicas (MRR/activo/activación/churn/GMV); query patrón multi-tenant; eventos GA4; solo-lectura |
| TRAZO | 24→96 | Regla Inter-nunca-display; jurisdicción: en superficie VELUM, TRAZO gana a los LAZO; formato de auditoría |
| SPEC | 74→108 | (benchmark, retoque) +spec de ejemplo llena + ancla al Flujo 1 |

### LAZO (17)
| Agente | Δ | Cambio de fondo |
|---|---|---|
| CENTRO | 309→107 | Exclusión mutua con NÚCLEO; dejó de recitar el marco de NORTE y el estado muerto; brief de delegación de 5 campos; audit IG degradado a observación (→LUPA) |
| NORTE | 145→117 | Frontera estrategia(90d)/día-a-día(CENTRO); ofertas y targets a MXN ($8k–$35k/mes); "fase actual" ya no hardcodeada |
| FLUJO | 149→101 | Frontera oficial con MOTOR + desempate; referencia el CRM de MOTOR (nunca define el suyo); anti-patrones que prometía y no traía |
| MOTOR | 227→107 | DUEÑO único del CRM (10 etapas: Lead→…→Activo→Upsell — bug de etapas fantasma resuelto); anti-burocracia (3 veces→SOP) |
| VÍNCULO | 116→115 | Ya conoce su cadena: formatos de input de RADAR/LUPA/META; no re-pregunta lo que el dossier trae; DM ≤60 palabras, aperturas prohibidas |
| RADAR | 174→116 | Anti-alucinación: búsqueda web real o [SIN VERIFICAR]; nunca inventar URLs/handles; 6 verificados > 20 plausibles; fuente+fecha |
| LUPA | 213→120 | Rúbrica del score X/10; regla de las 2 líneas (micro-copy inline, lo largo → brief a VÍNCULO); frontera con META |
| META | 411→160 | Frontmatter duplicado corregido; módulos fantasma eliminados; MXN (test $3–5k/mes); árbol de diagnóstico ROAS con umbrales |
| PULSO | 139→122 | Soltó los guiones de reel (llega a idea+hook+3 actos = brief para FLICKER); conoce a CHISPA y su equipo |
| CHISPA | 186→129 | POR FIN DIRIGE: tabla de ruteo a sus 4 especialistas; soltó storyboards (→FLICKER) y sesiones (→ESCENA); tipografía única (display de marca, nunca Inter) |
| FLICKER | 156→126 | Triggers estrechados; prohibido inventar "retención X%" → puntos de fuga; dos puertas de entrada (PULSO/CHISPA) |
| ESCENA | 132→127 | Cliente LEFLOW des-horneado; frontera pieza(CHISPA)/campaña(ESCENA); números operativos (1 concepto + 3-5 key visuals + 10-15 tomas) |
| PIXEL | 122→162 | Reconoce a sus DOS directores (LIENZO web / CHISPA social); filosofía → mecánica (duraciones, beziers, stagger, reduced-motion) |
| FORGE | 121→120 | Estrechado a producto-con-login; frase imperialista eliminada; números (espaciado, 8 estados, ≥44px, AA); Inter nunca display |
| FRACTURA | 131→171 | Disrupción acotada (máx 2-3 rupturas contra base sólida); frontera bidireccional con DROP |
| DROP | 365→254 | Ejemplo trabajado de los 13 puntos (QUIET VOLUME 001); podado sin perder tablas técnicas |
| LIENZO | 262→262 | (benchmark, retoque) exclusiones del triángulo en description; PIXEL bajo su dirección con handoff; FORGE declarado par de producto |

## Mapa del ecosistema (quién hace qué, quién coordina a quién)

```
CONTEXTO VELUM (repo Move-System) — coordinador: NÚCLEO (Flujo 8)
  construir:  /spec → FORJA·CAUDAL·AURA → gate ESCUDO → VERIFY CENTINELA → OK Roy
  vender:     VOZ (mensaje) → VITRINA (web) → IMPULSO (cierre) → APOYO (retención)
  medir:      ORÁCULO (definiciones canónicas)   diseño: TRAZO (gana a LAZO en VELUM)
  app:        SEÑAL (única que compila/publica)

CONTEXTO LAZO — coordinador: CENTRO (día a día) · NORTE (estrategia 90d)
  prospección: RADAR → LUPA → VÍNCULO → META   (cadena con handoffs formateados)
  conversión:  FLUJO (recorrido del lead) sobre infraestructura de MOTOR (dueño del CRM)
  creativo:    PULSO (qué publicar) ↔ CHISPA (cómo se ve) → PIXEL·FRACTURA·ESCENA·FLICKER
  web:         LIENZO dirige → PIXEL anima      producto: FORGE      apparel: DROP

DESEMPATES CLAVE
  'buenos días/qué sigue' → NÚCLEO si es VELUM/repo · CENTRO si es LAZO
  'automatiza' → camino del lead=FLUJO · herramienta/proceso=MOTOR
  'guion de reel' → FLICKER (PULSO briefea, CHISPA dirige)
  'diseña X' → landing/web=LIENZO+PIXEL · producto con login=FORGE · pieza social=CHISPA
  'audita' → ads=META · presencia orgánica/landing=LUPA
  precio VELUM → IMPULSO decide (con /spec), VITRINA publica, nadie cotiza de memoria
```

## Ubicaciones y backups

- VELUM plugin (8): instalado `rpm/plugin_01WUiXkGeforKC1jrVzhJKMT/skills/` + fuente
  `outputs/velum-studio/skills/` (en espejo) · backup `_backup_20260703/` en ambos lados.
- VELUM repo (6): `Move-System/.claude/skills/` (commiteado) · backup en el repo.
- LAZO (16): cache de la app `local-agent-mode-sessions/skills-plugin/.../skills/` —
  **ADVERTENCIA: esa carpeta es re-sincronizable por la app.** Copias durables:
  `Documents/Lazo Growth Studio/agentes-skill-pulidos-20260703/` (nuevos) y
  `agentes-skill-backup-20260703/` (originales). Si la app revierte un skill, restaurar
  desde la carpeta de pulidos (o re-subirlos vía Ajustes → Capacidades/Skills).
- LIENZO: `~/.claude/skills/lienzo/` · backup `~/.claude/skills/_backup_20260703/`.

## Pendiente de Roy

**Desinstalar el META duplicado**: el plugin `lazo-meta` duplica al skill `meta` ya pulido.
En la app de Claude: Ajustes → Extensiones/Plugins → `lazo-meta` → desinstalar (o desde
terminal interactiva: `claude plugin remove lazo-meta` si lo instalaste por CLI). El skill
`meta` de la carpeta LAZO queda como única copia, ya pulida.
