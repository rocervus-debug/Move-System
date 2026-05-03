import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, fuente } = await req.json();
    if (!email) return new Response(JSON.stringify({ ok: false, error: 'email requerido' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
    const NOTIFY_TO  = Deno.env.get('LEAD_NOTIFY_EMAIL') || 'ro.cervus@gmail.com';

    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'VELUM Leads <leads@myvelum.app>',
          to: [NOTIFY_TO],
          subject: `🔔 Nuevo lead en VELUM — ${email}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;padding:24px;background:#06100d;color:#e8edf5;border-radius:12px;">
              <h2 style="color:#5DCAA5;margin:0 0 16px;">🔔 Nuevo lead capturado</h2>
              <p style="margin:0 0 8px;"><strong>Email:</strong> ${email}</p>
              <p style="margin:0 0 8px;"><strong>Fuente:</strong> ${fuente || 'landing'}</p>
              <p style="margin:0 0 24px;"><strong>Fecha:</strong> ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
              <a href="https://wa.me/${email.replace('@','').replace('.','')}"
                 style="display:inline-block;background:#1D9E75;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;">
                Contactar por WhatsApp
              </a>
              <p style="margin:20px 0 0;font-size:11px;color:#4a7265;">VELUM · myvelum.app</p>
            </div>
          `,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    // Fail silently — el lead ya fue guardado en Supabase, solo falló la notificación
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
