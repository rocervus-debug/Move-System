# FASE 3 — Sistema de diseño por vertical

Todas comparten la **misma familia VELUM**: el mismo shell, los mismos componentes y la misma escala de espaciado (4px). Lo que cambia son los **tokens** (color, tipografía, densidad, radio, sombra) — definidos en [`assets/velum-core.css`](../assets/velum-core.css) bajo `body[data-vertical="…"]`. Abrir dos verticales se siente como dos marcas; el ADN (logo "V", estructura, glow) las mantiene de la misma casa.

> Base heredada de todas: navy casi negro, tipografía con display + texto + mono, glow del acento, espaciado en múltiplos de 4.

---

## VELUM Studios — *boutique premium*
> "Un ritual, no un entrenamiento."

- **Primario** champagne `#C9A86A` · **secundario** `#E4CF9B` · **ink** `#241829`
- **Fondo** ciruela nocturna `#0E0A12` / cards `#1B1422` · **texto** `#F4EEF2` / `#C9B6C4`
- **Semánticos** ok `#10E8A0`, warn `#FBBF24`, danger `#F87171` (heredados)
- **Tipografía** display **Fraunces** (serif editorial) + texto **Inter**
- **Densidad** 1.12 (espacioso) · **radio** 22px · **sombra** difusa y cálida
- **Iconografía** lineal fina, geométrica; fotografía cálida, cuerpos en movimiento, mucho aire
- **Personalidad:** calmado, caro, femenino-neutro, editorial.

## VELUM Gym — *tradicional, alto volumen*
> "Más fuerte cada día."

- **Primario** cian eléctrico `#00E0FF` · **secundario** `#5BEEFF` · **ink** `#03222A`
- **Fondo** `#05080C` / cards `#0E141C` · **texto** `#EAF2F8` / `#9CB0C0`
- **Tipografía** display **Archivo** (grotesca robusta) + texto **Inter**
- **Densidad** 0.86 (compacto, mucha info por pantalla) · **radio** 10px · **sombra** marcada, glow eléctrico
- **Iconografía** sólida, industrial; fotografía de hierro, contraste alto
- **Personalidad:** enérgico, masculino-neutro, sin fricción, operativo.

## VELUM Box — *functional / comunidad*
> "El WOD no se negocia."

- **Primario** volt `#C6FF00` · **secundario** `#E2FF66` · **ink** `#1A1F00`
- **Fondo** carbón verdoso `#0A0B07` / cards `#15170E` · **texto** `#F2F4E9` / `#AEB69A`
- **Tipografía** display **Archivo** (condensada/heavy) + texto **Space Grotesk**
- **Densidad** 0.9 · **radio** 8px (esquinas casi rectas) · estética cruda, de pizarra
- **Iconografía** stencil/industrial; fotografía sudor, comunidad, leaderboard
- **Personalidad:** crudo, competitivo, tribal, motivador.

## VELUM Performance — *Hyrox / data deportiva*
> "Cada segundo cuenta."

- **Primario** naranja brasa `#FF6B2B` · **secundario** `#FF9460` · **ink** `#2A1206`
- **Fondo** `#0B0907` / cards `#191410` · **texto** `#F5EEE8` / `#C2AE9E`
- **Tipografía** display **Space Grotesk** (técnica) + texto **Inter** + mono prominente para tiempos
- **Densidad** 0.88 · **radio** 12px · tablas y cronómetros como protagonistas
- **Iconografía** deportiva, flechas/cronos; fotografía estaciones, sleds, racing
- **Personalidad:** preciso, medible, atlético, orientado a marca personal.

## VELUM Combat — *artes marciales*
> "El grado se gana en el tatami."

- **Primario** rojo sangre `#DC2626` · **acento de grado** oro `#D4A23A` · **ink** `#2A0808`
- **Fondo** `#0A0606` / cards `#170E0E` · **texto** `#F4ECEC` / `#C2A6A6`
- **Tipografía** display **Archivo** (peso alto) + texto **Inter**
- **Densidad** 0.9 · **radio** 6px (anguloso, marcial) · jerarquía visual fuerte
- **Iconografía** sólida, emblemas/escudos; el oro reservado para grados y cinturones
- **Personalidad:** disciplina, respeto, jerarquía, linaje.

## VELUM Recovery — *wellness / clínico*
> "El descanso también entrena."

- **Primario** salvia `#5EC8B0` · **secundario** `#92E0CD` · **ink** `#0A2420`
- **Fondo** niebla nocturna `#070F0E` / cards `#101D1C` · **texto** `#ECF4F2` / `#A6C2BC`
- **Tipografía** display **Fraunces** (serif sereno) + texto **Inter**
- **Densidad** 1.18 (la más amplia) · **radio** 20px · sombras suaves, sin glow agresivo
- **Iconografía** redondeada, suave; fotografía agua, vapor, calma, piel
- **Personalidad:** sereno, clínico-premium, restaurador, silencioso.

---

### Cómo se mantiene la familia
- **Mismo shell** (sidebar + topbar + grid de cards) en las seis.
- **Mismo logo** "V" (cambia el gradiente del acento).
- **Misma gramática de componentes**: `kpi`, `card`, `tbl`, `badge`, `bar`, `chart`.
- **Mismo lenguaje de datos**: KPIs arriba, tablas abajo, glow del acento como firma.
- Lo único que viaja entre verticales: 8–10 variables CSS. Eso es **todo** lo que separa "champagne sereno" de "volt competitivo".
