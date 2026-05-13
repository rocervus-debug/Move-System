#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  VELUM Native App — Setup Inicial
#  Ejecutar UNA SOLA VEZ después de clonar / primer setup
# ═══════════════════════════════════════════════════════════
set -e  # Detener en cualquier error

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   VELUM Native App — Setup           ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Node version check ──────────────────────────────────
NODE_VER=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_VER" == "none" ]]; then
  echo "❌  Node.js no encontrado. Instala Node 18+ desde https://nodejs.org"
  exit 1
fi
echo "✅  Node: $NODE_VER"

# ── 2. npm install ─────────────────────────────────────────
echo ""
echo "📦  Instalando dependencias de Capacitor…"
npm install
echo "✅  Dependencias instaladas"

# ── 3. Build web assets ────────────────────────────────────
echo ""
echo "🔨  Generando www/ desde atleta.html…"
node scripts/build.js
echo "✅  www/index.html listo"

# ── 4. Capacitor add platforms ────────────────────────────
echo ""
echo "📱  Agregando plataformas nativas…"

# iOS (solo en macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  if [ ! -d "ios" ]; then
    npx cap add ios
    echo "✅  iOS agregado"
  else
    echo "ℹ️   iOS ya existe, saltando"
  fi
else
  echo "⚠️   iOS requiere macOS — saltando"
fi

# Android
if [ ! -d "android" ]; then
  npx cap add android
  echo "✅  Android agregado"
else
  echo "ℹ️   Android ya existe, saltando"
fi

# ── 5. Sync assets a plataformas nativas ──────────────────
echo ""
echo "🔄  Sincronizando assets con plataformas nativas…"
npx cap sync
echo "✅  Sync completo"

# ── 6. Configuraciones específicas iOS ────────────────────
if [[ "$OSTYPE" == "darwin"* ]] && [ -d "ios" ]; then
  echo ""
  echo "🍎  Aplicando config iOS adicional…"

  # Info.plist — permisos de cámara y notificaciones
  PLIST="ios/App/App/Info.plist"
  if [ -f "$PLIST" ]; then
    # Camera permission
    if ! grep -q "NSCameraUsageDescription" "$PLIST"; then
      plutil -insert NSCameraUsageDescription \
        -string "MOVE usa tu cámara para escanear códigos QR de clases." \
        "$PLIST" 2>/dev/null || echo "  ⚠️  Agrega manualmente NSCameraUsageDescription a Info.plist"
    fi
    # Notifications
    if ! grep -q "NSUserNotificationUsageDescription" "$PLIST"; then
      plutil -insert NSUserNotificationUsageDescription \
        -string "Recibe recordatorios de tus clases reservadas." \
        "$PLIST" 2>/dev/null || echo "  ⚠️  Agrega manualmente NSUserNotificationUsageDescription a Info.plist"
    fi
    echo "✅  Info.plist actualizado"
  fi
fi

# ── 7. Configuraciones específicas Android ────────────────
if [ -d "android" ]; then
  echo ""
  echo "🤖  Aplicando config Android adicional…"
  bash scripts/android-config.sh 2>/dev/null || echo "  ⚠️  android-config.sh no encontrado, saltando"
fi

# ── 8. Resumen final ───────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅  Setup completo — Siguiente paso:                ║"
echo "║                                                      ║"
if [[ "$OSTYPE" == "darwin"* ]]; then
echo "║  iOS:     npm run open:ios                           ║"
echo "║           (abre Xcode → Product → Run)               ║"
fi
echo "║  Android: npm run open:android                       ║"
echo "║           (abre Android Studio → Run)                ║"
echo "║                                                      ║"
echo "║  Al cambiar atleta.html:                             ║"
echo "║     npm run build && npm run sync                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
