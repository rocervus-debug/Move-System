const test = require('node:test');
const assert = require('node:assert/strict');
const { project, findRows, projectDetail } = require('../../assets/flow-customers/directory.js');

const known = { gym_id: 2, id: 12, nombre: 'María Núñez', numero_cliente: '007', telefono: '+52 (33) 5555-1234', email: 'maria@example.test' };
function snapshot(rows, overrides) {
  return { gymId: 2, actorGymId: '2', status: 'ready', rows, ...overrides };
}

test('solo expone campos de identidad y separa homónimos por ID y gimnasio', () => {
  const data = project(snapshot([known, { ...known, id: '13', pagos: 'privado' }, { ...known, gym_id: 7, nombre: 'Otra sede' }]));
  assert.equal(data.rows.length, 2);
  assert.deepEqual(data.rows.map(row => row.id), ['12', '13']);
  assert.deepEqual(Object.keys(data.rows[0]), ['id', 'name', 'number', 'phone', 'email']);
});

test('rechaza una identidad ambigua completa, IDs inválidos y números inseguros', () => {
  const data = project(snapshot([known, { ...known, id: '12' }, { ...known, id: 12 }, { ...known, id: -1 }, { ...known, id: 0 }, { ...known, id: 2**53 }, { ...known, id: '01' }]));
  assert.deepEqual(data.rows, []);
  assert.equal(data.unresolved, true);
  assert.equal(project(snapshot([{ ...known, id: '9007199254740993' }])).rows[0].id, '9007199254740993');
});

test('la ausencia de contexto, la carga y el error nunca exponen filas', () => {
  for (const input of [null, snapshot([known], { actorGymId: 3 }), snapshot([known], { actorGymId: undefined }), snapshot([known], { gymId: null })]) {
    assert.deepEqual(project(input), { status: 'unavailable' });
  }
  for (const status of ['loading', 'error']) {
    assert.deepEqual(project(snapshot([known], { status })), { status, gym: '2' });
  }
  assert.deepEqual(project(snapshot(null)), { status: 'error', gym: '2' });
});

test('busca por nombre, correo, teléfono, número y referencia sin modificar registros', () => {
  const data = project(snapshot([known, { ...known, id: 2, nombre: null, numero_cliente: null, telefono: null, email: null }], { truncated: true }));
  assert.equal(data.truncated, true);
  assert.equal(data.rows[0].name, '');
  for (const query of ['maria nunez', 'MARÍA', 'EXAMPLE.TEST', '3355551234', '007', '12']) {
    assert.deepEqual(findRows(data.rows, query).map(row => row.id), ['12']);
  }
  assert.equal(findRows(data.rows, 'ausente').length, 0);
  assert.equal(findRows(data.rows, '').length, 2);
});

function detail(overrides={}) { return {gymId:2,customerId:12,profile:{status:'ready',row:{...known,cumpleanos:'1994-01-31',notas:'Prefiere mañana.\n<b>Texto literal</b>',portal_token:'must-not-project'}},
  attendance:{status:'ready',rows:[{id:31,gym_id:2,cliente_id:12,fecha:'2026-10-31',hora:'23:59:00',metodo:'QR'}],truncated:false},...overrides}; }
test('detalle por gym+cliente expone solo campos aprobados y notas como texto',()=>{
  const d=projectDetail(detail(),2,12);assert.equal(d.info.birthday,'1994-01-31');assert.match(d.info.notes,/<b>Texto literal/);
  assert.equal('portal_token' in d.info,false);assert.equal(d.attendance.rows[0].date,'2026-10-31');assert.equal(d.attendance.rows[0].time,'23:59');
});
test('detalle de homónimo o de otra sede se descarta completo',()=>{
  for(const s of [detail({gymId:3}),detail({customerId:13}),null])assert.deepEqual(projectDetail(s,2,12),{status:'unavailable'});
  for(const row of [{...known,id:13},{...known,gym_id:3},null])assert.equal(projectDetail(detail({profile:{status:'ready',row}}),2,12).info.status,'error');
});
test('asistencias ajenas/ambiguas/fechas inválidas no se muestran ni cuentan',()=>{
  const row=detail().attendance.rows[0];
  const d=projectDetail(detail({attendance:{status:'ready',rows:[row,{...row,id:31},{...row,id:32,cliente_id:13},{...row,id:33,gym_id:3},{...row,id:34,fecha:'2026-02-31'}]}}),2,12);
  assert.equal(d.attendance.rows.length,0);assert.equal(d.attendance.unresolved,true);
});
test('carga y error de asistencia son independientes del registro personal',()=>{
  for(const status of ['loading','error']){const d=projectDetail(detail({attendance:{status}}),2,12);assert.equal(d.info.status,'ready');assert.deepEqual(d.attendance,{status});}
});
test('vacío conocido difiere de historial parcial y de error',()=>{
  const d=projectDetail(detail({attendance:{status:'ready',rows:[],truncated:true}}),2,12);
  assert.equal(d.attendance.status,'ready');assert.equal(d.attendance.truncated,true);
  assert.equal(projectDetail(detail({attendance:{status:'ready',rows:null}}),2,12).attendance.status,'error');
});
test('no inventa fecha de cumpleaños ni hora de asistencia inválidas',()=>{
  const s=detail();s.profile.row.cumpleanos='1994-02-31';s.attendance.rows[0].hora='25:00:00';
  const d=projectDetail(s,2,12);assert.equal(d.info.birthday,'');assert.equal(d.attendance.rows[0].time,'');
});

const reservation = {id:'abcdef01-1234-5678-90ab-abcdef012345',gym_id:2,cliente_id:12,fecha:'2026-10-31',clase_tipo:'Pilates Núñez',clase_hora:'7:00 – 8:00',estado:'reservado',portal_token:'never-project',pago_id:88,cliente_nombre:'No usar'};
function bookings(rows=[reservation],extra={}){return projectDetail(detail({reservations:{status:'ready',rows,...extra}}),2,12).reservations;}
test('reservas muestran solo campos aprobados y horario textual sin inferir derechos',()=>{
  assert.deepEqual(bookings().rows,[{id:reservation.id,date:'2026-10-31',type:'Pilates Núñez',time:'7:00 – 8:00',state:'Reservada'}]);
});
test('reservas de homónimo/otro gym/sin cliente, fecha o UUID válidos se omiten',()=>{
  const rows=[{...reservation,cliente_id:13},{...reservation,gym_id:3},{...reservation,cliente_id:null},{...reservation,fecha:'2026-02-31'},{...reservation,id:1},null];
  assert.deepEqual(bookings(rows),{status:'ready',rows:[],unresolved:true,truncated:false});
});
test('UUID duplicado incluso con distinta capitalización se descarta completo',()=>{
  const b=bookings([reservation,{...reservation,id:reservation.id.toUpperCase()},reservation]);
  assert.deepEqual(b.rows,[]);assert.equal(b.unresolved,true);
});
test('estados guardados son informativos; desconocidos no se convierten en confirmados',()=>{
  for(const [estado,label] of [['reservado','Reservada'],['checkin','Asistencia registrada en reserva'],['ausente','Ausencia registrada'],['cancelado','Cancelada'],['nuevo','Estado sin verificar'],[null,'Estado sin verificar'],['__proto__','Estado sin verificar']])assert.equal(bookings([{...reservation,estado}]).rows[0].state,label);
  assert.deepEqual(bookings([{...reservation,estado:'bloqueado'}]).rows,[]);
  assert.equal(bookings([{...reservation,estado:'bloqueado'}]).unresolved,true);
});
test('reservas parciales, vacías, inválidas o con error no borran asistencias',()=>{
  for(const status of ['loading','error']){const d=projectDetail(detail({reservations:{status}}),2,12);assert.deepEqual(d.reservations,{status});assert.equal(d.attendance.status,'ready');assert.equal(d.info.status,'ready');}
  assert.deepEqual(bookings([]),{status:'ready',rows:[],unresolved:false,truncated:false});
  assert.equal(bookings([],{truncated:true}).truncated,true);assert.equal(bookings(null).status,'error');
});
test('reservas se ordenan por fecha sin deducir próximas clases desde el reloj del dispositivo',()=>{
  const later={...reservation,id:'abcdef02-1234-5678-90ab-abcdef012345',fecha:'2027-01-31',clase_tipo:'<b>literal</b>',clase_hora:null};
  assert.deepEqual(bookings([reservation,later]).rows.map(r=>r.date),['2027-01-31','2026-10-31']);
  assert.equal(bookings([later]).rows[0].time,'');assert.equal(bookings([later]).rows[0].type,'<b>literal</b>');
});
