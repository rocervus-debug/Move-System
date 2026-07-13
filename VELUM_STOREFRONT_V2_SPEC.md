# SPEC: Storefront v2 — "Página del Estudio" + directorio Descubre

**Estado:** APROBADA por Roy (2026-07-11) con 3 ajustes: wizard en cada acción, default claro,
Pulse como preset opcional. Mockup de referencia validado (scratchpad sesión d27ba3eb:
`storefront-v2-mockup.html`).

**Qué**: Rediseñar la página pública del gym (`storefront.html`) al patrón Nessty (galería +
tabs + un CTA) con personalización guiada por wizard, y un directorio "Descubre" que agrupe
los negocios por vertical.

**Por qué / problema real**: el storefront actual es una landing de VELUM apuntada al atleta
(13 secciones, 5.4 pantallas, 23 botones, features del SaaS en el hero). El atleta solo quiere
ver horario y reservar. Los dueños lo perciben "muy lleno y complejo" — traba real de venta.
Referencia competitiva: nessty.mx (marketplace: 3 tabs, foto-first, 1 CTA) — pero cobra por
aparecer junto a competidores y no personaliza. VELUM: página propia, 0% comisión, personalizable.

## Criterios de aceptación (medibles)

**Fase 1 — Página del Estudio:**
1. La página del gym rinde: galería hero (fotos del gym; sin fotos → fallback color de marca) +
   nombre + 1 línea + chips → **4 tabs** (Horario · Planes · El espacio · Ubicación) → **1 CTA
   sticky** configurable. Cero features de VELUM en el hero; "con VELUM" solo al pie. Aura queda
   como burbuja.
2. **Los 4 presets** (Claro **default** · Pulse · Atelier · Lumen) portados del sistema
   `STOREFRONT_THEMES` existente + acento libre vía `applyAccent()`. **Claro es el
   predeterminado para gyms nuevos** (Pulse se conserva como opción, no como cara). Todo AA.
3. **Nada de flujo roto**: reservar clase, comprar paquete (checkout certificado), lead capture
   y chat Aura funcionan idéntico que hoy. CENTINELA verifica reservar+comprar end-to-end en demo.
4. **Wizard "Personaliza tu página" en el panel admin** (sistema `.wzd-*` existente), para
   dueños no técnicos — lenguaje simple, una decisión por paso, preview en vivo:
   Paso 1 Fotos (subir 1-4, ejemplo visual, se puede saltar) → Paso 2 Estilo (4 presets con
   miniatura) → Paso 3 Tu color (swatches + hex; contraste automático) → Paso 4 Textos (línea
   de descripción + texto del CTA: "Reservar clase" / "Clase de prueba gratis") → Paso 5
   Paquete recomendado (elegir 1) → Paso 6 Vista previa + Publicar. Re-entrable para editar.
5. Config nueva en `gym_config` (llaves: `sf_theme`, `sf_fotos`, `sf_cta`, `sf_pkg_rec`,
   `sf_tabs`, `sf_descubre_optin`) — sin migración de tablas, sin tocar RLS existente.

**Fase 2 — Descubre (directorio):**
6. **UNA página** (`descubre.html`) con chips de filtro por vertical (Gym·Studios·Recovery) y
   ciudad — NO tres tableros separados. Tarjetas estilo Nessty (foto, logo, nombre, disciplinas)
   → clic → `/g/slug`.
7. **Regla de una vía**: el directorio enlaza al gym; la página del gym NUNCA enlaza de vuelta
   ni muestra competidores (anti-Nessty, es el pitch).
8. **Opt-in** del gym (default ON en Max, se puede salir desde el wizard) y gratis (0% comisión).
   Solo aparecen gyms `activo=true` con storefront publicado.

## Alcance
- SÍ: reorganización de storefront.html (los datos/checkout ya existen), presets, wizard en
  panel, descubre.html.
- NO: cambios al checkout/pagos (recién certificados — no se tocan), ni al flujo de reservas,
  ni esquema de tablas nuevas, ni app del atleta.

## Toca
`storefront.html` (reorganizar) · `VELUM_Sistema_Interno.html` (wizard `.wzd-*` + sección
config) · `descubre.html` (nuevo) · llaves en `gym_config` (datos, no DDL).

## Agentes
VITRINA+FORJA construyen · TRAZO dirección visual (mockup ya validado) · CENTINELA verifica
flujos de dinero/reserva · ESCUDO revisa que las llaves nuevas de gym_config respeten
aislamiento por gym.

## Riesgos y mitigación
- Romper checkout al reorganizar → el DOM de checkout/modales se mueve INTACTO dentro de los
  tabs; prueba end-to-end con gym demo antes de deploy.
- Fotos pesadas del gym → compresión client-side al subir (canvas → JPEG ≤400KB).
- Directorio vacío al inicio → se lanza como "escaparate" de prueba social (marketing a dueños),
  no como marketplace consumer; el copy de la página lo refleja.
- Contraste con acento libre → `applyAccent()` ya calcula tinta según luminancia; validar AA.

## Preguntas abiertas
- Ninguna bloqueante. (Dominio propio por gym = fuera de alcance, futuro.)

**Estimación:** Fase 1 = L · Fase 2 = S. **Verificación:** node --check + preview con evidencia
por tab + reservar/comprar en demo + claims de gym B (no ve config del gym A).
