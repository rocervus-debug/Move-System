// velum-pagar — redirector de links de pago cortos.
//
// Por qué existe: WhatsApp deja de convertir un texto en enlace tocable al
// llegar al primer '%', y la URL de checkout de Stripe está llena de ellos
// (van después del '#'). El cliente tocaba media URL y Stripe respondía
// "This link is incomplete". Este redirector entrega un link sin '#' ni '%'.
//
// Es PÚBLICO a propósito: lo abre la persona que va a pagar, que no tiene
// sesión. La protección es que el token es aleatorio de 128 bits y solo
// resuelve a UNA sesión ya creada — el visitante no controla ningún parámetro.
// Migrado a Deno.serve nativo (deno.land/std truena el bundling al desplegar).
// deploy: supabase functions deploy velum-pagar --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function pagina(titulo: string, mensaje: string, status = 200) {
  return new Response(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070E15;
       color:#EAEFF3;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
  .c{max-width:380px;text-align:center}
  .m{width:44px;height:44px;margin:0 auto 20px;border-radius:12px;background:rgba(0,212,255,.12);
     border:1px solid rgba(0,212,255,.3);display:grid;place-items:center}
  .m svg{width:22px;height:22px;stroke:#00D4FF;fill:none;stroke-width:1.8;stroke-linecap:round}
  h1{font-size:20px;margin:0 0 10px;font-weight:700}
  p{font-size:15px;line-height:1.6;color:#A9B8C6;margin:0}
</style></head><body><div class="c">
<div class="m"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg></div>
<h1>${titulo}</h1><p>${mensaje}</p>
</div></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    // La ruta de Vercel entrega el token como ?t=; se acepta también /velum-pagar/<token>
    const token = (url.searchParams.get('t') || url.pathname.split('/').filter(Boolean).pop() || '').trim();
    if (!token || token.length < 16 || !/^[A-Za-z0-9_-]+$/.test(token)) {
      return pagina('Link no válido', 'Revisa que hayas copiado el enlace completo, o pídele uno nuevo a tu gimnasio.', 400);
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: link, error } = await db.from('payment_links')
      .select('stripe_url, vence').eq('token', token).maybeSingle();

    if (error) {
      console.error('velum-pagar lookup:', error.message);
      return pagina('No pudimos abrir tu pago', 'Vuelve a intentarlo en un momento.', 500);
    }
    if (!link) {
      return pagina('Este link no existe', 'Puede que se haya escrito mal. Pídele uno nuevo a tu gimnasio.', 404);
    }
    if (new Date(link.vence) < new Date()) {
      return pagina('Este link ya venció', 'Por seguridad los links de pago caducan. Pídele uno nuevo a tu gimnasio y podrás pagar sin problema.', 410);
    }

    // Marca de apertura: le sirve al gym para saber si el cliente ya lo abrió.
    db.from('payment_links').update({ abierto_en: new Date().toISOString() })
      .eq('token', token).then(({ error: e }) => { if (e) console.warn('abierto_en:', e.message); });

    return new Response(null, {
      status: 302,
      headers: { 'Location': link.stripe_url, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('velum-pagar:', e);
    return pagina('No pudimos abrir tu pago', 'Vuelve a intentarlo en un momento.', 500);
  }
});
