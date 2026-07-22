// storefront-config — v17: + coaches (equipo multi-coach por clase, ej. DUO RIDE de BYCO)
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
    if (sf.show_schedule) {
      const { data: horarios } = await db.from('horarios').select('id, dia, hora, tipo, coach_nombre, coaches_extra, cupo, fecha').eq('gym_id', sf.gym_id);
      const grouped: Record<string, any[]> = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };
      (horarios || []).forEach((h: any) => {
        const dia = normalizeDay(h.dia);
        if (!grouped[dia]) return;
        // Equipo completo de la clase: principal + coaches_extra (multi-coach, ej. DUO RIDE)
        const extras = Array.isArray(h.coaches_extra) ? h.coaches_extra.map((x: any) => x && x.nombre).filter(Boolean) : [];
        const equipo = [h.coach_nombre, ...extras].filter(Boolean);
        grouped[dia].push({ hora: h.hora, tipo: h.tipo, coach: h.coach_nombre || '', coaches: equipo, cupo_total: h.cupo || 0, minutes: horaToMinutes(h.hora) });
      });
      Object.keys(grouped).forEach(d => { grouped[d].sort((a, b) => a.minutes - b.minutes); grouped[d].forEach(c => delete c.minutes); });
      const hasAny = Object.values(grouped).some((arr: any) => arr.length > 0);
      schedule_weekly = hasAny ? grouped : null;
    }

    const fullAddress = [sf.address, sf.city, sf.state, sf.postal_code, sf.country].filter(Boolean).join(', ');

    return new Response(JSON.stringify({
      gym: {
        id: sf.gym_id, slug: sf.slug, vertical,
        nombre: cfg['gym_nombre'] || 'VELUM Gym', logo: cfg['gym_logo_url'] || null, tagline: cfg['gym_tagline'] || null,
        description: sf.description, primary_color: sf.primary_color || cfg['gym_color'] || '#00D4FF',
        theme: sf.theme || 'pulse', ia_prominent: sf.ia_prominent !== false,
        hero_image: sf.hero_image_url, hero_video: sf.hero_video_url,
        highlights: Array.isArray(sf.highlights) ? sf.highlights : [], about_html: sf.about_html,
        show_velum_badge: sf.show_velum_badge, google_rating: sf.google_rating, google_reviews: sf.google_review_count,
        years_open: sf.years_open, active_athletes_count: sf.active_athletes_count,
        social: { instagram: sf.social_instagram, facebook: sf.social_facebook, whatsapp: sf.social_whatsapp, tiktok: sf.social_tiktok },
        trial_class_enabled: sf.trial_class_enabled, free_first_month: sf.free_first_month, mode: sf.mode,
        meta_pixel_id: sf.meta_pixel_id || null, google_tag_id: sf.google_tag_id || null,
      },
      location: { address: sf.address, city: sf.city, state: sf.state, country: sf.country || 'México', postal_code: sf.postal_code, full_address: fullAddress || null, maps_embed_url: sf.maps_embed_url, latitude: sf.latitude, longitude: sf.longitude, hours_text: sf.hours_text },
      promo_banner: sf.promo_banner_text ? { text: sf.promo_banner_text, color: sf.promo_banner_color || '#10E8A0' } : null,
      packages,
      testimonials: Array.isArray(sf.testimonials) ? sf.testimonials : [],
      gallery: Array.isArray(sf.gallery_urls) ? sf.gallery_urls : [],
      faqs: Array.isArray(sf.faqs) ? sf.faqs : [],
      coaches, schedule_weekly,
      generatedAt: new Date().toISOString(),
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30, s-maxage=30' } });
  } catch (err) {
    console.error('storefront-config error:', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
