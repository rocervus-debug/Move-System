# VELUM — Ficha de tienda (App Store + Google Play)

**Para:** Roy · **Uso:** copiar/pegar al crear la app en App Store Connect y Google Play Console.
**Última actualización:** 6 jun 2026

> Nota: la app requiere ser miembro de un gimnasio que use VELUM. Decláralo en la descripción para evitar rechazos por "app vacía sin login" en la revisión.

---

## 1. Nombre y subtítulos

| Campo | Valor | Límite |
|---|---|---|
| **Nombre de la app** | VELUM | 30 car. (iOS) / 30 (Play) |
| **Subtítulo (iOS)** | Tu gym, en tu bolsillo | 30 car. |
| **Descripción corta (Play)** | Reserva clases, check-in QR y tu progreso, en una sola app. | 80 car. |

---

## 2. Descripción larga (ambas tiendas)

```
VELUM es la app de tu gimnasio o estudio fitness. Todo lo que necesitas como miembro, en un solo lugar:

• Reserva tus clases en segundos y administra tu cupo.
• Check-in con código QR — entra sin filas y mantén tu racha.
• Sigue tu plan de entrenamiento de la semana.
• Habla con Aura, tu asistente: resuelve dudas y te orienta 24/7.
• Renueva tu membresía o paquete desde la app, con pago seguro.
• Revisa tu progreso: asistencia, rachas y medidas.

VELUM se adapta a la identidad de cada gimnasio, así que tu app se ve como tu estudio.

Nota: necesitas ser miembro de un gimnasio o estudio que use VELUM para iniciar sesión.

¿Tienes un gimnasio y quieres usar VELUM? Conoce más en myvelum.app
```

---

## 3. Metadatos

- **Categoría:** Salud y forma física (Health & Fitness).
- **Palabras clave (iOS, 100 car.):** `gym,gimnasio,fitness,clases,crossfit,pilates,yoga,checkin,membresia,entrenamiento`
- **URL de soporte:** https://myvelum.app
- **URL de marketing:** https://myvelum.app
- **Política de privacidad:** https://myvelum.app/privacidad.html
- **Clasificación de contenido:** 4+ / Everyone (sin contenido sensible).
- **Precio:** Gratis (la app es gratis; los pagos son la membresía del gym vía Stripe).

---

## 4. Privacidad / Data Safety (lo que recopila la app)

Declara que recopilas y para qué (no se vende a terceros):

| Dato | Para qué | Vinculado al usuario |
|---|---|---|
| Nombre, email, teléfono | Cuenta del atleta, identificación en el gym | Sí |
| Datos de uso (asistencia, reservas) | Funcionalidad de la app | Sí |
| Datos de pago | Procesados por Stripe (no los almacena VELUM directamente) | Sí |
| Datos de salud opcionales (medidas) | Seguimiento de progreso, ingresados por el usuario | Sí |

- ¿Se vende la data? **No.**
- ¿Se comparte con terceros? Solo procesadores necesarios (Stripe para pagos, Supabase para backend).

---

## 5. Capturas de pantalla (guion)

Toma estas 5, en este orden, en un iPhone (y equivalentes en Android). Idealmente con datos "bonitos" (un gym demo bien poblado).

1. **Home / Inicio** — saludo, racha, clase de hoy. (El gancho.)
2. **Reservar clase** — el horario semanal con clases disponibles.
3. **Mi plan / Aura** — el programa del día + el chat de Aura.
4. **Progreso** — heatmap de asistencia + rachas.
5. **Mi cuenta / Renovar** — paquetes y membresía.

**Tamaños requeridos:**
- iOS: iPhone 6.7" (1290 × 2796 px) — obligatorio. Opcional 6.5".
- Android: teléfono (mín. 1080 px lado corto). Sube 4-8.

Tip: usa el simulador de Xcode (iPhone 15 Pro Max) para capturas 6.7" limpias.

---

## 6. Checklist final antes de Submit

- [ ] Nombre, subtítulo, descripción pegados.
- [ ] 5 capturas por plataforma.
- [ ] Ícono 1024×1024 (lo genera `npx capacitor-assets generate`).
- [ ] URL de privacidad puesta.
- [ ] Data Safety (Play) / App Privacy (iOS) llenados.
- [ ] Categoría Salud y forma física.
- [ ] Build subido (TestFlight en iOS / Internal testing en Android) y asignado.
- [ ] Cuenta de prueba para el revisor (usuario + contraseña de un atleta demo) — **importante**: Apple/Google necesitan poder entrar para revisar. Crea un atleta demo y pon sus credenciales en las notas de revisión.
```
```
