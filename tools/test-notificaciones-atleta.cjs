const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'atleta.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'velum-app/native/bridge.js'), 'utf8');
const start = portal.indexOf('let vistaDeAvisoPendiente =');
const end = portal.indexOf('function switchView(', start);
assert.ok(start >= 0 && end > start);
const destinos = new Set([...portal.matchAll(/class="view(?: active)?" id="view-([^"]+)"/g)].map(match => match[1]));

function telefono(platform){
  const navegacion = [];
  const listeners = {};
  const app = { style: { display: 'none' } };
  const plugin = { addListener(nombre, callback){ listeners[nombre] = callback;
    const handle = { remove: async () => { delete listeners[nombre]; } };
    return platform === 'ios' ? handle : Promise.resolve(handle); } };
  const ctx = vm.createContext({
    console: { log(){}, warn(){} }, portalData: null,
    document: { querySelector(){ return null; }, addEventListener(){}, getElementById(id){
      if(id === 'app') return app;
      if(destinos.has(id.slice(5))) return { classList: { contains: tipo => tipo === 'view' } };
      return null;
    }},
    Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins: { FirebaseMessaging: plugin, LocalNotifications: plugin } },
    switchView: name => navegacion.push(name)
  });
  ctx.window = ctx;
  vm.runInContext(portal.slice(start, end), ctx);
  vm.runInContext(bridge, ctx);
  assert.equal(typeof ctx.registerPush, 'function');
  return { listeners, navegacion, entrar(){
    ctx.portalData = { cliente: {} };
    app.style.display = 'flex';
    const entrega = portal.match(/if\(vistaDeAvisoPendiente\) abrirVistaDeAviso\(vistaDeAvisoPendiente\);/);
    assert.ok(entrega);
    vm.runInContext(entrega[0], ctx);
  }};
}

for(const platform of ['ios','android']){
  test(platform + ' espera la sesión al abrir un aviso anterior de membresía', () => {
    const t = telefono(platform);
    t.listeners.notificationActionPerformed({ notification: { data: { view: 'membresia' } } });
    assert.deepEqual(t.navegacion, []);
    t.entrar();
    t.entrar();
    assert.deepEqual(t.navegacion, ['planes']);
  });
  test(platform + ' abre la clase desde un recordatorio local anterior o nuevo', () => {
    const t = telefono(platform);
    t.entrar();
    for(const extra of [{fecha:'2026-11-25',hora:'17:00',tipo:'Pilates'},{view:'clases'}]){
      t.listeners.localNotificationActionPerformed({notification:{extra}});
    }
    assert.deepEqual(t.navegacion, ['clases','clases']);
  });
  test(platform + ' recibir o tocar un aviso sin destino válido conserva la pantalla', () => {
    const t = telefono(platform);
    t.entrar();
    t.listeners.notificationReceived({notification:{data:{view:'clases'}}});
    t.listeners.notificationActionPerformed({notification:{data:{view:'inexistente'}}});
    assert.deepEqual(t.navegacion, []);
    t.listeners.notificationActionPerformed({notification:{data:{view:'clases'}}});
    assert.deepEqual(t.navegacion, ['clases']);
  });
}
test('los dos destinos enviados por el servidor existen en el portal', () => {
  const cron = fs.readFileSync(path.join(root, 'supabase/functions/velum-cron-push/index.ts'), 'utf8');
  const enviados = [...cron.matchAll(/out\.(?:expiry|class)_fcm\s*=.*?,\s*'([^']+)'\);/g)].map(m => m[1]);
  assert.deepEqual(enviados, ['planes','clases']);
  for(const view of enviados) assert.ok(destinos.has(view));
});
