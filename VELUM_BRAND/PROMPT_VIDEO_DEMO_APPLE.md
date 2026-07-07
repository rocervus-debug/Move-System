# PROMPT — Video demo de VELUM estilo Apple
**Para:** Claude (sesión de diseño/motion) o cualquier herramienta de video AI de primera línea.
**Referencia analizada:** `VELUM_BRAND/v1c044g50000d8a1rg7og65im51rm61g.MP4` (54s, 9:16) —
demo SaaS estilo Apple en pantalla + filmado sobre MacBook real en escritorio cálido.

---

Copia desde aquí:

---

Eres un director de motion design del nivel del equipo interno de Apple (los videos de
presentación de iOS/Apple Intelligence). Vas a crear el **contenido de pantalla** de un
video demo de 55 segundos para VELUM — el sistema operativo de gimnasios, estudios boutique
y centros de recovery en México. Este contenido se reproducirá a pantalla completa en una
MacBook y se filmará físicamente (producción en dos capas), así que TODO debe vivir dentro
del frame de la pantalla: nada de marcos de laptop dibujados, nada de contexto exterior.

## 1. Especificaciones técnicas

- Master: **3024×1964 (o 16:10 equivalente a pantalla de MacBook), 30fps, 55 segundos.**
- Fondo SIEMPRE full-bleed (la pantalla jamás muestra negro de "app window" con bordes).
- Sin watermark, sin UI de sistema operativo (ni menubar ni dock).
- Loop suave opcional: el último frame puede fundir al primero.

## 2. Lenguaje visual (no negociable)

**Fondos:** gradientes tipo aurora en movimiento MUY lento (30-40s por ciclo), nunca
estáticos. Paleta por capítulo:
- Base/gym: azul profundo #040C14 → cyan #00D4FF → toques de índigo.
- Studios: el mismo mundo pero virando a champagne/dorado #C9A86A con atardecer cálido.
- Recovery: virando a salvia/menta #5EC8B0 con neblina fría.
- El cambio de paleta entre capítulos es un MORPH continuo del gradiente, no un corte.

**UI flotante:** las pantallas del producto NUNCA aparecen como screenshots planos. Se
muestran como tarjetas/fragmentos de UI recortados flotando en un espacio 3D sutil:
perspectiva ligera (rotación Y de 4-8°), parallax entre capas (fondo 0.3x, tarjetas 1x,
tipografía 1.15x), sombras suaves largas, esquinas 16-20px, glassmorphism moderado
(blur 20-30px, borde 1px blanco al 10%).

**Tipografía cinética:** una idea gigante por escena, tipografía **Outfit ExtraBold/Black**
(la display de VELUM), blanca o con el acento del capítulo, tracking apretado (-2%),
tamaño 8-12% de la altura del frame. Aparece por palabras (stagger 60-90ms por palabra,
slide-up 20px + fade, easing spring suave). Subcopy en **Inter Regular** al 45% de opacidad.
Todo en español mexicano. CERO emojis — la marca usa SVG e iconografía de línea.

**El orbe VELUM:** la estrella de 4 puntas de VELUM (✦, polígono 50,5 59.55,40.45 95,50
59.55,59.55 50,95 40.45,59.55 5,50 40.45,40.45) vive como un orbe/blob luminoso con
gradiente cyan→violeta que respira (escala 0.97→1.03, ciclo 4s). Es el hilo conductor:
abre el video, reacciona cuando la IA habla, y cierra como logo.

**Movimiento:** física Apple — nada llega ni sale en línea recta ni de golpe.
- Micro: 150-250ms · entradas de tarjeta: 500-700ms · transiciones de capítulo: 800-1200ms.
- Easing: cubic-bezier(0.22, 1, 0.36, 1) para entradas; springs sutiles (damping alto,
  1 solo overshoot pequeño) para elementos protagonistas.
- Cámara virtual: dolly-in continuo lentísimo (2-3% por escena) + drift lateral de 1-2°.
  Nunca estática, nunca mareada.
- Los números SIEMPRE cuentan hacia arriba (counter animado, 800ms, ease-out).

## 3. Guion — 8 escenas (55s)

**ESC 1 · 0:00-0:05 — Hola.**
Negro azulado #040C14. El orbe VELUM enciende en el centro (bloom suave).
Texto: "Hola." → morph a → **"Tu gym corre solo."**
El orbe se desplaza al costado y arrastra el gradiente aurora tras él.

**ESC 2 · 0:05-0:11 — El dolor.**
Tres tarjetas flotantes entran: una hoja de Excel, un chat de WhatsApp con "¿me apartas
lugar?", una libreta. Se ven pesadas, en grises.
Texto gigante: **"¿Todavía así?"**
Las tres tarjetas se desintegran en partículas que el gradiente absorbe (600ms).

**ESC 3 · 0:11-0:19 — El panel, en vivo.**
Fragmentos del dashboard real de VELUM (KPIs) entran en cascada con parallax:
"Ingresos del mes" contando de 0 → **$84,200 MXN**, "Check-ins hoy" subiendo, la gráfica
de ingresos dibujándose de izquierda a derecha (1.2s), el calendario de vencimientos con
2 filas encendiéndose en ámbar.
Texto: **"Todo, en vivo."** Subcopy: "Ingresos, asistencia y vencimientos en una pantalla."

**ESC 4 · 0:19-0:26 — Check-in QR.**
Un QR gigante al centro; un teléfono (solo la silueta de la pantalla) lo escanea; pulso
de onda cyan al confirmar; el contador de asistencias salta +1 con haptic visual (micro
shake 2px). Fila de avatares-círculo entrando al fondo.
Texto: **"508 check-ins al mes."** Subcopy: "Un gym real, el mes pasado." (dato real)

**ESC 5 · 0:26-0:35 — Tres giros, un sistema.**
EL MOMENTO FIRMA: el mismo layout de panel se transforma dos veces SIN corte —
1) el gradiente vira a champagne y las tarjetas se reorganizan en el **mapa de reformers**
   de un estudio de pilates llenándose lugar por lugar (9/12 ocupado),
2) vira a salvia y se convierte en la **agenda por cabina** de un recovery (citas cayendo
   a su carril, sin empalmes).
Texto (cambia con cada morph): **"Gyms." → "Estudios." → "Recovery."**
Cierre de escena: **"Habla el idioma de tu negocio."**

**ESC 6 · 0:35-0:42 — La app del atleta.**
Marco de iPhone flotante (solo el device, limpio) con la app: el atleta reserva una clase
(tap → lugar elegido en el mapa → confirmación), luego swipe a su progreso.
El detalle clave: la app está pintada con el logo y color de UN GYM ficticio, no de VELUM.
Texto: **"Tu marca, en su bolsillo."** Subcopy: "La app es tuya. Tus clientes ven TU logo."

**ESC 7 · 0:42-0:49 — La IA que conoce tu operación.**
El orbe regresa al centro y crece. Burbujas de chat entran en secuencia (300ms entre sí):
Usuario: "¿Cómo va mi retención este mes?"
VELUM Assistant: "Tienes 47 clientes activos — retención del 78%. Hay 8 membresías por
vencer esta semana: te sugiero una campaña de reactivación para los 5 con mejor historial."
Las cifras de la respuesta se subrayan con glow cyan al aparecer.
Texto: **"Pregúntale a tu negocio."**

**ESC 8 · 0:49-0:55 — Cierre.**
Todo funde a limpio. Número gigante contando: **"$999"** con "MXN/mes" pequeño.
Debajo, en cascada de 3 líneas: "Todo incluido." / "0% comisión." / "7 días gratis."
El orbe se condensa en la estrella ✦ nítida + wordmark **VELUM** (letter-spacing 5px).
Última línea, Geist Mono, chica: **myvelum.app**

## 4. Audio (dirección)

- Música: minimal electrónica cálida, 85-95 BPM, sin drop agresivo; crece en capas hacia
  ESC 5 y se adelgaza a piano/pads en ESC 8. Referencia: música de los videos de
  Apple Watch/iOS, no gym-motivational.
- SFX sutilísimos (nunca por encima de la música): whoosh suave en morphs de capítulo,
  tick satisfying en el check-in, pop de burbuja en el chat, shimmer en el logo final.
- Sin voz en off (el texto en pantalla ES la narración). Versión con VO opcional después.

## 5. Reglas de honestidad y marca

- Los números mostrados son reales del sistema ($84,200, 508 check-ins, 78%, $999, 0%):
  NO inventar otros ni exagerarlos.
- Cero emojis en pantalla. Cero stock footage. Cero manos/personas.
- La UI mostrada debe corresponder al producto real (panel oscuro, tarjetas, kiosco QR,
  mapa de reformers, agenda por cabina, chat del Assistant) — estilizada, no inventada.
- Español mexicano natural; "check-in" y "app" se quedan en inglés.

## 6. Entregables

1. **Master 16:10** (pantalla de MacBook) 55s — para filmar la capa física.
2. **Corte 9:16** (1080×1920) con encuadre re-compuesto (tipografía más grande, una sola
   columna de tarjetas) — para publicar directo en Reels/TikTok si no se filma.
3. **Corte 16:9** (1920×1080) — para la landing (sustituye el "Ver demo en video" actual).
4. Los 8 frames clave como stills (para thumbnails y pauta).

## 7. Producción de la capa física (nota para después)

El master 16:10 se reproduce fullscreen en una MacBook sobre escritorio de madera, luz
cálida de lámpara + ambiente tenue (como la referencia), y se filma con teléfono en
movimiento orbital lento (gimbal o pulso firme): 3-4 tomas de 15-20s desde ángulos
distintos (frontal bajo, lateral derecho, lateral izquierdo cerrando al logo), editadas
al ritmo de los capítulos. El brillo de pantalla al 100% y el cuarto 2 pasos más oscuro
que la pantalla — el glow es el look.

---

Fin del prompt.
