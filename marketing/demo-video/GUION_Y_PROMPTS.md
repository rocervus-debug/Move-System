# VELUM — Demo en video (ElevenCreative)

**Para:** Roy · **Duración:** ~50 seg · **Audiencia:** dueños de gyms/estudios en México
**Marca:** dark premium, acento cian (#00D4FF), tecnológico, cinematográfico.

> Tip: el demo más convincente **mezcla** b-roll cinematográfico (IA) **+ capturas reales** del producto (panel, storefront, app). Abajo marco dónde intercalar capturas reales.

---

## 1. Paso a paso en ElevenCreative
1. Entra a elevenlabs.io → **ElevenCreative**.
2. **Voz**: *Studio* o *Text to Speech*, voz en **español (latino)**, modelo **Multilingual v2** (consistente). **Recomendado: genera el guion completo en UNA sola toma y luego córtala por escena** (mismo tono parejo). Stability ~65%.
3. **Imágenes**: *AI Image Generator* → un prompt por escena (sección 3), 16:9.
4. **Video**: *AI Video Generator* → image-to-video con el prompt de movimiento (sección 4), 5-8 seg por escena (modelos Veo/Kling).
5. **Música**: *Music* → prompt de sección 5.
6. **Studio**: arma timeline (video + voz + música a ~-18 dB) + textos en pantalla + capturas reales. Export 1080p.

---

## 2. Guion / narración

### Versión OFICIAL — revisada por Fable 5 (pégala completa y corta por escena)
```
Abriste tu gym para entrenar gente… no para perseguir pagos por WhatsApp.
VELUM administra tu gimnasio… para que tú vuelvas al piso.
Los pagos se domicilian: cada mes caen solos, a tiempo, sin cobrar de puerta en puerta.
Tus clientes descargan TU app —con tu marca y tu logo, en App Store y Google Play— y entran con un código QR.
Tu página pública vende membresías sola… hasta cuando duermes.
Y Aura, tu inteligencia artificial, responde dudas a las tres de la mañana… y arma el entrenamiento de cada cliente.
¿Tú? Solo ves el panel: quién pagó, quién vence, cuánto creciste.
Hecho para gyms en México. Sin contratos forzados. Por lo que te paga una sola membresía al mes.
Pruébalo gratis siete días en myvelum punto app. Tu gym, en piloto automático.
```

### Variante 22s (reel / anuncio)
```
¿Sigues cobrando tu gym por WhatsApp? Con VELUM los pagos se domicilian solos… tus clientes tienen TU propia app, con tu marca, en App Store… y una inteligencia artificial atiende dudas y arma sus entrenamientos, 24/7. Cuesta lo que te paga una membresía. Siete días gratis: myvelum punto app.
```
> **Corrección clave de Fable:** el CTA es **"myvelum punto app"** (no "VELUM punto app") — el dominio es myvelum.app.

### Desglose por escena (para sincronizar con el video)
- **E1 (gancho):** "Tienes un gym… pero pasas más tiempo en WhatsApp, en la libreta y cobrando, que ayudando a tu gente a entrenar."
- **E2 (entra VELUM):** "VELUM es el sistema todo-en-uno para tu gimnasio o estudio."
- **E3 (cobros domiciliados):** "Cobra en línea y domicilia los pagos: cada mes se cobran solos, sin que persigas a nadie."
- **E4 (app + QR):** "Dale a tus clientes tu propia app —en App Store y Google Play— con check-in por código QR."
- **E5 (web + IA que crea entrenamientos):** "Tu página pública vende sola. Y Aura, tu inteligencia artificial, atiende 24 horas… y hasta crea los entrenamientos de cada cliente."
- **E6 (cierre + CTA):** "Hecho para gyms en México, al precio de una sola membresía al mes. Empieza gratis siete días en VELUM punto app." *(en pantalla: myvelum.app)*

---

## 2-C. PLAN DE PRODUCCIÓN — Fable 5 (OFICIAL) ⭐⭐
18 planos en ~50s · ninguno >3s · cada feature se VE en el beat en que se nombra · pantallas = captura real (la IA inventa UIs falsas).

**Sufijo global para TODOS los prompts de imagen:** `cinematic photography, dark premium aesthetic, deep charcoal shadows, single cyan accent light (#00D4FF), shallow depth of field, 35mm film grain, photorealistic, Mexican urban gym context, no text, no logos, no watermarks`

### BEAT 1 [0–4s] "Abriste tu gym para entrenar gente… no para perseguir pagos por WhatsApp"
- **1A IA (pasión):** `Cinematic medium shot of a Mexican gym owner in his 30s coaching an athlete through a barbell lift inside a dark industrial gym at night, chalk dust floating, single cyan rim light, sweat and focus, warm human connection` · vid: `Slow push-in on the coach's focused face, chalk dust drifting through cyan backlight, 2s`
- **1B IA (fricción):** `Cinematic close-up of the same tired gym owner alone at a cluttered desk at night, lit only by his smartphone glow, exhausted, scrolling, phone screen blurred/unreadable` · vid: `Static, subtle breathing, thumb scrolls slowly, he exhales and rubs forehead, 2s`

### BEAT 2 [4–8s] "VELUM administra tu gimnasio… para que vuelvas al piso"
- **2A CAPTURA REAL:** dashboard de `VELUM_Sistema_Interno.html` abriendo (ventana limpia/incógnito, datos demo, zoom 100→110%).
- **2B IA:** `Cinematic wide shot of a confident Mexican gym owner walking back onto the training floor, leaving an office door behind, athletes training in moody cyan light, relief and purpose` · vid: `Tracking shot from behind as he walks onto the floor, cyan flares, 2s`

### BEAT 3 [8–15s] "Los pagos se domicilian: caen solos, a tiempo"
- **3A CAPTURA REAL:** sección de pagos, tabla con estados "Pagado" en cian (scroll suave, 8–10 registros del mes).
- **3B CAPTURA REAL:** notificación "Pago recibido" entrando (pop + sonido cha-ching suave).
- **3C IA:** `Cinematic shot of a relaxed Mexican gym owner having morning coffee inside his gym, dawn light + cyan glow, his phone face-down on the counter, at ease` · vid: `Push-in, steam rising through cyan light, calm sip, quiet pride, 2s`

### BEAT 4 [15–23s] "Tu app —tu marca, en App Store— y entran con QR"
- **4A CAPTURA REAL:** ficha de la app en App Store/Play (con la marca DEL GYM demo, white-label), dedo tocando "Obtener".
- **4B CAPTURA REAL:** la app (`atleta.html`) en un teléfono real, home con logo del gym demo, luz cian detrás, leve tilt.
- **4C CAPTURA REAL:** check-in QR (`checkin.html`) acercándose al lector + el "check" de confirmación.
- **B-roll IA de respaldo:** `Cinematic close-up of a hand holding a smartphone up to a sleek check-in scanner at a dark gym entrance, cyan LED line reflecting, screen blurred/unreadable` · vid: `Macro slow-mo, phone tilts to scanner, cyan light sweep on scan, rack focus, 2s`

### BEAT 5 [23–28s] "Tu página pública vende sola… hasta cuando duermes"
- **5A CAPTURA REAL:** `storefront.html` (marca demo): scroll → hover membresía → "Comprar" → éxito (`success-storefront.html`), acelerado 2x.
- **5B IA:** `Cinematic night shot through a bedroom doorway, a man asleep, on the nightstand his phone glows with a single cyan notification light, peaceful, screen unreadable` · vid: `Locked shot, phone lights up casting cyan glow, he sleeps undisturbed, 2.5s` · *editor: overlay (motion graphic) "Nueva membresía vendida — $899 MXN".*

### BEAT 6 [28–36s] "Aura responde a las 3 a.m. … y arma el entrenamiento"
- **6A IA:** `Cinematic shot of a young Mexican woman on her sofa late at night typing on her phone, face lit by cyan screen glow, dark apartment, 3am, screen unreadable` · vid: `Push-in on her face, she types, pauses, smiles as a reply arrives, 2.5s`
- **6B CAPTURA REAL:** chat de Aura (`atleta.html`): pregunta + respuesta apareciendo con animación de escritura (reloj 3:02 a.m. si se puede).
- **6C CAPTURA REAL:** Aura generando el entrenamiento del día (que se vea "construirse", graba el momento de generación).

### BEAT 7 [36–40s] "¿Tú? Solo ves el panel: quién pagó, quién vence, cuánto creciste"
- **7A CAPTURA REAL:** dashboard, KPIs arriba (ingresos del mes, activos, por vencer) + gráfica ascendente (count-up si se puede).
- **7B CAPTURA REAL:** lista de clientes con badges pagado/por vencer, termina en la gráfica de crecimiento. (opcional 0.5s del dueño asintiendo.)

### BEAT 8 [40–50s] Cierre — "Hecho para gyms en México… Tu gym, en piloto automático"
- **8A IA:** `Cinematic wide establishing shot of a thriving independent gym in a Mexican city at dusk, warm + cyan glow on the street, silhouettes training through large windows, urban Mexican architecture` · vid: `Slow lateral dolly past the facade, silhouettes mid-workout, neon on wet pavement, 3s`
- **8B IA (héroe):** `Cinematic portrait of a proud Mexican gym owner on his training floor, arms relaxed, looking at camera, athletes in bokeh behind, single cyan rim light on his silhouette, quiet confidence` · vid: `Very slow push-in, he holds eye contact, smallest hint of a smile, dust in cyan backlight, 3s`
- **8C fondo CTA (SIN texto):** `Abstract cinematic background, deep black void with slow volumetric haze, a single horizontal ribbon of cyan light (#00D4FF) flowing through the darkness like silk, particle dust, centered negative space for logo, no text, no shapes resembling letters` · vid: `The cyan ribbon undulates slowly, particles drift up, gentle bloom pulse as if breathing, 4s` · *editor: logo VELUM a los 46.5s + "myvelum.app · Prueba gratis 7 días" a los 47.5s.*

### Notas de dirección de Fable
1. **Mismo protagonista** en 1A/1B/2B/3C/8B: genera primero el retrato **8B** y úsalo como **imagen de referencia (character reference)** en los demás → es una historia, no stock.
2. **Capturas reales** con datos demo (gym "Pulse Studio" que armamos) y **marca white-label del gym** en app/storefront; el panel sí con marca VELUM. 1080p+, ventana limpia, cursor lento.
3. **Pantallas dentro del b-roll IA: siempre blurred/unreadable** (ya en los prompts). Si debe leerse, compón la captura real encima.

---

## 2-B. STORYBOARD — cada escena muestra un FEATURE ⭐
Mezcla b-roll humano/emocional (IA) con **capturas REALES del producto** (los features). Cada beat = un feature distinto.

| Escena | Narración | Qué se VE | Tipo |
|---|---|---|---|
| **E1** | "...WhatsApp, libreta y cobrando..." | Dueño agobiado con WhatsApp | IA |
| **E2** | "el sistema todo-en-uno..." | Panel real (dashboard) + 1s del dueño aliviado | Captura + IA |
| **E3** | "Cobra en línea y domicilia los pagos..." | Pantalla Pagos & Renovaciones + registrar pago | Captura real |
| **E4** | "tu propia app... check-in QR" | App del atleta: home → check-in QR | Captura real |
| **E5** | "página pública... Aura crea entrenamientos" | Storefront (myvelum.app/g/krajo) + Aura creando rutina | Captura real |
| **E6** | "...Empieza gratis 7 días" | Gym próspero (IA) → cierre + CTA overlay | IA + overlay |

### Capturas reales a grabar (Cmd+Shift+5 en Mac · grabación de pantalla en iPhone · 16:9, lento)
- **Panel:** 1) Dashboard/inicio · 2) Pagos & Renovaciones (lista + registrar pago)
- **App atleta** (`/atleta`): 3) Home · 4) Check-in QR
- **Storefront/Aura:** 5) `myvelum.app/g/krajo` scroll · 6) Aura creando un entrenamiento

> En el editor: mete cada captura en un marco de laptop/teléfono (CapCut tiene mockups) con un zoom suave (Ken Burns). El b-roll de IA (abajo) va para E1, el alivio del dueño, y E6.

---

## 3-A. PROMPTS IA — b-roll humano / emocional ⭐
Vende el resultado (tu vida más fácil, tu gym próspero), no la herramienta. Arco: caos → alivio → confianza → miembros felices → gym lleno. Dark premium + acento cian. Intercala capturas reales del producto (E3 panel, E4 app, E5 storefront/Aura).

| | Imagen (inglés) | Movimiento (video) |
|---|---|---|
| **E1 agobio** | `Cinematic photo of a tired Latino gym owner in his 30s rubbing his forehead at the front desk of a dark modern gym, overwhelmed, phone glowing with messages, papers and cash scattered, warm moody light, emotional, realistic, 35mm, 16:9.` | `Slow push-in, he sighs and rubs his forehead, phone glowing, subtle handheld, emotional, 5s.` |
| **E2 alivio** | `Cinematic photo of a relieved Latino gym owner in his 30s with a soft smile looking at his phone, leaning back calmly at the front desk of a sleek dark gym, gentle cyan light from the screen on his face, sense of relief and control, premium lighting, realistic, 16:9.` | `Slow push-in as he exhales and a relieved smile appears, shoulders relax, soft cyan light on his face, 5s.` |
| **E3 confianza** | `Cinematic photo of a confident gym owner relaxed with a coffee, glancing at his phone with a satisfied nod, members training softly blurred behind him in a dark premium gym, subtle cyan accent light, emotional, realistic, 16:9.` | `He takes a calm sip of coffee and nods satisfied at his phone, members blurred in motion behind, smooth, 5s.` |
| **E4 miembro feliz** | `Cinematic photo of a happy young woman smiling as she walks into a modern dark gym holding her phone with a glowing app, warmly greeted, energetic welcoming atmosphere, soft cyan accents, shallow depth of field, realistic, 16:9.` | `She walks in smiling and looks up warmly as she's greeted, soft slow motion, welcoming energy, 5s.` |
| **E5 comunidad/IA** | `Cinematic photo of a smiling member following a workout on their phone while a friendly coach guides them in a vibrant dark premium gym, community and motivation, warm aspirational lighting with subtle cyan glow, realistic, 16:9.` | `The member and coach share a motivated moment, subtle smiles and nods, gentle camera drift, community feel, 6s.` |
| **E6 gym próspero** | `Cinematic wide shot of a proud gym owner with arms crossed smiling over his thriving full gym, members training energetically, golden hour light through windows, warm and aspirational, subtle cyan glow on screens, realistic, 16:9.` | `Slow cinematic pan across the thriving busy gym, the proud owner watching, light flares, aspirational, 6s.` |

> E6 termina cortando al fondo abstracto + superpones logo VELUM y "Empieza gratis 7 días · myvelum.app" en el editor.

---

## 3. Prompts de IMAGEN — versión producto/tech (alternativa)

> **Regla de oro del demo:**
> - **IA** → ambiente, emoción, b-roll (gym, dueño, partículas de marca).
> - **Capturas reales** → todo lo que muestre el producto (panel, app, storefront, Aura). Nunca dejes que la IA invente la interfaz (te puso conteo de calorías, que NO es VELUM).
> - **Texto** → siempre como capa en el editor, nunca generado por la IA (escribe mal: "gratia").

**E1 — el caos:**
```
Cinematic photo of a stressed Latino gym owner in his 30s in a modern functional-training gym, holding a phone buzzing with WhatsApp messages, a messy paper notebook and cash on the desk, warm morning light, shallow depth of field, moody, realistic, 35mm, 16:9.
```
**E2 — orden / VELUM (pantallas en glow abstracto, SIN interfaz inventada):**
```
Cinematic shot of a laptop and a smartphone on a clean desk in a stylish dark gym office, the screens showing only a soft abstract cyan (#00D4FF) glow — no interface, no text, no charts — premium ambient lighting, dark and modern, calm and powerful, 16:9.
```
> Luego CORTAS a tu captura real del panel VELUM (dashboard / Pagos & Renovaciones / Clientes). La IA no debe inventar la pantalla.
**E3 — pagos domiciliados (cobro recurrente automático):**
```
Dark premium fintech scene: a glowing credit card floating above a smartphone, a circular recurring-payment arrow icon in cyan light orbiting it, soft particles, automatic billing concept, clean and trustworthy, dark background with teal glow, cinematic, 16:9.
```
**E4 — app + check-in QR (simple, sin persona en acción compleja):**
```
Cinematic close-up of a smartphone held in one hand showing a dark fitness app with cyan accents and a large QR code on screen, blurred modern gym in the background, soft premium lighting, no full face visible, realistic, 16:9.
```
> Mejor aún: usa una **captura real** de tu app + un check-in QR real. Las acciones humanas específicas (levantar el teléfono, abrir reja) deforman manos/caras en IA.
**E5 — IA que crea entrenamientos (Aura):**
```
Close-up of a smartphone screen where a glowing cyan AI assistant orb generates a personalized workout plan: a clean list of exercises appearing as if written by AI, soft light particles, dark premium UI, futuristic and intelligent mood, cinematic, 16:9.
```
**E6 — cierre de marca (fondo abstracto, SIN texto ni letras):**
```
Minimal premium abstract background: deep near-black with a soft cyan (#00D4FF) glow from the center and slow-drifting light particles, elegant, lots of empty space, no text, no letters, no logo, cinematic, 16:9.
```
> La IA escribe mal el texto. Genera el fondo SIN letras y superpón en el editor tu **logo VELUM** (de `VELUM_BRAND/`) + "Empieza gratis 7 días" + "myvelum.app".

---

## 4. Prompts de VIDEO (movimiento; image-to-video, Veo/Kling)
- **E1:** `Slow push-in on the stressed owner, phone lighting up with notifications, subtle handheld shake, realistic, 6s.`
- **E2:** `Slow elegant dolly-in toward the laptop and phone, the abstract cyan glow on the screens gently pulses and breathes, calm and premium, smooth, no text, 5s.`
- **E3:** `The credit card hovers as the cyan recurring-payment arrow completes a full loop and a soft "charged" pulse glows, smooth and premium, 6s.`
- **E4:** `The phone screen glows softly and a cyan light sweeps across the QR code, very minimal hand movement, premium and realistic, 5s.`
- **E5:** `The cyan AI orb pulses and a workout list writes itself line by line on the phone screen, light particles drifting, intelligent and premium, 7s.`
- **E6:** `Soft cyan light particles drift slowly upward over the dark background, the central glow gently breathes, very subtle, premium, no text, 5s.` *(el logo + "Empieza gratis 7 días · myvelum.app" se superponen DESPUÉS en el editor)*

---

## 5. Música y SFX
**Música:**
```
A 50-second premium, modern, uplifting electronic track for a tech/SaaS product video. Starts minimal and atmospheric with soft synth pads, builds a clean pulsing beat around 12s, confident and aspirational but not aggressive, subtle, leaves room for a voiceover. Instrumental.
```
**SFX (opcional):** `soft futuristic UI whoosh for transitions` · `gentle digital chime on the logo`.

---

## 6. Dónde intercalar CAPTURAS REALES
- **E3 (cobros):** tu **panel real** en Pagos & Renovaciones / registrando un pago.
- **E4 (app):** la **app del atleta** real + el check-in QR.
- **E5 (IA):** el **storefront real** (`myvelum.app/g/krajo`) y el chat de **Aura** generando un entrenamiento.

## 7. Checklist de export
- [ ] 1080p 16:9 (y versión 9:16 vertical para reels/stories).
- [ ] Voz por encima de la música (~-18 dB).
- [ ] Precio y CTA legibles (myvelum.app).
- [ ] Subtítulos quemados.
- [ ] Duración 45-55 seg.
