// storefront-order-status — v6: soporta checkouts de SUSCRIPCIÓN (domiciliación).
//   Antes: solo buscaba en storefront_orders → las compras recurrentes daban 404 en bucle
//   y la success page se quedaba en "Confirmando tu pago..." (bug cazado en certificación 08-jul).
//   Ahora: si no hay orden, consulta la sesión en Stripe; si es suscripción pagada, responde
//   paid:true con los datos de member_subscriptions. Migrado a Deno.serve nativo.
// anon GET ?session_id=cs_xxx — devuelve info para la success page.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
function json(b: unknown, s = 200){ return new Response(JSON.stringify(b),{status:s,headers:{...CORS,'Content-Type':'application/json'}}); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id') || '';
    if (!sessionId || !sessionId.startsWith('cs_')) return json({ error: 'session_id requerido' }, 400);

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: order } = await db.from('storefront_orders').select('id, gym_id, package_id, status, customer_email, customer_name, amount_cents, cliente_id, paid_at').eq('stripe_session_id', sessionId).maybeSingle();

    if (order) {
      const { data: pkg } = await db.from('packages').select('name, duration_days, num_classes, unlimited_classes').eq('id', order.package_id).maybeSingle();
      const { data: gym } = await db.from('gyms').select('nombre').eq('id', order.gym_id).maybeSingle();
      const { data: sf } = await db.from('gym_storefront').select('slug').eq('gym_id', order.gym_id).maybeSingle();
      let cliente: any = null;
      if (order.cliente_id) {
        const { data: c } = await db.from('clientes').select('nombre, email, numero_cliente, portal_token').eq('id', order.cliente_id).maybeSingle();
        cliente = c;
      }
      return json({
        ok: true,
        status: order.status,
        paid: order.status === 'paid',
        gym: gym ? { nombre: gym.nombre, slug: sf?.slug } : null,
        package: pkg,
        amount_mxn: order.amount_cents / 100,
        customer: { email: order.customer_email, name: order.customer_name },
        cliente: cliente ? {
          nombre: cliente.nombre,
          email: cliente.email,
          numero_cliente: cliente.numero_cliente,
          portal_link: cliente.portal_token ? `https://myvelum.app/atleta?token=${cliente.portal_token}` : null,
        } : null,
      });
    }

    // Sin orden: puede ser un checkout de SUSCRIPCIÓN (domiciliación). Preguntar a Stripe.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (stripeKey) {
      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Stripe-Version': '2024-11-20.acacia' },
      });
      if (res.ok) {
        const session = await res.json();
        if (session.mode === 'subscription') {
          const paid = session.payment_status === 'paid' || session.status === 'complete';
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
          let ms: any = null, cliente: any = null, gym: any = null, sfSlug: string | null = null, pkg: any = null;
          if (subId) {
            const { data } = await db.from('member_subscriptions').select('gym_id, package_id, cliente_id, cliente_nombre, customer_email, amount_cents, status').eq('stripe_subscription_id', subId).maybeSingle();
            ms = data;
          }
          if (ms) {
            const { data: g } = await db.from('gyms').select('nombre').eq('id', ms.gym_id).maybeSingle();
            gym = g;
            const { data: sf } = await db.from('gym_storefront').select('slug').eq('gym_id', ms.gym_id).maybeSingle();
            sfSlug = sf?.slug ?? null;
            const { data: p } = await db.from('packages').select('name, duration_days, num_classes, unlimited_classes').eq('id', ms.package_id).maybeSingle();
            pkg = p;
            if (ms.cliente_id) {
              const { data: c } = await db.from('clientes').select('nombre, email, numero_cliente, portal_token').eq('id', ms.cliente_id).maybeSingle();
              cliente = c;
            }
          }
          return json({
            ok: true,
            status: paid ? 'paid' : 'pending',
            paid,
            recurring: true,
            gym: gym ? { nombre: gym.nombre, slug: sfSlug } : null,
            package: pkg,
            amount_mxn: ms ? ms.amount_cents / 100 : (session.amount_total || 0) / 100,
            customer: { email: ms?.customer_email || session.customer_email || '', name: ms?.cliente_nombre || '' },
            cliente: cliente ? {
              nombre: cliente.nombre,
              email: cliente.email,
              numero_cliente: cliente.numero_cliente,
              portal_link: cliente.portal_token ? `https://myvelum.app/atleta?token=${cliente.portal_token}` : null,
            } : null,
          });
        }
        // Pago único SIN orden de storefront: puede ser un LINK DE COBRO manual
        // (source='manual_link') — no crea storefront_orders, el webhook lo registra
        // directo en `pagos` por stripe_session_id. Si la sesión está pagada, buscamos ahí.
        const paidPay = session.payment_status === 'paid' || session.status === 'complete';
        if (paidPay) {
          const { data: pago } = await db.from('pagos')
            .select('gym_id, cliente, monto, plan')
            .eq('stripe_session_id', sessionId).maybeSingle();
          if (pago) {
            const { data: g } = await db.from('gyms').select('nombre').eq('id', pago.gym_id).maybeSingle();
            const { data: sf } = await db.from('gym_storefront').select('slug').eq('gym_id', pago.gym_id).maybeSingle();
            return json({
              ok: true,
              status: 'paid',
              paid: true,
              gym: g ? { nombre: g.nombre, slug: sf?.slug } : null,
              package: pago.plan ? { name: pago.plan } : null,
              amount_mxn: Number(pago.monto) || (session.amount_total || 0) / 100,
              customer: { email: session.customer_email || '', name: pago.cliente || '' },
              cliente: null,
            });
          }
          // Pagada en Stripe pero el webhook aún no registró el pago: aún "procesando".
        }
        // Sesión de pago único que aún no aterriza: el webhook va en camino.
        return json({ ok: true, status: 'pending', paid: false });
      }
    }
    return json({ error: 'Orden no encontrada' }, 404);
  } catch (e) {
    console.error('storefront-order-status:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
