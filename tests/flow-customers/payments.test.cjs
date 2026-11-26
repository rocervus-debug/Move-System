'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {projectPayments,projectDetail}=require('../../assets/flow-customers/directory.js');
const payment={id:1,gym_id:2,cliente_id:12,cliente:'Ana Núñez',monto:500,fecha:'2026-10-31',plan:'Plan',metodo:'Efectivo',vence:'2026-11-30',notas:''};
const project=(rows,patch={})=>projectPayments({status:'ready',rows,...patch},2,12);
test('muestra registro por ID aunque el nombre histórico sea diferente',()=>{const r=project([{...payment,cliente:'Nombre anterior'}]);assert.equal(r.rows.length,1);assert.equal(r.rows[0].amount,500);assert.equal(r.rows[0].expires,'2026-11-30');assert.equal(r.rows[0].name,undefined);});
for(const patch of [{cliente_id:null},{cliente_id:13},{gym_id:3}])test('omite sin atribuir por nombre '+JSON.stringify(patch),()=>{const r=project([{...payment,...patch}]);assert.deepEqual(r.rows,[]);assert.equal(r.unresolved,true);});
test('igual id con PK distinta conserva dos registros',()=>{const r=project([payment,{...payment,notas:'Ajuste'}]);assert.equal(r.rows.length,2);assert.notEqual(r.rows[0].key,r.rows[1].key);});
test('PK completa duplicada se omite como ambigua',()=>{const r=project([payment,{...payment}]);assert.equal(r.rows.length,0);assert.equal(r.unresolved,true);});
for(const patch of [{id:9007199254740992},{monto:NaN},{monto:1.555},{fecha:'2026-02-31'},{notas:null}])test('no inventa datos inválidos '+JSON.stringify(patch),()=>{assert.equal(project([{...payment,...patch}]).rows.length,0);});
test('conserva ID bigint textual y valores negativos/cero registrados',()=>{const r=project([{...payment,id:'9007199254740993',monto:-10},{...payment,monto:0}]);assert.equal(r.rows.length,2);assert.equal(r.rows[0].amount,-10);});
test('vencimiento no verificable no se convierte en acceso ni fecha',()=>{const r=project([{...payment,vence:'—'}]);assert.equal(r.rows[0].expires,'');assert.equal(r.rows[0].active,undefined);});
test('fecha descendente y claves estables',()=>{const r=project([payment,{...payment,id:2,fecha:'2026-11-01'}]);assert.deepEqual(r.rows.map(p=>p.id),['2','1']);});
test('carga error restricción y falta de contexto no exponen datos',()=>{for(const status of ['loading','error','restricted'])assert.deepEqual(projectPayments({status,rows:[payment]},2,12),{status});assert.deepEqual(projectPayments({status:'ready',rows:[payment]},null,12),{status:'error'});assert.equal(projectPayments(null,2,12).status,'restricted');});
test('vacío total y cobertura parcial distintos; texto conserva caracteres literal',()=>{assert.equal(project([]).truncated,false);assert.equal(project([],{truncated:true}).truncated,true);const r=project([{...payment,plan:'<img src=x onerror=alert(1)>',notas:'Peña & Núñez'}]);assert.match(r.rows[0].plan,/<img/);assert.equal(r.rows[0].notes,'Peña & Núñez');});
test('ficha de otro cliente descarta también historial monetario',()=>{assert.deepEqual(projectDetail({gymId:2,customerId:13,payments:{status:'ready',rows:[payment]}},2,12),{status:'unavailable'});});

test('conserva centavos del pago',()=>assert.equal(project([{...payment,monto:137.26}]).rows[0].amount,137.26));
