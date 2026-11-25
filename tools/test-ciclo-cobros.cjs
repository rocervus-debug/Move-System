const { test } = require("node:test");
const path = require("node:path");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const { createHmac, webcrypto } = require("node:crypto");
const vm = require("node:vm");

// Los proveedores y el libro están en memoria. Se ejecuta el manejador de VELUM completo.
const base = new Date();
base.setUTCDate(base.getUTCDate() + 3);
const day = (date) => date.toISOString().slice(0, 10);
const sub = {
  id: 501,
  gym_id: 1,
  cliente_id: 61,
  cliente_nombre: "Atleta QA",
  package_id: 7,
  stripe_subscription_id: "sub_fixture",
  status: "active",
  cancel_at_period_end: true,
  customer_email: "socia@example.test",
  application_fee_pct: 0.02,
};
const tablas = {
  member_subscriptions: [sub],
  gyms: [{ id: 1, nombre: "MOVE QA" }],
  packages: [{ id: 7, name: "Cuatro clases QA", price_mxn: 500, num_classes: 4, duration_days: 30 }],
  pagos: [{
    gym_id: 1,
    cliente: "Atleta QA",
    fecha: day(new Date()),
    vence: day(base),
    notas: "Cuota anterior",
  }],
};
const mails = [];
let fallarSiguienteResultado = false;
function from(table) {
  const source = tablas[table];
  if (!source) throw Error("Tabla inesperada: " + table);
  const predicates = [];
  let single = false, update, sortBy, orderSign = 1, limit = Infinity;
  return {
    select() {
      return this;
    },
    is(k, v) {
      assert.equal(k, "metadata->>reserva_resultado");
      predicates.push((r) => (r.metadata?.reserva_resultado ?? null) === v);
      return this;
    },
    eq(k, v) {
      predicates.push((r) => r[k] === v);
      return this;
    },
    neq(k, v) {
      predicates.push((r) => r[k] !== v);
      return this;
    },
    single() {
      single = true;
      return this;
    },
    maybeSingle() {
      single = true;
      return this;
    },
    order(k, { ascending }) {
      sortBy = k;
      orderSign = ascending ? 1 : -1;
      return this;
    },
    limit(n) {
      limit = n;
      return this;
    },
    update(obj) {
      update = obj;
      return this;
    },
    insert(obj) {
      if (
        table === "pagos" && obj.stripe_session_id &&
        source.some((r) => r.stripe_session_id === obj.stripe_session_id)
      ) return Promise.resolve({ error: { code: "23505" } });
      source.push({ ...obj, id: source.length + 1 });
      return Promise.resolve({ error: null });
    },
    then(resolve, reject) {
      if (table === "storefront_orders" && update?.metadata && fallarSiguienteResultado) {
        fallarSiguienteResultado = false;
        return Promise.resolve({ error: { message: "Interrupción de prueba" } }).then(resolve, reject);
      }
      const matched = source.filter((r) => predicates.every((p) => p(r)));
      if (sortBy) matched.sort((a, b) => orderSign * String(a[sortBy]).localeCompare(String(b[sortBy])));
      const rows = matched.slice(0, limit);
      if (update) rows.forEach((r) => Object.assign(r, update));
      return Promise.resolve({ count: rows.length, data: single ? rows[0] : rows, error: null }).then(
        resolve,
        reject,
      );
    },
  };
}
let handler;
const notificationsSecret = "local-test-only";
const services = { STRIPE_WEBHOOK_SECRET: notificationsSecret, SUPABASE_URL: "https://fixture.invalid" };
const code = readFileSync(path.join(__dirname, "../supabase/functions/stripe-webhook/index.ts"), "utf8")
  .replace(/^import .*?;$/gm, "");
const settlement = readFileSync(path.join(__dirname, "../supabase/functions/_shared/stripe-settlement.ts"), "utf8")
  .replace(/^export /gm, "");
const { stripeSettlement, withDestinationPayment } = vm.runInNewContext(stripTypeScriptTypes(settlement) + "\n({stripeSettlement, withDestinationPayment})");
test("El cargo directo separa la comisión de la plataforma y conserva los centavos", () => {
  const charge = { balance_transaction: { id: "txn_fixture", currency: "mxn", amount: 45000, fee: 3388,
    net: 41612, available_on: 1796169600, fee_details: [{ type: "application_fee", amount: 900 }] } };
  const fields = stripeSettlement(charge, 45000, 900, true);
  assert.equal(fields.net_to_gym_mxn, 416.12);
  assert.equal(fields.stripe_fee_mxn, 24.88);
  assert.equal(fields.velum_commission_mxn, 9);
  assert.equal(stripeSettlement(null, 45000, 900, true).net_to_gym_mxn, null);
});
test("Un cargo de destino toma el neto del movimiento del gimnasio", async () => {
  const charge = { amount: 45000, currency: "mxn", transfer_data: { destination: "acct_gym" },
    transfer: "tr_qa", application_fee_amount: 900,
    balance_transaction: { id: "txn_platform", currency: "mxn", amount: 45000, fee: 2488, net: 42512,
      fee_details: [], available_on: 1800000000 } };
  assert.equal(stripeSettlement(charge, 45000, 900, false).net_to_gym_mxn, null);
  const resolved = await withDestinationPayment(charge, async (url, acct) => {
    if (url === "/transfers/tr_qa" && !acct) return { amount: 45000, currency: "mxn", destination: "acct_gym", destination_payment: "py_qa" };
    assert.equal(url, "/charges/py_qa?expand[]=balance_transaction");
    assert.equal(acct, "acct_gym");
    return { id: "py_qa", balance_transaction: { id: "txn_gym", currency: "mxn", amount: 45000,
      fee: 0, net: 45000, fee_details: [], available_on: 1800100000 } };
  });
  const result = stripeSettlement(resolved, 45000, 900, false);
  assert.equal(result.net_to_gym_mxn, 441);
  assert.equal(result.stripe_fee_mxn, 0);
  assert.equal(result.velum_commission_mxn, 9);
  assert.equal(result.stripe_balance_transaction_id, "txn_gym");
});
vm.runInNewContext(stripTypeScriptTypes(code), {
  stripeSettlement, withDestinationPayment,
  Deno: {
    env: { get: (k) => services[k] },
    serve: (f) => {
      handler = f;
    },
  },
  createClient: () => ({ from }),
  URL,
  Request,
  Response,
  TextEncoder,
  crypto: webcrypto,
  console,
  fetch: async (url, opts) => {
    if (url === "https://fixture.invalid/functions/v1/velum-email") {
      mails.push(JSON.parse(opts.body));
      return Response.json({ ok: true });
    }
    if (url.startsWith("https://api.stripe.com/v1/charges/ch_fixture?")) {
      return Response.json({
        balance_transaction: { id: "txn_fixture", amount: 50000, fee: 2000, net: 48000, currency: "mxn", fee_details: [], available_on: Math.floor(Date.now() / 1000) },
      });
    }
    throw Error("Destino no previsto en la simulación");
  },
});
const invoice = {
  id: "in_fixture",
  subscription: "sub_fixture",
  billing_reason: "subscription_cycle",
  amount_due: 50000,
  hosted_invoice_url: "https://invoice.example.test/fixture",
};
async function evento(type, obj, expectedStatus = 200) {
  const body = JSON.stringify({ type, data: { object: obj } }), t = Math.floor(Date.now() / 1000);
  const checksum = createHmac("sha256", notificationsSecret).update(t + "." + body).digest("hex");
  const result = await handler(
    new Request("https://fixture.invalid/", {
      method: "POST",
      body,
      headers: { "Stripe-Signature": "t=" + t + ",v1=" + checksum },
    }),
  );
  assert.equal(result.status, expectedStatus);
}
test("Renovación, recuperación, link, reserva y recibo al reintentar un cobro", async () => {
  await evento("invoice.payment_failed", invoice);
  assert.equal(sub.status, "past_due");
  assert.equal(tablas.pagos.length, 1);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].template, "pago_fallido");
  assert.equal(mails[0].data.monto, "500");
  assert.equal(mails[0].data.url, invoice.hosted_invoice_url);
  assert.equal(mails[0].to, sub.customer_email);
  const recovered = { ...invoice, charge: "ch_fixture", amount_paid: 50000, application_fee_amount: 1000 };
  await evento("invoice.payment_succeeded", recovered);
  await evento("invoice.payment_succeeded", recovered);
  assert.equal(tablas.pagos.length, 2);
  const pago = tablas.pagos[1];
  const end = new Date(base);
  end.setUTCDate(end.getUTCDate() + 30);
  assert.equal(sub.status, "active");
  assert.equal(pago.vence, day(end));
  assert.equal(pago.monto, 500);
  assert.equal(pago.clases_totales, 4);
  assert.equal(pago.clases_usadas, 0);
  assert.equal(pago.net_to_gym_mxn, 470);
  assert.equal(pago.stripe_fee_mxn, 20);
  assert.equal(pago.velum_commission_mxn, 10);
  assert.equal(
    sub.cancel_at_period_end,
    true,
    "Se debe conservar la baja programada al recuperar la factura",
  );
  await evento("customer.subscription.updated", {
    id: sub.stripe_subscription_id,
    status: "active",
    cancel_at_period_end: false,
  });
  assert.equal(sub.cancel_at_period_end, false);
  const gym = tablas.gyms[0];
  gym.stripe_subscription_id = "sub_gym_qa";
  const facturaGym = { ...invoice, subscription: gym.stripe_subscription_id };
  await evento("invoice.payment_failed", facturaGym);
  assert.equal(gym.subscription_status, "past_due");
  await evento("invoice.payment_succeeded", facturaGym);
  assert.equal(gym.subscription_status, "active");
  assert.equal(tablas.pagos.length, 2, "La suscripción del gimnasio queda fuera de la caja de socios");
  const simFecha = day(base);
  const sale = (id, metadata, amount_total = 45000) => ({
    id,
    mode: "payment",
    amount_total,
    metadata: { gym_id: "1", package_id: "7", ...metadata },
  });
  const charge = (session, status) => evento("checkout.session.completed", session, status);
  const manual = sale("cs_link", { source: "manual_link", cliente: "Atleta QA" }, 30000);
  await charge(manual);
  await charge(manual);
  assert.equal(tablas.pagos.filter((p) => p.stripe_session_id === "cs_link").length, 1);
  assert.equal(tablas.pagos.at(-1).monto, 300);
  tablas.clientes = [{ id: 61, nombre: "Atleta QA", gym_id: 1, email: sub.customer_email }];
  tablas.storefront_orders = [];
  tablas.reservas = [];
  tablas.commission_payouts = [];
  tablas.horarios = [{ gym_id: 1, id: "slotQA", hora: "15:00", tipo: "Fuerza", cupo: 1 }];
  for (const [id, full] of [["cs_libre", false], ["cs_llena", true]]) {
    if (full) tablas.reservas[0].cliente_id = 72;
    tablas.storefront_orders.push({
      id,
      customer_email: sub.customer_email,
      customer_name: "Atleta QA",
      amount_cents: 50000,
      stripe_session_id: id,
    });
    const before = mails.length;
    const checkout = sale(id, { reserva_horario_id: "slotQA", reserva_fecha: simFecha });
    await charge(checkout);
    const receipt = mails.slice(before);
    assert.equal(tablas.storefront_orders.at(-1).status, "paid");
    assert.equal(tablas.storefront_orders.at(-1).amount_cents, 45000);
    assert.equal(tablas.reservas.length, 1);
    if (full) assert.equal(tablas.reservas[0].cliente_id, 72);
    else assert.equal(tablas.reservas[0].cliente_id, 61);
    assert.deepEqual(receipt.map((m) => m.template), ["recibo"], "Un solo recibo por compra");
    assert.equal(receipt[0].data.plan.includes("reagendar"), full);
    assert.equal(tablas.pagos.at(-1).monto, 450, "El libro debe mostrar el importe cobrado");
    assert.equal(receipt[0].data.monto, "450");
    assert.equal(tablas.storefront_orders.at(-1).metadata.reserva_resultado, full ? "sin_cupo" : "reservado");
    const reservasAntes = tablas.reservas.length;
    if (full) tablas.reservas.length = 0;
    await charge(checkout);
    assert.equal(
      tablas.reservas.length,
      full ? 0 : reservasAntes,
      "Una reentrega no debe generar otra reserva",
    );
    assert.equal(mails.length, before + 1, "Reintento de la misma compra");
    assert.equal(tablas.pagos.filter((p) => p.stripe_session_id === id).length, 1);
  }
  const interrumpida = sale("cs_reintento", { reserva_horario_id: "slotQA", reserva_fecha: simFecha });
  tablas.storefront_orders.push({
    id: 3,
    stripe_session_id: interrumpida.id,
    customer_email: sub.customer_email,
    amount_cents: 45000,
  });
  tablas.reservas.length = 0;
  fallarSiguienteResultado = true;
  const correosAntes = mails.length;
  await charge(interrumpida, 500);
  assert.equal(mails.length, correosAntes);
  await charge(interrumpida);
  const pagosReintentados = tablas.pagos.filter((p) => p.stripe_session_id === interrumpida.id);
  assert.equal(pagosReintentados.length, 1);
  assert.equal(tablas.reservas.length, 1);
  assert.equal(mails.length, correosAntes + 1);
  assert.equal(mails.at(-1).data.vence, pagosReintentados[0].vence);
  assert.equal(mails.at(-1).data.plan, tablas.packages[0].name);
});
