# VELUM — Pendientes para la próxima build de la app

> **Estado:** acumulando cambios. NO compilar todavía (esperando más detalles).
> **Última actualización:** 2026-07-02
> **Última subida a tiendas:** iOS 1.0.1 build 5 (aprobada, auto-release). Android: 1.0.2 versionCode 4 en prueba cerrada de Google Play (juntando 12 testers).

Este archivo junta todo lo que requiere **rebuild + resubmit** de la app nativa (Capacitor).
Los cambios solo-web del panel (`VELUM_Sistema_Interno.html`) y de edge functions NO necesitan esto:
se despliegan solos y no entran en esta lista.

---

## 1. Cambios de la app ya en código (entran en la próxima build)

| # | Cambio | Archivo(s) | Necesita |
|---|--------|-----------|----------|
| 1 | **Domiciliación visible (solo lectura)** — tarjeta "Mensualidad domiciliada" en Planes con estados activa / cobro pendiente / cancela-al-fin | `atleta.html` → `velum-app/www/index.html` | iOS + Android |
| 2 | **Splash Android 12+ fondo oscuro** — `windowSplashScreenBackground #030A07` (evita flash blanco) | `velum-app/android/.../styles.xml` | Android |
| 3 | **Splash más rápido** — `launchShowDuration 2500→500` | `velum-app/capacitor.config.ts` | iOS + Android |
| 4 | **Fix: meta semanal no se guardaba** — `saveMeta` usaba `SUPABASE_KEY` (indefinido) → `ANON_KEY` | `atleta.html` | iOS + Android |
| 5 | **Fix: pull-to-refresh / refresh al volver del background rotos** — faltaba definir `loadPortalData()` | `atleta.html` | iOS + Android |
| 6 | **Fix: mensaje "¡Todo listo!" tras pago no aparecía** — `updateQRStatus()` indefinido → `renderQR()` | `atleta.html` | iOS + Android |
| 7 | **Perf: arranque/refresh más rápido** — `loadPortalData`/`tryToken` paralelizan auth+paquetes; `loadClasesData` paraleliza 4 fetches | `atleta.html` | iOS + Android |
| 8 | **Fix: refresh al recuperar conexión** — el banner offline llamaba `loadPortalData()` sin token (no-op) | `atleta.html` | iOS + Android |
| 9 | **Mobile: doble inset del notch** — `.topbar` duplicaba `env(safe-area-inset-top)` → gap vacío bajo el notch | `atleta.html` | iOS |
| 10 | **Mobile: zoom de iOS al enfocar** — inputs de bitácora/medidas 14→16px | `atleta.html` | iOS |
| 11 | **UX: touch targets + toast + borrado de bitácora** — `.bit-del`/`.chat-send-btn` más grandes; toast no corta texto; `deleteBitacoraEntry` con confirm+chequeo; chats con guard anti doble-envío; bitácora con estado de carga/error | `atleta.html` | iOS + Android |

> El backend de la domiciliación (`velum-atleta-portal` v30) **ya está desplegado** — solo falta la parte visual de la app.

---

## 2. Por confirmar / pendiente de definir (puede sumar a la build)

**De la auditoría iOS (2026-07-02):**

- [ ] **PrivacyInfo.xcprivacy** — crear el privacy manifest a nivel app (`velum-app/ios/App/App/PrivacyInfo.xcprivacy`). Requisito de Apple desde 2024; Capacitor 6 trae manifests en sus pods pero el de la app reduce riesgo de rechazo. ~15 min. **Hacer antes del próximo submit iOS.**
- [ ] **Sincronizar versión iOS** — 1.0.1(5) → 1.0.2 para paridad con Android (ya contemplado en checklist §3).
- [ ] **PUSH_ENABLED sigue en false** — para encender push se necesita: Firebase/`google-services.json` (Android) + APNs AuthKey .p8 (iOS). Sprint aparte; mientras, la app no crashea (fix v4).
- [ ] **QR lib desde CDN** (`qrcodejs` de cdnjs, sin SRI) — empaquetarla local en el build: quita dependencia de red para el QR de check-in (beneficio offline real) y elimina el riesgo de CDN. ~30 min en `build.js`.
- [ ] **`/cookie-banner.js` 404 dentro de la app** — el tag apunta a raíz del servidor; en la app nativa no existe. Strip del tag en `build.js`. ~10 min.
- [ ] **Barrido XSS con `esc()`** — auditar los `innerHTML` de `atleta.html` que interpolan datos del backend sin escapar (ej. nombre del gym). Riesgo bajo (datos del propio gym) pero es higiene. CENTINELA+ESCUDO.
- [ ] **(v1.1, no urgente)** subir deployment target iOS 13 → 14; hash-at-rest del `portal_password` (hoy texto plano en `gym_config`, es código compartido por gym, no credencial individual); pre-commit hook que regenere `www` si cambió `atleta.html`.

**Verificado que NO son problema (contra reporte del agente):**
- El AppIcon usa el formato single-size moderno de Xcode 14+ (universal 1024×1024) — **válido para App Store**, no es bloqueador.
- El `ANON_KEY` en el HTML es público **por diseño** (arquitectura estándar de Supabase); la seguridad vive en RLS (ya endurecida). No hay que "rotarla". Acción real: audit periódico de ESCUDO sobre lo accesible con rol `anon`.
- `www/` está sincronizado con `atleta.html` (build del 29-jun posterior a la última edición).

---

## 3. Checklist al momento de compilar (cuando se decida)

1. `cd velum-app && node scripts/build.js` (regenera `www` desde `atleta.html`).
2. `npx cap copy ios && npx cap copy android` (propaga `www`).
3. **iOS:** subir versión (`MARKETING_VERSION`) en Xcode antes de archivar — la 1.0.1 ya está cerrada, la próxima sería 1.0.2 o 1.1.0.
4. **Android:** "Generate Signed App Bundle" (release, NO debug). `versionCode` debe subir de 1.
5. Probar en TestFlight / Internal testing antes de promover.
6. Verificar específicamente: la tarjeta de domiciliación aparece para un atleta con `member_subscriptions` activa.

---

## 4. Notas

- Android sigue bloqueado en la verificación de dispositivo de Google Play (requiere un teléfono Android físico que el usuario debe conseguir prestado) + el requisito de 12 testers / 14 días de prueba cerrada para cuentas personales.
- iOS está al día (1.0.1 en App Store).
