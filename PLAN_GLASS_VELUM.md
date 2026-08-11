# PLAN — Migración Glass VELUM (panel)

**Contrato visual:** los mockups aprobados por Roy (11-ago-2026):
`velum-glass-fiel.html` y `velum-glass-verticales.html` (scratchpad de la sesión).
Estética 100% pegada al concepto: **una lámina de vidrio ahumado** sobre la **escena de
niebla simulada en CSS**, rail/sidebar de vidrio, tarjetas internas en vidrio oscuro,
acento y escena por vertical (gym bruma fría cyan · studios champagne oro · recovery salvia menta).

## La arquitectura que lo hace barato y seguro

1. **Solo la LÁMINA lleva `backdrop-filter`** (más topbar y modales). Las tarjetas internas
   son rgba translúcido SOBRE la lámina ya difuminada → look glass sin costo extra de GPU.
2. **El vidrio entra por TOKENS**: `--card/--bg-card/--card2/--border` pasan de hex sólido a
   rgba translúcido → las 20 secciones y 38 modales lo heredan sin tocar sus templates.
3. **La escena es CSS puro** (gradientes + bruma + viñeta), re-tintada por
   `body[data-vertical]` — 0 KB de assets, contraste controlado.
4. **Fallbacks**: móvil ≤768 baja el blur; `@supports` sin backdrop-filter → lámina sólida.

## Olas

- [ ] **G1 — Shell**: escena por vertical + lámina + sidebar vidrio + topbar + tokens
      translúcidos + modales con blur. (Esto ya hace que TODO el panel se vea glass.)
- [ ] **G2 — Dashboard fiel**: hero "Hola, {nombre}", KPIs con ícono circular, actividad
      reciente estilo mockup.
- [ ] **G3 — Gráficas pastel**: barras redondeadas pastel + dona con hueco (los hex de
      Chart.js son dinámicos — se cambian en su config JS, no por token).
- [ ] **G4 — Modales/wizards** pulidos al vidrio profundo del mockup.
- [ ] **G5 — Barrido por sección** (dinero → personas → operación → resto) + móvil real.
- [ ] **G6 — Auditor**: chequeo AA de texto sobre vidrio + verificación 3 verticales.

## Riesgos aceptados / fuera de alcance

- **Modo claro** (`body.light-mode`): fuera de Ola G1; el glass es de tema oscuro.
  Se decidirá si el modo claro se glassifica o se retira.
- **Rail solo-íconos del mockup**: el sidebar real tiene ~20 secciones con etiqueta y los
  usuarios son dueños no técnicos — G1 glassifica el sidebar actual (con etiquetas);
  si Roy quiere el rail literal, va como variante colapsada con tooltips en G5.
- Rendimiento en Android de gama baja: presupuesto de blur (lámina+topbar+modal) y fallback.

_Estado: arrancando G1 — 11-ago-2026_
