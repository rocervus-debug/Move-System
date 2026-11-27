const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({
  _horaToMinutes:h=>h?Number(h.slice(0,2))*60+Number(h.slice(3,5)):9999,
  _hovDiaNombre:f=>['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date(f+'T12:00Z').getUTCDay()]
});
for(const file of ['core-agenda.js','core-ocupacion.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const fechas=ctx.fechasOcupacion('2026-11-27');
test('las dos ventanas completas comparten días y excluyen hoy',()=>{
  assert.equal(fechas.length,14);assert.equal(fechas[0],'2026-11-13');assert.equal(fechas[7],'2026-11-20');assert.equal(fechas[13],'2026-11-26');
  assert.equal(ctx.fechasOcupacion('2027-01-01')[0],'2026-12-18');
});
test('una excepción reúne sus reservas y las de la plantilla; sin canceladas ni solicitudes de muestra',()=>{
  const base={id:'a',fecha:'',dia:'Viernes',hora:'08:00',tipo:'Fuerza',cupo:8};
  const override={...base,id:'b',fecha:fechas[7],tipo:'Pilates',cupo:4};
  const r=(fecha,horario_id,estado)=>({fecha,horario_id,estado});
  const f=ctx.franjasOcupacion(fechas,[base,override],[],[r(fechas[7],'a','reservado'),r(fechas[7],'b','checkin'),r(fechas[7],'b','cancelado')])[0];
  assert.equal(f.actual.length,1);assert.equal(f.actual[0].tipo,'Pilates');assert.equal(f.actual[0].reservas,2);
  assert.equal(ctx.totalesOcupacion(f.actual).porcentaje,50);assert.equal(ctx.totalesOcupacion(f.anterior).porcentaje,0);
  for(const cancel of [[{fecha:fechas[7],horario_id:'b'}],[]]){
    const ov=cancel.length?override:{...override,tipo:'CERRADO'};
    const g=ctx.franjasOcupacion(fechas,[base,ov],cancel,[r(fechas[7],'a','reservado')])[0];
    assert.equal(g.actual.length,0);assert.equal(ctx.totalesOcupacion(g.actual).porcentaje,null);
  }
});
test('los cupos desconocidos y horarios eliminados no se convierten en cero; una clase nueva no se proyecta al pasado',()=>{
  const base={id:'a',dia:'Viernes',fecha:null,hora:'09:00',tipo:'Yoga',cupo:null,created_at:'2026-11-20T10:00:00Z'};
  const f=ctx.franjasOcupacion(fechas,[base],[],[{fecha:fechas[0],horario_id:'borrada',clase_hora:'09:00',clase_tipo:'Otro',estado:'no_show'}])[0];
  assert.equal(f.anterior.length,1);assert.equal(f.anterior[0].tipo,'Otro');assert.equal(f.anterior[0].reservas,1);
  assert.equal(f.actual.length,1);assert.equal(ctx.totalesOcupacion(f.actual).porcentaje,null);
  assert.equal(ctx.totalesOcupacion([{cupo:10,reservas:5},{cupo:40,reservas:5}]).porcentaje,20);
});
test('lectura completa por cursor bajo un límite inferior al solicitado y sin devolver datos parciales al fallar',async()=>{
  const rows=Array.from({length:106},(_,i)=>({id:i+1}));
  let calls=0;
  const fetch=()=>{let cursor=0;return {order(){return this},limit(){return this},gt(_,n){cursor=n;return this},then(ok){calls++;ok({data:rows.filter(r=>r.id>cursor).slice(0,40)})}}};
  assert.equal((await ctx.leerFilasOcupacion(fetch,()=>true)).length,106);assert.equal(calls,4);
  await assert.rejects(ctx.leerFilasOcupacion(fetch,()=>false));
});
