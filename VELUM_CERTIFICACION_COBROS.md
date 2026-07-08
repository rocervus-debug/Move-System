# Certificación de cobros con dinero real — checklist ejecutable
**Estado:** Fase A desplegada (07-jul) · paquetes demo $10 creados en MOVE (#28 único, #29
recurrente) · **costo total de las pruebas: ~$40-50 MXN** (a tu propio gym, recuperable).
**Regla de oro:** una prueba pasa solo con sus evidencias completas. Claude verifica DB y
panel; Roy aporta lo que ve en Stripe y su correo. Se hacen EN ORDEN y se marca cada una.

---

## [ ] PRUEBA 1 — Storefront, pago único (el riel rojo histórico)

**Roy:**
1. Abre `myvelum.app/g/movefitness`
2. Compra **"PRUEBA Pago único $10"** con tarjeta real (tu email)
3. Al ver la confirmación de Stripe, di **"pagado P1"**

**Claude verifica:** orden `paid` en `storefront_orders` → **fila en `pagos` con el mismo
`stripe_session_id`** (el bug de mayo) → cliente creado/reusado → visible en panel MOVE.
**Roy confirma:** email de recibo recibido · el pago aparece en Stripe dashboard.
**PASA si:** las 5 evidencias existen. (En mayo, 3 de 3 ventas fallaron aquí.)

## [ ] PRUEBA 2 — Link manual desde el panel (charge v16: auth + fee 0% + registro)

**Roy:**
1. Panel de MOVE → Cobros/Stripe → **Generar link de pago** · cliente: "Certificación",
   monto **$10**, pago único
2. Abre el link que genera y págalo
3. Di **"pagado P2"**

**Claude verifica:** que el link se generó (la función ahora exige tu JWT — si el botón
fallara, es hallazgo) → pago registrado en `pagos` vía la rama manual_link del webhook →
**comisión = $0** (MOVE es plan max: el fee 0% en acción) → visible en panel.
**Ya verificado hoy:** sin token la función responde 401 (evidencia adjunta en tablero).

## [ ] PRUEBA 3 — App / portal del atleta (renovación)

**Roy:**
1. Abre el portal de atleta de tu cuenta demo en MOVE (o la app) → sección de
   membresía/renovar → elige **"PRUEBA Pago único $10"** → paga
2. Di **"pagado P3"**

**Claude verifica:** mismo riel que P1 pero con `source='atleta_renewal'` en la orden →
pago en `pagos` → la membresía del atleta extendida (vence +30d).

## [ ] PRUEBA 4 — Domiciliación (recurrente completo: alta → cobro → cancelación)

**Roy:**
1. Storefront `myvelum.app/g/movefitness` → **"PRUEBA Domiciliación $10"** (o desde el
   panel → Domiciliados → generar link con el paquete #29) → completa el checkout
2. Di **"pagado P4"** → Claude verifica alta + primer cobro
3. Después: **cancela la suscripción** (desde el panel/Domiciliados) → di **"cancelada P4"**

**Claude verifica (2 momentos):** `member_subscriptions` con status `active`,
`stripe_subscription_id` y **`cliente_id` poblados** (fix v5) + fila en `pagos` de la
mensualidad + email de recibo · tras cancelar: status `canceled` en DB y en Stripe.

## [ ] PRUEBA 5 — SaaS gym→VELUM (trial → cobro del día 8 → cancelación)

**Preparación (Roy, 1 min):** en Stripe dashboard → Coupons → crea un cupón **100% off,
duración once** (p. ej. código CERTVELUM) — así el cobro de $999 ejecuta el riel completo
pero cobra $0. (Alternativa: pagar $999 y reembolsarte desde Stripe.)

**Roy:**
1. `myvelum.app/registro.html` con un email NUEVO tuyo (ej. ro.cervus+cert@gmail.com) →
   plan Max → en el checkout de Stripe usa el cupón → completa (pide tarjeta aunque sea $0)
2. Di **"registrado P5"** → Claude verifica: gym creado + usuario + `trialing` + login
3. En Stripe dashboard → esa suscripción → **"End trial now"** → di **"trial terminado P5"**
4. Claude verifica: `invoice.payment_succeeded` procesado → gym pasa a **`active`**
5. Cancela la suscripción en Stripe (o portal) → Claude verifica gym → `canceled`
6. Al final Claude borra el gym de prueba (con tu ok)

## [ ] PRUEBA 6 — Dunning (pago fallido) · PARCIAL por diseño

La tarjeta de fallo (4000 0000 0000 0341) solo existe en modo test de Stripe. Estado
honesto: la lógica está verificada en código (webhook → `past_due` + email `pago_fallido`
con link de pago). Dos opciones:
- **(a) Aceptar verificación de código** + monitoreo del primer fallo real (recomendado
  para no montar infraestructura de test-mode hoy). Se certifica "condicional".
- **(b) Certificación total:** configurar un webhook endpoint en modo TEST de Stripe
  apuntando a la misma función + repetir P4 en test-mode con la tarjeta de fallo.
  (~20 min extra, Roy en el dashboard.)

## Cierre

- P1-P5 en verde (+P6 según opción) → `VELUM_AUDITORIA_COBROS.md` pasa a **CERTIFICADO**
  con fecha y evidencias · borrar los paquetes PRUEBA (#28/#29) y el gym de prueba ·
  tablero a Hecho. Cualquier rojo → Flujo 1 como P0 y se re-certifica solo ese riel.
