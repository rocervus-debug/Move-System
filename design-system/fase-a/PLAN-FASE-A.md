# VELUM · Fase A — Plan técnico de arranque (bajo riesgo)

> Objetivo: dejar lista la **plataforma segmentada** para 3 verticales
> (**velum** = gym/hyrox/tradicional · **studios** · **recovery**) sin dañar
> lo que hoy factura. Todo **aditivo, reversible, verificado paso a paso**.

## Medidas de seguridad (no negociables)
1. **Rama `feature/verticales-fase-a`** — nada toca `main` hasta que Roy revise/mergee.
2. **Aditivo siempre** — columnas/tablas/funciones nuevas; **cero** cambios destructivos a lo existente.
3. **El panel actual sigue vivo e intacto** mientras se construye. Su look no cambia (el tema base = el cian de hoy).
4. **DB a producción solo con OK explícito** (como el fix del kiosko). Las migraciones quedan como archivos revisables primero.
5. **Verificar cada bloque** (node --check, preview, prueba de RLS con claims simulados) antes de avanzar.
6. **Reversible** — cada migración trae su rollback escrito.

## Qué se toca vs qué queda intacto

| Queda **intacto** | Se **agrega** (aditivo) |
|---|---|
| `VELUM_Sistema_Interno.html` (lógica, queries, RLS) | `design-system/velum-verticales.css` (tokens + temas) |
| Todas las tablas y columnas actuales | `gyms.vertical` (default `'velum'`) + `gym_vertical()` |
| El aislamiento `gym_id = auth_gym_id()` | Tablas nuevas SOLO cuando toque (waitlist, spots, recursos) — con la misma RLS |
| Los 6 gyms actuales (siguen como `velum`) | Lectura del vertical para pintar tema + módulos |

## Secuencia (cada paso es entregable y seguro)

**A.1 — Design system canónico** ✅ *(hecho en esta rama)*
`design-system/velum-verticales.css`: usa los mismos nombres de variable del panel (`--accent`, `--bg`, `--card`…). Base = idéntico al actual → adoptarlo no cambia el look. Studios y Recovery sólo se activan con `data-vertical`.

**A.2 — Contrato de datos** 📄 *(archivo listo, aplicar con OK)*
`fase-a/01_vertical_profile.sql`: agrega `gyms.vertical` (default `'velum'`, CHECK a las 3) + helper `gym_vertical()`. Aditivo, con rollback. **Pendiente: tu OK para aplicar a producción.**

**A.3 — Puente de tema en el panel (1 línea de efecto)**
Al cargar el panel, leer `gyms.vertical` del gym del usuario y poner `document.body.dataset.vertical`. Incluir `velum-verticales.css`. Resultado: un gym `studios` ve el panel en champagne; uno `velum` lo ve igual que hoy. **Sin tocar lógica de datos.**

**A.4 — Toggle de módulos por vertical**
El sidebar y las rutas leen el preset del vertical (o el `vertical_profile` de `gym_config`) para mostrar/ocultar módulos y cambiar vocabulario (ej. "clase" → "sesión" en Recovery). Diccionario central, no `if` regados.

**A.5 — Completar lo class-based (sólo Studios lo necesita)**
Crear `waitlist` (la deuda detectada en auditoría) y `spots`/`reformers`, con `gym_id` + `gym_isolation`. Calendario de reservas con asignación de spot + waitlist. Aditivo.

**A.6 — Modelo de recurso reservable (sólo Recovery)**
Tabla `recursos` (sauna, cabina, camilla) + agenda por recurso + protocolos. Es el módulo más nuevo; se hace al final, aislado, sin tocar nada de los otros dos.

## App del atleta — un solo app, tematizado por negocio

La app (`atleta.html` → `build.js` → app nativa) **se queda igual para todos**: misma funcionalidad, mismo código. Sólo cambia la **piel** según el negocio del atleta.

- La app **ya** lee config del gym (`gym_config`: nombre, logo, color). Extender eso para leer también `gyms.vertical` y aplicar el set de tokens correcto (los mismos de `velum-verticales.css`).
- Un atleta de un Studios ve su app en champagne premium; uno de un gym tradicional la ve en cian; uno de Recovery en salvia. **Cero forks del código de la app** — sólo un atributo de tema.
- Cambio contenido y de bajo riesgo: vive en `atleta.html` (separado del panel) y se reconstruye con `build.js` (no se edita el `www` artefacto a mano).

## El estándar de diseño (compromiso)
`velum-verticales.css` + la gramática de componentes de los mockups (cards, KPIs con jerarquía, espacio que respira) son **la barra de calidad de todo el sistema, siempre**. Lo nuevo (Studios, Recovery) **nace** a ese nivel. El panel actual se sube a ese nivel **módulo por módulo** — ya empezamos con los wizards guiados, que ya están en esa barra.

## Orden de lanzamiento recomendado
1. **velum (gym/hyrox/tradicional)** — el actual, elevado al estándar de diseño. Casi todo hecho.
2. **studios** — base lista (reservas+créditos), faltan waitlist+spots.
3. **recovery** — el de más construcción (recurso reservable), mayor mercado desatendido.

## Lo único que necesita tu decisión ahora
- ¿Aplico `01_vertical_profile.sql` a producción (aditivo, reversible) para habilitar A.3/A.4? Es el desbloqueo para que el theming por vertical funcione en datos reales.
