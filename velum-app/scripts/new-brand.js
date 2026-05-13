/**
 * VELUM — Generador de nueva marca (white-label)
 *
 * Uso:
 *   node scripts/new-brand.js
 *
 * Interactivo: pide nombre del gym, ID y colores.
 * Crea brands/<gymSlug>.json listo para usar.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   VELUM — Nueva marca white-label         ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const name     = await ask('Nombre del gym (ej. "Box MX"):           ');
  const slug     = await ask('Slug corto sin espacios (ej. "boxmx"):   ');
  const gymCode  = await ask('Código de acceso del gym (ej. "BOXMX"):  ');
  const appId    = await ask(`Bundle ID (ej. "app.myvelum.${slug.toLowerCase()}"): `)
                   || `app.myvelum.${slug.toLowerCase()}`;
  const theme    = await ask('Color de fondo (hex, default #04120f):   ') || '#04120f';
  const accent   = await ask('Color de acento (hex, default #5DCAA5):  ') || '#5DCAA5';

  const brand = {
    appId:       appId.trim(),
    appName:     name.trim(),
    displayName: `${name.trim()} — Portal de Atletas`,
    version:     '1.0.0',
    themeColor:  theme.trim(),
    accentColor: accent.trim(),
    splashBg:    theme.trim(),
    gymCode:     gymCode.trim().toUpperCase()
  };

  const outFile = path.join(__dirname, '..', 'brands', `${slug.toLowerCase()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(brand, null, 2) + '\n');

  console.log(`\n✅  brands/${slug.toLowerCase()}.json creado:`);
  console.log(JSON.stringify(brand, null, 2));

  console.log('\n📋  Agrega este script a package.json → "scripts":');
  console.log(`    "build:${slug.toLowerCase()}":   "VELUM_BRAND=${slug.toLowerCase()} node scripts/build.js",`);
  console.log(`    "deploy:${slug.toLowerCase()}":  "VELUM_BRAND=${slug.toLowerCase()} node scripts/build.js && VELUM_BRAND=${slug.toLowerCase()} npx cap sync",`);

  console.log('\n🚀  Para correr la app de este gym:');
  console.log(`    npm run build:${slug.toLowerCase()}`);
  console.log('    npm run sync');
  console.log('    npm run open:ios\n');

  rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
