# Guía: Pasar Stripe de TEST a PRODUCCIÓN

**Para:** Roy / VELUM
**Cuándo hacerlo:** Cuando el flow completo de compra funcione en test (ya validado ✓) y estés listo para cobrar dinero real.
**Tiempo estimado:** 30-40 minutos
**Riesgo:** Bajo si sigues el orden. Alto si mezclas keys test/live.

---

## ⚠️ Antes de empezar — entiende esto

En Stripe, **test mode y live mode son mundos separados**:
- Las keys `sk_test_`/`pk_test_` solo mueven dinero falso.
- Las keys `sk_live_`/`pk_live_` mueven dinero real.
- Los webhooks, productos, cuentas conectadas (gyms) y Connect onboarding son **independientes** entre test y live. Lo que configuraste en test NO existe en live.

Esto significa que cuando pases a producción:
1. Cada gym tendrá que **volver a hacer el onboarding de Stripe Connect** (esta vez con datos reales y cuenta bancaria real).
2. Hay que crear un **webhook nuevo** apuntando al mismo edge function pero con secret de live.
3. Hay que actualizar las **3 secrets en Supabase** con los valores de live.

---

## Checklist de pasos (en orden)

### 1. Activar tu cuenta Stripe para live (si no lo está)

- Ve a https://dashboard.stripe.com
- **Apaga el toggle "Test mode"** (arriba a la derecha) para entrar a modo live
- Si te pide "Activate account" / "Activar cuenta": completa el formulario con tus datos reales de negocio:
  - RFC / datos fiscales reales
  - Cuenta bancaria CLABE real (donde VELUM recibirá las comisiones)
  - Verificación de identidad (tu INE real)
- Stripe revisa y activa (puede tardar minutos a 1-2 días)

### 2. Configurar Connect en live

- En modo live: Settings → Connect → Platform profile
- Repite la configuración que ya hiciste en test:
  - Liability for refunds/disputes → **Connected accounts**
  - Customer service → **Connected accounts**
  - Descripción de plataforma, industria, etc.
- Confirma los reconocimientos de responsabilidad (los "Confirmar" en azul)

### 3. Obtener las API keys de LIVE

- Settings → Developers → API keys (en modo live)
- Copia:
  - **Publishable key** → `pk_live_...`
  - **Secret key** → "Reveal live key" → `sk_live_...`
- ⚠️ **NUNCA pegues la `sk_live_` en un chat, email, ni en el código.** Va directo a Supabase secrets.

### 4. Crear el webhook de LIVE

- Modo live → Developers → Webhooks → Add endpoint
- URL del endpoint (la MISMA que en test):
  ```
  https://savzjanpydyjtrgdkllx.supabase.co/functions/v1/stripe-webhook
  ```
- Ámbito: **Tu cuenta**
- Eventos (los mismos 3):
  - `checkout.session.completed`
  - `checkout.session.expired`
  - `checkout.session.async_payment_failed`
- Crear → revelar el **Signing secret** → `whsec_...` (este es de LIVE, distinto al de test)

### 5. Actualizar las 3 secrets en Supabase

Ve a:
```
https://supabase.com/dashboard/project/savzjanpogiozccmrgnoxv/functions/secrets
```
(o el link de tu proyecto: `.../project/savzjanpydyjtrgdkllx/functions/secrets`)

Reemplaza los valores de estas 3 secrets con los de LIVE:

| Secret | Nuevo valor |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (el del webhook de live) |

Las edge functions las leen automáticamente — no hay que redeployar nada.

### 6. Cada gym debe re-conectar Stripe (en live)

Como las cuentas Connect de test NO existen en live, cada gym (incluyendo MOVE) debe:
1. Entrar a VELUM → Configuración → Stripe
2. Verás que aparece "Conectar Stripe" de nuevo (porque en live no hay cuenta)
3. Click → completar onboarding con datos reales + cuenta bancaria real
4. Quedará "Conectado ✓" en live

> **Nota técnica:** El `stripe_account_id` guardado en la tabla `gyms` es el de test (`acct_...`). Cuando un gym se reconecta en live, se genera un nuevo `acct_...` que reemplaza al de test. El sistema lo maneja automáticamente porque `stripe-connect-onboard` crea cuenta nueva si no hay una válida en el modo actual.

### 7. Smoke test en producción (con tarjeta real, monto bajo)

- Haz una compra real de prueba con un paquete barato (ej. crea un paquete de $10 MXN temporal)
- Usa tu tarjeta real
- Verifica que:
  - El pago aparece en el dashboard de Stripe (modo live)
  - Se creó el cliente + pago en VELUM
  - La comisión 2% aparece en el dashboard de comisiones (Superadmin)
  - El dinero llega a tu cuenta bancaria (los payouts de Stripe tardan 1-7 días la primera vez)
- Después borra el paquete de $10 de prueba

---

## Rollback (si algo sale mal)

Si en producción algo falla y necesitas volver a test temporalmente:
1. Restaura las 3 secrets en Supabase a los valores `_test_`
2. Reactiva el webhook de test
3. Los gyms vuelven a usar sus cuentas de test

Guarda los valores de test en un lugar seguro antes de sobreescribirlos.

---

## Diferencias clave test vs producción

| Aspecto | Test | Producción |
|---|---|---|
| Tarjetas | 4242 4242 4242 4242 | Tarjetas reales |
| Dinero | Falso | Real |
| Payouts al banco | No ocurren | 1-7 días (primera vez más lento) |
| Cuentas Connect | acct_ de test | acct_ de live (re-onboarding) |
| Webhook secret | whsec_ test | whsec_ live (distinto) |
| Comisión VELUM | Simulada | Real, llega a tu CLABE |

---

## Costos que debes saber (producción real)

- **Stripe cobra** ~3.6% + $3 MXN por transacción con tarjeta (México). Esto lo paga el gym (sale del monto), no VELUM.
- **VELUM cobra** 2% como application_fee (configurado en `stripe-checkout-create`, constante `VELUM_FEE_PCT = 0.02`).
- Ejemplo de una venta de $1,500:
  - Cliente paga: $1,500
  - Stripe se queda: ~$57 (3.6% + $3)
  - VELUM se queda: $30 (2%)
  - Gym recibe: ~$1,413

> Si quieres cambiar el 2%, edita la constante `VELUM_FEE_PCT` en el edge function `stripe-checkout-create` y redeploya.

---

**Última actualización:** 28 May 2026
**Owner:** Roy Cervus
