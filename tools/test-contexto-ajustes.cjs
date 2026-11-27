const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const panel=fs.readFileSync(path.resolve(__dirname,'../VELUM_Sistema_Interno.html'),'utf8');
function funcion(nombre){
  const inicio=panel.match(new RegExp('^(async )?function '+nombre+'\\(','m'));
  assert.ok(inicio,nombre);
  return panel.slice(inicio.index,panel.indexOf('\n}',inicio.index)+2);
}

function fixture(){
  let resolver;
  const espera=new Promise(resolve=>{resolver=resolve;});
  const llamadas=[], mensajes=new Map();
  const elemento=id=>{
    if(!mensajes.has(id)) mensajes.set(id,{textContent:'',value:'2026-10',reportValidity:()=>true});
    return mensajes.get(id);
  };
  const db={
    from(tabla){
      llamadas.push(tabla);
      const q={insert:()=>q,select:()=>q,eq:()=>q,single:()=>espera};return q;
    }
  };
  const user={id:1,gym_id:1,jwt:'token-A',rol:'superadmin'};
  const ctx=vm.createContext({currentUser:user,MOVE_GYM_ID:1,window:{supabaseClient:db,location:{href:'app'}},
    supabaseUrl:'https://fixture.invalid',_hoyMX:()=>'2026-11-27',_pvImpersonando:()=>false,
    document:{getElementById:elemento},toast:()=>{},fetch:(url,opts)=>{llamadas.push(opts.headers.Authorization);return espera;},
    renderStripeSettings:()=>llamadas.push('renderStripeSettings'),cargarSolicitudesFiscales:()=>llamadas.push('cargarSolicitudesFiscales')
  });
  const nombres=['contextoPagoGym','pagoGymVigente','administrarPagosGym','openBillingPortal','conectarStripe','refreshStripeStatus','enviarSolicitudFiscal','tituloPlanVelum','datosPagoGym','actualizarTituloMenuPlan'];
  vm.runInContext('let lecturaMenuPlan=0;'+nombres.map(funcion).join('\n'),ctx);
  function cambiar(){
    user.gym_id=2;user.jwt='token-B';ctx.MOVE_GYM_ID=2;
    ctx.window.supabaseClient={from:()=>{llamadas.push('consulta-B');throw Error('consulta B');}};
  }
  return {ctx,cambiar,resolver,llamadas,elemento};
}

for(const nombre of ['openBillingPortal','conectarStripe','refreshStripeStatus']){
  test(nombre+' descarta respuestas tardías tras cambiar de gimnasio en la misma sesión',async()=>{
    const {ctx,cambiar,resolver,llamadas,elemento}=fixture(), btn={disabled:false,textContent:'Original'};
    const operacion=ctx[nombre](btn);
    assert.deepEqual(llamadas,['Bearer token-A']);
    cambiar();
    elemento('stripe-sync-msg').textContent='Estado del gimnasio B';
    btn.textContent='Acción del gimnasio B';btn.disabled=true;
    resolver({ok:true,json:async()=>({url:'https://fixture.invalid/A',onboarding_url:'https://fixture.invalid/A',ok:true})});
    await operacion;
    assert.equal(ctx.window.location.href,'app');
    assert.deepEqual(llamadas,['Bearer token-A']);
    assert.equal(btn.disabled,true);assert.equal(btn.textContent,'Acción del gimnasio B');
    assert.equal(elemento('stripe-sync-msg').textContent,'Estado del gimnasio B');
  });
}

test('Una solicitud CFDI duplicada del gimnasio anterior no reintenta ni repinta en el nuevo contexto',async()=>{
  const {ctx,cambiar,resolver,llamadas,elemento}=fixture(), btn={disabled:false};
  const op=ctx.enviarSolicitudFiscal({preventDefault(){},currentTarget:{querySelector:()=>btn}});
  assert.deepEqual(llamadas,['solicitudes_cfdi_suscripcion']);
  cambiar();
  elemento('fis-solicitud-msg').textContent='Consulta del gimnasio B';
  resolver({error:{code:'23505'}});
  await op;
  assert.deepEqual(llamadas,['solicitudes_cfdi_suscripcion']);
  assert.equal(elemento('fis-solicitud-msg').textContent,'Consulta del gimnasio B');
  assert.equal(btn.disabled,true);
});

test('El menú muestra el precio de la lectura confirmada, incluidas las cuentas anteriores',async()=>{
  for(const [g,titulo] of [[{subscription_plan:'max'},'$999 MXN al mes'],[{plan:'pro'},'$599 MXN al mes'],[{subscription_status:'owner'},'Cortesía'],[{},'']]){
    const {ctx,resolver,elemento}=fixture();
    ctx.PLAN_LIMITS={pro:{price_mxn:599},max:{price_mxn:999}};
    ctx.planPrecio=plan=>ctx.PLAN_LIMITS[plan].price_mxn;
    ctx.roleAllowsSettings=()=>true;
    ctx.gymConfig={gym_plan:'max'};
    const op=ctx.actualizarTituloMenuPlan();
    assert.equal(elemento('cfg-plan-label').textContent,'Mi plan VELUM');
    resolver({ok:true,json:async()=>[g]});await op;
    assert.equal(elemento('cfg-plan-label').textContent,'Mi plan VELUM'+(titulo?' · '+titulo:''));
  }
});
