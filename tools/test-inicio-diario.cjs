const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../core-hoy.js'), 'utf8');

function inicio() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { classList: { contains: () => true }, querySelector: () => null });
    return elements.get(id);
  };
  const user = {id: 1};
  const app = vm.createContext({
    document: {getElementById: get, addEventListener() {}}, window: {},
    clearTimeout() {}, setTimeout() {}, MOVE_GYM_ID: 10, currentUser: user,
    _gymVertical: 'gym', _asistFechaSel_offset: () => '2026-11-27', _hovDiaNombre: () => 'Viernes',
    _horaToMinutes: h => Number(h.slice(0,2))*60 + Number(h.slice(3,5)),
    esc: String, fmtHoraClase: String,
    contextoPagosInicio: {gym:10,user}, contextoClientesInicio: {gym:10,user},
    clientesDB: [{nombre:'Ada'}, {nombre:'Leo'}, {nombre:'Iris'}, {nombre:'Ana'}],
    estadoMembresiaPorCliente: () => new Map([
      ['Ada', {acceso:true,diasRest:9}], ['Leo', {acceso:false, mejorVence:'2026-11-26', diasRest:-1}],
      ['Iris', {acceso:false, congelado:true}], ['Ana', {acceso:false, mejorVence:null, diasRest:null}],
      ['Otro', {acceso:false, agotado:true}]
    ]),
    _horariosEfectivosFecha: async () => [], _gymHoyOcupacion: async () => ({porClase:{},asistencias:0})
  });
  vm.runInContext(source, app);
  return {get, app};
}

test('Inicio cuenta sólo socios del directorio y evita mostrar datos de otro gimnasio', async () => {
  const {get, app} = inicio();
  let resolver;
  app._horariosEfectivosFecha = () => new Promise(resolve => {resolver=resolve;});
  const lectura = app.renderInicioHoy();
  assert.equal(get('core-hoy-vencido').textContent, 1);
  assert.equal(get('core-hoy-por-vencer').textContent, 1);
  app.MOVE_GYM_ID=12;
  app._horariosEfectivosFecha=async () => [];
  await app.renderInicioHoy();
  resolver([{id:99,hora:'23:59',tipo:'Clase anterior'}]);
  await lectura;
  assert.equal(get('core-hoy-vencido').textContent,'—');
  assert.match(get('gym-hoy-body').innerHTML,/Hoy no hay clases/);
});

test('La próxima clase suma reservas de plantilla y excepción y distingue la ocupación desconocida', () => {
  const {get, app} = inicio();
  const clases=[{id:1,hora:'06:00',tipo:'Movilidad'}, {id:2,base_id:3,hora:'09:00',tipo:'Fuerza',cupo:10}];
  const ahora = new Date(2026,10,27,8,59);
  app.pintarProximaClase(clases,{2:1,3:2},ahora);
  assert.match(get('gym-hoy-body').innerHTML,/3 de 10 lugares ocupados/);
  assert.match(get('gym-hoy-body').innerHTML,/data-slot="2"/);
  app.pintarProximaClase(clases,null,ahora);
  assert.match(get('gym-hoy-body').innerHTML,/Ocupación por confirmar/);
  app.pintarProximaClase(clases,{},new Date(2026,10,27,20,0));
  assert.match(get('gym-hoy-body').innerHTML,/Ya comenzaron todas/);
});
