// velum-push-register — Guarda el token de push del atleta en clientes.push_token.
// La app (bridge.js) llama aquí tras obtener el token FCM. Usa service role para poder
// escribir (el RLS de clientes solo deja escribir autenticado como atleta/admin, y la app
// solo tiene la anon key → por eso el PATCH directo fallaba en silencio).
// Auth: el portal_token (UUID secreto que solo tiene el dueño de esa cuenta) actúa como
// credencial — se valida que exista y se escribe únicamente en ESA fila.
// Deno.serve nativo. deploy: verify_jwt=false.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  let body: { portal_token?: string; push_token?: string; platform?: string };
  try { body = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }
  const portalToken = (body.portal_token || '').trim();
  const pushToken = (body.push_token || '').trim();
  const platform = (body.platform === 'ios' || body.platform === 'android') ? body.platform : null;

  if (!UUID_RE.test(portalToken)) return json({ error: 'portal_token inválido' }, 400);
  if (!pushToken || pushToken.length < 20) return json({ error: 'push_token inválido' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Actualiza SOLO la fila cuyo portal_token coincide (el secreto que gatea la escritura).
  const { data, error } = await sb.from('clientes')
    .update({ push_token: pushToken, push_platform: platform })
    .eq('portal_token', portalToken)
    .select('id');
  if (error) return json({ error: 'No se pudo guardar: ' + error.message }, 500);
  if (!data || !data.length) return json({ error: 'portal_token no encontrado' }, 404);

  return json({ ok: true, saved: data.length });
});
