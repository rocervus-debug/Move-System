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

- [x] **G1 — Shell** (`83f9aec`): escena por vertical + lámina + sidebar/topbar vidrio +
      tokens translúcidos. GOTCHA: la escena lleva `!important` (una regla `body` posterior
      de menor especificidad ganaba el background-image en runtime).
- [~] **G2 — Dashboard fiel** (`5312b86` parcial): KPIs con degradado de canto; FALTA hero
      "Hola, {nombre}" + ícono circular en KPI + actividad estilo mockup (edita renderDashboard).
- [~] **G3 — Gráficas pastel** (`85da3cc` inicio): barras del historial de ingresos ya en
      pastel (radius 10, sin borde). FALTAN: checkins (línea L~17497), balance (L~19596),
      revenue superadmin (L~28016) y grid punteado.
- [x] **G4 — Modales** (`5312b86`): vidrio profundo blur 22 + inputs translúcidos —
      verificado abriendo modal-solo-cliente en DOM real.
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
