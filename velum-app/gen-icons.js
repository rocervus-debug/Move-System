// Genera los assets de marca de VELUM (estrella cyan sobre fondo oscuro) y los rasteriza con sharp.
const sharp = require('sharp');
const fs = require('fs');

const CYAN_A = '#5FE6FF', CYAN_B = '#00B8E6';
const BG_CENTER = '#0A1F1B', BG_EDGE = '#04120F';

// Estrella sparkle de 4 puntas (cubic, lados cóncavos). cx,cy=centro, R=radio de punta, k=cintura.
function starPath(cx, cy, R, k) {
  const c = cx, y = cy;
  return `M${c} ${y-R} C${c+k} ${y-k} ${c+k} ${y-k} ${c+R} ${y} C${c+k} ${y+k} ${c+k} ${y+k} ${c} ${y+R} C${c-k} ${y+k} ${c-k} ${y+k} ${c-R} ${y} C${c-k} ${y-k} ${c-k} ${y-k} ${c} ${y-R} Z`;
}

function svgStar(size, R, glow) {
  const cx = size/2, k = R*0.30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="cy" x1="0.15" y1="0.1" x2="0.85" y2="0.9">
      <stop offset="0" stop-color="${CYAN_A}"/><stop offset="1" stop-color="${CYAN_B}"/>
    </linearGradient>
    <filter id="g" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="${glow}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <path filter="url(#g)" fill="url(#cy)" d="${starPath(cx,cx,R,k)}"/>
</svg>`;
}

function svgBg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><radialGradient id="bg" cx="0.5" cy="0.42" r="0.75">
    <stop offset="0" stop-color="${BG_CENTER}"/><stop offset="1" stop-color="${BG_EDGE}"/>
  </radialGradient></defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
</svg>`;
}

function svgComposite(size, R, glow) {
  const cx = size/2, k = R*0.30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="${BG_CENTER}"/><stop offset="1" stop-color="${BG_EDGE}"/></radialGradient>
    <linearGradient id="cy" x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stop-color="${CYAN_A}"/><stop offset="1" stop-color="${CYAN_B}"/></linearGradient>
    <filter id="g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${glow}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <path filter="url(#g)" fill="url(#cy)" d="${starPath(cx,cx,R,k)}"/>
</svg>`;
}

async function png(svg, out) {
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('✓', out);
}

(async () => {
  // Adaptativo: fondo oscuro + estrella (foreground en zona segura ~52%)
  await png(svgBg(1024), 'assets/icon-background.png');
  await png(svgStar(1024, 250, 26), 'assets/icon-foreground.png');   // estrella centrada, dentro de safe zone
  // Legacy / round: composite a sangre
  await png(svgComposite(1024, 300, 28), 'assets/icon-only.png');
  // Splash: estrella más chica centrada sobre fondo (la del splash de Android 12 usa el ícono adaptativo)
  await png(svgComposite(2732, 470, 60), 'assets/splash.png');
  await png(svgComposite(2732, 470, 60), 'assets/splash-dark.png');
  console.log('Listo: assets regenerados.');
})();
