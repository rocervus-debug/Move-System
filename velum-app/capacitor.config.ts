import { CapacitorConfig } from '@capacitor/cli';
import * as fs from 'fs';
import * as path from 'path';

/**
 * VELUM — Capacitor Config con soporte multi-brand
 *
 * Build VELUM (plataforma, default):
 *   npm run build           → usa brands/velum.json
 *   npm run open:ios        → Xcode con VELUM
 *
 * Build white-label para un gym específico:
 *   VELUM_BRAND=move npm run build && npm run sync
 *   VELUM_BRAND=move npm run open:ios
 *
 * Agregar nuevo gym:
 *   1. Crear brands/mygym.json con sus datos
 *   2. npm run build:mygym && npm run sync
 */

const BRAND = (process.env.VELUM_BRAND || 'velum').toLowerCase();
const brandFile = path.join(__dirname, 'brands', `${BRAND}.json`);

let brand = {
  appId:       'app.myvelum.platform',
  appName:     'VELUM',
  themeColor:  '#04120f',
  accentColor: '#5DCAA5',
  splashBg:    '#04120f',
  gymCode:     null as string | null
};

try {
  const raw = JSON.parse(fs.readFileSync(brandFile, 'utf-8'));
  brand = { ...brand, ...raw };
} catch {
  if (BRAND !== 'velum') {
    console.warn(`[capacitor.config] Brand "${BRAND}" no encontrado, usando velum`);
  }
}

console.log(`\n📱  Building brand: ${brand.appName} (${brand.appId})\n`);

const config: CapacitorConfig = {
  appId:   brand.appId,
  appName: brand.appName,
  webDir:  'www',

  server: {
    androidScheme: 'https',
    allowNavigation: [
      'supabase.co', '*.supabase.co',
      'wa.me', 'api.whatsapp.com',
      'fonts.googleapis.com', 'fonts.gstatic.com',
      'cdnjs.cloudflare.com'
    ]
  },

  ios: {
    contentInset:                       'automatic',
    scrollEnabled:                      true,
    limitsNavigationsToAppBoundDomains: true,
    backgroundColor:                    brand.themeColor
  },

  android: {
    backgroundColor:             brand.themeColor,
    allowMixedContent:           false,
    webContentsDebuggingEnabled: false
  },

  plugins: {
    SplashScreen: {
      launchShowDuration:        500,
      launchAutoHide:            true,
      backgroundColor:           brand.splashBg,
      androidSplashResourceName: 'splash',
      androidScaleType:          'CENTER_CROP',
      showSpinner:               false,
      splashFullScreen:          true,
      splashImmersive:           true
    },
    StatusBar: {
      style:           'DARK',
      backgroundColor: brand.themeColor,
      overlaysWebView: false
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_velum',
      iconColor: brand.accentColor
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
