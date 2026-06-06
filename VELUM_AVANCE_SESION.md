# VELUM — Bitácora de avance

**Última actualización:** 6 jun 2026
**Para:** Roy
**Qué es esto:** resumen de todo lo que se trabajó en la sesión, qué quedó vivo, y qué depende de ti.

---

## 1. Storefront — rediseño y personalización

- **Sistema de 3 temas** (Pulse oscuro/atlético · Atelier claro/editorial · Lumen cálido/wellness). Cada gym elige el suyo en Configuración → Branding.
- **Swatches de acento por tema** (reemplazaron el color libre que ya no servía con temas fijos). 6 colores curados por tema; el público deriva automáticamente las variantes y el contraste del texto.
- **Limpieza UX (PIXEL):**
  - Botones flotantes de 4 → 1 (arreglada la colisión IA/WhatsApp en móvil).
  - Paquetes subidos al 3er lugar (el precio se ve temprano, no enterrado).
  - Hero con 1 CTA dominante + ancla "Planes desde $X MXN".
  - Quité "Powered by VELUM" del nav (el gym es dueño de su marca; VELUM queda en el footer).
  - **Coach IA configurable por gym** (prominente para box/CrossFit, discreto para pilates/yoga).

## 2. Aura (rebrand del asistente)

- "Coach IA" → **"Aura"** en todo lo que ve el cliente: storefront, app del atleta, política de privacidad.
- System prompts actualizados (`storefront-ia-chat`, `velum-coach-ia`): Aura se presenta como persona, nunca como "IA/bot".
- Respeté los "Coach" que se refieren a tus coaches humanos reales.

## 3. App del atleta — coherencia visual

- **Armonía de acento con el storefront:** la app hereda el color de marca del gym (ajustado para que sea legible sobre fondo oscuro). App y tienda ya no chocan.
- **Loaders sin flash:** el storefront pre-pinta el tema cacheado y neutralicé el spinner; la app usa el acento del gym en la barra de carga.
- **Íconos limpios:** reemplacé emojis raros (el de "strength" que parecía enchufe, el rayo de cardio, la caja de cartón de paquetes) por íconos SVG consistentes.

## 4. Estrategia de pricing

- **Max = 0% comisión storefront** (Pro/sin-plan = 2%). Diferenciador fuerte vs Nessty Pro. Ya vivo en el checkout.
- **Cap del plan Pro: 100 → 60 atletas** (el estudio promedio en MX es ~50). Consistente en frontend, DB, checkout, tabla de planes y copy (landing/registro/términos).

## 5. Bloque A — Producto core (cerrado)

- **Cap duro de límites por plan:** trigger en base de datos (altas manuales) + pre-check en el checkout del storefront (cliente nuevo en gym Pro lleno se bloquea ANTES de cobrar). Ya no es solo cosmético de frontend.
- **Suscripción vencida:** gracia de 3 días → luego un modal bloquea el panel admin pidiendo reactivar el pago. El storefront y la app del atleta siguen vivos (no se corta el dinero del gym). Owner exento.

## 6. Bloque B — App del atleta (cerrado)

- **Renovación corregida (bug de dinero):** ahora el vencimiento se extiende desde `max(hoy, vencimiento_actual)` — si el atleta renueva con días restantes ya no los pierde. Y la renovación se registra con el nombre real del cliente (antes podía quedar "invisible" en el portal).
- **Push notifications automáticas:** 2 recordatorios diarios — clase de hoy (7am) y vencimiento en 3 días (10am). Infra completa con pg_cron, probada (200 OK).
- **Bonus de seguridad:** en la auditoría encontré y cerré un hueco que yo mismo había introducido (un RPC exponía tokens de portal a usuarios anónimos).

## 7. Bloque H — Limpieza de funciones legacy (parcial)

- `move-stripe-webhook` neutralizado (ya no procesa nada → cero riesgo de cobro doble desde ahí).
- **Hallazgo importante:** la app nativa (`velum-app`) quedó en el flujo de pago viejo y divergió de la web. Hay que reconciliarla antes de publicarla en tiendas.

## 8. Bloque D — Facturación CFDI (fase 1)

- Recolección de **datos fiscales del gym** (RFC, razón social, régimen, uso CFDI, CP, email) con un formulario en Mi Suscripción y un RPC acotado y seguro.
- El timbrado automático (Facturapi, ~$299/mes + $0.60/timbre) queda listo para cablear cuando consigas la cuenta + CSD.

## 9. Documentos creados

- `VELUM_AUDITORIA_COMERCIALIZACION.md` — auditoría completa por 13 áreas con los 7 bloqueadores y una secuencia de 90 días.

---

## ⚠️ Pendiente DE TU LADO (no lo puedo hacer yo)

1. **Subir el último push** (`git push`) — los cambios de formulario fiscal están commiteados, faltan de subir.
2. **Smoke test de renovación** con tarjeta real (validar que suma días + aparece en el portal).
3. **Confirmar VAPID keys** en Supabase (sin ellas los push corren pero no se entregan).
4. **Stripe (modo live):** confirmar que solo exista el endpoint de `stripe-webhook`.
5. **Borrar en Supabase** las funciones muertas: `move-payment`, `move-register`, `move-stripe-webhook`.
6. **CFDI:** conseguir cuenta Facturapi + tu CSD cuando quieras activar el timbrado.

## 🔜 Bloqueadores que faltan (del audit)

- **E** — Onboarding self-serve (wizard + import CSV).
- **F** — Emails transaccionales (welcome, recibo, vencimiento, recuperación).
- **G** — Hardening Fase B (los WARN del advisor).
- **CFDI fase 2** — factura gym→atleta (multi-RFC).
- **Reconciliar `velum-app`** con la web antes de tiendas.
