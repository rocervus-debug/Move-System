const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = readFileSync(path.join(__dirname, '../VELUM_Sistema_Interno.html'), 'utf8');
const source = html.split('async function leerDirectorioCompleto(')[1].split('\n}')[0];
const leer = vm.runInNewContext('(async function leerDirectorioCompleto('+source+'\n})');

function consulta(pagina) {
  return {from(tabla) {
    assert.equal(tabla,'pagos');
    const orden=[];
    return {
      select(_,op) {assert.equal(op.count,'exact');return this;},
      eq(k,v) {assert.equal(k,'gym_id');assert.equal(v,4);return this;},
      order(k) {orden.push(k);return this;},
      range(desde,hasta) {assert.deepEqual(orden,['created_at','id']);return pagina(desde,hasta);}
    };
  }};
}
test('Lee una membresía anterior al pago 2000 aunque el servidor limite el tamaño de página',async()=>{
  const filas=Array.from({length:2050},(_,i)=>({id:2050-i}));
  const db=consulta(desde=>({data:filas.slice(desde,desde+75),count:filas.length}));
  const {data}=await leer(db,'pagos',4,'created_at',false,()=>true);
  assert.equal(data.length,2050);assert.equal(data.at(-1).id,1);
});
test('Una página fallida nunca marca el historial parcial como completo',async()=>{
  const db=consulta(desde=>desde?{error:{message:'sin conexión'}}:{data:[{id:2}],count:2});
  const r=await leer(db,'pagos',4,'created_at',false,()=>true);
  assert.equal(r.data,undefined);assert.equal(r.error.message,'sin conexión');
});
test('Reinicia una lectura si se desplazó el límite entre páginas',async()=>{
  let intentos=0;
  const db=consulta(desde=>{
    if(!desde){intentos++;return {data:[{id:3}],count:2};}
    return {data:[{id:intentos===1?3:2}],count:2};
  });
  const {data}=await leer(db,'pagos',4,'created_at',false,()=>true);
  assert.equal(intentos,2);assert.equal(data[1].id,2);
});
