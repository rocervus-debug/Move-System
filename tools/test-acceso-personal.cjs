const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const panel = fs.readFileSync(path.join(__dirname, '..', 'VELUM_Sistema_Interno.html'), 'utf8');
const inicio = panel.indexOf('let intentoAcceso = ');
const fin = panel.indexOf('async function doLogin(', inicio);
assert.ok(inicio >= 0 && fin > inicio);
const personal = { id: 12, gym_id: 7, rol: 'recepcion', pw_version: 2, jwt: 'prueba' };

function entorno(responder) {
  const filtros = [];
  const error = { classList: { add() {} } };
  const consulta = {
    select() { return this; },
    eq(columna, valor) { filtros.push([columna, valor]); return this; },
    maybeSingle: responder
  };
  const cliente = { from(tabla) { assert.equal(tabla, 'usuarios'); return consulta; } };
  const ctx = vm.createContext({
    document: { getElementById() { return error; } },
    window: {}, currentUser: null, MOVE_GYM_ID: null, _realJwt: null, _realGymId: null,
    isJwtExpired: () => false,
    crearClientePersonal: () => cliente,
    setSession(sesion) { ctx.guardada = sesion; },
    clearSession() { ctx.borrada = true; }
  });
  vm.runInContext(panel.slice(inicio, fin), ctx);
  return { ctx, filtros, cliente, error };
}

test('activa sólo después de confirmar persona, gimnasio y cuenta activa', async () => {
  const { ctx, filtros, cliente } = entorno(() => ({ data: personal }));
  assert.equal(await ctx.activarSesionPersonal(personal, 0, true), true);
  assert.deepEqual(filtros, [['id', 12], ['gym_id', 7], ['activo', true]]);
  assert.equal(ctx.MOVE_GYM_ID, 7);
  assert.equal(ctx.currentUser.id, 12);
  assert.equal(ctx.window.supabaseClient, cliente);
});

for (const [nombre, responder, borrar] of [
  ['sesión rechazada', () => ({ error: {}, status: 401 }), true],
  ['acceso denegado', () => ({ error: {}, status: 403 }), true],
  ['cuenta inactiva', () => ({ data: null }), true],
  ['cambio de rol', () => ({ data: { ...personal, rol: 'coach' } }), true],
  ['cambio de contraseña', () => ({ data: { ...personal, pw_version: 3 } }), true],
  ['interrupción de red', () => { throw new Error('sin red'); }, false],
  ['servicio temporalmente indisponible', () => ({ error: {}, status: 503 }), false]
]) {
  test(nombre, async () => {
    const { ctx, error } = entorno(responder);
    assert.equal(await ctx.activarSesionPersonal(personal, 0, true), false);
    assert.equal(ctx.currentUser, null);
    assert.equal(ctx.MOVE_GYM_ID, null);
    assert.equal(Boolean(ctx.borrada), borrar);
    assert.equal(ctx.guardada, undefined);
    assert.ok(error.textContent);
  });
}

test('una respuesta anterior al cierre de sesión no reactiva al usuario', async () => {
  let resolver;
  const { ctx } = entorno(() => new Promise(resolve => { resolver = resolve; }));
  const pendiente = ctx.activarSesionPersonal(personal, 0, true);
  vm.runInContext('++intentoAcceso', ctx);
  resolver({ data: personal });
  assert.equal(await pendiente, false);
  assert.equal(ctx.currentUser, null);
  assert.equal(ctx.guardada, undefined);
});

const login = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'move-login', 'index.ts'), 'utf8');
const consultaGym = login.slice(login.indexOf('    if (user.gym_id)'), login.indexOf('    const { data: factor'));
const bloqueoPanel = panel.slice(panel.indexOf('function checkSubscriptionBlock()'), panel.indexOf('function removeSubBlock()'));
const vencimiento = '2026-11-30T12:00:00.000Z';
const limite = Date.parse(vencimiento);

async function probarAcceso(gymConfig, instante, error = null) {
  const ctx = vm.createContext({
    gymConfig, getPlan: () => 'max', user: { gym_id: 1 }, CORS: {}, Response,
    Date: class extends Date { static now() { return instante; } },
    db: { from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: gymConfig, error }) }; } },
    removeSubBlock() { ctx.bloqueado = false; }, showSubBlock() { ctx.bloqueado = true; }
  });
  const respuesta = await vm.runInContext('(async () => {' + consultaGym + '})()', ctx);
  if (gymConfig) vm.runInContext(bloqueoPanel + '\ncheckSubscriptionBlock()', ctx);
  return [respuesta?.status ?? 200, ctx.bloqueado];
}

for (const [nombre, fecha, reloj, esperado] of [
  ['último milisegundo de gracia', vencimiento, limite - 1, 200],
  ['vencimiento exacto', vencimiento, limite, 402],
  ['gracia agotada', vencimiento, limite + 1, 402],
  ['sin plazo registrado', null, limite, 402],
  ['fecha inválida', 'inválido', limite, 402],
]) {
  test('pago atrasado en login y panel: ' + nombre, async () => {
    const gym = { subscription_status: 'past_due', subscription_grace_until: fecha, subscription_current_period_end: '2027-01-01' };
    assert.deepEqual(await probarAcceso(gym, reloj), [esperado, esperado === 402]);
  });
}

test('el pago recuperado y un convenio vigente conservan el acceso', async () => {
  assert.deepEqual(await probarAcceso({ subscription_status: 'active' }, limite), [200, false]);
  assert.deepEqual(await probarAcceso({ subscription_status: 'past_due', acceso_garantizado: true }, limite), [200, false]);
});

test('el acceso espera a que el gimnasio pueda verificarse', async () => {
  assert.equal((await probarAcceso(null, limite, { message: 'sin conexión' }))[0], 503);
  assert.equal((await probarAcceso(null, limite))[0], 402);
});

for (const [nombre, respuesta, usaTabla] of [
  ['operación de alta disponible', {}, false],
  ['instalación anterior al procedimiento', { error: { code: 'PGRST202' } }, true],
  ['alta denegada por el servidor', { error: { code: '42501' } }, false],
]) {
  test('alta de personal: ' + nombre, async () => {
    let inserciones = 0;
    const campos = { 'nu-nombre': 'Recepción', 'nu-email': 'qa@example.invalid', 'nu-pass': 'prueba-local', 'nu-rol': 'recepcion' };
    const ctx = vm.createContext({
      document: { getElementById: id => ({ value: campos[id] }) },
      limpiarEmail: s => s, hashPassword: async () => 'hash de prueba', MOVE_GYM_ID: 17,
      window: { supabaseClient: {
        rpc: async (fn, args) => {
          assert.equal(fn, 'p0a6_create_user');
          assert.deepEqual({ ...args }, { p_gym: 17, p_role: 'recepcion', p_nombre: 'Recepción', p_email: campos['nu-email'], p_hash: 'hash de prueba' });
          return respuesta;
        },
        from: () => ({ insert: async () => { inserciones++; return {}; } }),
      } },
      withGymId: row => row, auditLog() {}, closeModal() {}, loadUsuariosFromSupabase() {}, renderUsuarios() {}, toast() {}, _handleSessionError: () => true
    });
    vm.runInContext(panel.slice(panel.indexOf('async function saveNewUser()'), panel.indexOf('function openEditUser(')), ctx);
    await ctx.saveNewUser();
    assert.equal(inserciones, Number(usaTabla));
  });
}
