# VELUM — Runbook de publicación de la app nativa

**Para:** Roy
**Qué cubre:** cómo pasar de `velum-app/` (Capacitor) a la app publicada en App Store y Google Play.
**Concepto clave:** la app nativa **es `atleta.html` envuelto**. `scripts/build.js` copia `atleta.html` → `www/index.html` e inyecta el brand + Capacitor + bridge nativo. **Nunca edites `www/` a mano** — edita `atleta.html` y corre el build.

---

## 0. Prerrequisitos (una sola vez)

- **Mac** con **Xcode** (para iOS) y **Android Studio** (para Android).
- **Node** instalado (ya lo tienes).
- **Apple Developer Program** — $99 USD/año → https://developer.apple.com/programs/
- **Google Play Console** — $25 USD pago único → https://play.google.com/console/signup
- En `velum-app/`: `npm install` (una vez).

---

## 1. Build del contenido web (cada vez que cambies algo)

```
cd velum-app
npm run build      # atleta.html → www/index.html + brand + bridge, y bumpea sw.js
npm run sync       # copia www/ a los proyectos iOS y Android (npx cap sync)
```

> `npm run deploy:velum` hace build + sync de un jalón.

## 2. Íconos y splash (una vez, o cuando cambie el arte)

Las fuentes están en `velum-app/assets/` (`icon-only.png`, `splash.png`). Genera todos los tamaños:

```
npx capacitor-assets generate --iconBackgroundColor '#030A07' --splashBackgroundColor '#030A07'
```

Esto crea los íconos/splash para iOS y Android automáticamente. Revisa que `assets/icon-only.png` sea **1024×1024** y `splash.png` **2732×2732** para mejor resultado.

---

## 3. iOS — App Store

1. `npm run open:ios` (abre Xcode).
2. En Xcode → target **App** → pestaña **Signing & Capabilities**:
   - **Team:** tu cuenta Apple Developer.
   - **Bundle Identifier:** `app.myvelum.platform` (debe coincidir con `capacitor.config.ts`).
   - Activa **Automatically manage signing**.
3. **Capabilities** a agregar (botón +):
   - **Push Notifications** (si vas a usar push nativo — ver sección 6).
4. Sube la versión: target App → **General** → Version (ej. `1.0.0`) y Build (`1`, incrementa en cada subida).
5. En App Store Connect (https://appstoreconnect.apple.com): crea la app (mismo bundle id), llena la ficha (sección 5).
6. En Xcode: selecciona destino **Any iOS Device (arm64)** → menú **Product → Archive**.
7. Cuando termine, en el Organizer → **Distribute App → App Store Connect → Upload**.
8. En App Store Connect el build aparece en ~15-30 min → asígnalo a **TestFlight** (prueba interna) y luego **Submit for Review**.
9. Revisión de Apple: 1-3 días típicamente.

## 4. Android — Google Play

1. **Keystore** (una vez, GUÁRDALO bien — si lo pierdes no puedes actualizar la app):
   ```
   keytool -genkey -v -keystore velum-release.keystore -alias velum -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Configura el signing en `android/app/build.gradle` (o usa Android Studio → Build → Generate Signed Bundle).
3. `applicationId` = `app.myvelum.platform` (revisa `android/app/build.gradle`). `versionCode` (entero, incrementa cada subida) y `versionName` (ej. `1.0.0`).
4. `npm run open:android` (abre Android Studio).
5. **Build → Generate Signed App Bundle (.aab)** con tu keystore.
6. En Play Console (https://play.google.com/console): crea la app, sube el `.aab` a **Internal testing** primero.
7. Llena la ficha (sección 5) + el **Data Safety form** (declara qué datos recopilas) + **Content rating**.
8. Promueve de Internal testing → Production → **Submit**. Revisión de Google: horas a 2 días.

---

## 5. Ficha de tienda (lo que piden ambas)

- **Nombre:** VELUM — Portal de Atletas (máx 30 caracteres en iOS).
- **Subtítulo/Short:** Tu gym en tu bolsillo: reserva, check-in y progreso.
- **Descripción:** (te la puedo redactar pulida cuando quieras — borrador abajo).
- **Categoría:** Salud y forma física (Health & Fitness).
- **Privacidad:** URL → `https://myvelum.app/privacidad.html` (ya existe).
- **Íconos de tienda:** 1024×1024 (iOS) — lo genera capacitor-assets.
- **Screenshots:** iPhone 6.7" (1290×2796) y 6.5"; Android teléfono. Mínimo 3-4 por plataforma. (Toma capturas de: home, reservar clase, mi plan/Aura, progreso, mi cuenta.)
- **Content rating / Data Safety:** declara: email, nombre, datos de uso; sin venta de datos.

**Borrador de descripción:**
> VELUM es la app de tu gimnasio o estudio: reserva tus clases, haz check-in con QR, sigue tu plan de entrenamiento, chatea con Aura (tu asistente) y renueva tu membresía en segundos. Todo tu progreso —rachas, asistencia y medidas— en un solo lugar. (Necesitas ser miembro de un gimnasio que use VELUM.)

---

## 6. Pendientes/consideraciones de la versión nativa

- **Push nativo (APNs/FCM):** el push de la web usa Web Push (VAPID), que NO funciona dentro del webview nativo. La nativa necesita `@capacitor/push-notifications` con APNs (iOS) y FCM (Android). El plugin ya está en `package.json` y `native/bridge.js` puede manejar el registro, pero hay que configurar las credenciales (APNs key en Apple, `google-services.json` en Android). **La app funciona sin esto; el push nativo es una mejora.**
- **Redirect post-pago de Stripe:** al renovar, Stripe redirige a `https://myvelum.app/atleta?...` (web), no de vuelta a la app. El pago se procesa correcto (la membresía se extiende vía webhook); el *deep-link de regreso a la app* es un pulido (configurar Universal Links / App Links + `appUrlOpen` en bridge.js). No bloquea publicar.
- **Multi-brand / white-label:** ya soportado. Para una app dedicada de un gym: `VELUM_BRAND=move npm run deploy:move` y publicas con su `appId`/nombre desde `brands/move.json`. (Por ahora publica solo la app VELUM plataforma.)

---

## Resumen del flujo recurrente (después de la 1ª vez)

```
# cambiaste algo en atleta.html →
cd velum-app
npm run deploy:velum          # build + sync
npm run open:ios              # Archive → subir a App Store Connect
npm run open:android          # Generate Signed Bundle → subir a Play Console
# subir nuevo build, incrementar version/build number, Submit
```

**Última actualización:** 6 jun 2026 · Owner: Roy Cervus
