const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=readFileSync(path.join(__dirname,'..','core-agenda.js'),'utf8');
const app=vm.createContext({window:{matchMedia:()=>({addEventListener(){}})},_horaToMinutes:h=>Number(h.slice(0,2))*60+Number(h.slice(3))});
vm.runInContext(source,app);
const fecha='2026-11-27';
const plantilla={id:1,dia:'Viernes',hora:'09:00',tipo:'Yoga'};
const especial={...plantilla,id:20,fecha,tipo:'Movilidad'};

test('Una excepción cancelada o un cierre retiran también su horario semanal',()=>{
  for(const [fila,canceladas] of [[especial,new Set(['20'])],[{...especial,tipo:'CERRADO'},new Set()]]){
    const clases=app.resolverClasesFecha([plantilla,fila],fecha,'Viernes',canceladas);
    assert.equal(clases.length,0);
  }
});

test('La agenda muestra la clase efectiva con el id de la plantilla y ordena por hora',()=>{
  const temprano={...plantilla,id:3,hora:'07:30'};
  const otraFecha={...especial,id:30,fecha:'2026-12-04',hora:'10:00'};
  const filas=app.resolverClasesFecha([especial,plantilla,otraFecha,temprano],fecha,'Viernes',new Set());
  assert.deepEqual(Array.from(filas,f=>f.id),[3,20]);
  assert.equal(filas[1].base_id,1);
});

const panel=readFileSync(path.join(__dirname,'..','VELUM_Sistema_Interno.html'),'utf8');
const lector=panel.slice(panel.indexOf('async function _gymHoyOcupacion('),panel.indexOf('async function abrirClaseHoy('));
test('La ocupación y las asistencias suman todas las páginas aunque la base limite cada lectura',async()=>{
  const filas=Array.from({length:112},(_,i)=>({id:i,horario_id:10+i%2,estado:i===111?'bloqueado':i%4?'reservado':'checkin'}));
  const condiciones=[];
  const consulta={select(){return this;},eq(c,v){condiciones.push([c,v]);return this;},neq(){return this;},order(){return this;},range(inicio){return Promise.resolve({data:filas.slice(inicio,inicio+50),count:filas.length});}};
  const contexto=vm.createContext({window:{supabaseClient:{from:()=>consulta}}});
  vm.runInContext(lector,contexto);
  const ocupacion=await contexto._gymHoyOcupacion(fecha,33);
  assert.equal(ocupacion.porClase[10],56);
  assert.equal(ocupacion.porClase[11],56);
  assert.equal(ocupacion.bloqueadosPorClase[11],1);
  assert.equal(ocupacion.asistencias,28);
  assert.equal(ocupacion.asistenciasPorClase[10],28);
  assert.equal(condiciones.filter(([c,v])=>c==='gym_id' && v===33).length,3);
});

test('Una tienda con horario oculto abre Planes aunque le llegue el enlace con #horario',()=>{
  const tienda=readFileSync(path.join(__dirname,'..','storefront.html'),'utf8');
  const inicio=tienda.indexOf('function _sfBuildTabs(');
  const build=tienda.slice(inicio,tienda.indexOf('\n}',inicio)+2);
  let seleccion;
  const tiendaCtx=vm.createContext({
    SF_CFG:{tabs:['planes']},location:{hash:'#horario'},
    sfTab:nombre=>{seleccion=nombre;},document:{querySelectorAll:()=>[],getElementById:()=>null}
  });
  vm.runInContext(build,tiendaCtx);
  tiendaCtx._sfBuildTabs({schedule_weekly:[]});
  assert.equal(seleccion,'planes');
  tiendaCtx.SF_CFG.tabs=['horario','planes'];
  tiendaCtx._sfBuildTabs({schedule_weekly:[]});
  assert.equal(seleccion,'horario');
});

test('Dos socios y dos lugares bloqueados en una clase de seis son dos de cuatro ofrecidos',()=>{
  const cupo=app.cupoAgendaDia({id:20,base_id:1,cupo:6},{
    porClase:{20:3,1:1},bloqueadosPorClase:{20:1,1:1}
  });
  assert.equal(cupo.reservados,2);
  assert.equal(cupo.ofrecidos,4);
  assert.equal(cupo.bloqueados,2);
});

test('Las clases simultáneas conservan sus IDs y reservas al cancelar otra de la misma hora',()=>{
  const segunda={...plantilla,id:2,tipo:'Reformer'};
  const otroEspecial={...especial,id:21,tipo:'Fuerza'};
  const casos=[
    {filas:[plantilla,segunda,especial],canceladas:[],ids:[1,2,20]},
    {filas:[plantilla,segunda,especial],canceladas:['1'],ids:[2,20]},
    {filas:[plantilla,segunda,especial],canceladas:['20'],ids:[1,2]},
    {filas:[plantilla,especial,otroEspecial],canceladas:[],ids:[1,20,21]},
    {filas:[plantilla,especial,otroEspecial],canceladas:['20'],ids:[1,21]},
    {filas:[plantilla,especial,{...otroEspecial,tipo:'CERRADO'}],canceladas:[],ids:[1,20]}
  ];
  for(const {filas,canceladas,ids} of casos){
    const clases=app.resolverClasesFecha(filas,fecha,'Viernes',new Set(canceladas));
    assert.deepEqual(Array.from(clases,h=>h.id),ids);
    assert.ok(clases.every(h=>h.base_id==null));
  }
  const excepcion=app.resolverClasesFecha([plantilla,especial],fecha,'Viernes',new Set(['1']));
  assert.equal(excepcion[0].base_id,1);
  assert.equal(excepcion[0].id,20);
});
