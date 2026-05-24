# VELUM Storefront — Arquitectura Técnica

**FASE 10 · Mayo 2026**

Este documento describe la arquitectura completa del Storefront público de VELUM: la página que cualquier prospecto puede visitar para conocer un gym, hablar con Coach IA y comprar un paquete sin intervención del gym.

---

## 1. Visión general

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   PROSPECT (cualquiera con el link)                             │
│   ───────────────────────────────                               │
│   myvelum.app/g/iron-box-bajio                                  │
│                          │                                      │
│                          ▼                                      │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  VERCEL · Storefront static HTML + JS                    │  │
│   │  ─────────────────────────────────────                   │  │
│   │  - Hero, paquetes, horario, testimonios                  │  │
│   │  - Widget IA chat (floating)                             │  │
│   │  - Checkout modal (Stripe Elements)                      │  │
│   └──────────────────────────────────────────────────────────┘  │
│                          │                                      │
│            ┌─────────────┴─────────────┐                        │
│            ▼                           ▼                        │
│   ┌────────────────────┐    ┌─────────────────────────┐         │
│   │  SUPABASE          │    │  SUPABASE EDGE          │         │
│   │  Postgres + RLS    │    │  FUNCTIONS              │         │
│   │  ───────────       │    │  ─────────────          │         │
│   │  gym_storefront    │    │  /storefront-render     │         │
│   │  storefront_pkgs   │    │  /storefront-ia-chat    │         │
│   │  storefront_carts  │    │  /storefront-checkout   │         │
│   │  storefront_txn    │    │  /stripe-webhook        │         │
│   │  ia_conversations  │    │  /cart-recovery (cron)  │         │
│   └────────────────────┘    │  /commission-payout(crn)│         │
│                             └─────────────────────────┘         │
│                                          │                      │
│            ┌─────────────────────────────┼────────────────┐     │
│            ▼                             ▼                ▼     │
│   ┌──────────────┐         ┌──────────────────┐   ┌──────────┐ │
│   │  STRIPE      │         │  CLAUDE API      │   │  META    │ │
│   │  Connect     │         │  (Sonnet/Haiku)  │   │  WA BIZ  │ │
│   │  Payments    │         │  Coach IA chat   │   │  API     │ │
│   │  + Webhooks  │         │  + recomendación │   │  Recovery│ │
│   └──────────────┘         └──────────────────┘   └──────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| **Frontend** | HTML/CSS/JS vanilla (igual que `atleta.html`) | Consistencia con resto de VELUM, sin framework overhead |
| **Hosting** | Vercel (rutas en `vercel.json`) | Ya está en producción |
| **DB** | Supabase Postgres + Row Level Security | Existente |
| **API** | Supabase Edge Functions (Deno) | Existente, low cold start |
| **Pagos** | Stripe Connect Standard | Por gym, comisión auto-split, payouts directos |
| **IA** | Claude API (Sonnet 4.6 + Haiku 4.5 routing) | Mejor calidad ES + cost-efficient |
| **WhatsApp** | Meta WhatsApp Business Cloud API | Single gateway, plantillas aprobadas |
| **Tracking** | Meta Pixel + Stripe Conversion API | Server-side primary, client-side complement |
| **Cron jobs** | Supabase pg_cron extension | Built-in scheduling |

---

## 3. Edge Functions necesarias

Cada función vive en `/supabase/functions/{name}/index.ts` y se invoca vía HTTPS.

### 3.1 `storefront-render` *(opcional — solo si quieres SSR)*

**Trigger:** GET request a `/g/{slug}` desde Vercel rewrite
**Output:** HTML pre-renderizado con datos del gym (para SEO)
**Decisión:** Para MVP puede saltarse — render client-side fetcheando de Supabase es suficiente.

### 3.2 `storefront-config`

**Trigger:** GET `/api/storefront/{slug}`
**Auth:** Anónima (clave anon)
**Output:** JSON con config del gym, paquetes activos, próximas clases

```typescript
// Request
GET /api/storefront/iron-box-bajio

// Response
{
  "gym": {
    "id": "uuid",
    "name": "Iron Box Bajío",
    "slug": "iron-box-bajio",
    "location": "León, Gto",
    "description": "...",
    "google_rating": 4.9,
    "review_count": 87,
    "primary_color": "#00D4FF"
  },
  "packages": [
    { "id": "uuid", "name": "Pack 10 clases", "price_mxn": 1500, "is_featured": true, ... }
  ],
  "upcoming_classes": [
    { "id": "uuid", "name": "WOD", "time": "2026-05-21T18:00:00Z", "spots_available": 7 }
  ]
}
```

### 3.3 `storefront-ia-chat`

**Trigger:** POST `/api/storefront/{slug}/chat`
**Auth:** Anónima
**Body:** `{ session_id, message, conversation_history? }`
**Logic:**

1. Recupera contexto del gym + paquetes (cacheable)
2. Construye system prompt con info del gym
3. Llama Claude API (con prompt caching del system prompt)
4. Si la conversación está madura, sugiere paquete
5. Persiste conversación en `ia_conversations_public`
6. Retorna respuesta + sugerencias clickeables + opcional: package_recommended

```typescript
// System prompt template
const systemPrompt = `
Eres Coach IA de ${gym.name}, gym de CrossFit en ${gym.location}.

INFORMACIÓN DEL GYM:
${gym.description}
- Coaches: ${gym.coaches.join(', ')}
- Apertura: ${gym.opened_year}
- Rating: ${gym.google_rating}★ (${gym.review_count} reseñas)

PAQUETES DISPONIBLES:
${packages.map(p => `- ${p.name}: $${p.price_mxn} MXN (${p.description})`).join('\n')}

TU OBJETIVO:
1. Conocer el objetivo del prospect (perder peso, ganar fuerza, etc)
2. Conocer su nivel y disponibilidad
3. Recomendar el paquete ideal
4. Cerrar con CTA a comprar

TONO: Cálido pero directo. Español MX. Sin promesas exageradas.
NUNCA: Inventes precios, horarios o coaches.
`;
```

**Costo estimado por conversación:** ~$0.012 USD (con cache de system prompt al 90%)

### 3.4 `storefront-checkout`

**Trigger:** POST `/api/storefront/{slug}/checkout`
**Auth:** Anónima
**Body:** `{ package_id, email, name, phone, session_id }`
**Logic:**

1. Crea/actualiza row en `storefront_carts` (status: active)
2. Crea Stripe PaymentIntent con `application_fee_amount` = comisión VELUM
3. Stripe Connect account_id del gym es destino del split
4. Retorna `client_secret` para Stripe Elements
5. Frontend muestra Stripe Elements para captar tarjeta

```typescript
// Stripe Connect split payment
const paymentIntent = await stripe.paymentIntents.create({
  amount: package.price_mxn * 100, // cents
  currency: 'mxn',
  application_fee_amount: velum_commission * 100,
  transfer_data: {
    destination: gym.stripe_account_id
  },
  metadata: {
    cart_id, gym_id, package_id, session_id
  }
});
```

### 3.5 `stripe-webhook`

**Trigger:** POST `/api/stripe/webhook` (Stripe llama)
**Auth:** Stripe signature verification
**Eventos manejados:**

- `payment_intent.succeeded` → ejecuta flujo de fulfillment
- `payment_intent.payment_failed` → marca cart como expired
- `charge.refunded` → updatea transaction status

**Flujo `payment_intent.succeeded`:**

```
1. Insertar storefront_transaction (status: completed)
2. Calcular comisión VELUM via calc_velum_commission()
3. Crear/buscar usuario auth (atletas table)
   - Si existe: link a este gym
   - Si nuevo: signUp con email + temp password
4. Asignar paquete al usuario (existing logic de packages)
5. Disparar onboarding:
   - WhatsApp: credenciales + link a app
   - Email: bienvenida + recibo + credenciales
   - SMS opcional con código de acceso
6. Marcar cart como 'completed'
7. Si conversación IA → marcar led_to_purchase = true
```

### 3.6 `storefront-onboarding-send`

**Trigger:** Invocada desde `stripe-webhook` post-success
**Logic:** Manda WhatsApp + email con credenciales

```typescript
await fetch('https://graph.facebook.com/v18.0/{PHONE_ID}/messages', {
  method: 'POST',
  headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
  body: JSON.stringify({
    messaging_product: 'whatsapp',
    to: customer_phone,
    type: 'template',
    template: {
      name: 'velum_credentials_v1',
      language: { code: 'es_MX' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: customer_name },
          { type: 'text', text: gym_name },
          { type: 'text', text: app_login_url },
          { type: 'text', text: temp_password }
        ]
      }]
    }
  })
});
```

### 3.7 `cart-recovery` *(cron · cada 15 min)*

**Trigger:** Supabase pg_cron schedule
**Logic:**

1. Llama `mark_abandoned_carts()` para marcar carritos abandonados
2. Busca carts con status='abandoned' AND recovery_message_sent=false AND visitor_phone IS NOT NULL
3. Para cada uno:
   - Genera mensaje IA personalizado: "Vi que viste el plan X, ¿alguna duda?"
   - Envía vía WhatsApp Business API
   - Marca `recovery_message_sent = true`
4. 24h después: secuencia con descuento (si configurado)

**Cron en pg_cron:**

```sql
SELECT cron.schedule(
  'storefront-cart-recovery',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/cart-recovery',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
  ); $$
);
```

### 3.8 `commission-payout` *(cron · día 1 de cada mes)*

**Logic:**

1. Para cada gym, suma `velum_commission_mxn` del mes anterior
2. Crea row en `commission_payouts`
3. Genera invoice en Stripe (o descuento directo del payout vía Connect)
4. Marca como `invoiced`

---

## 4. Stripe Connect setup

### 4.1 Onboarding flow del gym

Cuando un gym activa Storefront, lo redirigimos a Stripe Connect onboarding:

```
1. Backend crea Connect account:
   stripe.accounts.create({
     type: 'express',
     country: 'MX',
     email: gym.owner_email,
     capabilities: {
       card_payments: { requested: true },
       transfers: { requested: true }
     }
   })

2. Genera AccountLink:
   stripe.accountLinks.create({
     account: account.id,
     refresh_url: 'https://myvelum.app/app/storefront/setup',
     return_url: 'https://myvelum.app/app/storefront/done',
     type: 'account_onboarding'
   })

3. Redirige al gym al link de Stripe
4. Cuando regresa: stripe_account_id queda guardado
   gym_storefront.stripe_account_id + stripe_onboarded = true
```

### 4.2 Split payment

En cada PaymentIntent (función 3.4) usamos `transfer_data.destination` con la cuenta del gym. Stripe automáticamente:

- Cobra al cliente
- Descuenta su fee (2.9% + $3 MXN)
- Descuenta tu `application_fee_amount` (comisión VELUM)
- Deposita el neto en cuenta del gym

**Nada de manejar dinero tú directamente. Stripe Connect hace el split en tiempo real.**

### 4.3 Refunds

Si gym aprueba refund desde su panel:

```typescript
await stripe.refunds.create({
  payment_intent: transaction.stripe_payment_intent_id,
  reverse_transfer: true, // recupera el monto del gym
  refund_application_fee: true // VELUM también devuelve su comisión
});
```

---

## 5. WhatsApp Business API setup

### 5.1 Cuenta Meta Business

1. Crear Meta Business Manager para VELUM
2. Verificar negocio (KYC con SAT)
3. Crear WhatsApp Business Account
4. Comprar número dedicado o usar +1 de Twilio/360dialog provider

### 5.2 Plantillas a aprobar

Meta aprueba plantillas para mensajes outbound (24h fuera de conversación activa).

**`velum_credentials_v1`** (post-pago):

```
¡Hola {{1}}! 🎉

Tu compra en {{2}} fue confirmada.

🔐 Accede a tu app:
{{3}}
Contraseña temporal: {{4}}

Tu Coach IA personal ya te espera con tu primer plan.
```

**`velum_cart_recovery_v1`** (10 min después de abandono):

```
Hola, vi que estabas viendo el plan {{1}} en {{2}}.

¿Te quedó alguna duda? Puedo ayudarte ahora mismo 💪

{{3}} ← Continúa tu compra
```

**`velum_cart_discount_v1`** (24h después):

```
{{1}}, te regalamos $100 OFF para que pruebes {{2}} hoy.

Código: {{3}}
Vigencia: solo hoy.

{{4}} ← Reclamar descuento
```

---

## 6. Routing Vercel

Agregar a `vercel.json`:

```json
{
  "routes": [
    { "src": "/g/(?<slug>[^/]+)", "dest": "/storefront.html?slug=$slug" },
    { "src": "/g/(?<slug>[^/]+)/chat", "dest": "/storefront.html?slug=$slug&view=chat" },
    { "src": "/api/storefront/(?<slug>[^/]+)", "dest": "https://<supabase>.functions.supabase.co/storefront-config?slug=$slug" }
  ]
}
```

---

## 7. Variables de entorno necesarias

Agregar a Vercel + Supabase secrets:

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

# Claude API
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL_DEFAULT=claude-sonnet-4-6
CLAUDE_MODEL_LIGHT=claude-haiku-4-5

# WhatsApp Business
WHATSAPP_TOKEN=EAA...
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_BUSINESS_ACCOUNT_ID=987654321

# Cron secret (para autorizar llamadas internas)
CRON_SECRET=<random 32-byte hex>

# Meta Pixel
META_PIXEL_ID=1234567890
META_CONVERSION_API_TOKEN=EAA...
```

---

## 8. Flujos clave (sequence diagrams)

### 8.1 Compra exitosa via IA

```
Prospect       Storefront       IA Chat       Stripe         Supabase       WhatsApp
   │              │                │            │                │               │
   │ visita /g/x  │                │            │                │               │
   │─────────────>│                │            │                │               │
   │              │                │            │                │               │
   │ abre widget  │                │            │                │               │
   │─────────────>│                │            │                │               │
   │              │ POST /chat     │            │                │               │
   │              │───────────────>│            │                │               │
   │              │                │ stream    │                │               │
   │              │<───────────────│            │                │               │
   │ ve recom.    │                │            │                │               │
   │<─────────────│                │            │                │               │
   │              │                │            │                │               │
   │ click "buy"  │                │            │                │               │
   │─────────────>│ POST /checkout │            │                │               │
   │              │────────────────────────────>│ create PI      │               │
   │              │                │            │───────────────>│ insert cart   │
   │              │ client_secret  │            │                │               │
   │              │<────────────────────────────│                │               │
   │ Stripe form  │                │            │                │               │
   │<─────────────│                │            │                │               │
   │              │                │            │                │               │
   │ paga         │                │            │                │               │
   │─────────────>│                │            │                │               │
   │              │                │            │ payment.succ.  │               │
   │              │                │            │───────────────>│ webhook       │
   │              │                │            │                │ create user   │
   │              │                │            │                │ assign pkg    │
   │              │                │            │                │ update cart   │
   │              │                │            │                │ insert txn    │
   │              │                │            │                │──────────────>│
   │              │                │            │                │               │ envía credenciales
   │              │                │            │                │               │─────>│ Prospect
   │ ve success   │                │            │                │               │
   │<─────────────│ redirect       │            │                │               │
```

### 8.2 Cart abandonado y recuperado

```
T+0min:    Prospect entra checkout, captura email → cart status=active
T+30min:   cron mark_abandoned_carts() → status=abandoned
T+30min:   cart-recovery cron detecta → genera msg IA → envía WA template
T+1h:      Prospect responde WA → IA conversa
T+1.5h:    Prospect click link → vuelve a checkout con cart restaurado
T+1.5h:    paga → status=recovered + completed
T+1.5h:    métrica: 33% recovery rate (industry avg)
```

---

## 9. Testing strategy

### 9.1 Tests críticos

| Test | Cómo |
|---|---|
| **RLS aislamiento entre gyms** | Crear 2 gyms, intentar leer storefront del otro como autenticado del primero |
| **Anon read solo a enabled storefronts** | Llamar API anónima a gym con is_enabled=false → debe retornar empty |
| **Comisión cap mensual** | Insertar transactions hasta llegar al cap, verificar siguiente calc_velum_commission() = 0 |
| **Stripe webhook signature** | Mandar webhook sin firma → debe rechazar 401 |
| **Idempotency** | Mandar mismo webhook 2 veces → no debe duplicar transaction |
| **WA template approval** | Submit plantillas a Meta, esperar aprobación (24-72h) |
| **Cart expiry** | Crear cart sin completar, esperar 30 min, verificar status=abandoned |

### 9.2 Stripe test cards

```
Éxito:       4242 4242 4242 4242
3D Secure:   4000 0027 6000 3184
Declined:    4000 0000 0000 0002
```

---

## 10. Launch checklist

### Pre-launch (semana 5)

- [ ] Supabase: aplicar `VELUM_STOREFRONT_SCHEMA.sql` en staging
- [ ] Probar RLS con usuario fake (audit completo)
- [ ] Stripe Connect: cuenta activada, capabilities live
- [ ] Plantillas WhatsApp: las 3 aprobadas por Meta
- [ ] Edge functions: todas deployed y testeadas
- [ ] Vercel: routing `/g/{slug}` agregado
- [ ] HTML del storefront: ajustado por gym con sus datos reales
- [ ] Variables de entorno: todas en Vercel + Supabase
- [ ] Cron jobs: schedule activado en pg_cron
- [ ] Meta Pixel: instalado y verificado con Events Manager
- [ ] Stripe Webhook: registrado con URL de producción

### Launch (semana 5)

- [ ] 3 founding gyms reales activados con sus URLs
- [ ] Envío de comunicado a base actual: "Storefront live"
- [ ] Tracking de primeras 50 visitas + carts + conversions
- [ ] Sentry verificando errores en edge functions

### Post-launch (semana 6)

- [ ] Análisis de funnel real vs proyección
- [ ] Iteración del system prompt de Coach IA según conversaciones reales
- [ ] A/B test: hero con vs sin video
- [ ] A/B test: orden de paquetes
- [ ] Refinamiento de plantillas WhatsApp según response rate

---

## 11. Costos operativos mensuales (estimado)

| Item | Costo | Detalle |
|---|---|---|
| Supabase Pro | $25 USD | Necesario para cron + backups + RLS testing |
| Stripe (gym paga su fee) | $0 directo VELUM | 2.9% + $3 MXN va al gym, VELUM solo cobra application_fee |
| Claude API (IA chat) | ~$80-200 USD | A 100 gyms con 50 conversaciones/mes promedio |
| WhatsApp Business | ~$30-80 USD | $0.038 USD por conversación iniciada (recovery + credentials) |
| Meta Conversion API | $0 | Free tier suficiente |
| Vercel | $0 | Hobby tier sigue siendo viable hasta ~1M visits/mes |
| **TOTAL** | **~$135-305 USD/mes** | A 100 gyms |

Vs revenue estimado a 100 gyms (mix Core/Pro/Elite): ~$226K MXN ≈ $12,900 USD → **costos de Storefront = ~2% del revenue**. Sano.

---

## 12. Roadmap post-MVP

### v1.1 (mes +1)
- Mercado Pago integration (LATAM gyms con problemas Stripe)
- Trial class booking (sin pago, captura lead → handoff a coach)
- Email automation con Resend

### v1.2 (mes +2)
- Dashboard de funnel en VELUM admin panel
- A/B testing nativo de paquetes
- Notificaciones push de "X persona viendo tu gym ahora"

### v2 (mes +3-6)
- VELUM Pass: cuenta cross-gym (marketplace mode)
- Affiliate links: atletas ganan referidos
- White-label más profundo (dominios custom)

---

## Anexos

### A. Endpoints públicos resumen

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/g/{slug}` | GET | None | Render storefront HTML |
| `/api/storefront/{slug}` | GET | None | Config + paquetes JSON |
| `/api/storefront/{slug}/chat` | POST | None | IA chat |
| `/api/storefront/{slug}/checkout` | POST | None | Create PaymentIntent |
| `/api/stripe/webhook` | POST | Stripe sig | Stripe events |
| `/api/cart-recovery` | POST | Cron secret | Trigger recovery |

### B. Tablas creadas (resumen)

```
gym_storefront           — config público por gym
storefront_packages      — paquetes públicos
storefront_visits        — analytics
storefront_carts         — checkout sessions
storefront_transactions  — ventas con comisión
ia_conversations_public  — chats IA en venta
commission_payouts       — liquidación mensual VELUM
```

### C. Documentos relacionados

- `VELUM_STOREFRONT_SCHEMA.sql` — DDL completo para Supabase
- `VELUM_STOREFRONT_MOCKUP.html` — mockup visual de la página pública
- `VELUM_DESIGN_SYSTEM.md` — tokens visuales VELUM
- `VELUM_COSTO_IA_SIMULADOR.html` — simulador de costo Claude API

---

**Última actualización:** 22 May 2026 · **Autor:** Equipo VELUM
