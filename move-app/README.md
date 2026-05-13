# MOVE — Native App (Capacitor)

Portal de atletas empaquetado como app nativa iOS y Android usando [Capacitor](https://capacitorjs.com/).

## Stack

| Capa | Tecnología |
|---|---|
| Web layer | `atleta.html` (HTML/CSS/JS vanilla) |
| Native wrapper | Capacitor 6 |
| Backend | Supabase (existente) |
| iOS build | Xcode 15+ |
| Android build | Android Studio + JDK 17 |

## Requisitos

- Node.js 18+
- **iOS**: macOS + Xcode 15+ + CocoaPods (`sudo gem install cocoapods`)
- **Android**: Android Studio Hedgehog+ + JDK 17

## Setup (primera vez)

```bash
cd move-app
npm run setup
```

Esto hace automáticamente:
1. `npm install` — instala Capacitor y plugins
2. `npm run build` — genera `www/index.html` desde `atleta.html`
3. `npx cap add ios` + `npx cap add android`
4. `npx cap sync` — copia assets a las carpetas nativas
5. Aplica configuraciones de permisos

## Workflow diario

Cada vez que editas `atleta.html`:

```bash
npm run build   # regenera www/index.html
npm run sync    # sincroniza con ios/ y android/
```

Luego corre la app:

```bash
npm run open:ios      # Abre Xcode → ⌘R para correr
npm run open:android  # Abre Android Studio → ▶ para correr
```

## Estructura

```
move-app/
├── package.json          ← Dependencias de Capacitor
├── capacitor.config.ts   ← Config: app ID, nombre, plugins
├── www/                  ← Assets web (generados por build.js)
│   ├── index.html        ← atleta.html + Capacitor injected
│   └── native/
│       └── bridge.js     ← Bridge copiado del source
├── native/
│   └── bridge.js         ← Native bridge (haptics, notifs, etc.)
├── scripts/
│   ├── build.js          ← Genera www/ desde atleta.html
│   ├── setup.sh          ← Setup inicial (una vez)
│   └── android-config.sh ← Permisos Android
├── ios/                  ← Generado por `cap add ios`
└── android/              ← Generado por `cap add android`
```

## Características nativas activadas

| Feature | Plugin | Estado |
|---|---|---|
| Haptic feedback en botones | `@capacitor/haptics` | ✅ Activo |
| Status bar dark theme | `@capacitor/status-bar` | ✅ Activo |
| Splash screen brandead | `@capacitor/splash-screen` | ✅ Activo |
| Back button Android | `@capacitor/app` | ✅ Activo |
| Local notifications (recordatorios) | `@capacitor/local-notifications` | ✅ Activo |
| Offline banner | `@capacitor/network` | ✅ Activo |
| Share nativo | `@capacitor/share` | ✅ Activo |
| Push notifications (Supabase) | `@capacitor/push-notifications` | 🔜 Próximo |
| QR scan nativo | `@capacitor/camera` | 🔜 Próximo |

## App IDs (para App Store / Google Play)

| Platform | ID |
|---|---|
| iOS Bundle ID | `app.myvelum.move` |
| Android App ID | `app.myvelum.move` |

> Para renombrar (otro gym): cambiar `appId` y `appName` en `capacitor.config.ts`, limpiar `ios/` y `android/`, re-hacer `cap add`.

## App Store checklist

- [ ] Íconos: `assets/icons/icon.png` (1024×1024 PNG sin transparencia)
- [ ] Splash: `assets/icons/splash.png` (2732×2732 PNG)
- [ ] Privacy policy URL en App Store Connect
- [ ] NSCameraUsageDescription en Info.plist
- [ ] Signing certificate configurado en Xcode

## Cambiar nombre del gym (white-label)

1. Editar `capacitor.config.ts`: `appId` y `appName`
2. Editar `atleta.html` branding (o dejar que lo tome de Supabase → `portalData.gym.nombre`)
3. Reemplazar íconos en `assets/icons/`
4. `npm run build && npm run sync`
5. En Xcode: cambiar Bundle Identifier en target settings
