import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { digestHex, issuePermit, staffPasswordHash } from '../_shared/core-recovery.ts';

const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json','Cache-Control':'no-store'};
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body),{headers,status});
const invalid = () => reply({error:'El código venció o ya se utilizó. Solicita otro.'},400);
Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response(null,{headers});
  if(req.method!=='POST') return reply({error:'Método no permitido.'},405);
  try {
    const body = await req.json().catch(()=>null);
    if(!body || typeof body !== 'object') return reply({error:'Solicitud inválida.'},400);
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {auth:{persistSession:false,autoRefreshToken:false}});
    const ip=req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
    async function allowed(key:string, max:number) {
      const {data,error}=await db.rpc('check_rate_limit',{p_key:'core-recovery:'+await digestHex(key),
        p_max_per_window:max,p_window_seconds:1200,p_block_seconds:1200});
      if(error) throw new Error('No se pudo verificar el límite.');
      return data===true;
    }
    if(body.action==='solicitar'){
      const email=String(body.email??'').replace(/[\u200b-\u200d\u2060\ufeff\u00a0]/g,'').trim().toLowerCase();
      if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({error:'Ingresa un correo válido.'},400);
      if(!await allowed('ip:'+ip,35)) return reply({error:'Espera antes de volver a intentar.'},429);
      const mailKey=Deno.env.get('RESEND_API_KEY');
      if(!mailKey) throw new Error('Correo no configurado.');
      if(!await allowed('correo:'+email,4)) return reply({ok:true});
      const {data:user,error}=await db.from('usuarios').select('id,email,pw_hash').eq('email',email).eq('activo',true).maybeSingle();
      if(error) throw new Error('Consulta no disponible.');
      if(user?.pw_hash){
        const permit=await issuePermit(db,user.id,'clave',user.pw_hash);
        if(permit){
          const configuredFrom=Deno.env.get('EMAIL_FROM');
          const from=configuredFrom && !/@resend\.dev/i.test(configuredFrom)
            ? configuredFrom : 'VELUM <noreply@myvelum.app>';
          const sent=await fetch('https://api.resend.com/emails',{method:'POST',
            headers:{Authorization:'Bearer '+mailKey,'Content-Type':'application/json'},
            body:JSON.stringify({from,to:[user.email],subject:'Recupera tu acceso a VELUM',
              text:'Ingresa este código en la pantalla de recuperación de VELUM:\n\n'+permit.code+'\n\nVence en 20 minutos y sólo puedes usarlo una vez. Si tú no lo solicitaste, puedes ignorar este correo.'})});
          if(!sent.ok) {
            const failure=await sent.json().catch(()=>({}));
            const reason=/own email|testing emails/i.test(failure.message||'')?'destinatarios de prueba':
              /not verified|verify a domain/i.test(failure.message||'')?'dominio pendiente':
              /restricted|permission/i.test(failure.message||'')?'permiso del remitente':'proveedor';
            console.error('Entrega de recuperación rechazada:',sent.status,reason);
          }
        }
      }
      return reply({ok:true});
    }
    const code=typeof body.code==='string'?body.code.trim().toLowerCase():'';
    if(!/^[a-f0-9]{32}$/.test(code)) return invalid();
    const huella=await digestHex(code);
    if(body.action==='confirmar'){
      if(typeof body.password!=='string' || body.password.length<12 || body.password.length>128)
        return reply({error:'Usa una contraseña de entre 12 y 128 caracteres.'},400);
      if(!await allowed('confirmar:'+ip,45)) return reply({error:'Demasiados intentos. Espera antes de reintentar.'},429);
      const hash=await staffPasswordHash(await digestHex(body.password));
      const {data,error}=await db.rpc('core_confirmar_clave',{p_huella:huella,p_hash:hash});
      if(error) throw new Error('No se pudo guardar.');
      return data===true?reply({ok:true}):invalid();
    }
    if(body.action==='leer'){
      if(typeof body.section!=='string'||body.section.length>40||typeof body.after!=='string'||body.after.length>80)
        return reply({error:'Página inválida.'},400);
      const {data,error}=await db.rpc('core_exportar_pagina',{p_huella:huella,p_seccion:body.section,p_despues:body.after});
      if(error) throw new Error('No se pudo leer la sección.');
      if(!Array.isArray(data)) return reply({error:'El acceso de lectura venció. Vuelve a iniciar sesión.'},403);
      return reply({rows:data,next:data.length===200?String(data.at(-1).id):null});
    }
    return reply({error:'Acción no disponible.'},400);
  }catch{ return reply({error:'Servicio temporalmente no disponible. Inténtalo de nuevo.'},503); }
});
