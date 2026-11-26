// velum-totp — 2FA TOTP RFC 6238 + recovery codes
// Actions: enroll, verify_enrollment, check, disable, regenerate_recovery_codes
// IMPORTANTE: protegido por rate limit + acción 'check' solo callable internamente con secreto compartido.


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function toBase32(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return toBase32(bytes);
}

function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/l
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    let code = '';
    for (const b of bytes) code += alphabet[b % alphabet.length];
    codes.push(code.match(/.{5}/g)!.join('-'));
  }
  return codes;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function decodePart(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

async function staffClaims(req: Request, subject: string) {
  const token = req.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  const parts = token?.split('.');
  if (parts?.length !== 3) return null;
  try {
    const [header, claims, signature] = parts;
    const decode = (part: string) => JSON.parse(new TextDecoder().decode(decodePart(part)));
    if (decode(header).alg !== 'HS256') return null;
    const secret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
    if (!secret) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'},false,['verify']);
    if (!await crypto.subtle.verify('HMAC',key,decodePart(signature),new TextEncoder().encode(header+'.'+claims))) return null;
    const p = decode(claims);
    const now = Math.floor(Date.now()/1000);
    if (p.sub !== subject || p.iss !== 'supabase' || p.aud !== 'authenticated' ||
        p.role !== 'authenticated' || p.staff_login !== true || !Number.isSafeInteger(p.exp) ||
        p.exp <= now || !Number.isSafeInteger(p.iat) || p.iat > now || now-p.iat>900) return null;
    return p;
  } catch { return null; }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null,{headers:CORS});
  if (req.method !== 'POST') return json({error:'Método no permitido.'},405);
  try {
    const {action,user_id,code,totp_code} = await req.json();
    if (!/^[1-9]\d*$/.test(String(user_id))) return json({error:'Cuenta inválida.'},400);
    const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    if (action==='check') {
      const internal = Deno.env.get('VELUM_INTERNAL_SECRET');
      if (!internal || req.headers.get('x-internal-secret')!==internal) return json({error:'No autorizado.'},401);
      const {data,error} = await db.rpc('core_staff_factor',{p_subject:user_id,p_action:'internal_check'});
      return json({valid:!error && data?.ok===true},error?503:200);
    }
    if (!['enroll','verify_enrollment','disable','regenerate_recovery_codes'].includes(action)) return json({error:'Acción inválida.'},400);
    const claims = await staffClaims(req,String(user_id));
    if (!claims) return json({error:'Vuelve a iniciar sesión para administrar el segundo factor.'},401);
    const {data:user,error:lookup} = await db.from('usuarios').select('email,rol,gym_id').eq('id',user_id).eq('activo',true).maybeSingle();
    if (lookup) return json({error:'Servicio temporalmente no disponible.'},503);
    if (!user || user.email!==claims.email || user.rol!==claims.app_rol || user.gym_id!==claims.gym_id) return json({error:'Cuenta inválida.'},403);
    const secret = action==='enroll' ? generateSecret() : null;
    const codes = secret || action==='regenerate_recovery_codes' ? generateRecoveryCodes() : null;
    const factor = code ?? totp_code;
    const {data,error} = await db.rpc('core_staff_factor',{p_subject:user_id,p_action:action,p_secret:secret,p_codes:codes,p_code:typeof factor==='string'?factor.trim():null});
    if (error) return json({error:'Servicio temporalmente no disponible.'},503);
    if (data?.ok!==true) return json({error:data?.error || 'Operación no disponible.'},400);
    if (secret) return json({ok:true,secret,recovery_codes:codes,otpauth_uri:`otpauth://totp/VELUM:${encodeURIComponent(user.email)}?secret=${secret}&issuer=VELUM&algorithm=SHA1&digits=6&period=30`});
    return json(codes?{ok:true,recovery_codes:codes}:{ok:true});
  } catch { return json({error:'Solicitud inválida.'},400); }
});
