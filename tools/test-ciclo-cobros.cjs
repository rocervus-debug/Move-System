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
  gyms: [{ id: 1, nombre: "MOVE QA", stripe_account_id: "acct_qa" }],
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
      const value = r => k === "metadata->>reserva_resultado" ? r.metadata?.reserva_resultado : r[k];
      predicates.push((r) => (value(r) ?? null) === v);
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
      if (table === "stripe_adjustment_events" && source.some((row) =>
        row.stripe_account === obj.stripe_account && row.livemode === obj.livemode && row.event_id === obj.event_id
      )) return Promise.resolve({ error: { code: "23505" } });
      if (table === "gyms") {
        const row = { ...obj, id: source.length + 1 };
        source.push(row);
        return { select() { return { single: async () => ({ data: { id: row.id }, error: null }) }; } };
      }
      for (const entry of Array.isArray(obj) ? obj : [obj]) source.push({ ...entry, id: source.length + 1 });
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
test("Un cobro nuevo de $150 sólo descuenta el costo externo de Stripe", () => {
  const charge = { balance_transaction: { id: "txn_sin_comision", currency: "mxn", amount: 15000,
    fee: 974, net: 14026, available_on: 1796169600, fee_details: [{ type: "stripe_fee", amount: 974 }] } };
  const fields = stripeSettlement(charge, 15000, 0, true);
  assert.equal(fields.velum_commission_mxn, 0);
  assert.equal(fields.stripe_fee_mxn, 9.74);
  assert.equal(fields.net_to_gym_mxn, 140.26);
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
  btoa,
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
async function evento(type, obj, expectedStatus = 200, envelope = {}) {
  const body = JSON.stringify({ type, ...envelope, data: { object: obj } }), t = Math.floor(Date.now() / 1000);
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
  const endOfCycle = 1799003445;
  const currentInvoice = { ...invoice, parent: { subscription_details: { subscription: gym.stripe_subscription_id } },
    lines: { data: [{ period: { end: endOfCycle } }] }, amount_paid: 99900 };
  delete currentInvoice.subscription;
  await evento("invoice.payment_failed", currentInvoice);
  assert.equal(gym.subscription_status, "past_due");
  await evento("invoice.payment_succeeded", currentInvoice);
  assert.equal(gym.subscription_status, "active");
  await evento("customer.subscription.updated", { id: gym.stripe_subscription_id, status: "active",
    items: { data: [{ current_period_end: endOfCycle }] } });
  assert.equal(gym.subscription_current_period_end, new Date(endOfCycle * 1000).toISOString());
  assert.equal(tablas.pagos.length, 2);
  const simFecha = day(base);
  const sale = (id, metadata, amount_total = 45000) => ({
    id,
    mode: "payment",
    amount_total,
    metadata: { gym_id: "1", package_id: "7", ...metadata },
  });
  const charge = (session, status) => evento("checkout.session.completed", session, status);
  const manual = sale("cs_link", { source: "manual_link", cliente: "Atleta QA" }, 30000);
  await evento("checkout.session.completed", manual, 200, { account: "acct_qa" });
  await evento("checkout.session.completed", manual, 200, { account: "acct_qa" });
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

test("Los reembolsos y disputas quedan registrados una vez y conservan el consumo", async () => {
  tablas.stripe_adjustment_events = [];
  const original = { id: 100, gym_id: 1, monto: 450, clases_totales: 4, clases_usadas: 1 };
  tablas.pagos.push({ ...original });
  const charge = { object: "charge", id: "ch_qa", currency: "mxn", amount: 45000, payment_intent: "pi_qa" };
  const dispute = { object: "dispute", id: "dp_qa", currency: "mxn", amount: 45000, charge: "ch_otro", payment_intent: "pi_otro" };
  const cases = [
    ["charge.refunded", { ...charge, amount_refunded: 10000 }, 10000],
    ["charge.refunded", { ...charge, amount_refunded: 45000 }, 45000],
    ["charge.dispute.created", { ...dispute, status: "needs_response" }, 45000],
    ["charge.dispute.closed", { ...dispute, status: "won" }, 45000],
  ];
  for (const [i, [type, object, amount]] of cases.entries()) {
    const env = { id: "evt_" + i, account: "acct_qa", livemode: false, created: 1795700000 + i };
    await evento(type, object, 200, env);
    await evento(type, object, 200, env);
    assert.equal(tablas.stripe_adjustment_events.length, i + 1);
    const saved = tablas.stripe_adjustment_events.at(-1);
    assert.equal(saved.amount_cents, amount);
    assert.equal(saved.charge_id, object.charge || object.id);
    assert.equal(saved.stripe_account, env.account);
  }
  assert.deepEqual(tablas.pagos.at(-1), original);
});

test("El corte concilia por movimiento de saldo y rechaza una respuesta parcial", async () => {
  const source = readFileSync(path.join(__dirname, "../supabase/functions/velum-stripe-balance/index.ts"), "utf8")
    .replace(/^import .*?;$/gm, "");
  const row = (id, type, reporting_category, amount, fee = 0) =>
    ({ id, type, reporting_category, currency: "mxn", amount, fee, net: amount - fee });
  const original = row("txn_sale", "charge", "charge", 45000, 2488);
  const partial = row("txn_partial", "refund", "refund", -10000);
  const final = row("txn_final", "refund", "refund", -35000);
  const hold = row("txn_withdrawn", "adjustment", "dispute", -45000, 1500);
  const restored = row("txn_won", "adjustment", "dispute_reversal", 45000);
  let pages;
  const monthly = vm.runInNewContext(stripTypeScriptTypes(source) + "\nmonthNetSummary", {
    Deno: { serve() {} }, Response,
    fetch: async (url, opts) => {
      assert.equal(opts.headers["Stripe-Account"], "acct_qa");
      const page = pages.shift();
      assert.ok(page);
      if (page.after) assert.equal(new URL(url).searchParams.get("starting_after"), page.after);
      return Response.json(page);
    },
  });
  pages = [{ data: [original, partial], has_more: false }];
  let summary = await monthly("fixture", "acct_qa");
  assert.equal(summary.net_mxn, 325.12);
  pages = [{ data: [original, partial], has_more: true }, { after: partial.id, data: [partial, final], has_more: false }];
  summary = await monthly("fixture", "acct_qa");
  assert.equal(summary.count, 1);
  assert.equal(summary.gross_mxn, 450);
  assert.equal(summary.refunds_net_mxn, -450);
  assert.equal(summary.net_mxn, -24.88);
  pages = [{ data: [original, hold], has_more: false }];
  assert.equal((await monthly("fixture", "acct_qa")).net_mxn, -39.88);
  pages = [{ data: [original, hold, restored, row("po", "payout", "payout", -1000)], has_more: false }];
  assert.equal((await monthly("fixture", "acct_qa")).net_mxn, 410.12);
  pages = [{ data: [original], has_more: true }, { error: "processor unavailable" }];
  await assert.rejects(monthly("fixture", "acct_qa"), /incompleto/);
});

test("Una confirmación de alta crea una cuenta de gimnasio y permite reentrega", async () => {
  tablas.usuarios = [];
  tablas.gym_config = [];
  tablas.velum_saas_plans = [{ id: "max", max_clientes: null }];
  const checkout = {
    id: "cs_test_alta",
    mode: "subscription",
    customer: "cus_qa",
    subscription: "sub_nuevo",
    metadata: { velum_signup: "true", plan: "max", gym_nombre: "CORE de prueba",
      email: "alta@example.test", nombre_admin: "Dueña QA", pw_hash: "a".repeat(64) },
  };
  const before = mails.length;
  await evento("checkout.session.completed", checkout);
  await evento("checkout.session.completed", checkout);
  const gyms = tablas.gyms.filter(g => g.stripe_subscription_id === checkout.subscription);
  assert.equal(gyms.length, 1);
  assert.equal(tablas.usuarios.length, 1);
  const owner = tablas.usuarios[0];
  assert.equal(owner.gym_id, gyms[0].id);
  assert.equal(owner.rol, "admin");
  assert.match(owner.pw_hash, /^v2:/);
  assert.ok(tablas.gym_config.some(c => c.gym_id === owner.gym_id && c.key === "moneda" && c.value === "MXN"));
  assert.deepEqual(mails.slice(before).map(m => m.template), ["welcome"]);
});

test("Al vencer un enlace, el webhook conserva otro para el mismo socio y paquete",async()=>{
  const pending={id:9901,gym_id:1,status:'incomplete',package_id:7,customer_email:'qa@example.test',stripe_checkout_session_id:'cs_primero'};
  const other={...pending,id:9902,stripe_checkout_session_id:'cs_segundo'};
  tablas.member_subscriptions.push(pending,other);
  const message={id:'cs_primero',mode:'subscription',metadata:{velum_member_sub:'true',gym_id:'1',package_id:'7',customer_email:pending.customer_email}};
  await evento('checkout.session.expired',message);
  await evento('checkout.session.expired',message);
  assert.equal(pending.status,'canceled');assert.equal(other.status,'incomplete');
});
