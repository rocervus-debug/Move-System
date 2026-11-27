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
