const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {resumenVigencias,personasParaRenovar}=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../core-vencimientos.js'),'utf8')+';({resumenVigencias,personasParaRenovar})');
const resumen=(...pagos)=>resumenVigencias(pagos,'2026-12-31',plan=>plan==='Pase de día');
const socios=estados=>Array.from(estados.keys(),nombre=>({nombre}));
const pago=(cliente,vence,extra={})=>({cliente,vence,plan:'Mensual',...extra});
test('Cierre de año y ventanas inclusivas: hoy, mañana, 7, 14 y 30',()=>{
  const fechas=['2026-12-30','2026-12-31','2027-01-01','2027-01-07','2027-01-14','2027-01-30','2027-01-31'];
  const estados=resumen(...fechas.map(f=>pago(f,f)));
  assert.deepEqual(Array.from(estados.values(),e=>e.diasRest),[-1,0,1,7,14,30,31]);
  for(const [n,cantidad] of [[7,3],[14,4],[30,5]]) assert.equal(personasParaRenovar(estados,socios(estados),n,'proximos').length,cantidad);
});
test('Una renovación posterior sustituye al pago antiguo. Un paquete agotado no prolonga otro vigente.',()=>{
  const estados=resumen(pago('Ana','2026-12-31'),pago('Ana','2027-01-26'),pago('Ana','2027-04-01',{clases_totales:4,clases_usadas:4}));
  assert.equal(estados.get('Ana').mejorVence,'2027-01-26');
  assert.equal(personasParaRenovar(estados,socios(estados),7,'proximos').length,0);
  assert.equal(personasParaRenovar(estados,socios(estados),30,'proximos').length,1);
});
test('La pausa suspende los recordatorios; la devolución conserva las clases según saldo. Los pases no son membresías.',()=>{
  const estados=resumen(pago('Pausa','2026-12-28',{congelado:true}),pago('Pausa vigente','2027-01-12',{congelado:true}),pago('Pase','2026-12-31',{plan:'Pase de día'}),pago('Vacío',''),pago('Sin pago','2027-01-03',{notas:'__sin_pago__'}),pago('Sin fecha',null,{clases_totales:8,clases_usadas:2}),pago('Sin fecha','2027-01-01'),pago('Reembolso','2027-01-03',{clases_totales:8,clases_usadas:2,refunded_cents:80000}),pago('Agotado','2027-02-24',{clases_totales:3,clases_usadas:3}));
  assert.equal(estados.get('Pausa').acceso,false);assert.equal(estados.get('Pausa vigente').acceso,true);
  assert.equal(estados.get('Sin fecha').acceso,true);assert.equal(estados.get('Sin fecha').diasRest,null);
  assert.equal(estados.get('Vacío').acceso,false);assert.equal(estados.has('Pase'),false);
  assert.deepEqual(Array.from(personasParaRenovar(estados,socios(estados),14,'proximos'),p=>p.nombre),['Reembolso']);
  assert.deepEqual(Array.from(personasParaRenovar(estados,socios(estados),14,'vencidos'),p=>p.nombre),['Agotado']);
});
test('El teléfono de directorio prevalece y las filas históricas mantienen el número del pago',()=>{
  const estados=resumen(pago('Ana','2027-01-01',{telefono:'5551234444'}),pago('Hugo','2027-01-12',{telefono:'+52 55 9911 2345'}));
  const personas=personasParaRenovar(estados,[{nombre:'Ana',telefono:'55 9000 1212'},{nombre:'Hugo'}],14,'ambos');
  assert.deepEqual(Array.from(personas,p=>p.telefono),['525590001212','525599112345']);
});

test('El directorio delimita los destinatarios y los homónimos requieren revisar la identidad',()=>{
  const estados=resumen(pago('Ana','2027-01-01',{telefono:'5551234444'}),pago('Ya no está','2027-01-01'));
  const personas=personasParaRenovar(estados,[{nombre:'Ana',telefono:'5512345678'},{nombre:'Ana',telefono:'5598765432'}],7,'proximos');
  assert.equal(personas.length,1);assert.equal(personas[0].homonimo,true);assert.equal(personas[0].telefono,'');
});
