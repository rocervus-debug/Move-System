// storefront-config — v23: + schedule_by_date (ventana de N semanas navegable).
// v22: + gym.reserva_modo (contacto | pago).
// v21: + ocupación real por clase (reservados) para la barra
// de llenado del storefront. Se cuenta contra la MISMA próxima ocurrencia que ya
// se calcula abajo, con el service role (el visitante anónimo no puede leer reservas).
// v19: el horario público refleja la PRÓXIMA ocurrencia real
// de cada día (overrides por fecha + CERRADO + cancelaciones), no solo la plantilla.
// v18: cada clase expone su id para atar leads a ESA clase.
// v17: + coaches (equipo multi-coach por clase, ej. DUO RIDE de BYCO)
//
// OJO AL DESPLEGAR: verify_jwt=false. El storefront la llama solo con 'apikey'.
// v14: + vertical (gym/studios/recovery) para que el storefront hable el idioma del giro
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey' };

function normalizeDay(d: string): string {
  const s = (d || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s === 'lunes' || s === 'lun' || s === 'l') return 'Lunes';
  if (s === 'martes' || s === 'mar' || s === 'ma') return 'Martes';
  if (s === 'miercoles' || s === 'mie' || s === 'mi' || s === 'x') return 'Miércoles';
  if (s === 'jueves' || s === 'jue' || s === 'j') return 'Jueves';
  if (s === 'viernes' || s === 'vie' || s === 'v') return 'Viernes';
  if (s === 'sabado' || s === 'sab' || s === 's') return 'Sábado';
  if (s === 'domingo' || s === 'dom' || s === 'd') return 'Domingo';
  return d || '';
}
function horaToMinutes(h: string): number {
  if (!h) return 9999;
  const s = h.toLowerCase().trim();
  const m = s.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm)?/);
  if (!m) return 9999;
  let hour = parseInt(m[1]) || 0;
  const min = parseInt(m[2]) || 0;
  const ampm = m[3];
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return hour * 60 + min;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
    if (!slug || !/^[a-z0-9-]{2,60}$/.test(slug)) return new Response(JSON.stringify({ error: 'slug inválido' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sf, error: sfErr } = await db.from('gym_storefront').select('*').eq('slug', slug).eq('is_enabled', true).single();
    if (sfErr || !sf) return new Response(JSON.stringify({ error: 'Storefront no encontrado o deshabilitado' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const { data: cfgRows } = await db.from('gym_config').select('key, value').eq('gym_id', sf.gym_id).in('key', ['gym_nombre', 'gym_logo_url', 'gym_color', 'gym_tagline']);
    const cfg: Record<string, string> = {};
    (cfgRows || []).forEach((r: any) => { cfg[r.key] = r.value; });

    const { data: gymRow } = await db.from('gyms').select('vertical').eq('id', sf.gym_id).maybeSingle();
    const vertical = (gymRow && gymRow.vertical) ? gymRow.vertical : 'gym';

    // v20: switches de experiencia (misma fuente única velum_flags que el portal)
    let gymFlags: any = null;
    try { const { data: fl } = await db.rpc('velum_flags', { p_gym_id: sf.gym_id }); gymFlags = fl || null; } catch (_) {}

    // OJO: además de is_public del listing, hay que exigir packages.is_active. Sin eso, un
    // paquete que el gym DESACTIVÓ en su admin seguía publicándose en el storefront y en la
    // app del atleta (el gym veía sus paquetes nuevos y los atletas los viejos).
    const { data: listings } = await db.from('storefront_listings').select(`id, package_id, sort_order, is_featured, badge_text, public_name, public_description, features_list, hero_image_url, packages!inner (id, name, description, price_mxn, duration_days, num_classes, unlimited_classes, allow_discount, billing_type)`).eq('gym_id', sf.gym_id).eq('is_public', true).eq('packages.is_active', true).order('sort_order', { ascending: true });
    const packages = (listings || []).map((l: any) => { const p = l.packages; return { listing_id: l.id, package_id: l.package_id, name: l.public_name || p.name, description: l.public_description || p.description, price_mxn: p.price_mxn, duration_days: p.duration_days, num_classes: p.num_classes, unlimited: p.unlimited_classes, billing_type: p.billing_type || 'one_time', recurring: p.billing_type === 'recurring', badge: l.badge_text, is_featured: l.is_featured, features: Array.isArray(l.features_list) ? l.features_list : [], hero_image: l.hero_image_url }; });

    let coaches: any[] = [];
    if (sf.show_coaches) {
      const { data: cRows } = await db.from('coaches').select('id, nombre, rol, clases, foto_url').eq('gym_id', sf.gym_id).eq('activo', true).limit(12);
      coaches = (cRows || []).map((c: any) => ({ id: c.id, nombre: c.nombre, rol: c.rol || 'Coach', clases: c.clases || '', foto_url: c.foto_url || null }));
    }

    let schedule_weekly: any = null;
    let schedule_by_date: any = null;
    let schedule_semanas = 1;
    if (sf.show_schedule) {
      const { data: horarios } = await db.from('horarios').select('id, dia, hora, tipo, coach_nombre, coaches_extra, cupo, fecha').eq('gym_id', sf.gym_id);

      // v19: cada columna del horario público representa la PRÓXIMA ocurrencia de
      // ese día (que es la fecha con la que se reserva). Se aplica la misma regla
      // que la app y el panel: plantilla del día, menos los huecos que un override
      // de esa fecha pisa, más los overrides no-CERRADO. Además se excluyen las
      // clases canceladas (horario_cancelaciones). Antes el storefront mostraba
      // solo la plantilla: ofrecía clases de días cerrados y aceptaba reservas
      // de prueba para clases que no iban a existir.
      const hoyMX = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const hoyD = new Date(hoyMX + 'T12:00:00');
      const DIAS_IDX: Record<string, number> = { 'Domingo': 0, 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6 };
      const proxFecha: Record<string, string> = {};
      Object.keys(DIAS_IDX).forEach(dn => {
        const delta = (DIAS_IDX[dn] - hoyD.getDay() + 7) % 7;
        const d = new Date(hoyD); d.setDate(hoyD.getDate() + delta);
        proxFecha[dn] = d.toISOString().slice(0, 10);
      });

      // Ventana visible: HOY + (semanas × 7) días. El público navega semana por
      // semana con la fecha real de cada clase — la reserva se ata a esa fecha,
      // no a "la próxima vez que caiga ese día".
      const semanas = Math.min(6, Math.max(1, Number(sf.semanas_visibles) || 1));
      const NOMBRE_DIA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
      const ventana: { fecha: string; dia: string }[] = [];
      for (let i = 0; i < semanas * 7; i++) {
        const d = new Date(hoyD); d.setDate(hoyD.getDate() + i);
        ventana.push({ fecha: d.toISOString().slice(0, 10), dia: NOMBRE_DIA[d.getDay()] });
      }
      const fechasVentana = ventana.map(v => v.fecha);

      const filas = horarios || [];
      const plantilla = filas.filter((h: any) => !h.fecha || h.fecha === '');
      const overrides = filas.filter((h: any) => h.fecha && /^\d{4}-\d{2}-\d{2}$/.test(h.fecha));

      // Clases canceladas en las próximas ocurrencias (una sola consulta)
      const { data: cancs } = await db.from('horario_cancelaciones')
        .select('horario_id, fecha').eq('gym_id', String(sf.gym_id)).in('fecha', fechasVentana);
      const cancSet = new Set((cancs || []).map((c: any) => c.horario_id + '_' + c.fecha));

      // Ocupación real: reservas vivas de cada clase en SU próxima ocurrencia.
      // Solo se expone el CONTEO (nunca nombres ni tokens): el storefront es público.
      const { data: resvs } = await db.from('reservas')
        .select('horario_id, fecha').eq('gym_id', sf.gym_id)
        .gte('fecha', fechasVentana[0]).lte('fecha', fechasVentana[fechasVentana.length - 1])
        .neq('estado', 'cancelado');
      const ocupMap: Record<string, number> = {};
      (resvs || []).forEach((r: any) => {
        const k = r.horario_id + '_' + r.fecha;
        ocupMap[k] = (ocupMap[k] || 0) + 1;
      });

      const grouped: Record<string, any[]> = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };
      const pushClase = (dia: string, h: any) => {
        const extras = Array.isArray(h.coaches_extra) ? h.coaches_extra.map((x: any) => x && x.nombre).filter(Boolean) : [];
        const equipo = [h.coach_nombre, ...extras].filter(Boolean);
        const fechaOcurrencia = proxFecha[dia];
        const cupoTotal = h.cupo || 0;
        const reservados = Math.min(ocupMap[h.id + '_' + fechaOcurrencia] || 0, cupoTotal || Infinity);
        grouped[dia].push({
          id: h.id, hora: h.hora, tipo: h.tipo, coach: h.coach_nombre || '', coaches: equipo,
          cupo_total: cupoTotal, reservados, fecha: fechaOcurrencia,
          minutes: horaToMinutes(h.hora),
        });
      };
      Object.keys(grouped).forEach(dia => {
        const fecha = proxFecha[dia];
        const ovsDia = overrides.filter((h: any) => h.fecha === fecha);
        const horasPisadas = new Set(ovsDia.map((h: any) => h.hora));
        plantilla
          .filter((h: any) => normalizeDay(h.dia) === dia && !horasPisadas.has(h.hora))
          .filter((h: any) => !cancSet.has(h.id + '_' + fecha))
          .forEach((h: any) => pushClase(dia, h));
        ovsDia
          .filter((h: any) => (h.tipo || '') !== 'CERRADO')
          .filter((h: any) => !cancSet.has(h.id + '_' + fecha))
          .forEach((h: any) => pushClase(dia, h));
      });
      Object.keys(grouped).forEach(d => { grouped[d].sort((a, b) => a.minutes - b.minutes); grouped[d].forEach(c => delete c.minutes); });
      const hasAny = Object.values(grouped).some((arr: any) => arr.length > 0);
      schedule_weekly = hasAny ? grouped : null;

      // Horario POR FECHA de toda la ventana. Misma regla efectiva que arriba
      // (plantilla − horas pisadas por override + overrides no-CERRADO − canceladas),
      // aplicada a cada día real en vez de a la próxima ocurrencia.
      const porFecha: Record<string, any[]> = {};
      for (const { fecha, dia } of ventana) {
        const ovsDia = overrides.filter((h: any) => h.fecha === fecha);
        const horasPisadas = new Set(ovsDia.map((h: any) => h.hora));
        const base = plantilla
          .filter((h: any) => normalizeDay(h.dia) === dia && !horasPisadas.has(h.hora));
        const extra = ovsDia.filter((h: any) => (h.tipo || '') !== 'CERRADO');
        const items = [...base, ...extra]
          .filter((h: any) => !cancSet.has(h.id + '_' + fecha))
          .map((h: any) => {
            const extras = Array.isArray(h.coaches_extra) ? h.coaches_extra.map((x: any) => x && x.nombre).filter(Boolean) : [];
            const equipo = [h.coach_nombre, ...extras].filter(Boolean);
            const cupoTotal = h.cupo || 0;
            const crudos = ocupMap[h.id + '_' + fecha] || 0;
            return {
              id: h.id, hora: h.hora, tipo: h.tipo, coach: h.coach_nombre || '', coaches: equipo,
              cupo_total: cupoTotal,
              reservados: cupoTotal ? Math.min(crudos, cupoTotal) : crudos,
              fecha,
              minutes: horaToMinutes(h.hora),
            };
          })
          .sort((a: any, b: any) => a.minutes - b.minutes);
        items.forEach((c: any) => delete c.minutes);
        if (items.length) porFecha[fecha] = items;
      }
      schedule_by_date = Object.keys(porFecha).length ? porFecha : null;
      schedule_semanas = semanas;
    }

    const fullAddress = [sf.address, sf.city, sf.state, sf.postal_code, sf.country].filter(Boolean).join(', ');

    return new Response(JSON.stringify({
      gym: {
        id: sf.gym_id, slug: sf.slug, vertical, flags: gymFlags,
        nombre: cfg['gym_nombre'] || 'VELUM Gym', logo: cfg['gym_logo_url'] || null, tagline: cfg['gym_tagline'] || null,
        description: sf.description, primary_color: sf.primary_color || cfg['gym_color'] || '#00D4FF',
        theme: sf.theme || 'pulse', ia_prominent: sf.ia_prominent !== false,
        hero_image: sf.hero_image_url, hero_video: sf.hero_video_url,
        highlights: Array.isArray(sf.highlights) ? sf.highlights : [], about_html: sf.about_html,
        show_velum_badge: sf.show_velum_badge, google_rating: sf.google_rating, google_reviews: sf.google_review_count,
        years_open: sf.years_open, active_athletes_count: sf.active_athletes_count,
        social: { instagram: sf.social_instagram, facebook: sf.social_facebook, whatsapp: sf.social_whatsapp, tiktok: sf.social_tiktok },
        trial_class_enabled: sf.trial_class_enabled, free_first_month: sf.free_first_month, mode: sf.mode,
        // 'pago' = reservar exige comprar paquete y la reserva ocupa lugar; 'contacto' = lead
        reserva_modo: sf.reserva_modo || 'contacto',
        meta_pixel_id: sf.meta_pixel_id || null, google_tag_id: sf.google_tag_id || null,
      },
      location: { address: sf.address, city: sf.city, state: sf.state, country: sf.country || 'México', postal_code: sf.postal_code, full_address: fullAddress || null, maps_embed_url: sf.maps_embed_url, latitude: sf.latitude, longitude: sf.longitude, hours_text: sf.hours_text },
      promo_banner: sf.promo_banner_text ? { text: sf.promo_banner_text, color: sf.promo_banner_color || '#10E8A0' } : null,
      packages,
      testimonials: Array.isArray(sf.testimonials) ? sf.testimonials : [],
      gallery: Array.isArray(sf.gallery_urls) ? sf.gallery_urls : [],
      faqs: Array.isArray(sf.faqs) ? sf.faqs : [],
      coaches, schedule_weekly,
      // Horario por fecha (ventana de N semanas) + cuántas semanas navegar
      schedule_by_date, schedule_semanas,
      generatedAt: new Date().toISOString(),
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30, s-maxage=30' } });
  } catch (err) {
    console.error('storefront-config error:', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
