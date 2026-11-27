const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cancelPendingCheckout } = require('../supabase/functions/_shared/cancel-pending-checkout.ts');
const account='acct_demo', token='pruebadepago123456';
const meta={velum_member_sub:'true',gym_id:'6',package_id:'9',customer_email:'qa@example.test'};
function setup(opts={}){
  const row={id:1, gym_id:6, package_id:9, customer_email:meta.customer_email, stripe_account_id:account,
    stripe_checkout_session_id:opts.legacy?null:'cs_month',stripe_subscription_id:null,status:'incomplete',
    created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...opts.row};
  const links=[{gym_id:6,token,session_id:'cs_once',vence:'2099-01-01'}];
  const tables={member_subscriptions:[row,...(opts.siblings||[])],gyms:[{id:6,stripe_account_id:account}],payment_links:links};
  const db={from(table){
    let rows=tables[table],update;
    const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},is(k,v){return q.eq(k,v)},
      in(k,items){rows=rows.filter(r=>items.includes(r[k]));return q;},update(patch){update=patch;return q;},
      limit(n){rows=rows.slice(0,n);return q;},then(resolve){if(update)rows.forEach(r=>Object.assign(r,update));return resolve({data:rows,error:null});},
      async maybeSingle(){const {data}=await q;return {data:data[0]||null,error:null};}};
    return q;
  }};
  const month={id:'cs_month',status:'open',mode:'subscription',metadata:{...meta},...opts.session};
  const once={id:'cs_once',status:'open',mode:'payment',metadata:{gym_id:'6',source:'manual_link'}};
  const requests=[];
  async function stripe(path,method,acct){
    assert.equal(acct,account);
    requests.push([method,path]);
    if(path.includes('?')) return {data:opts.matches||[month],has_more:false};
    const session=path.includes('cs_once')?once:month;
    if(method==='POST'){
      assert.equal(path,'/checkout/sessions/'+session.id+'/expire');
      if(opts.race){session.status='complete';throw Error('state changed');}
      if(opts.network) throw Error('Timeout');
      session.status='expired';
    }
    return session;
  }
  return {requests,row,links,cancel:(body={kind:'activation',id:1},gym=6)=>cancelPendingCheckout(db,gym,body,stripe)};
}
test('La activación se cierra en Stripe antes de marcar la fila y repetir es seguro',async()=>{
  const f=setup();await f.cancel();await f.cancel();assert.equal(f.row.status,'canceled');assert.equal(f.requests.filter(r=>r[0]==='POST').length,1);
});
test('Un enlace ya vencido en Stripe se puede conciliar localmente',async()=>{
  const f=setup({session:{status:'expired'}});await f.cancel();assert.equal(f.row.status,'canceled');assert.equal(f.requests.length,1);
});
test('Enlace anterior identificado inequívocamente en la cuenta del gym',async()=>{
  const f=setup({legacy:true});await f.cancel();assert.equal(f.row.stripe_checkout_session_id,'cs_month');
});
test('Enlace anterior ambiguo o ausente queda intacto',async()=>{
  for(const opts of [{matches:[]},{matches:['a','b'].map(id=>({id,mode:'subscription',status:'open',metadata:meta}))},{siblings:[{id:2,gym_id:6,package_id:9,customer_email:meta.customer_email,stripe_checkout_session_id:null,status:'incomplete'}]}]){
    const f=setup({legacy:true,...opts});await assert.rejects(f.cancel(),/identificar/);assert.equal(f.row.status,'incomplete');assert.ok(!f.requests.some(r=>r[0]==='POST'));
  }
});
test('Datos ajenos, suscripción activa o sesión completada nunca se cancelan',async()=>{
  for(const opts of [{row:{stripe_subscription_id:'sub_1'}},{row:{status:'active'}},{session:{status:'complete'}},{session:{metadata:{...meta,gym_id:'7'}}}]){
    const f=setup(opts);await assert.rejects(f.cancel());assert.ok(!f.requests.some(r=>r[0]==='POST'));
  }
  const f=setup();await assert.rejects(f.cancel({kind:'activation',id:1},7));assert.equal(f.requests.length,0);
});
test('Pago concurrente o respuesta interrumpida no anuncia cancelación',async()=>{
  for(const opts of [{race:true},{network:true}]){
    const f=setup(opts);await assert.rejects(f.cancel());assert.equal(f.row.status,'incomplete');
  }
});
test('Un pago único invalida el Checkout y el enlace corto propio',async()=>{
  const f=setup();await f.cancel({kind:'link',token});assert.ok(Date.parse(f.links[0].vence)<=Date.now());assert.equal(f.row.status,'incomplete');
});
