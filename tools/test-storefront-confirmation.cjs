const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../success-storefront.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('El servicio distingue una consulta fallida de una orden ausente', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/storefront-order-status/index.ts'), 'utf8');
  let handler, error = { code: 'TEST' }, stripeCalls = 0;
  const lookup = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: null, error }; }
  };
  vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;$/gm, '')), {
    Deno: { serve: callback => { handler = callback; }, env: { get: k => k === 'STRIPE_SECRET_KEY' ? 'fixture' : undefined } },
    createClient: () => ({ from: () => lookup }),
    URL, Response, console: { error() {} },
    fetch: async () => {
      stripeCalls++;
      return new Response(null, { status: 404 });
    }
  });
  const req = new Request('https://example.test/?session_id=cs_fixture');
  assert.equal((await handler(req)).status, 503);
  assert.equal(stripeCalls, 0);
  error = null;
  assert.equal((await handler(req)).status, 404);
  assert.equal(stripeCalls, 1);
});

async function openConfirmation(query, responses) {
  const elements = { 'paid-icon': { hidden: true }, 'page-title': {}, 'page-sub': {}, content: {} };
  let requests = 0;
  await vm.runInNewContext(script, {
    document: { getElementById: id => elements[id] },
    location: { href: 'https://example.test/storefront-success' + query },
    URL,
    console,
    window: {},
    setTimeout: resolve => resolve(),
    fetch: async url => {
      assert.equal(new URL(url).searchParams.get('session_id'), 'sample');
      const response = responses[Math.min(requests++, responses.length - 1)];
      return { ok: !response.error, json: async () => response };
    }
  });
  return { elements, requests };
}

test('Un enlace sin referencia explica cómo recuperar la compra', async () => {
  const { elements, requests } = await openConfirmation('', []);
  assert.equal(requests, 0);
  assert.equal(elements['paid-icon'].hidden, true);
  assert.match(elements['page-title'].textContent, /referencia/);
});

test('Una consulta interrumpida permite volver a consultar antes de repetir el pago', async () => {
  const { elements, requests } = await openConfirmation('?session_id=sample', [{ error: 'Consulta no disponible' }]);
  assert.equal(requests, 5);
  assert.equal(elements['paid-icon'].hidden, true);
  assert.equal(elements['page-title'].textContent, 'No pudimos consultar tu compra');
  assert.match(elements.content.innerHTML, /Refrescar/);
  const resumed = await openConfirmation('?session_id=sample', [
    { error: 'Consulta no disponible' }, { paid: true, gym: { slug: 'norte' }, cliente: { portal_link: '/atleta' } }
  ]);
  assert.equal(resumed.requests, 2);
  assert.match(resumed.elements.content.innerHTML, /href="\/g\/norte"/);
});

test('Una orden pendiente permite consultar de nuevo sin anunciar el cobro', async () => {
  const { elements, requests } = await openConfirmation('?session_id=sample', [{ paid: false }]);
  assert.equal(requests, 5);
  assert.equal(elements['paid-icon'].hidden, true);
  assert.match(elements.content.innerHTML, /Refrescar/);
});

for (const status of ['failed', 'expired']) {
  test(`La orden ${status} permite volver al gimnasio sin esperar más consultas`, async () => {
    const { elements, requests } = await openConfirmation('?session_id=sample', [
      { status, paid: false, gym: { slug: 'norte' } }
    ]);
    assert.equal(requests, 1);
    assert.equal(elements['paid-icon'].hidden, true);
    assert.match(elements.content.innerHTML, /href="\/g\/norte"/);
    assert.match(elements['page-title'].textContent, status === 'expired' ? /venció/ : /no se completó/);
  });
}

test('La confirmación muestra el importe y abre el portal cuando llega el pago', async () => {
  const { elements, requests } = await openConfirmation('?session_id=sample', [
    { paid: false },
    { paid: true, gym: { nombre: 'Fuerza & Ritmo' }, amount_mxn: 400,
      package: { name: 'Cuatro clases', num_classes: 4, duration_days: 30 },
      cliente: { portal_link: 'https://example.test/atleta' } }
  ]);
  assert.equal(requests, 2);
  assert.equal(elements['paid-icon'].hidden, false);
  assert.equal(elements['page-title'].textContent, 'Pago confirmado en Fuerza & Ritmo');
  assert.match(elements.content.innerHTML, /\$400 MXN/);
  assert.match(elements.content.innerHTML, /Cuatro clases/);
  assert.doesNotMatch(elements.content.innerHTML, /href="(?:https:\/\/myvelum\.app)?\/g\/"/);
  assert.match(elements.content.innerHTML, /href="https:\/\/example.test\/atleta"/);
});

test('Un pago confirmado sin acceso generado ofrece refrescar la orden', async () => {
  const { elements } = await openConfirmation('?session_id=sample', [{ paid: true, amount_mxn: 400 }]);
  assert.equal(elements['paid-icon'].hidden, false);
  assert.match(elements['page-sub'].textContent, /detalles/);
  assert.match(elements.content.innerHTML, /Refrescar ahora/);
});

test('Una clase que se llena durante el pago conserva el paquete y explica cómo reagendar', async () => {
  const paid = { paid: true, amount_mxn: 450, cliente: { portal_link: 'https://example.test/atleta' } };
  const { elements, requests } = await openConfirmation('?session_id=sample', [
    { ...paid, reserva: 'por_verificar' }, { ...paid, reserva: 'sin_cupo' }
  ]);
  assert.equal(requests, 2);
  assert.equal(elements['paid-icon'].hidden, false);
  assert.match(elements['page-sub'].textContent, /otro horario/);
  assert.match(elements.content.innerHTML, /\$450 MXN/);
});

test('La reserva confirmada y la reserva sin resultado tienen mensajes distintos', async () => {
  const paid = { paid: true, amount_mxn: 450, cliente: { portal_link: 'https://example.test/atleta' } };
  const confirmed = await openConfirmation('?session_id=sample', [{ ...paid, reserva: 'reservado' }]);
  assert.equal(confirmed.requests, 1);
  assert.match(confirmed.elements['page-sub'].textContent, /quedó reservado/);
  const unresolved = await openConfirmation('?session_id=sample', [{ ...paid, reserva: 'por_verificar' }]);
  assert.equal(unresolved.requests, 5);
  assert.match(unresolved.elements['page-sub'].textContent, /Consulta en el portal/);
});

test('El checkout cobra en la cuenta del gimnasio sin comisión VELUM y regresa al sitio del entorno', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/stripe-checkout-create/index.ts'), 'utf8');
  const catalog = {
    gym_storefront: { gym_id: 1, is_enabled: true },
    gyms: { id: 1, nombre: 'Gym QA', subscription_plan: null, stripe_account_id: 'acct_fixture', stripe_charges_enabled: true },
    packages: { id: 7, gym_id: 1, name: 'Paquete QA', is_active: true, price_mxn: 450 },
    storefront_listings: { is_public: true }
  };
  for (const site of [undefined, 'https://preview.example.test/']) {
    const origin = site ? new URL(site).origin : 'https://myvelum.app';
    let handler, form, saved;
    vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;$/gm, '')), {
      Deno: { serve: callback => { handler = callback; }, env: { get: key => key === 'SITE_URL' ? site : 'fixture' } },
      createClient: () => ({
        rpc: async () => ({ data: true }),
        from: table => ({
          select() { return this; }, eq() { return this; },
          maybeSingle: async () => ({ data: catalog[table] }),
          insert: async row => { saved = row; return { error: null }; }
        })
      }),
      fetch: async (_url, request) => {
        assert.equal(request.headers['Stripe-Account'], 'acct_fixture');
        form = new URLSearchParams(request.body);
        return Response.json({ id: 'cs_fixture', url: 'https://example.test/checkout' });
      },
      URL, URLSearchParams, Response, console
    });
    for (const [billing, returnTo, expectedCancel, successPath] of [
      ['single', undefined, '/g/gym-qa?canceled=1', '/storefront-success?'],
      ['recurring', origin + '/atleta?payment=success', '/atleta?payment=success', '/atleta?payment=success&']
    ]) {
      catalog.packages.billing_type = billing;
      const result = await handler(new Request('https://example.test', { method: 'POST',
        body: JSON.stringify({ slug: 'gym-qa', package_id: 7, customer: { email: 'qa@example.test' }, return_to: returnTo }) }));
      assert.equal(result.status, 200);
      assert.equal(form.get('line_items[0][price_data][unit_amount]'), '45000');
      assert.equal(form.has('payment_intent_data[application_fee_amount]'), false);
      assert.equal(form.has('subscription_data[application_fee_percent]'), false);
      assert.equal(billing === 'single' ? saved.application_fee_cents : saved.application_fee_pct, 0);
      assert.equal(form.get('cancel_url'), origin + expectedCancel);
      assert.equal(form.get('success_url'), origin + successPath + 'session_id={CHECKOUT_SESSION_ID}');
    }
  }
});
