/**
 * VELUM Native Build Script
 * Copia atleta.html → www/index.html e inyecta:
 *   1. <script src="capacitor.js"> (runtime de Capacitor)
 *   2. <script src="native/bridge.js"> (mejoras nativas)
 *
 * Uso:
 *   node scripts/build.js
 *   node scripts/build.js --watch  (re-ejecuta al cambiar atleta.html)
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const SRC        = path.resolve(ROOT, '..', 'atleta.html');  // ../atleta.html
const DEST_DIR   = path.join(ROOT, 'www');
const DEST       = path.join(DEST_DIR, 'index.html');
const BRIDGE_SRC = path.join(ROOT, 'native', 'bridge.js');
const BRIDGE_DST = path.join(DEST_DIR, 'native', 'bridge.js');

function build() {
  // Leer atleta.html
  if (!fs.existsSync(SRC)) {
    console.error('❌  No encontré atleta.html en:', SRC);
    process.exit(1);
  }
  let html = fs.readFileSync(SRC, 'utf-8');

  // ── Inyectar Capacitor runtime ANTES de cualquier <script> ──
  // capacitor.js lo genera Capacitor automáticamente en www/
  // Solo se carga cuando corre en la app nativa
  const capScript = `
  <!-- Capacitor runtime — inyectado por build.js -->
  <script>
    // Shim: si no estamos en Capacitor, evitamos errores de undefined
    if (typeof window.Capacitor === 'undefined') {
      window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: {} };
    }
  </script>
  <script src="capacitor.js"></script>
  <!-- Native bridge: haptics, status bar, notifications, back button -->
  <script src="native/bridge.js"></script>`;

  // Insertar justo antes de </head>
  html = html.replace('</head>', capScript + '\n</head>');

  // ── Actualizar meta viewport para viewport-fit=cover ──
  html = html.replace(
    /(<meta\s+name="viewport"\s+content="[^"]*)(")/,
    (match, before, quote) => {
      if (before.includes('viewport-fit')) return match;
      return before + ', viewport-fit=cover' + quote;
    }
  );

  // ── Escribir www/index.html ──
  if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.writeFileSync(DEST, html, 'utf-8');
  console.log('✅  atleta.html → www/index.html');

  // ── Copiar bridge.js a www/native/bridge.js ──
  const bridgeDestDir = path.join(DEST_DIR, 'native');
  if (!fs.existsSync(bridgeDestDir)) fs.mkdirSync(bridgeDestDir, { recursive: true });
  fs.copyFileSync(BRIDGE_SRC, BRIDGE_DST);
  console.log('✅  native/bridge.js → www/native/bridge.js');

  console.log('');
  console.log('Siguiente paso:  npm run sync');
  console.log('Abrir Xcode:     npm run open:ios');
  console.log('Abrir Android S: npm run open:android');
}

// ── Run ──
build();

// ── Watch mode ──
if (process.argv.includes('--watch')) {
  console.log('\n👀  Watching atleta.html for changes…\n');
  fs.watchFile(SRC, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      console.log('🔄  atleta.html changed, rebuilding…');
      build();
    }
  });
  fs.watchFile(BRIDGE_SRC, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      console.log('🔄  bridge.js changed, rebuilding…');
      build();
    }
  });
}
