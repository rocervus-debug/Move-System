// velum-saas-portal — v3 (propuesta, patch mínimo de la auditoría de cobros):
//   1. Se valida `exp` del JWT (token vencido → 401); antes solo se verificaba la firma.
//   2. return_url FIJO a https://myvelum.app/app — antes se derivaba del header Origin,
//      que es controlable por el cliente (open-redirect tras salir del portal).
//   3. Migrado a Deno.serve nativo (sin deno.land/std). Resto intacto.
// Crea sesión del Stripe Customer Portal para que el gym gestione su suscripción.
// JWT admin/superadmin requerido. Usa gyms.stripe_customer_id.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey' };
const RETURN_URL = 'https://myvelum.app/app'; // fijo: nunca derivarlo de headers del cliente
function json(b: unknown, s=200){ return new Response(JSON.stringify(b),{status:s,headers:{...CORS,'Content-Type':'application/json'}}); }
function decodeJWT(t: string){ try { const [,p]=t.split('.'); const pad='='.repeat((4-p.length%4)%4); return JSON.parse(atob((p+pad).replace(/-/g,'+').replace(/_/g,'/'))); } catch { return null; } }
async function verifyJWT(token: string, secret: string){ try { const [h,p,s]=token.split('.'); const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']); const pad='='.repeat((4-s.length%4)%4); const sb=Uint8Array.from(atob((s+pad).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)); return await crypto.subtle.verify('HMAC',k,sb,new TextEncoder().encode(`${h}.${p}`)); } catch { return false; } }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('MOVE_JWT_SECRET');
    if (!stripeKey || !jwtSecret) return json({ error: 'Config server incompleta.' }, 500);

    const auth = req.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !await verifyJWT(token, jwtSecret)) return json({ error: 'JWT inválido.' }, 401);
    const claims = decodeJWT(token);
    if (!claims) return json({ error: 'JWT inválido.' }, 401);
    // Validar expiración: un token vencido no autoriza nada.
    const exp = Number(claims.exp);
    if (Number.isFinite(exp) && exp < Math.floor(Date.now() / 1000)) return json({ error: 'Sesión expirada.' }, 401);
    const gymId = claims?.gym_id;
    if (!gymId) return json({ error: 'Sin gym_id.' }, 401);
    if (!['admin','superadmin'].includes(claims?.app_rol)) return json({ error: 'Solo admin puede gestionar la suscripción.' }, 403);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession:false, autoRefreshToken:false } });
    const { data: gym } = await db.from('gyms').select('stripe_customer_id, subscription_plan').eq('id', gymId).single();
    if (!gym?.stripe_customer_id) return json({ error: 'Este gym no tiene suscripción activa (cuenta owner o sin pago).' }, 400);

    const params = new URLSearchParams({ customer: gym.stripe_customer_id, return_url: RETURN_URL });
    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const session = await res.json();
    if (!res.ok) return json({ error: session.error?.message || 'Error de Stripe' }, 500);
    return json({ ok: true, url: session.url });
  } catch (e) {
    console.error('velum-saas-portal:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
