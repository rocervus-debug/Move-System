# VELUM — Auditoría de lanzamiento, proyecciones y equipo
**Fecha:** 2026-07-03 · **Elaborado bajo VELUM-OS** (datos duros de producción, no opiniones)

---

## 1. Estado real del sistema (evidencia de producción)

### Producto construido
- **3 apps, una marca:** panel interno (~26k líneas, wizards guiados, dashboards por vertical), app atleta (Capacitor iOS/Android), storefront público. Landing v2 con páginas SEO por vertical (`para-estudios`, `para-recovery`).
- **33 edge functions ACTIVAS** en Supabase: auth propia, check-in, pagos Stripe (Connect + checkout + webhook idempotente), domiciliación, IA (assistant, coach, storefront chat, generador de programas), emails, push, SaaS billing (setup/portal/metrics/cancel), TOTP, studio room.
- **3 verticales operando en la misma base**: gym (cyan), studios (champagne), recovery (salvia) — theming aditivo, RLS multi-tenant con `auth_gym_id()`.
- **VELUM-OS activo**: pipeline de calidad con gates, skill /spec, 13 agentes.

### Uso real (últimos 30 días)
| Gym | Vertical | Clientes | Pagos 30d | Actividad 30d | Señal |
|---|---|---|---|---|---|
| MOVE (Roy) | gym | 86 | 44 | 87 visitas | Ancla, Stripe Connect activo |
| **Krajo** | gym | **91** | **109** | **508 asistencias** | **Cliente externo REAL y enganchado** |
| FRWD | studios | 13 | 10 | 0 | Piloto tibio |
| Origin | recovery | 10 | 9 | 0 | Piloto tibio |
| Pulse Studio | gym | 10 | 10 | 0 | Se enfrió (último pago 9-jun) |
| Functional Gym | gym | 0 | 0 | 0 | Trial → canceló (churn 1/1) |

**Dinero procesado PARA los gyms (GMV):** abr $47k → may $126k → jun **$186k MXN**. Crece 60-70% mensual.

### La verdad incómoda
- **MRR de VELUM: $0.** Los 6 gyms están en `subscription_status='owner'` (cortesía) o cancelado. Nadie paga.
- El único trial orgánico que hubo (Functional Gym) **canceló sin activarse** (0 clientes cargados): el onboarding de las primeras 24h no retiene solo.
- 0 filas en `leads` y `leads_landing`: no existe pipeline comercial aún.
- Domiciliación: 2 suscripciones de prueba; falta `STRIPE_PLATFORM_SECRET_KEY` y que más gyms conecten Stripe.
- Apps en tiendas: Android en prueba interna (falta closed testing 12 testers × 14 días); iOS falta submit (PrivacyInfo ~15 min).

### Salud técnica
- Errores: 8 en 14 días, ninguno de cara a gyms. Estable.
- Advisors de seguridad: **nada crítico.** 3 tablas internas con RLS sin policy (inaccesibles = seguro), 2 policies INSERT abiertas intencionales (error_logs, leads del landing), 3 funciones SECURITY DEFINER expuestas que revisar (kiosco_lookup es intencional; `update_gym_fiscal_data` conviene endurecerla), pg_net en schema public (menor).
- El sistema aguanta 20–50 gyms sin cambiar nada de infraestructura (Supabase escala; el costo variable es la IA).

---

## 2. Veredicto: ¿viable lanzar YA?

**Sí — con una condición.** El producto está ~85% listo para vender; **el negocio está al ~20%**. El riesgo de VELUM hoy no es técnico, es comercial:

1. **Nada bloquea cobrar hoy.** El funnel registro → Stripe checkout → gym creado ya funcionó en producción. Lo que nunca ha pasado es que alguien PAGUE.
2. **Ya hay product-market fit embrionario**: Krajo (cliente externo) usa el sistema todos los días con 91 clientes y 508 check-ins/mes. Eso es oro: es tu caso de éxito y tu prueba de que el producto retiene.
3. **La lección del único churn**: Functional Gym entró y se fue sin cargar un cliente. El onboarding self-serve necesita acompañamiento humano las primeras 24h (llamada/WhatsApp de bienvenida) hasta que los datos digan otra cosa.

**Lanzamiento correcto: founder-led, no self-serve masivo.** Vender tú, en persona/WhatsApp, 10 clientes con el deck y la lista del Bajío que ya tienes. El self-serve madura en paralelo con lo que aprendas de esas ventas.

---

## 3. Proyecciones (12 meses)

**Supuestos:** ticket promedio $799 MXN/mes (mezcla Pro $599 / Max $999) + 1.5% de comisión sobre GMV domiciliado. Costos fijos hoy ≈ $1,500–2,500 MXN/mes (Supabase, IA, Resend, dominio, tiendas).

| Escenario | Gyms pagando a 3m / 6m / 12m | MRR a 12m | Nota |
|---|---|---|---|
| Conservador | 4 / 8 / 15 | ~$12k MXN | Solo ventas de Roy, sin pauta |
| **Base** | 8 / 18 / 40 | **~$32k MXN + comisiones** | Ventas + pauta chica + referidos |
| Optimista | 12 / 30 / 80 | ~$64k MXN + comisiones | Pauta funcionando + 1 vendedor |

- **Break-even operativo: 3–4 gyms pagando.** Todo lo demás es margen.
- La comisión de domiciliación es la palanca silenciosa: 20 gyms con GMV de $80k c/u al 1.5% = +$24k MXN/mes extra a 12m (escenario base).
- Churn asumido 5%/mes (el benchmark del sector es 3–8%). Cada punto de churn que bajes con onboarding vale más que 2 clientes nuevos.

---

## 4. Roadmap al lanzamiento

### Fase 1 — Cerrar el circuito del dinero (semanas 1–2)
- [ ] Convertir a **Krajo** en el primer cliente pagando (descuento founder de por vida si hace falta — necesitas el logo y el testimonio más que los $599).
- [ ] Decisión sobre FRWD/Origin/Pulse: plan founder pagado o salir del limbo de cortesías.
- [ ] Probar trial→pago end-to-end con tarjeta real (la tuya) y documentar cada fricción.
- [ ] Setear `STRIPE_PLATFORM_SECRET_KEY` + activar domiciliación en MOVE como demo viva.
- [ ] Playbook de onboarding 24h: llamada de bienvenida + migración de Excel hecha por ti.
- [ ] Endurecer `update_gym_fiscal_data` (advisor).

### Fase 2 — Ventas founder-led (semanas 3–6)
- [ ] 20 demos agendadas de `VELUM_Prospectos_Bajio.xlsx` con el deck de cadenas.
- [ ] Caso de éxito Krajo (1 página: números reales de asistencia/cobros).
- [ ] Pauta Meta chica ($3–5k MXN/mes) apuntando a las landing por vertical (GA4 ya mide todo el funnel).
- [ ] Google Play: reclutar 12 testers → closed testing 14 días. iOS: PrivacyInfo + submit.
- [ ] Meta de fase: **5 gyms pagando.**

### Fase 3 — Tracción (meses 2–3)
- [ ] 10+ clientes pagando; medir activación (¿cargan clientes en 48h?), churn y CAC reales.
- [ ] Domiciliación activa en 3+ gyms (empieza a fluir la comisión).
- [ ] Apps publicadas en ambas tiendas.
- [ ] Referidos: 1 mes gratis por gym referido que pague.

### Fase 4 — Escalar (meses 4–6)
- [ ] Subir pauta a lo que el CAC aguante (CAC < 3× ticket mensual).
- [ ] Primera contratación (ver §5).
- [ ] CFDI/facturación si 3+ clientes lo piden (las columnas fiscales ya existen).
- [ ] Self-serve sin acompañamiento cuando la activación orgánica supere 60%.

---

## 5. Equipo propuesto (por etapa, no por organigrama)

**Hoy (0–10 clientes): Roy + el equipo de agentes. Costo extra: $0.**
- Roy = CEO/ventas/soporte (las 3 cosas que una IA no debe hacer por ti: vender, dar la cara, decidir).
- Claude + VELUM Studio (13 agentes) = ingeniería (FORJA/CAUDAL/ESCUDO), QA (CENTINELA), marketing (VOZ/VITRINA/IMPULSO), diseño (TRAZO), datos (ORÁCULO), soporte técnico de fondo (APOYO).
- Herramienta puntual: Higgsfield (~$280 MXN/mes) para creativos de video cuando actives la pauta.

**10–30 clientes: primera contratación = Customer Success medio tiempo (~$8–12k MXN/mes).**
- Onboarding, WhatsApp de soporte nivel 1, migraciones de Excel. Es lo primero que te va a comer el tiempo de venta. Los agentes le preparan guías y él/ella da la cara.

**30–80 clientes: + vendedor a comisión (20–25% del primer año del cliente).**
- Tú pasas de vender a dirigir. CS pasa a tiempo completo.

**80+ clientes: primer dev humano + segundo CS.**
- El dev no reemplaza a los agentes: los usa. Contratas a alguien que trabaje CON VELUM-OS (el pipeline ya está documentado para eso).

**Regla de oro:** cada contratación se paga con el MRR que desbloquea, nunca antes. Con break-even en 4 gyms, el negocio se autofinancia desde la Fase 2.

---

## 6. Los 3 números que definen todo (revisar semanal)

1. **Gyms pagando** (hoy: 0) — la única métrica de lanzamiento.
2. **Activación**: % de trials que cargan ≥10 clientes en 48h (hoy: 0/1).
3. **GMV domiciliado** — de ahí sale la comisión que convierte a VELUM en fintech, no solo SaaS.
