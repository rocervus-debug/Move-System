const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const panel = fs.readFileSync(path.join(__dirname, '../VELUM_Sistema_Interno.html'), 'utf8');
const funcion = panel.slice(panel.indexOf('async function agregarClienteAClase('), panel.indexOf('// Check-in directo desde el widget'));
function recepcion({ cambiarSede = false, ocupacion = 0 } = {}) {
  const llamadas = [], consultas = [], avisos = [];
  let vigente = true;
  const origen = { value: 'Nessty' };
  const ctx = {
    window: { _dc: {}, supabaseClient: {
      from(tabla) {
        assert.equal(tabla, 'reservas');
        const condiciones = [];
        consultas.push(condiciones);
        const query = new Proxy({}, { get(_, prop) {
          if(prop === 'then') return (ok) => {
            if(cambiarSede) vigente = false;
            ok({ count: condiciones.some(([k]) => k === 'cliente_id') ? 0 : ocupacion });
          };
          return (...args) => { if(prop === 'eq') condiciones.push(args); return query; };
        }});
        return query;
      },
      rpc: async (nombre, args) => { llamadas.push([nombre, args]); return { error: null }; }
    }},
    document: { getElementById: id => id === 'mostrador-origen' ? origen : null },
    contextoMostradorVigente: () => vigente, MOVE_GYM_ID: 7, _detalleCtx: { cupo: 2 },
    _asistFechaSel: () => '2026-11-27', idsClaseEnFecha: id => [id],
    _DIAS_ES: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
    pagos: [], navigator: {}, loadDetalleClase: async () => {}, _fWaitlistP: () => true,
    confirmDialog: async () => true, toast: mensaje => avisos.push(mensaje),
    _paqueteBloquea() { assert.fail('La plataforma ya cubre esta clase'); },
    _maxReservasDiaCliente() { assert.fail('El límite del paquete personal no aplica'); },
  };
  vm.createContext(ctx); vm.runInContext(funcion, ctx);
  return { registro: () => ctx.agregarClienteAClase(83,"Ana O'Neil",'clase','09:00','Fuerza','reservado','Nessty'), llamadas, consultas, avisos };
}
test('La recepción reserva una clase cubierta por Nessty sin usar el paquete del socio', async () => {
  const t=recepcion(); await t.registro();
  assert.equal(t.llamadas.length,1);
  const [fn,args]=t.llamadas[0];
  assert.equal(fn,'core_reservar_mostrador');
  assert.deepEqual(JSON.parse(JSON.stringify(args)),{p_gym:7,p_clase:'clase',p_socio:83,p_fecha:'2026-11-27',p_origen:'Nessty',p_estado:'reservado',p_sobrecupo:false});
  assert.ok(t.consultas.every(condiciones=>condiciones.some(([k,v])=>k==='gym_id'&&v===7)));
});
test('La lista de espera conserva la plataforma sin crear también una reserva', async () => {
  const t=recepcion({ocupacion:2}); await t.registro();
  assert.equal(t.llamadas.length,1);
  assert.equal(t.llamadas[0][1].p_estado,'espera');
  assert.equal(t.llamadas[0][1].p_origen,'Nessty');
});
test('Un cambio de sede durante la consulta descarta la operación del mostrador',async()=>{
  const t=recepcion({cambiarSede:true});await t.registro();assert.equal(t.llamadas.length,0);
});
