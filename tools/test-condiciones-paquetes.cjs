const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = { window:{} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../core-paquetes.js'),'utf8'),ctx);
const { importe,recurrente,resumen } = ctx.window.CorePaquetes;

test('Catálogo y tienda muestran el mismo precio, frecuencia, clases y vigencia',()=>{
  const base = { price_mxn:'349.50', duration_days:30, num_classes:8 };
  const interno = resumen({...base,billing_type:'one_time',unlimited_classes:false});
  const publico = resumen({...base,billing_type:'one_time',recurring:false,unlimited:false});
  assert.equal(interno,publico);
  assert.match(publico,/\$349\.50.*MXN[\s\S]*Pago único[\s\S]*Clases<\/dt><dd>8[\s\S]*Vigencia<\/dt><dd>30 días/);
});

test('Una membresía ilimitada de 30 días solo se anuncia recurrente si así se cobra',()=>{
  const p = { price_mxn:750,duration_days:30,unlimited_classes:true };
  assert.match(resumen(p),/Pago único[\s\S]*Ilimitadas/);
  assert.match(resumen({...p,billing_type:'recurring'}),/Cobro mensual automático/);
  assert.equal(recurrente({billing_type:'one_time',recurring:true}),false);
  assert.equal(recurrente({recurring:true}),true);
});

test('Precio gratis y datos incompletos se distinguen incluso con configuración antigua',()=>{
  assert.match(resumen({price_mxn:0,recurring:true}),/Gratis[\s\S]*Sin cobro/);
  for(const price of [null,undefined,'',-1,'mal']){
    assert.equal(importe({price_mxn:price}),null);
    assert.match(resumen({price_mxn:price}),/Precio por confirmar/);
  }
  assert.match(resumen({price_mxn:50}),/Clases<\/dt><dd>Por confirmar[\s\S]*Vigencia<\/dt><dd>Por confirmar/);
});

test('La condición de primera visita se muestra solo en paquetes restringidos que pasan por checkout',()=>{
  const aviso='Solo para primera visita';
  for(const billing_type of ['one_time','recurring']){
    const plan={price_mxn:80,billing_type,solo_primera_vez:true};
    assert.ok(resumen(plan).includes(aviso));
    assert.ok(!resumen({...plan,solo_primera_vez:false}).includes(aviso));
    assert.ok(!resumen({...plan,solo_primera_vez:undefined}).includes(aviso));
    assert.ok(!resumen({...plan,price_mxn:0}).includes(aviso));
    assert.ok(!resumen({...plan,price_mxn:9.99}).includes(aviso));
  }
});

test('storefront-config lee la restricción de cada paquete publicado y la devuelve como booleano',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/storefront-config/index.ts'),'utf8');
  let handler;
  const packages=[true,false,undefined].map((flag,i)=>({id:i+1,package_id:i+1,packages:{name:'Clase',price_mxn:80,solo_primera_vez:flag}}));
  const data={gym_storefront:{slug:'qa',gym_id:33},gyms:{vertical:'gym'},gym_config:[],storefront_listings:packages};
  const filters=[];
  const db={
    rpc:async()=>({data:{}}),
    from(table){
      return {
        select(cols){if(table==='storefront_listings') assert.match(cols,/packages!inner\s*\([^)]*\bsolo_primera_vez\b/);return this;},
        eq(col,v){if(table==='storefront_listings') filters.push([col,v]);return this;},
        in(){return this;}, single(){return this;}, maybeSingle(){return this;},order(){return this;},
        then(resolve){resolve({data:data[table]});}
      };
    }
  };
  vm.runInNewContext(require('node:module').stripTypeScriptTypes(source.replace(/^import .*;$/gm,'')),{
    URL, Response, console, createClient:()=>db, Deno:{env:{get:()=>''},serve:f=>{handler=f;}}
  });
  const res=await handler(new Request('https://example.test/?slug=qa'));
  assert.equal(res.status,200);
  assert.deepEqual(filters,[['gym_id',33],['is_public',true],['packages.is_active',true]]);
  assert.deepEqual((await res.json()).packages.map(p=>p.solo_primera_vez),[true,false,false]);
});

test('la revisión de nombre respeta mensualidades manuales, negación y el importe real',()=>{
  const {explicacionCobro,revisarNombreCobro}=ctx.window.CorePaquetes;
  const pago={price_mxn:999,billing_type:'one_time'};
  for(const name of ['Mensualidad domiciliada','Plan recurrente','Suscripción con renovación automática']){
    assert.equal(revisarNombreCobro({...pago,name}),true);
    assert.equal(revisarNombreCobro({...pago,name,billing_type:'recurring'}),false);
  }
  for(const name of ['Mensualidad','4 clases al mes','Mensualidad no domiciliada','Sin domiciliación']){
    assert.equal(revisarNombreCobro({...pago,name}),false);
  }
  assert.equal(revisarNombreCobro({...pago,name:'Pago Único',billing_type:'recurring'}),true);
  assert.equal(explicacionCobro({...pago,price_mxn:0,billing_type:'recurring'}),'Sin cobro');
  assert.equal(explicacionCobro(pago),'Se cobra una vez');
});
