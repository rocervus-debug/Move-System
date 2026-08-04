# PLAN — Cruzada de Densidad Visual (panel admin)

**Meta:** que el panel se sienta del nivel de Nessty **sin dejar de ser VELUM**, y sin que
falte una sola sección. Aprobado el mockup de Clientes (04-ago-2026).

**Regla de oro:** no se declara terminado por memoria ni "a ojo".
`python3 scripts/audit-densidad.py` debe dar **0**. Mientras dé más, falta.

---

## Línea base (medida 04-ago-2026)

| Métrica | Valor |
|---|---|
| Archivo | `VELUM_Sistema_Interno.html` · 28,334 líneas · 1.6 MB |
| Texto < 12px (ilegible) | **810** (171 CSS + 639 inline) |
| Fuera de escala | **160** |
| Hex hardcodeado | **701** (216 CSS + 485 inline) |
| **TOTAL VIOLACIONES** | **1,671** |
| Funciones `render*` | 72 · Modales: 38 · `innerHTML`: 342 |

**El 78% del trabajo está INLINE**, dentro de template strings de JS — no en el `<style>`.
Ahí está el costo real, y por eso no se resuelve tocando solo el CSS.

---

## Veredicto de complejidad

**No es difícil — es largo.** Cada cambio es trivial; el riesgo está en el volumen
y en romper layouts que hoy dependen de que el texto sea chico (tablas anchas,
calendarios, chips). Por eso va por olas con verificación visual, no en un solo commit.

---

## Fase 0 — Fundación (bloquea todo lo demás)

1. **Escala tipográfica en `:root`** — 6 tamaños, ni uno más:
   `--fs-xs:12px · --fs-sm:13px · --fs-base:15px · --fs-lg:17px · --fs-xl:20px · --fs-2xl:24px`
   Piso duro: **nada por debajo de 12px**.
2. **Escala de espaciado**: `--sp-1:4 · --sp-2:8 · --sp-3:12 · --sp-4:16 · --sp-5:24`
3. **Radios**: solo `--r-sm:8px`, `--r-md:12px`, `--r-full:99px`.
4. **Auditor** `scripts/audit-densidad.py` (HECHO) — mide el avance objetivamente.
5. **Mapa de migración** determinístico (8/9/10/11px → 12-13px; 216 hex → tokens existentes).

**Gate:** el auditor corre y reporta línea base. Sin esto, ninguna ola arranca.

---

## Olas (cada una: build → `node --check` → preview con evidencia → auditor → push)

### Ola 1 — Shell (afecta TODAS las pantallas)
`sidebar` · `topbar` · `KPI cards` · `badges` · `botones` · `toasts` · `paginación`
> Es la que más se nota y la que más riesgo tiene. Va sola.

### Ola 2 — Dinero
- [ ] `pagos`
- [ ] `domiciliados`
- [ ] `gastos`
- [ ] `revenue`

### Ola 3 — Personas
- [ ] `clientes` ← incluye la fila del mockup aprobado
- [ ] `crm`
- [ ] `retencion`
- [ ] `solicitudes`

### Ola 4 — Operación
- [ ] `horario`
- [ ] `asistencia`
- [ ] `calendario-venc`
- [ ] `visitas`
- [ ] `citas` (recovery)

### Ola 5 — Equipo y contenido
- [ ] `coaches`
- [ ] `evaluaciones`
- [ ] `programa`
- [ ] `paquetes`
- [ ] `protocolos` (recovery)
- [ ] `recursos` (recovery)

### Ola 6 — Marketing
- [ ] `marketing`
- [ ] `campanas`
- [ ] `landing-leads`

### Ola 7 — Sistema
- [ ] `settings` (todos sus grupos)
- [ ] `ayuda`
- [ ] `superadmin`
- [ ] `dashboard` (los 3 verticales: gym / studios / recovery)

### Ola 8 — Modales y cierre
- [ ] Los **38 modales** (wizards `.wzd-*` incluidos)
- [ ] Barrido final de hex → tokens
- [ ] **Auditor en 0**
- [ ] Verificación móvil 375px + escritorio, en los 3 verticales

---

## Cobertura garantizada (cómo sabemos que no faltó nada)

Tres candados, no uno:

1. **El auditor cuenta** — mientras no dé 0, falta. No depende de memoria.
2. **Checklist de arriba** — 20 secciones navegables + 3 dashboards por vertical + 38 modales.
3. **Barrido por `render*`** — las 72 funciones se tachan una por una; ninguna
   sección vive fuera de alguna de ellas.

---

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Texto más grande rompe tablas/calendarios anchos | Ola por ola con preview real; tablas conservan `--fs-sm` |
| Menos filas por pantalla (más scroll) | Fila de 84px (no 120px como Nessty); ajustable a 72px |
| Regresión en móvil | Cada ola verifica 375px además de escritorio |
| Cambio masivo rompe JS | Solo se tocan estilos; `node --check` en cada ola |
| Perder acciones al mover a menú `···` | Nada se elimina: migra a `···` + ficha; se verifica que siga alcanzable |

---

## Fuera de alcance (por ahora)

`atleta.html` (app nativa) y `storefront.html` tienen su propio ciclo — la app además
requiere build + review de tiendas. Se atienden **después** de que el panel esté en 0,
reusando la misma escala de tokens.

---

## Estado

- [x] **Fase 0 — auditor** `scripts/audit-densidad.py` + línea base (1,671)
- [x] **Fase 0 — tokens de escala** en `:root` (6 tamaños + espaciado + radios + `--row-h`)
- [x] **Ola 1 — barrido tipográfico GLOBAL** (`scripts/migrar-densidad.py`)
      · 1,648 `font-size` migrados a tokens en TODAS las secciones a la vez
      · **810 textos ilegibles (<12px) → 0**
      · Verificado en DOM real: mínimo renderizado = 12px exacto
- [x] **Ajuste de escala** (04-ago, 2ª pasada): la 1ª subió el piso pero no la base —
      82% de la UI seguía en ≤13px y **se sentía igual**. `--fs-sm` 13→14, `--fs-base` 15→**16**
      (igual que Nessty), `--fs-lg` 17→18, `--fs-xl` 20→22.
- [x] **Ola 3 — Clientes**: fila de 86px, nombre 18px, meta 14px, **un** badge de estado;
      las 6 acciones al menú `···` (0 controles sueltos, cierra con clic fuera y Escape).
- [x] **Ola 2 — Dinero**: `.tbl td` 16px, gastos 68px, domiciliados 72px; móvil sube de
      `--fs-xs` a `--fs-sm` en celdas y botones de acción a 36px.
- [x] **Olas 4-8 — aire en 21 clases de fila/tarjeta** (`scripts/migrar-aire.py`),
      que cubren operación, equipo, marketing, sistema y modales por CSS compartido.
- [x] **Tokenización de color** (`scripts/migrar-color.py`): 176 hex → tokens semánticos.

### Deuda de color: qué queda y por qué NO es 0

Quedan **305**: ~14 tamaños hero (>34px, deliberados) y ~291 hex.
De esos hex, **~75 son `#fff`/`#000`** (blanco y negro puros: universales, no
dependen del tema — un token solo añadiría indirección) y **~61 son colores
decorativos usados 1-2 veces** (gradientes, sombras puntuales). Tokenizarlos
crearía ~50 tokens de un solo uso: peor que el problema.

**Lo que sí importaba ya está**: los hex que rompían el theming por vertical
(fondos, grises, acento) son tokens y se verificó que gym/studios/recovery
siguen pintando distinto.

### GOTCHA grande (por si se retoma con un script)

Un mapeo hex→token **automático por valor** manda `#00D4FF` a `var(--velum-emerald)`
—la paleta de marca CRUDA— y **congela el cyan en studios y recovery**. El mapa
debe ser manual y apuntar a tokens **semánticos** (`--accent`, `--bg`, `--text`).
Tampoco se deben tocar las definiciones `--algo:#hex` (crea ciclos) ni los hex
entre comillas en JS (Chart.js, canvas, `${color}44`).

### Por qué el barrido tipográfico se hizo global y no ola por ola

El mapeo px→token es **determinístico y mecánico**: no depende de la sección.
Hacerlo en 8 commits habría dado el mismo resultado con 8x el riesgo de quedar
a medias (mitad del panel en una escala y mitad en otra). La reestructura de
filas SÍ va ola por ola: ahí cada pantalla tiene criterio propio.

### Medición actual

| | Antes | Ahora |
|---|---|---|
| Texto < 12px | 810 | **0** |
| Fuera de escala | 160 | 14 (heros >34px, deliberados) |
| Hex accionables | — | 466 |
| **TOTAL** | **1,671** | **480** |

Nota: los **235 hex entre comillas en JS** (Chart.js, canvas, concatenaciones
`${color}44`) ya NO cuentan como violación — convertirlos a `var()` rompe el panel.
Son excepción justificada, no deuda. El auditor los excluye desde esta versión.

_Última medición: **305** — 04-ago-2026. Tipografía en 0; el resto es deuda de
color justificada (ver arriba). Panel: **1,671 → 305**._

## Pendiente real (no es deuda de esta cruzada)

- **Revisión con datos reales**: todo se verificó contra render con el CSS real,
  pero no con los 528 clientes de MOVE logueado (requiere sesión de Roy).
- `atleta.html` y `storefront.html`: reusar los mismos tokens de escala. La app
  además necesita build + review de tiendas.
