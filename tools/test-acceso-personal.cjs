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
