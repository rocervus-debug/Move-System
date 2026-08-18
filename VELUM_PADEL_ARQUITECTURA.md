# PADEL — Arquitectura y estrategia de producto
*Exploración 2026-08-18 · pre-decisión (no es spec de build)*

## 1. Qué se quiere construir (la intención)

Un sistema para el mundo del padel con dos usuarios distintos:

- **El club de padel**: canchas, reservas por hora, academias (clases), membresías, cobros,
  ligas/torneos. El "negocio" — mismo perfil de comprador que un gym de VELUM.
- **El coach de padel** (con o sin club): su agenda, sus alumnos, sus cobros, la progresión
  de cada alumno. Hoy nadie lo atiende bien; opera con WhatsApp + Excel.

## 2. La decisión central: ¿independiente o conectado a VELUM?

### Lo que ya tiene VELUM que el padel necesita (verificado en el código, no de memoria)

| Necesidad de padel | Lo que ya existe en VELUM |
|---|---|
| Multi-tenant + aislamiento | `gyms` + RLS por `gym_id` en 44 tablas (auditada 2026-07) |
| Cobros en línea | Stripe Connect certificado con dinero real, 0% comisión |
| Membresías/bonos | `pagos` + paquetes (tiempo y por-clases) + domiciliación |
| **Academias (clases)** | Horarios + reservas + cupos + **multi-coach por clase + nómina por cabeza** (construido PARA Gold Padel) |
| **Reserva de recurso por franja** | Motor de recovery: `recursos` reservables + `citas` por agenda — una cancha ES un recurso |
| App del jugador | atleta.html → Capacitor (iOS pública, Android en testers) |
| Página propia + directorio | storefront v2 + Descubre (filtro por vertical = 1 línea) |
| Vocabulario/tema por giro | `_term()` + theming aditivo `body[data-vertical]` (4º giro = patrón conocido) |
| CRM / operación de Roy | VELUM HQ (leads, cuentas, salud, referidos, borrar gyms) |
| Coach independiente | Un "gym" de 1 persona: clientes+pagos+horarios+evaluaciones+programas ya operan solos |

**Estimación honesta:** ~80% del sistema de un club de padel ya está construido y probado en
producción. Lo verdaderamente nuevo del padel es: partidas abiertas, niveles/ranking, ligas
y precios por franja horaria.

### La prueba de mercado ya ocurrió dentro de VELUM
Gold Padel llegó SOLO y eligió CORE para sus academias. El multi-coach se construyó por
ellos. Es la validación de que el comprador (dueño de club) compra el mismo producto con
otro vocabulario.

### El pitch se transfiere intacto
En padel el dominante es **Playtomic**: marketplace con comisión donde el club no es dueño
de su relación con el jugador — exactamente lo que Nessty es para estudios. El pitch
anti-marketplace de VELUM ("tu club, tu marca, tu página, 0% comisión, sin competidores al
lado") funciona palabra por palabra. No hay que inventar narrativa nueva.

### Contra: qué ganaría siendo independiente
1. **Marca**: "VELUM" huele a fitness; un club de padel puede querer identidad propia.
2. **Foco de producto**: el loop social del padel (partidas abiertas, matchmaking, ranking
   entre clubes) es B2C y podría crecer hasta merecer su propia app.
3. **Valuación/venta futura**: un vertical SaaS de padel puro se cuenta distinto a inversionistas.

### Y el costo real de la independencia
Reconstruir auth, multi-tenant, RLS, pagos, admin (~27k líneas), app nativa (2 tiendas),
CRM, salud del sistema… **meses de trabajo para re-llegar a donde VELUM ya está**, y de ahí
en adelante todo se arregla DOS veces (el bug de vigencia de julio se habría arreglado en
dos códigos). Roy opera solo + agentes: dividir el foco es el riesgo #1.

### ► Recomendación: **conectado, con marca propia desmontable ("producto hermano")**

Vivir DENTRO del ecosistema VELUM como 4ª vertical (`gyms.vertical='padel'`), pero con
**cara propia** desde el día uno — algo que la arquitectura ya permite (está probado con la
piel Marfil, los 4 presets del storefront y el swap de home):

- **Mismo motor**: DB, RLS, pagos, panel, HQ, edge functions.
- **Cara propia**: skin de padel en la app (como Marfil), preset de storefront propio,
  y cuando la marca lo amerite un dominio propio (ej. `___.app`) que sirva el mismo
  storefront/Descubre filtrado a padel — el frontend es HTML estático + slug, apuntarlo a
  otro dominio es config de Vercel, no re-arquitectura.
- **Cláusula de salida explícita**: si en 12 meses el loop social B2C (partidas/ranking
  inter-clubes) demuestra ser EL producto, se extrae a app propia — y para entonces habrá
  clubes reales pagando que financien esa extracción. Extraer con tracción > construir en
  el vacío.

Regla de decisión simple: **el negocio del club es VELUM; el juego del jugador podría
algún día no serlo.** Empezar donde está el dinero (B2B club) con el 80% ya construido.

## 3. Arquitectura propuesta (vertical 'padel')

### Capa de datos (aditiva, cero forks)
```
gyms.vertical = 'padel'                  -- 4ª vertical
recursos       → CANCHAS  (ya existe: motor de recovery; tipo='cancha', + superficie/techada)
citas          → RESERVAS DE CANCHA por franja (ya existe la agenda por recurso)
  + precio_franja: tarifas valle/pico por día-hora (nuevo: tabla cancha_tarifas o jsonb)
horarios       → ACADEMIAS (clases; multi-coach + nómina YA operando para Gold Padel)
clientes       → JUGADORES (+ nivel: columna o tabla jugador_nivel)
pagos/paquetes → membresías, bonos de horas, clases (sin cambio)

NUEVO (el corazón padel):
partidas       -- partida abierta: cancha+franja, nivel objetivo, 4 lugares, costo dividido
partida_jugadores -- quién entra (el picker de Lugares de BYCO es el patrón: índice único anti-colisión)
ligas / liga_partidos -- round robin y brackets (fase 2; deriva standings de resultados)
```

### Vocabulario y tema
```
_TERMS.padel = { coach:'Coach', cliente:'Jugador', clientes:'Jugadores',
                 reserva:'Reserva', sesion:'Clase', unidadPaq:'clases' }
body[data-vertical="padel"] → acento propio (propuesta: verde cancha #2E8B57 o
                              arena/terracota #C96F4A — lo define TRAZO/diseñador)
App: skin 'padel' (patrón Marfil) · Storefront: preset propio · Descubre: chip "Padel"
```

### Reutilización directa (cero código nuevo)
Check-in QR/kiosco · storefront con checkout · leads · nómina · evaluaciones (progresión
del alumno) · programas (planes de entrenamiento del coach) · push nativo · HQ/CRM.

## 4. Features por fases

**FASE 1 — El club opera (MVP vendible, mayormente reuso)**
1. Canchas como recursos + agenda de reservas por franja (motor recovery re-vocabulizado)
2. Tarifas por franja (valle/pico) + cobro online o en recepción
3. Academias: ya está (clases multi-coach, nómina, cupos, reservas)
4. Membresías y bonos de horas: ya está (paquetes)
5. App jugador: reservar cancha + clases (skin padel)
6. Página pública + chip Padel en Descubre
   → *Con esto Gold Padel opera el club completo, no solo la academia.*

**FASE 2 — Lo que engancha al jugador (diferenciador vs agenda genérica)**
7. **Partidas abiertas**: "faltan 2 para el sábado 7pm, nivel 3.5" — unirse desde la app,
   costo dividido entre 4, lugares protegidos por índice único (patrón BYCO)
8. Nivel del jugador (auto-declarado + ajuste por resultados; simple, no ELO académico)
9. Ligas y torneos: inscripción, round robin/brackets, standings, cobro de inscripción

**FASE 3 — El coach como usuario primario (wedge de crecimiento)**
10. Plan "Coach" (pricing chico): un coach sin club = un tenant de 1 persona con agenda,
    alumnos, cobros, progresión (evaluaciones+programas ya existen)
11. Perfil de coach en Descubre (marketplace de coaches — cobrable a futuro)
12. Coach ↔ club: un coach independiente que da clases EN un club (relación entre tenants;
    diseñarlo hasta tener el caso real enfrente)

## 5. Riesgos y verdades incómodas
- **Playtomic tiene el efecto de red de partidas entre clubes.** No competirle ahí primero:
  ganar el B2B (la operación del club, que Playtomic hace mal) y crecer lo social después.
- **El panel ya pesa ~27k líneas**: la vertical debe ser aditiva estricta (regla existente),
  y las secciones padel-only ocultas para los demás giros, como recovery.
- **Roy es un solo operador**: la razón #1 de "conectado" es no partir el foco. Si algún
  día hay equipo dedicado al padel, la cláusula de salida existe.
- Nombre/marca del sub-producto: pendiente (no forzar "VELUM Padel" si el mercado pide
  identidad propia — el dominio y skin propios lo permiten sin re-arquitectura).

## 6. Siguiente paso propuesto
1. Sesión con Gold Padel: mapear SU operación de canchas (¿cómo cobran la hora? ¿valle/
   pico? ¿partidas abiertas hoy por WhatsApp?) — son el design partner natural.
2. /spec de Fase 1 (canchas + tarifas + reserva por franja sobre el motor de recovery).
3. TRAZO define acento/skin de la vertical.
*(Nada se construye sin el "va" de Roy sobre la spec.)*
