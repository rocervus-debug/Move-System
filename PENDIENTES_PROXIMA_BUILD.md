# VELUM — Pendientes para la próxima build de la app

> **Estado (2026-07-09):**
> - **iOS 1.0.3 (build 6): ✅ ENVIADO A REVIEW de Apple.** Archivado + subido desde Xcode +
>   ficha 1.0.3 completa en App Store Connect (build adjunto, novedades, cuenta demo PULSE/4/
>   VelumDemo2026, nota anti-IAP guía 3.1.3). Release automático al aprobar. Espera ≤48h.
> - **Android: ⏳ BLOQUEADO por la clave de subida.** Roy no recuerda la contraseña del
>   `velum-release.jks`. Como la app usa **Play App Signing**, se solicitó **cambio de clave de
>   subida** en Play Console (motivo: "olvidé la contraseña"). Se generó un keystore NUEVO
>   `~/velum-upload-new.jks` (alias `velum`, contraseña que Roy SÍ anotó) y se subió su cert
>   `~/velum-upload-cert.pem`. **Google confirma en 1–2 días hábiles por correo.**
>   Al confirmar: actualizar `velum-app/android/keystore.properties` (storeFile=~/velum-upload-new.jks,
>   keyAlias=velum, storePassword/keyPassword = la nueva) → `./gradlew bundleRelease` → subir el
>   `.aab` (versionCode 5) a Prueba cerrada Alpha → reclutar 12 testers (14 días).
> - Versiones: Android `versionCode 5 / 1.0.3` · iOS `build 6 / 1.0.3`.
> - `www` regenerado + `cap copy` hechos (06-jul). PrivacyInfo.xcprivacy creado (agregar al target en Xcode).

---

## 0. BUILD 2026-07-06 — listo para subir a testers

**Incluido en este build (además de todo lo de la §1):**
- **Fix del crash de login en Android** (`PUSH_ENABLED = false` en `bridge.js`) — el v3 que está en Alpha crashea al iniciar sesión; este build lo arregla.
- **Feature nueva "Mis Marcas"** — progresión de fuerza por ejercicio en Progreso (récord histórico + sparkline + Δkg). Deriva de `bitacora_atleta`, sin cambio de esquema. Verificada en preview (poblado + vacío).
- **Limpieza de emojis** — UI 100% sin emojis pictográficos (verificado: `body.innerText` sin un solo emoji). Chat de Aura, racha, check-in, chips de membresía → texto/SVG. Mapa `EMOJIS` muerto eliminado, `data-emoji` quitados.
- **Verificado que el bug PGRST303 de Clases NO se reproduce** — `horarios` responde 200 con cuenta con acento (Juan Pérez); el fix UTF-8 del JWT ya está aplicado. No requirió cambio.

**PARA SUBIR — pasos exactos (los binarios los generas tú por los secretos de firma):**

**Android — generar AAB firmado y subir a Alpha:**
1. Rellena las credenciales de firma (una sola vez):
   ```
   cd velum-app/android
   cp keystore.properties.template keystore.properties
   # edita keystore.properties → storePassword, keyAlias, keyPassword
   # (storeFile ya apunta a ~/velum-release.jks)
   ```
2. Genera el bundle firmado:
   ```
   cd velum-app/android && ./gradlew bundleRelease
   # sale en: app/build/outputs/bundle/release/app-release.aab
   ```
   (o Android Studio → Build → Generate Signed Bundle, eligiendo velum-release.jks)
3. Play Console → Prueba cerrada **Alpha** → Crear versión → sube el `.aab` (versionCode 5) → Revisar → Lanzar. Esto reemplaza la v3 (que crashea).

**iOS — archivar y subir a TestFlight:**
1. `cd velum-app && npm run open:ios` (Xcode).
2. Selecciona "Any iOS Device", Product → Archive (build 6 / 1.0.3).
3. Distribute App → App Store Connect → Upload → TestFlight.
   - **`PrivacyInfo.xcprivacy` YA CREADO** (2026-07-09) en `velum-app/ios/App/App/PrivacyInfo.xcprivacy`.
     **Falta agregarlo al target en Xcode:** File → Add Files to "App"… → selecciónalo → marca el
     target **App** → Add. Sin esto Xcode no lo empaqueta. Reduce riesgo de rechazo por privacy manifest.

**Después:** con v5 en Alpha, reclutar 12+ testers Android → arranca el reloj de 14 días → luego "Solicitar acceso a producción".

---

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

## BUILD SIGUIENTE (post-v5) — feedback de Krajo 2026-07-10
- **App: botón "Registrar marca" en Progreso** (`atleta.html:2802`) — abre `openBitacoraSheet()`
  (default fuerza: ejercicio/series/reps/peso) que alimenta "Mis Marcas". Antes solo existía el
  botón de medición corporal; el registro de PR/score vivía escondido en otra pestaña. iOS+Android.
  (Los bugs de panel de Krajo — pase-de-día y teléfono con prefijo — NO requieren build: ya en git.)
- **App: gate de membresía al reservar** (auditoría 2026-07-14, `crearReserva` en atleta.html) —
  un atleta vencido podía reservar clases sin límite (el banner avisaba pero no bloqueaba).
  Guard 0 agregado: vencido → toast "Renueva para reservar". Ya vive en atleta.html (la web
  lo tiene desde el push); la app nativa lo toma en esta build vía build.js. iOS+Android.
- **Smart App Banner iOS** (`apple-itunes-app` id6780286384 en el head) — solo afecta Safari
  web; Capacitor lo ignora. Ya en atleta.html; entra solo con el build.
- **Equipo multi-coach en Clases** (fase 2 multi-coach, 2026-07-14) — la lista de clases y el
  sheet de detalle muestran el equipo completo ("Ana & Luis" / "Ana, Luis +1") leyendo
  horarios.coaches_extra. Ya en atleta.html (web desplegada); la app lo toma con build.js.
  Caso real: BYCO (indoor cycling, studios) quiere ver su "DUO RIDE" con ambos coaches.
- **Selector de Lugar al reservar (studios)** (spec BYCO, 2026-07-14) — al reservar en vertical
  studios la atleta elige su lugar/bici en un grid (ocupados y bloqueados tachados), puede
  cambiarlo hasta 1h antes desde el detalle, y su tarjeta muestra "LUGAR N". Colisiones
  protegidas por índice único (toast "ese lugar ya se ocupó"). Ya en atleta.html (web
  desplegada); la app nativa lo toma con build.js. iOS+Android.
