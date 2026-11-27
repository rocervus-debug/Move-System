const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../core-ficha.js'),'utf8');

function ficha({subscriptions=[], clientes, paquete, bloqueado=false, error=null}={}){
  const cliente={id:2,email:'ana@example.test'};
  const facts={};
  const root={isConnected:true,querySelector(selector){
    const name=selector.match(/"(.*?)"/)[1];
    return facts[name]??={textContent:'Por confirmar'};
  }};
  const queries=[];
  const supabaseClient={from(){
    const predicates=[];
    const q={
      select(){return q;},
      eq(key,value){predicates.push(s=>s[key]===value);return q;},
      is(key,value){return q.eq(key,value);},
      in(key,values){predicates.push(s=>values.includes(s[key]));return q;},
      then(resolve){resolve({error,data:subscriptions.filter(s=>predicates.every(f=>f(s)))});}
    };
    queries.push(q);return q;
  }};
  const context={document:{getElementById:()=>root},MOVE_GYM_ID:33,currentUser:{rol:'admin'},
    clientesDB:clientes||[cliente],window:{supabaseClient},roleBlocksView:()=>bloqueado,
    _hoyMX:()=>'2026-11-27', esPaseDia:plan=>plan==='Visita',
    _cargarPaquetesLista:async()=>({2:paquete}),CoreCobros:{frequency:()=> 'Pago único'}};
  const run=vm.runInNewContext(source+'; cargarResumenFicha',context);
  return {root,queries,facts,leer:(historial=[])=>run(cliente,historial)};
}

test('La ficha distingue clases de renovación y respeta el gimnasio',async()=>{
  const f=ficha({paquete:{restantes:5},subscriptions:[{gym_id:44,cliente_id:2,status:'active'}]});
  await f.leer([{clases_totales:8}]);
  assert.equal(f.facts.clases.textContent,'5');
  assert.equal(f.facts.renovacion.textContent,'Pago único · sin renovación registrada');
});

test('La mensualidad identificada por correo muestra el fin del periodo en México',async()=>{
  const f=ficha({subscriptions:[{gym_id:33,cliente_id:null,customer_email:'ana@example.test',status:'active',cancel_at_period_end:true,current_period_end:'2026-12-16T02:00:00Z'}]});
  await f.leer();
  assert.match(f.facts.renovacion.textContent,/Renovación cancelada.*15/);
});

test('Un correo compartido requiere revisión y recepción evita consultar suscripciones',async()=>{
  const f=ficha({clientes:[{email:'ana@example.test'},{email:'ANA@example.test'}]});await f.leer();
  assert.match(f.facts.renovacion.textContent,/Correo compartido/);
  const recepcion=ficha({bloqueado:true});await recepcion.leer();
  assert.equal(recepcion.queries.length,0);
});

test('Una respuesta fallida o una ficha sustituida nunca confirman una renovación',async()=>{
  const f=ficha({error:{message:'sin conexión'}});await f.leer();
  assert.equal(f.facts.renovacion,undefined);
  const previa=ficha({paquete:{restantes:4}});const lectura=previa.leer();previa.root.isConnected=false;
  await lectura;assert.deepEqual(previa.facts,{});
});
