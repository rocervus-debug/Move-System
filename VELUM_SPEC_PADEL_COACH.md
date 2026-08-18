# SPEC: Vertical PADEL — Fase 1: el Coach

**Qué**: 4ª vertical de VELUM (`gyms.vertical='padel'`) con el **coach de padel** como primer
usuario: un coach (independiente o de club) administra alumnos, clínicas, clases privadas,
asistencia, cobranza y entrenamientos — con la app existente para sus atletas.

**Por qué / problema real**: el coach de padel opera con WhatsApp + Excel (asistencia,
cobros, quién debe, qué entrenó cada alumno). El coach de Roy lo pidió explícitamente.
Playtomic sirve la CANCHA (reserva/partidas), no al coach; las herramientas de academia
existentes (Padel School Manager, Kuosel) son España-céntricas (Redsys) — en México/LATAM
el hueco es real. Para VELUM es el mismo producto con otro vocabulario: un coach = un
negocio de 1 persona, y todo lo que necesita YA existe en CORE.

## Contexto de mercado (investigado 2026-08-18)
- Playtomic: reserva de cancha, partidas abiertas, nivel ELO, ligas — 16k canchas, 2M
  jugadores. NO gestiona la operación del coach (su Manager es para clubes).
- El coach queda huérfano entre Playtomic (cancha) y el Excel. Ese es el wedge.

## Criterios de aceptación (medibles)
1. **Onboarding coach en <10 min**: registro → elegir "Soy coach de padel" → wizard
   (alumnos → primera clínica → primer cobro). Sin tocar nada de otras verticales.
2. **Alumnos** (= clientes, re-etiquetado): alta rápida, nivel del alumno (campo simple
   1.0–7.0 estilo padel), teléfono/contacto.
3. **Clínicas** (= clases grupales de `horarios`): día/hora/cupo; el alumno reserva desde
   la app; el coach pasa **asistencia** con la lista de la clase (roster existente) o QR.
4. **Clases privadas** (1:1 o 1:2): agenda del coach por cita — reutiliza el motor de
   citas/recursos de recovery con el coach como recurso; el alumno la ve en su app.
5. **Cobranza**: bonos de clases (4/8/12 = paquetes con clases_totales), pago manual o
   link Stripe, y los avisos de vencimiento existentes; el coach ve quién debe de un
   vistazo (KPI vencidas ya arreglado con la regla canónica).
6. **Entrenamientos**: programas + bitácora + evaluaciones existentes re-etiquetados
   ("Entrenamiento de la clínica", "Progresión del alumno").
7. **App del alumno**: skin padel (patrón Marfil: aditivo por `data-skin`), reserva de
   clínica, sus pagos/bono, su progresión. Web inmediato; nativa en la siguiente build.
8. **Vertical aditiva estricta**: gym/studios/recovery sin un pixel de cambio. Vocabulario
   vía `_TERMS.padel` = { cliente:'Alumno', clientes:'Alumnos', sesion:'Clase',
   coach:'Coach', reserva:'Reserva', unidadPaq:'clases' }.
9. **Plan "Coach"** en pricing (decisión Roy/IMPULSO): tier reducido (1 usuario staff,
   sin kiosco) a precio menor que Max — p.ej. $349–$499/mes. Gate: definir ANTES de
   vender el primero.
10. **Descubre**: chip "Padel"; el coach aparece como negocio con su página.

## Alcance
- **SÍ**: vertical `padel` (selector HQ + wizard de registro), vocabulario+tema panel,
  skin app, onboarding coach, plan Coach, chip en Descubre.
- **NO (fase 2, spec aparte tras sesión con Gold Padel)**: canchas/reserva por hora del
  CLUB, tarifas valle/pico, partidas abiertas, ranking, ligas.
- **NO (evaluar con tracción)**: app dedicada de marca padel — ver §Riesgos.

## Toca (verificado)
`gyms.vertical` (+'padel' en selector HQ y wizard Nuevo Gym) · `VELUM_Sistema_Interno.html`
(_TERMS.padel, theming `body[data-vertical="padel"]`, onboarding) · `atleta.html` (skin
padel) · `velum_saas_plans` (plan coach) · `descubre.html` (chip) · textos de registro.
Sin tablas nuevas ni cambios de RLS (el aislamiento por gym_id aplica igual a un coach).

**Agentes**: FORJA construye · TRAZO define acento del giro (propuesta: verde cancha o
terracota — NO el cyan gym) · IMPULSO define pricing · CENTINELA regresión de las otras
3 verticales.

## Riesgos y cómo se mitigan
- **"¿Bajar una app de gym crea barrera?"** → En fase coach NO: la distribución es
  coach→alumno (el alumno instala lo que su coach le dice, igual que los 144 de Ares
  Gym). La percepción de nicho se mitiga con: skin padel al entrar + keywords de padel
  en la ficha de la tienda (ASO). **Si el B2C exige marca propia**: Capacitor permite una
  **app hermana** (2º target, bundle id y marca padel, MISMO código y backend) — costo:
  segunda ficha y doble review en tiendas. Decisión de marketing para cuando haya
  tracción, no de arquitectura hoy.
- **Plan Coach canibaliza Max** → tier limitado por capacidades (1 staff, sin kiosco,
  sin nómina multi-coach), no por engaño; IMPULSO fija la línea.
- **Coach que da clases EN un club con VELUM** → relación coach↔club (dos tenants) NO se
  diseña ahora; hasta tener el caso real enfrente.

## Variables de configuración (decisión de Roy 2026-08-18: soportar AMBAS respuestas
## de cada pregunta — el sistema se adapta al modelo de cada coach, no impone uno)

1. **Volumen** (¿5 alumnos o 60?): la alta funciona igual en ambos extremos — alta rápida
   1×1 + importación CSV existente. El onboarding no asume tamaño.
2. **Modelo de cobro** — los TRES conviven en el catálogo del coach y puede mezclarlos:
   · Clase suelta (pase/visita) · Bono de clases (paquetes con clases_totales, 4/8/12
   configurables) · Mensualidad (membresía por tiempo). Todo ya existe en pagos/paquetes;
   el wizard de onboarding pregunta "¿cómo cobras?" y pre-arma su catálogo (puede editar).
3. **Clínicas fijas vs variables** — ambas: plantilla semanal recurrente (horarios con
   fecha='') Y clases de fecha única (el mecanismo de overrides por fecha ya existe).
   El coach que improvisa semana a semana solo usa fechas únicas.
4. **Asistencia y progresión — toggles por coach**:
   · Asistencia: por lista (roster) o QR, o simplemente no usarla — no es obligatoria
     para cobrar (los bonos descuentan por asistencia SOLO si el coach la registra).
   · `mostrar_progresion_alumno` on/off: hay coaches que quieren que el alumno vea su
     evolución y coaches que la manejan interna.
5. **Cancha** — campo opcional `ubicacion` por clínica/clase (texto: "Club X, cancha 2").
   Si el coach reserva su cancha en Playtomic/el club, VELUM no estorba; si algún día la
   quiere adentro, eso es la fase club. Nunca es bloqueo.

Estas 5 variables viven en el wizard de onboarding como preguntas simples (una decisión
por paso, patrón .wzd-*) con defaults sensatos — el coach nunca ve un panel de "settings"
crudo. Cazador de segmentos: cada combinación de variables ES un perfil de coach distinto
al que se le puede vender igual.

**Estimación**: M (mayormente verticalización + onboarding; cero esquema nuevo).
**Verificación**: node --check + preview con evidencia (onboarding coach completo → alumno
reserva clínica desde la app → asistencia → cobro) + regresión de las 3 verticales + gym B
no ve nada del coach A.
