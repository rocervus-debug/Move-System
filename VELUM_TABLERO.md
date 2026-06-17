# VELUM — Tablero de seguimiento

**Última actualización:** 17 jun 2026 · **Lo mantiene:** NÚCLEO (VELUM Studio)

> Fuente de prioridades: `VELUM_AUDITORIA_MAESTRA.md`. Marca `[x]` lo hecho, `[~]` lo que está en curso.

## 🔴 Por hacer — P0 (bloquea empezar a vender)
- [x] **Funnel self-serve de gyms** ✅ VERIFICADO EN VIVO (7 jun): registro → trial 7d → pago Live → gym creado → login aislado y limpio. Stripe Live, price IDs y eventos del webhook confirmados. Aislamiento multi-gym probado (gym nuevo ve 0 datos de otros). VELUM puede vender solo. · IMPULSO + FORJA
- [ ] **Activar emails (Resend)**: crear cuenta, verificar dominio, poner secrets `RESEND_API_KEY` + `EMAIL_FROM` · área: Producto · agente: FORJA (acción de Roy)
- [x] **Pricing público + CTA de registro en el landing** ✅ HECHO (index.html: sección #pricing, tabla comparativa, CTAs a registro.html?plan=pro/max) · VITRINA + IMPULSO
- [~] **Publicar la app — iOS ~90% (17 jun):** cuenta Apple activa, Build 3 (limpio, sin "MOVE") subiéndose a App Store Connect, ficha/keywords/categoría, Age Ratings 9+, App Privacy (7 datos), export compliance, gym demo Pulse Studio poblado y cuenta del revisor (PULSE/4/VelumDemo2026) — **faltan: 5 capturas + seleccionar build + Submit**. **Android:** ❌ DUNS YA NO ES NECESARIO (Roy es persona física → **cuenta Personal de Google Play, sin DUNS**, $25 USD único + verificación INE). Falta: crear la cuenta Personal → subir `.aab` + capturas + feature graphic → submit. · área: App · agente: SEÑAL
- [ ] **Facturación CFDI (Facturapi)**: cuenta + CSD + cablear timbrado · área: Pagos · agente: FORJA (cuenta: Roy)

## 🟡 Por hacer — P1 / P2
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
- [~] **Submit de iOS a revisión** · SEÑAL · 17 jun — Build 3 subiéndose; tomando las 5 capturas (iPhone 6.9", del portal de Ana en Pulse Studio); luego seleccionar build + cuenta del revisor + Submit. Es el P0 "publicar app".
- [~] **Verticales Fase A — A.6 Recovery UI** · FORJA · 17 jun — pulido fino opcional pendiente; lo grueso terminado y verificado (ver Hecho).

## 🟢 Hecho (reciente — junio 2026)
- [x] **Verticales A.6 — Recovery UI completa** (3 bloques, recovery-gated): **Recursos** (sauna/crio/masaje/compresión), **Protocolos** (plantillas de sesión), **Agenda de citas 1-a-1 por recurso** (navegación por día, agrupado por recurso, estados completada/no-show, wizard 3 pasos con duración auto + datalist de clientes). Verificado: esquema coincide, **RLS round-trip real (INSERT/SELECT/UPDATE/DELETE) como admin de Origin** OK, UI offline (nav reversible, renders, wizards). Cero riesgo a velum/studios. · FORJA · 17 jun
- [x] **iOS — preparación completa para Submit** (17 jun): cuenta Apple Developer activa, Bundle ID `app.myvelum.platform`, archive+upload, **fix Info.plist** (NSCamera/NSPhotoLibrary + ITSAppUsesNonExemptEncryption=false → resuelve ITMS-90683 y export compliance), Age Ratings 9+, **App Privacy** (7 datos: Name/Email/Phone/Fitness/User ID/Purchases/Product Interaction), ficha/keywords/categoría Health & Fitness · SEÑAL
- [x] **App atleta — eliminado el branding "MOVE"** (defaults, título, meta, banner, placeholders → todo "VELUM"/neutral). White-label limpio. · FORJA · 17 jun
- [x] **Gym demo "Pulse Studio" poblado** para capturas y revisión: portal_codigo PULSE + password, 17 clases recurrentes, programa de la semana, 12 check-ins de Ana, reserva activa, membresía Ilimitada. Cuenta del revisor: PULSE/4/VelumDemo2026 · FORJA · 17 jun
- [x] **Feature graphic Google Play** (1024×500, diseño original on-brand: estrella, glow cyan, wordmark Outfit) → `VELUM_ASSETS/store/feature-graphic.png` · SEÑAL · 16 jun
- [x] **App atleta — fix login crash de socios con paquete de clases** (querySelector a nodo inexistente tumbaba showPortal → "No se pudo conectar"). Verificado en vivo + auditoría de null-derefs (sin más bombas). · FORJA · 16 jun
- [x] **App atleta — render fiel del programa manual** (texto libre por renglones, sin reformatear) · FORJA · 16 jun
- [x] **Fix check-in del kiosko** (kiosco_lookup STABLE→VOLATILE; formato de hora 24h) · FORJA · jun
- [x] **Panel admin — sistema de wizards guiados** (.wzd-*): pago, cliente, coach, clase, visita, paquete, lead, campaña, gasto, solicitud convertidos a paso a paso · FORJA · jun
- [x] **Verticales Fase A — fundación** (gyms.vertical + RLS, puente de tema, módulos por giro, Studios funcional) · FORJA · 14 jun
- [x] Aislamiento multi-gym auditado y verificado · ESCUDO
- [x] Bug de borrar paquetes (RLS) corregido · FORJA/ESCUDO
- [x] Analítica del negocio en el dashboard · FORJA
- [x] Centro de ayuda (15 guías) · APOYO
- [x] Métricas SaaS en panel Super Admin · FORJA
- [x] SEO del storefront (meta/OG/JSON-LD/sitemap/robots) · VITRINA
- [x] Modo claro retirado · FORJA
- [x] Emails transaccionales cableados (falta activar Resend) · FORJA
- [x] Auditoría maestra de comercialización · NÚCLEO
