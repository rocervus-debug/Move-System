const {test}=require('node:test');
const assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const archivo=join(__dirname,'../supabase/functions/velum-saas-info/index.ts');
const codigo=stripTypeScriptTypes(readFileSync(archivo,'utf8').replace(/^import .*;$/gm,''));
const corte=Date.UTC(2026,11,27,18)/1000;
function fixture(){
  const f={rol:'admin',solicitudes:[],gymIds:[],sub:{id:'sub_33',customer:'cus_33',status:'active',
    metadata:{gym_id:'33'},current_period_end:corte,cancel_at_period_end:false}};
  const query={select(){return this},eq(col,id){assert.equal(col,'id');f.gymIds.push(id);return this;},async maybeSingle(){return {data:{id:33,stripe_customer_id:'cus_33',stripe_subscription_id:'sub_33'}}}};
  const db={from(tabla){assert.equal(tabla,'gyms');return query;}};
  vm.runInNewContext(codigo,{Deno:{serve(fn){f.handler=fn;},env:{get:n=>n==='VELUM_INTERNAL_SECRET'?'fixture-interno':'fixture'}},
    createClient:()=>db,verifyPanelSession:async token=> token==='panel-qa'?{gym_id:33,app_rol:f.rol}:null,Response,
    fetch:async (url,op)=>{f.solicitudes.push([op.method||'GET',url]);return Response.json(url.includes('/invoices')?{data:[]}:f.sub);},
    console,URLSearchParams,TextEncoder});
  f.get=(url='',token='panel-qa')=>f.handler(new Request('https://qa.invalid/velum-saas-info'+url,{headers:{Authorization:'Bearer '+token}}));
  return f;
}

test('Una cancelación anterior, cambiada, retirada y concluida se lee directamente de Stripe',async()=>{
  const f=fixture();
  f.sub.cancel_at_period_end=true;f.sub.canceled_at=corte-604800;
  let r=await (await f.get('?gym_id=98')).json();
  assert.equal(r.scheduled,true);assert.equal(r.cancel_at,new Date(corte*1000).toISOString());
  f.sub.cancel_at=corte+86400;f.sub.cancel_at_period_end=false;
  r=await (await f.get()).json();assert.equal(r.cancel_at,new Date((corte+86400)*1000).toISOString());
  f.sub.cancel_at=null;
  r=await (await f.get()).json();assert.equal(r.scheduled,false);assert.equal(r.cancel_at,null);
  f.sub.status='canceled';f.sub.cancel_at_period_end=true;f.sub.ended_at=corte;
  r=await (await f.get()).json();assert.equal(r.scheduled,false);assert.equal(r.ended_at,new Date(corte*1000).toISOString());
  assert.deepEqual(f.gymIds,[33,33,33,33]);
  assert.ok(f.solicitudes.every(([method,url])=>method==='GET' && url.startsWith('https://api.stripe.com/v1/subscriptions/sub_33?')));
});

test('Cobros con varios artículos y sin corte inequívoco sólo confirman la cancelación',async()=>{
  const f=fixture();f.sub.current_period_end=null;f.sub.cancel_at_period_end=true;
  f.sub.items={data:[{current_period_end:corte},{current_period_end:corte+100}]};
  assert.equal((await (await f.get()).json()).cancel_at,null);
  f.sub.items.data.pop();assert.equal((await (await f.get()).json()).cancel_at,new Date(corte*1000).toISOString());
});

test('La lectura del gimnasio exige JWT administrativo y confirma cliente e identidad antes de revelar el estado',async()=>{
  const f=fixture();
  assert.equal((await f.get('','otro')).status,401);
  f.rol='recepcion';assert.equal((await f.get()).status,403);assert.deepEqual(f.gymIds,[]);
  f.rol='superadmin';f.sub.customer='cus_98';assert.equal((await f.get()).status,502);
  f.sub.customer='cus_33';f.sub.metadata.gym_id='98';assert.equal((await f.get()).status,502);
  f.sub={error:{code:'temporarily_unavailable'}};assert.equal((await f.get()).status,502);
});

test('HQ conserva el POST y sus facturas; el GET del gimnasio nunca consulta facturas',async()=>{
  const f=fixture();
  const hq=await f.handler(new Request('https://qa.invalid/info',{method:'POST',headers:{'x-internal-secret':'fixture-interno'},body:JSON.stringify({gym_id:33})}));
  assert.equal(hq.status,200);const r=await hq.json();assert.equal(r.subscription.status,'active');assert.deepEqual(r.invoices,[]);
  assert.equal(f.solicitudes.length,2);f.solicitudes=[];
  assert.equal((await f.get()).status,200);assert.equal(f.solicitudes.length,1);
});
