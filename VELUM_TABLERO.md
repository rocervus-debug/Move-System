# VELUM — Tablero de seguimiento

**Última actualización:** 7 jun 2026 · **Lo mantiene:** NÚCLEO (VELUM Studio)

> Fuente de prioridades: `VELUM_AUDITORIA_MAESTRA.md`. Marca `[x]` lo hecho, `[~]` lo que está en curso.

## 🔴 Por hacer — P0 (bloquea empezar a vender)
- [x] **Funnel self-serve de gyms** ✅ VERIFICADO EN VIVO (7 jun): registro → trial 7d → pago Live → gym creado → login aislado y limpio. Stripe Live, price IDs y eventos del webhook confirmados. Aislamiento multi-gym probado (gym nuevo ve 0 datos de otros). VELUM puede vender solo. · IMPULSO + FORJA
- [ ] **Activar emails (Resend)**: crear cuenta, verificar dominio, poner secrets `RESEND_API_KEY` + `EMAIL_FROM` · área: Producto · agente: FORJA (acción de Roy)
- [x] **Pricing público + CTA de registro en el landing** ✅ HECHO (index.html: sección #pricing, tabla comparativa, CTAs a registro.html?plan=pro/max) · VITRINA + IMPULSO
- [ ] **Publicar la app**: iOS (esperando que Apple procese la membresía) y Android (esperando D-U-N-S) · área: App · agente: SEÑAL
- [ ] **Facturación CFDI (Facturapi)**: cuenta + CSD + cablear timbrado · área: Pagos · agente: FORJA (cuenta: Roy)

## 🟡 Por hacer — P1 / P2
- [ ] Capturas de tienda (5 por plataforma) + feature graphic Google Play 1024×500 · P1 · SEÑAL
- [ ] Prueba social en landing (testimonios/logos de los 4 gyms) · P1 · VITRINA
- [ ] Endurecer seguridad: kiosco_lookup, bucket storefront-assets, error_logs · P1 · ESCUDO
- [ ] Presencia viva en redes + cadencia de publicación · P1 · VOZ
- [ ] Definir trial (14 días) + primer canal de adquisición · P1 · IMPULSO
- [ ] Canal de soporte formal + onboarding asistido del 1er gym de paga · P1 · APOYO
- [ ] ToS/contrato SaaS + aviso de privacidad MX (LFPDPPP) · P1 · (legal, coordina NÚCLEO)
- [ ] noindex/quitar páginas *_MOCKUP del deploy · P2 · VITRINA
- [ ] Base de conocimiento pública (las 15 guías) · P2 · APOYO + VITRINA
- [ ] Programa de referidos · P2 · IMPULSO
- [ ] Dominio propio por gym (subdominio o dominio 100% propio) · P2 · FORJA + VITRINA

## 🔵 En curso
- (vacío)

## 🟢 Hecho (reciente — junio 2026)
- [x] Aislamiento multi-gym auditado y verificado · ESCUDO
- [x] Bug de borrar paquetes (RLS) corregido · FORJA/ESCUDO
- [x] Analítica del negocio en el dashboard · FORJA
- [x] Centro de ayuda (15 guías) · APOYO
- [x] Métricas SaaS en panel Super Admin · FORJA
- [x] SEO del storefront (meta/OG/JSON-LD/sitemap/robots) · VITRINA
- [x] Modo claro retirado · FORJA
- [x] Emails transaccionales cableados (falta activar Resend) · FORJA
- [x] Auditoría maestra de comercialización · NÚCLEO
