import { CapacitorConfig } from '@capacitor/cli';

/**
 * MOVE — Capacitor Native App Config
 *
 * appId:    Bundle ID único para App Store / Google Play.
 *           Cambiar por gym: e.g. "app.myvelum.boxmx" para un gym llamado BoxMX
 * appName: Nombre que aparece debajo del ícono en el teléfono
 * webDir:  Carpeta con los assets web (generada por `npm run build`)
 */
const config: CapacitorConfig = {
  appId:   'app.myvelum.move',
  appName: 'MOVE',
  webDir:  'www',

  // Permite que Supabase y otros HTTPS externos funcionen dentro del WebView
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'supabase.co',
      '*.supabase.co',
      'wa.me',
      'api.whatsapp.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdnjs.cloudflare.com'
    ]
  },

  ios: {
    // Respeta las safe areas del iPhone (notch, Dynamic Island, home indicator)
    contentInset: 'automatic',
    // Scroll elástico nativo
    scrollEnabled: true,
    // Limpia el cache en cada actualización de build
    limitsNavigationsToAppBoundDomains: true,
    backgroundColor: '#04120f'
  },

  android: {
    backgroundColor: '#04120f',
    // Permite mixed content (por si Supabase regresa http en algún redirect)
    allowMixedContent: false,
    // Capturar errores JS y enviarlos a Logcat
    webContentsDebuggingEnabled: false  // true solo en dev
  },

  plugins: {
    SplashScreen: {
      launchShowDuration:       2500,
      launchAutoHide:           true,
      backgroundColor:          '#04120f',
      androidSplashResourceName:'splash',
      androidScaleType:         'CENTER_CROP',
      iosSpinnerStyle:          'small',
      spinnerColor:             '#5DCAA5',
      showSpinner:              false,
      splashFullScreen:         true,
      splashImmersive:          true
    },

    StatusBar: {
      style:           'DARK',
      backgroundColor: '#04120f',
      overlaysWebView: false
    },

    LocalNotifications: {
      smallIcon:   'ic_stat_velum',
      iconColor:   '#5DCAA5'
    },

    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },

    // Keyboard: avoid layout jumping when soft keyboard opens
    Keyboard: {
      resize:         'body',
      resizeOnFullScreen: true
    }
  }
};

export default config;
