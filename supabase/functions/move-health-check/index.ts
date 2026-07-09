// move-health-check — v15 · Watchdog de salud del sistema VELUM
// Deno.serve nativo (regla VELUM: NO deno.land/std).
//
// Modos:
//   ?mode=status  (default) → JSON de salud (lo consume el panel HQ y velum-salud). Público (verify_jwt=false).
//   ?mode=cron              → evalúa y, si NO está healthy, envía email de alerta a Roy vía velum-email.
//                             Requiere header x-cron-secret == cron_config.cron_secret.
//
// Compat: mantiene status/health_score/summary.{total_errors,unique_error_types,critical_errors,
// active_gyms,checkins_today}/top_errors/timestamp/window_hours. AÑADE chequeos de dinero.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const url = new URL(req.url);
  const mode  = url.searchParams.get('mode') || 'status';
  const hours = parseInt(url.searchParams.get('hours') || '24');

  try {
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    // ── 1. Errores recientes (error_logs) ──────────────────────────
    const { data: errors, error: errFetch } = await db
      .from('error_logs')
      .select('gym_id, error_type, message, section, user_email, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (errFetch) throw errFetch;

    const grouped: Record<string, any> = {};
    for (const e of (errors || [])) {
      const key = `${e.error_type}::${(e.message || '').slice(0, 80)}`;
      if (!grouped[key]) grouped[key] = {
        error_type: e.error_type, message: (e.message || '').slice(0, 120),
        section: e.section, count: 0, affected_users: new Set(), gyms: new Set(), last_seen: e.created_at,
      };
      grouped[key].count++;
      if (e.user_email) grouped[key].affected_users.add(e.user_email);
      if (e.gym_id) grouped[key].gyms.add(e.gym_id);
    }
    const report = Object.values(grouped)
      .map((g: any) => ({ ...g, affected_users: g.affected_users.size, gyms: [...g.gyms] }))
      .sort((a: any, b: any) => b.count - a.count);
    const totalErrors = errors?.length || 0;
    const criticalErrors = report.filter((e: any) => e.count >= 5);

    // ── 2. Actividad ───────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const [{ count: gymCount }, { count: checkinsHoy }, { count: pagosHoy }] = await Promise.all([
      db.from('gyms').select('*', { count: 'exact', head: true }).eq('activo', true),
      db.from('asistencias').select('*', { count: 'exact', head: true }).eq('fecha', today),
      db.from('pagos').select('*', { count: 'exact', head: true }).gte('created_at', today + 'T00:00:00'),
    ]);

    // ── 3. Rieles de dinero (banderas rojas) ───────────────────────
    const [dunSaas, onboardStuck, dunMember] = await Promise.all([
      db.from('gyms').select('id, nombre', { count: 'exact' }).in('subscription_status', ['past_due', 'unpaid']),
      db.from('gyms').select('id, nombre', { count: 'exact' }).not('stripe_account_id', 'is', null).eq('stripe_charges_enabled', false),
      db.from('member_subscriptions').select('id, gym_id, cliente_nombre', { count: 'exact' }).in('status', ['past_due', 'unpaid']),
    ]);
    const gyms_past_due       = dunSaas.count || 0;
    const gyms_onboard_stuck  = onboardStuck.count || 0;
    const member_subs_past_due = dunMember.count || 0;

    const flags: { level: string; msg: string }[] = [];
    if (gyms_past_due > 0)        flags.push({ level: 'warn', msg: `${gyms_past_due} gym(s) con cobro SaaS fallido (past_due/unpaid) — tarjeta rechazada, avísales antes de bloquearlos.` });
    if (member_subs_past_due > 0) flags.push({ level: 'warn', msg: `${member_subs_past_due} domiciliación(es) de atleta con cobro fallido (past_due).` });
    if (gyms_onboard_stuck > 0)   flags.push({ level: 'warn', msg: `${gyms_onboard_stuck} gym(s) conectaron Stripe pero NO pueden cobrar (onboarding incompleto).` });
    if (criticalErrors.length)    flags.push({ level: 'crit', msg: `${criticalErrors.length} error(es) críticos (≥5 repeticiones) afectando usuarios.` });

    // ── 4. Estado + score ──────────────────────────────────────────
    const moneyRed = gyms_past_due + gyms_onboard_stuck + member_subs_past_due;
    let status = 'healthy';
    if (criticalErrors.length >= 2) status = 'critical';
    else if (criticalErrors.length >= 1 || moneyRed > 0 || totalErrors >= 20) status = 'degraded';
    const healthScore = Math.max(0, Math.round(100 - criticalErrors.length * 20 - totalErrors * 0.5 - moneyRed * 10));

    const result = {
      status, health_score: healthScore, timestamp: new Date().toISOString(), window_hours: hours,
      summary: {
        total_errors: totalErrors,
        unique_error_types: report.length,
        critical_errors: criticalErrors.length,
        active_gyms: gymCount || 0,
        checkins_today: checkinsHoy || 0,
        pagos_today: pagosHoy || 0,
        gyms_past_due, gyms_onboard_stuck, member_subs_past_due,
      },
      flags,
      top_errors: report.slice(0, 10),
    };

    // ── 5. Modo cron: alerta a Roy solo si NO está healthy ─────────
    if (mode === 'cron') {
      const secret = req.headers.get('x-cron-secret') || '';
      const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').maybeSingle();
      if (!cfg || !secret || secret !== cfg.value) return json({ error: 'unauthorized' }, 401);

      if (status === 'healthy') {
        return json({ ...result, alert_sent: false, reason: 'all_clear' });
      }

      // destinatario configurable (cron_config.alert_email), con fallback
      const { data: emailCfg } = await db.from('cron_config').select('value').eq('key', 'alert_email').maybeSingle();
      const to = (emailCfg?.value || 'ro.cervus@gmail.com').split(',').map((s: string) => s.trim()).filter(Boolean);

      const flagsHtml = flags.map(f => `<li style="color:${f.level === 'crit' ? '#F87171' : '#F5B544'};margin:6px 0;">${f.msg}</li>`).join('');
      const errsHtml = report.slice(0, 5).map((e: any) => `<li style="color:#7ABFCC;margin:4px 0;">${e.count}× ${e.error_type || ''} — ${(e.message || '').slice(0, 90)}</li>`).join('');
      const html = `<div style="font-family:Inter,Arial,sans-serif;background:#040C14;color:#E8EDF5;padding:28px;">
        <div style="max-width:520px;margin:0 auto;background:#08121E;border:1px solid rgba(0,212,255,.15);border-radius:16px;padding:26px;">
          <div style="font-weight:800;color:#00D4FF;letter-spacing:1px;margin-bottom:14px;">VELUM · WATCHDOG</div>
          <h1 style="font-size:19px;margin:0 0 6px;color:${status === 'critical' ? '#F87171' : '#F5B544'};">Sistema: ${status === 'critical' ? 'CRÍTICO' : 'ATENCIÓN'} · ${healthScore}/100</h1>
          <p style="color:#7ABFCC;font-size:13px;margin:0 0 16px;">Algo necesita tu revisión. Esto te llega antes de que un cliente lo note.</p>
          ${flags.length ? `<b style="color:#E8EDF5;font-size:13px;">Banderas</b><ul style="padding-left:18px;margin:8px 0 16px;">${flagsHtml}</ul>` : ''}
          ${errsHtml ? `<b style="color:#E8EDF5;font-size:13px;">Errores top</b><ul style="padding-left:18px;margin:8px 0 16px;">${errsHtml}</ul>` : ''}
          <div style="font-size:12px;color:#7ABFCC;">Errores 24h: ${totalErrors} · Gyms activos: ${gymCount} · Cobros hoy: ${pagosHoy}</div>
          <div style="margin-top:20px;font-size:11px;color:#3A5A6A;">Panel: VELUM_HQ → Salud · move-health-check watchdog</div>
        </div></div>`;

      let alertResult: any = { ok: false };
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/velum-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ to, subject: `VELUM ${status === 'critical' ? 'CRÍTICO' : 'atención'}: salud ${healthScore}/100`, html }),
        });
        alertResult = await r.json().catch(() => ({ ok: r.ok }));
      } catch (e) {
        alertResult = { ok: false, error: String((e as Error).message || e) };
      }
      return json({ ...result, alert_sent: true, alert_to: to, alert_result: alertResult });
    }

    return json(result);
  } catch (e: any) {
    return json({ status: 'error', error: e.message, timestamp: new Date().toISOString() }, 500);
  }
});
