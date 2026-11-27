const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const crypto=require('node:crypto').webcrypto;
const source=filename=>fs.readFileSync(path.join(__dirname,'../supabase/functions',filename),'utf8')
  .replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const code=stripTypeScriptTypes(source('_shared/core-recovery.ts')+'\n'+source('core-acceso/index.ts'));

for(const rol of ['admin','recepcion']){
  test('la recuperación entrega al correo registrado un código que sólo permite cambiar la clave una vez: '+rol,async()=>{
    let handler,correo,permiso,guardada;
    const user={id:7,email:rol+'@example.test',pw_hash:'clave-de-ensayo'};
    const db={from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:user})}},async rpc(name,args){
      if(name==='check_rate_limit')return {data:true};
      if(name==='core_crear_permiso'){permiso=args;return {data:'vigente'};}
      if(name==='core_confirmar_clave'&&permiso&&permiso.p_huella===args.p_huella){
        guardada=args.p_hash;permiso=null;return {data:true};
      }
      return {data:false};
    }};
    const ctx=vm.createContext({crypto,TextEncoder,Response,btoa,console,createClient:()=>db,
      fetch:async(url,request)=>{assert.equal(url,'https://api.resend.com/emails');correo=JSON.parse(request.body);return Response.json({id:'test'});},
      Deno:{env:{get:()=>undefined}, serve:f=>{handler=f;}}});
    ctx.Deno.env.get=k=>k==='RESEND_API_KEY'?'test-only':undefined;
    vm.runInContext(code,ctx);
    const post=body=>handler(new Request('https://local.test',{method:'POST',body:JSON.stringify(body)}));
    const result=await post({action:'solicitar',email:user.email});
    assert.deepEqual(await result.json(),{ok:true});assert.deepEqual(correo.to,[user.email]);
    const token=correo.text.match(/\b[a-f0-9]{32}\b/)[0];
    assert.notEqual(permiso.p_huella,token);
    const body={action:'confirmar',code:token,password:'contraseña nueva de ensayo'};
    assert.equal((await post(body)).status,200);assert.match(guardada,/^v2:/);
    const [version,salt,expected]=guardada.split(':');
    const {createHash,pbkdf2Sync}=require('node:crypto');
    const input=createHash('sha256').update(body.password).digest('hex');
    assert.equal(pbkdf2Sync(input,Buffer.from(salt,'base64'),100000,32,'sha256').toString('base64'),expected);
    assert.equal((await post(body)).status,400);
  });
}
