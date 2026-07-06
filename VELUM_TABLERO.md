# VELUM — Tablero de seguimiento
Última actualización: 2026-07-06 · Lo mantiene: NÚCLEO

> Reconciliado contra git log + estado de sesión (el tablero anterior estaba al 17-jun).
> Nota: el MCP de Supabase está desconectado en esta sesión — lo que requiera verificar
> producción (deploys, DB) queda marcado y se confirma al reconectar.

## [P0] Por hacer — bloquea vender/cobrar
- [ ] Cerrar el PRIMER cliente pagando: llamada a Krajo con propuesta founder ($999 congelado)
      · flujo: 4 · agente: IMPULSO + Roy · nota: todo listo en `marketing/prospeccion/propuesta-founder-krajo.md` + caso de éxito en `marketing/casos/caso-krajo.html`

## [P1/P2] Por hacer
- [ ] Verificar landing v3 post-rediseño: que JSON-LD/OG/GA4, demo IA y lead-capture de la v2
      hayan sobrevivido el cambio de territorio (la memoria dice que faltaba portarlos)
      · flujo: 1 · agente: CENTINELA + VITRINA · prioridad: P1
- [ ] Prueba social en landing (testimonio Krajo — depende de su permiso en la llamada)
      · flujo: 7 · agente: VITRINA + APOYO · prioridad: P1
- [ ] Kit de demos Bajío: guion 15 min + objeciones + mensajes por prospecto del Excel
      · flujo: 4 · agente: IMPULSO · prioridad: P1
- [ ] Reporte semanal de activación/churn automatizado (velum-saas-metrics, lunes)
      · flujo: 1 · agente: ORÁCULO · prioridad: P2
- [ ] Dunning de pagos fallidos gym→VELUM (reintentos + aviso) · flujo: 1 · agente: CAUDAL · prioridad: P2
- [ ] Briefs de pauta Meta por vertical (cuando Roy defina presupuesto) · flujo: 7 · agente: VOZ · prioridad: P2
- [ ] Quitar/noindex páginas *_MOCKUP del deploy · flujo: 1 · agente: VITRINA · prioridad: P2
- [ ] Barrido final de ~264 emojis inline del panel · flujo: 1 · agente: TRAZO + FORJA · prioridad: P2

## [EN CURSO]
- [~] (nada activo de agentes en este momento)

## [ESPERANDO A ROY]
- [ ] OK para desplegar `velum-trial-nurture` + cron diario (código listo y commiteado; además
      requiere reconectar el MCP de Supabase) · desde 03-jul
- [ ] La llamada a Krajo (el P0 de arriba — 20 minutos, todo preparado) · desde 03-jul
- [ ] 12 testers de Google Play (los 14 días de closed testing no arrancan sin ellos)
- [ ] Submit de iOS (estado exacto en App Store Connect por confirmar; PrivacyInfo ~15 min de prep)
- [ ] Desinstalar plugin `lazo-meta` duplicado (2 clics, instrucciones en AGENTES_CHANGELOG)
- [ ] STRIPE_PLATFORM_SECRET_KEY para que Domiciliados muestre dinero real
- [ ] (Opcional) Cuenta Higgsfield + autenticar su MCP para creativos de video

## [HECHO] (reciente)
- [x] Landing v3 "Sala de Máquinas" aplicada (index + verticales por plantilla) · LIENZO/VITRINA · 05-06 jul
- [x] Upgrade de los 31 agentes (auditoría 8 dimensiones + reescritura + CHANGELOG + mapa) · 05 jul
- [x] VELUM_FLUJOS.md: 8 pipelines operativos + índice en CLAUDE.md + NÚCLEO los lee · 05 jul
- [x] Paquete primer cliente: caso Krajo + propuesta founder + secuencia trial-nurture (código) · 03 jul
- [x] Candado `update_gym_fiscal_data` (solo admin/superadmin; advisor resuelto) · 03 jul
- [x] Comisión 0% oficial (decisión Roy) — FAQ/JSON-LD/tarjetas dicen la verdad del código · 03 jul
- [x] Pricing plan único Max $999 — Pro desactivado en DB + toda la superficie pública · 03 jul
- [x] Organigrama y plan de equipo por disparadores + auditoría de lanzamiento con datos reales · 03 jul
- [x] Landing v2 (3 olas: SEO invisible, visibles, páginas por vertical) + login.html · 03 jul
- [x] Panel v2 (sidebar por intención, dashboards por vertical, check-in de reservas studios, saldo recovery) · 02 jul
- [x] VELUM Studio nivel 2 (sala IA real) + oficina isométrica + puente orden de trabajo · 01 jul
