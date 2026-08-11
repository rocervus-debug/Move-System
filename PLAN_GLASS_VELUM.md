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
- [x] **G2 — Dashboard fiel** (`92a9ab7`): hero "Hola, {nombre}" protagonista (fs-2xl blanco)
      sobre vidrio con canto; gym como secundario; stat-boxes en vidrio. GOTCHA: el hero usa
      estilos inline → la capa glass lleva `!important`.
- [x] **G3 — Gráficas pastel** (`3a5b0e8`): las 4 gráficas. Check-ins y balance usan
      `color-mix(var(--accent) 45%, white)` → cada vertical pasteliza SU acento; ingresos/
      gastos en los estados calmados; 6 grids con borderDash [4,4].
- [x] **G4 — Modales** (`5312b86`): vidrio profundo blur 22 + inputs translúcidos —
      verificado abriendo modal-solo-cliente en DOM real.
- [x] **G5 — Barrido completo** (`9303105`): las 18 vistas recorridas en DOM real midiendo el
      color computado de cada nodo de texto. Cazado: `--text4` invisible sobre vidrio (1.10 →
      `#8793A0`, 3.41), textos de hero con alfa .35 → .62+, 3 cajas QR sólidas → token elevado.
      Falsos positivos descartados: estrellas vacías, handles, btn-primary (negro sobre cyan).
      Solo queda la pasada de Roy logueado con datos reales.
- [x] **G6 — Auditor** (`65e3b8c`): `glass_check()` compone escena→lámina→tarjeta en los 6
      extremos y exige AA. **Cazó su primer bug real**: los grises del tema sólido fallaban
      sobre vidrio (text3 caía a 2.3) → en glass `--text2:#A8B4C0` / `--text3:#A2AEBB`, medidos.

## Riesgos aceptados / fuera de alcance

- **Modo claro** (`body.light-mode`): fuera de Ola G1; el glass es de tema oscuro.
  Se decidirá si el modo claro se glassifica o se retira.
- **Rail solo-íconos del mockup**: el sidebar real tiene ~20 secciones con etiqueta y los
  usuarios son dueños no técnicos — G1 glassifica el sidebar actual (con etiquetas);
  si Roy quiere el rail literal, va como variante colapsada con tooltips en G5.
- Rendimiento en Android de gama baja: presupuesto de blur (lámina+topbar+modal) y fallback.

_Estado: G1-G4 y G6 COMPLETOS, G5 barrido estático — 11-ago-2026. Falta: pasada de Roy con datos reales; decidir modo claro; rail solo-íconos como variante opcional._
