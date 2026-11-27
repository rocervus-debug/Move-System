import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

export async function digestHex(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}

export async function staffPasswordHash(input: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(input),'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100_000,hash:'SHA-256'},key,256);
  return 'v2:' + btoa(String.fromCharCode(...salt)) + ':' + btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export async function issuePermit(db: SupabaseClient, id: number, purpose: 'lectura'|'clave', storedHash: string) {
  const code = crypto.randomUUID().replaceAll('-','');
  const {data,error} = await db.rpc('core_crear_permiso',{
    p_usuario:id, p_finalidad:purpose, p_huella:await digestHex(code), p_firma:await digestHex(storedHash)
  });
  if(error) throw new Error('No se pudo crear el permiso.');
  return data ? {code,expires_at:data} : null;
}

// Se llama exclusivamente después de validar la contraseña y el factor del personal.
export async function exportAccess(db: SupabaseClient, user: {id:number; gym_id:number; rol:string; pw_version?:number; email:string}) {
  if(user.rol !== 'admin') return null;
  const {data,error} = await db.from('usuarios').select('pw_hash').eq('id',user.id).eq('gym_id',user.gym_id)
    .eq('rol','admin').eq('activo',true).eq('email',user.email).eq('pw_version',user.pw_version ?? 1).maybeSingle();
  if(error) throw new Error('No se pudo verificar el permiso.');
  return data?.pw_hash ? await issuePermit(db,user.id,'lectura',data.pw_hash) : null;
}
