// VERIFY Storefront v2 — carga pulse-demo (Supabase real, solo lectura),
// captura cada tab, abre el modal de checkout (SIN completar compra) y guarda evidencia.
const puppeteer = require('/Users/rodrigomendezvadillo/Move-System/velum-app/node_modules/puppeteer-core');

const OUT = __dirname;
const BASE = 'http://localhost:8899';
const SLUG = process.env.SLUG || 'pulse-demo';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1280,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(`${BASE}/storefront.html?slug=${SLUG}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForSelector('#app:not(.app-hidden)', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));

  // Tab activo inicial + captura por tab
  const tabs = ['horario', 'planes', 'espacio', 'ubicacion'];
  for (const t of tabs) {
    const visible = await page.evaluate(name => {
      const btn = document.querySelector(`.tab[data-p="${name}"]`);
      return btn && btn.style.display !== 'none';
    }, t);
    if (!visible) { console.log(`tab ${t}: oculto (sin contenido) — ok`); continue; }
    await page.evaluate(name => sfTab(name), t);
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: `${OUT}/${SLUG}_tab_${t}.png`, fullPage: false });
    console.log(`tab ${t}: captura guardada`);
  }

  // Checkout: clic en el CTA de un paquete → debe abrir #sf-checkout-modal (NO se compra)
  await page.evaluate(() => sfTab('planes'));
  await new Promise(r => setTimeout(r, 500));
  const hasPkg = await page.$('.pkg-card .pkg-cta');
  if (hasPkg) {
    // scroll + click nativo (el CTA sticky puede tapar el centro del botón para page.click)
    await page.evaluate(() => { const b = document.querySelector('.pkg-card .pkg-cta'); b.scrollIntoView({ block: 'center' }); b.click(); });
    await page.waitForSelector('#sf-checkout-modal', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/${SLUG}_checkout_modal.png` });
    console.log('checkout modal: ABRE correctamente (captura guardada, compra NO completada)');
    await page.evaluate(() => closeCheckoutModal());
  } else {
    console.log('checkout: este gym no tiene paquetes públicos');
  }

  // CTA sticky → lead modal
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => document.getElementById('cta-main').click());
  await page.waitForSelector('#lead-modal.open', { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/${SLUG}_lead_modal.png` });
  console.log('lead modal (CTA sticky): abre correctamente');
  await page.evaluate(() => closeLeadModal());

  // Estado general
  const resumen = await page.evaluate(() => ({
    titulo: document.title,
    tema: document.body.className,
    tabsVisibles: [...document.querySelectorAll('.tab')].filter(t => t.style.display !== 'none').map(t => t.dataset.p),
    ctaTexto: document.getElementById('cta-main')?.textContent,
    paquetes: document.querySelectorAll('.pkg-card').length,
    clasesHoy: document.querySelectorAll('.schedule-card').length,
    auraVisible: getComputedStyle(document.getElementById('ia-fab')).display !== 'none',
  }));
  console.log('RESUMEN:', JSON.stringify(resumen, null, 2));
  if (errors.length) console.log('ERRORES JS:', errors.join('\n'));
  else console.log('Sin errores JS en consola.');

  await browser.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
