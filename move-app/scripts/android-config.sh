#!/bin/bash
# Configuraciones extra para Android después de `cap add android`
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "AndroidManifest.xml no encontrado, saltando"
  exit 0
fi

# Verificar si ya tiene los permisos
if grep -q "CAMERA" "$MANIFEST"; then
  echo "Permisos Android ya configurados"
  exit 0
fi

# Insertar permisos antes de <application
PERMS='    <!-- VELUM: Cámara para QR, notificaciones para recordatorios -->
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-permission android:name="android.permission.VIBRATE"/>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>'

# sed insertado antes de <application
sed -i.bak "s|<application|${PERMS}\n    <application|" "$MANIFEST"
echo "✅  Permisos Android agregados"

# Network security config (permite HTTPS a Supabase)
NS_DIR="android/app/src/main/res/xml"
NS_FILE="$NS_DIR/network_security_config.xml"
mkdir -p "$NS_DIR"
if [ ! -f "$NS_FILE" ]; then
cat > "$NS_FILE" << 'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">supabase.co</domain>
    <domain includeSubdomains="true">myvelum.app</domain>
  </domain-config>
  <base-config cleartextTrafficPermitted="false"/>
</network-security-config>
XML
echo "✅  network_security_config.xml creado"
fi
