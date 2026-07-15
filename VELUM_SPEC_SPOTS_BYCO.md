# SPEC: Selección de spot (bici) al reservar + bloqueo de spots por el admin

**Qué**: que la atleta elija su bici/lugar al reservar en la app (se bloquea para las demás),
el admin vea cuál eligió, y el admin pueda bloquear bicis específicas por clase/fecha.

**Por qué / problema real**: BYCO (indoor cycling, vertical studios) — en cycling el lugar ES
parte de la experiencia (primera fila vs atrás, bici favorita). Hoy el spot solo lo asigna el
staff a mano en el panel después de la reserva; la atleta no elige, nada impide colisiones, y
no hay forma de sacar bicis de circulación (mantenimiento o clases más chicas).

## Estado actual (verificado en código/DB)
- `reservas.spot integer` YA existe; el panel studios ya lo asigna/muestra (`asignarSpot`,
  mapa `_dcTaken`, spots = 1..cupo de la clase). El roster admin ya enseña "Spot N".
- La app reserva vía REST (`crearReserva`, atleta.html:7003) SIN spot; cupos = conteo de
  reservas vs `horarios.cupo`.
- `reservas` solo tiene PRIMARY KEY — **no hay ningún índice único**: hoy ni siquiera se
  impide que el mismo cliente reserve 2 veces la misma clase (los guards son solo de UI).

## Criterios de aceptación (medibles)
1. **App (vertical studios)**: al reservar, la atleta ve el mapa de spots (grid 1..cupo);
   los ocupados y bloqueados salen deshabilitados; su elección se guarda en `reservas.spot`
   y su reserva muestra "Bici N". En verticales gym/recovery el flujo queda EXACTAMENTE igual
   que hoy (sin picker) — theming aditivo.
2. **Anti-colisión en DB**: índice único parcial
   `(gym_id, horario_id, fecha, spot) WHERE spot IS NOT NULL AND estado <> 'cancelado'`
   — dos atletas pidiendo la misma bici al mismo segundo: una gana, la otra recibe
   "Esa bici ya se ocupó, elige otra" (tolerar 23505) y el mapa se refresca.
3. **Bloqueo por el admin**: en el roster de la clase (panel studios), el admin puede marcar
   spots como bloqueados para esa clase/fecha. Un spot bloqueado (a) sale deshabilitado en la
   app, (b) descuenta el cupo efectivo (cupo mostrado = cupo − bloqueados), (c) se puede
   desbloquear. Se modela como fila de `reservas` con `estado='bloqueado'` y
   `cliente_nombre='(bloqueado)'` — sin tabla nueva, el índice único del punto 2 lo protege
   igual, y el mapa de ocupados existente lo ve gratis.
4. **Compatibilidad**: reservas sin spot siguen siendo válidas (la atleta puede saltarse el
   picker con "Sin preferencia"); el staff puede reasignar spots desde el panel como hoy.
5. Multi-tenant: todo bajo el mismo `gym_id`; gym B jamás ve spots/bloqueos del gym A.

## Alcance
- SÍ: picker de spot en atleta.html (reserva + tarjeta de reserva), índice único, bloqueo/
  desbloqueo en el roster del panel, conteo de cupo efectivo (app y panel), RLS check.
- NO: mapa visual del salón con posiciones reales (fase futura: hoy es grid numérico 1..cupo,
  igual que el selector del panel); cobro extra por spot premium; spots en storefront público
  (la reserva pública es lead, no reserva de lugar).

## Toca (verificado)
`atleta.html` (picker + insert con spot + manejo 23505 + "Bici N"; app nativa vía build) ·
`VELUM_Sistema_Interno.html` (roster: botón bloquear/desbloquear spots, cupo efectivo) ·
migración: índice único parcial en `reservas` (DDL, requiere OK de Roy) ·
RLS de `reservas`: verificar que el atleta pueda leer spots ocupados de su clase (hoy ya lee
reservas de horarios para cupos — atleta.html:6652) y que NO pueda escribir `estado='bloqueado'`.

**Agentes**: FORJA construye · CENTINELA verifica colisión concurrente + regresión gym/recovery ·
ESCUDO revisa RLS del bloqueo.

## Riesgos y mitigación
- **Carrera por la misma bici** → índice único + tolerar 23505 con retry de UI (criterio 2).
- **Atleta malicioso escribe 'bloqueado'** → policy INSERT del atleta restringida a
  `estado='reservado'` (verificar policy actual; ajustar si permite otros estados).
- **Cupo efectivo desincronizado** → un solo conteo: reservas activas + bloqueos, mismo query
  en app y panel.
- **Regresión en gym/recovery** → picker solo se renderiza con `vertical='studios'`; los
  demás flujos no cambian ni una línea visible.

## Preguntas / cosas que no cuadran
1. ¿La atleta puede **cambiar** su bici después de reservar (si hay libres), o solo el staff?
   Propongo: sí puede, desde su reserva, hasta 1h antes de la clase.
2. ¿El bloqueo de spots es por **clase/fecha individual** (ej. solo el sábado) o también
   "siempre" (la bici 12 está descompuesta 2 semanas)? Propongo fase 1 = por clase/fecha
   (cubre ambos con unos taps); bloqueo persistente = fase 2 si lo piden.
3. BYCO usaría el término "bici" — sale gratis del vocabulario por vertical (studios ya dice
   "créditos/instructores"); confirmar etiqueta: ¿"Bici" para studios-cycling o "Spot" genérico?
   Propongo "Lugar" genérico con número, y el gym lo entiende como bici/reformer/tapete.

**Estimación**: M · **Verificación**: migración en transacción de prueba + node --check +
preview con evidencia (2 reservas concurrentes al mismo spot → una falla limpio; bloqueo
visible en app) + claims de gym B + regresión completa de reservar en vertical gym.
