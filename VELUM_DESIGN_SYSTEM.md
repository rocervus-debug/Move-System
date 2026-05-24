# VELUM — Auditoría UX/UI + Design System Premium

> Rediseño completo del producto VELUM. Inspirado en Apple Fitness, Whoop, Linear, Stripe.
> **(FORGE — Elite Product Design · LAZO Growth Studio)**

---

## FASE 1 — AUDITORÍA UX/UI

### Estado actual de VELUM (lo que ya tienes)

**Branding (fuerte ✅):**
- Paleta dark elegante (#06100D base + verde teal #1D9E75 / #5DCAA5)
- Símbolo ✦ icónico, memorable
- Tipografía Inter — moderna y legible
- Wordmark monospace tracking 5px = look tech premium

**Sistema funcional (sólido ✅):**
- Admin con 8 módulos completos
- Vista atleta separada
- Check-in QR funcional
- IA dual (Assistant + Coach)
- Multi-gym nativo
- PWA (sin app store)

**Oportunidades de elevación (lo que voy a rediseñar):**

| Problema detectado | Impacto | Solución FORGE |
|---|---|---|
| Densidad informativa alta en dashboard | Usuario tarda en escanear | Hero KPI con UN número dominante por pantalla |
| Jerarquía visual plana | Todo compite por atención | Sistema de jerarquía Z-axis con elevación |
| Componentes sin sistema unificado | Inconsistencia entre módulos | Design system con tokens estrictos |
| Falta de microinteracciones | Producto se siente "estático" | Motion system con Framer Motion patterns |
| App atleta puede sentirse genérica | No diferenciada de competencia | Vista premium tipo Whoop con anillos animados |
| Check-in QR funcional pero plano | No genera "wow" en kiosko | Animación fullscreen premium con halo |
| IA chat sin presencia distintiva | Parece ChatGPT genérico | UI con sparkle ✦ + streaming animation + glassmorphism |

---

## FASE 2 — DESIGN SYSTEM VELUM

### Paleta extendida

```css
/* === FOUNDATION === */
--velum-bg-deep:        #06100D    /* Background principal */
--velum-bg-base:        #0A1612    /* Background secundario */
--velum-bg-card:        #0C1E18    /* Cards y surfaces */
--velum-bg-elevated:    #122821    /* Hover states / modales */

/* === BRAND === */
--velum-teal:           #1D9E75    /* Brand primary */
--velum-teal-light:     #5DCAA5    /* Accent, glow, sparkle */
--velum-teal-soft:      #2A5F4D    /* Subtle accent */
--velum-teal-dim:       rgba(93, 202, 165, 0.12)  /* Tinted bg */

/* === SEMANTIC === */
--velum-success:        #5DCAA5
--velum-warning:        #F0BE63
--velum-danger:         #E27676
--velum-info:           #6FB8E5

/* === TEXT === */
--velum-text-primary:   #E8EDF5    /* Headlines, datos hero */
--velum-text-secondary: #9DC8BB    /* Body, descripciones */
--velum-text-tertiary:  #4A7265    /* Captions, labels */
--velum-text-disabled:  #2C3F38    /* Estados inactivos */

/* === BORDERS & DIVIDERS === */
--velum-border-soft:    rgba(157, 200, 187, 0.08)
--velum-border-medium:  rgba(157, 200, 187, 0.18)
--velum-border-accent:  rgba(93, 202, 165, 0.30)
```

### Tipografía

```css
/* === FONT FAMILIES === */
--font-display:  'Outfit', system-ui, sans-serif      /* Headlines, números hero */
--font-body:     'Inter', system-ui, sans-serif       /* UI general */
--font-mono:     'Geist Mono', 'SF Mono', monospace   /* Wordmark, labels, datos */

/* === SCALE (escala fluida, base 16px) === */
--text-xs:    11px  /* labels, tags */
--text-sm:    13px  /* captions */
--text-base:  15px  /* body */
--text-md:    17px  /* highlighted body */
--text-lg:    22px  /* section headers */
--text-xl:    28px  /* card titles */
--text-2xl:   36px  /* page titles */
--text-3xl:   56px  /* KPI numbers */
--text-hero:  88px  /* hero metrics (dashboard) */

/* === WEIGHTS === */
--weight-regular:  400
--weight-medium:   500
--weight-bold:     700
--weight-black:    900   /* solo para números hero */

/* === LETTER SPACING === */
Inter:       0 a -0.02em (tight para headlines)
Outfit:      -0.03em (display tight)
Geist Mono:  +0.05em a +0.10em (tracking generoso para labels)
```

### Sistema de espaciado (8pt grid)

```
--space-1:   4px      /* tight clusters */
--space-2:   8px      /* default gap */
--space-3:   12px     /* component padding */
--space-4:   16px     /* section gap */
--space-6:   24px     /* card padding */
--space-8:   32px     /* large gaps */
--space-12:  48px     /* section dividers */
--space-16:  64px     /* major sections */
--space-24:  96px     /* page-level spacing */
```

### Border radius (consistencia esencial)

```
--radius-sm:    8px     /* inputs, small buttons */
--radius-md:    12px    /* default cards */
--radius-lg:    18px    /* hero cards */
--radius-xl:    24px    /* containers premium */
--radius-2xl:   32px    /* feature cards */
--radius-full:  9999px  /* pills, avatars */
```

### Elevación (z-axis)

```
Level 0 — Base background     (--velum-bg-deep)
Level 1 — Surface cards       (--velum-bg-card + border-soft)
Level 2 — Elevated cards      (--velum-bg-card + subtle glow teal-dim)
Level 3 — Modal / Sheet       (--velum-bg-elevated + glow medio)
Level 4 — Toast / Popover     (--velum-bg-elevated + glow fuerte)
```

### Sistema de glow (sutil, no obvio)

```css
/* Glow sutil — solo cuando aporta jerarquía */
--glow-soft:    0 0 24px rgba(93, 202, 165, 0.05)
--glow-medium:  0 0 40px rgba(93, 202, 165, 0.12)
--glow-strong:  0 0 80px rgba(93, 202, 165, 0.25)
--glow-hero:    0 0 160px rgba(93, 202, 165, 0.18)

/* Sombras (sutil, no decorativas) */
--shadow-sm:    0 1px 2px rgba(0,0,0,0.3)
--shadow-md:    0 4px 12px rgba(0,0,0,0.4)
--shadow-lg:    0 8px 32px rgba(0,0,0,0.5)
```

### Sistema de motion

```css
/* === TIMING === */
--ease-out:      cubic-bezier(0.22, 1, 0.36, 1)        /* Default */
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1)     /* Bouncy */
--ease-smooth:   cubic-bezier(0.65, 0, 0.35, 1)        /* Smooth */

/* === DURATIONS === */
--duration-instant:  100ms   /* tooltips, hover */
--duration-fast:     200ms   /* buttons, inputs */
--duration-base:     320ms   /* cards, transitions */
--duration-slow:     500ms   /* page changes */
--duration-deliberate: 800ms /* hero animations */
```

### Componentes base

#### Botones

```
Primary:     bg teal #5DCAA5 + text dark + hover glow medium
Secondary:   bg transparent + border medium + hover bg teal-dim
Ghost:       bg transparent + text teal-light + hover bg teal-dim
Danger:      bg danger + text white + hover darker
Icon-only:   40x40px circle + hover bg teal-dim
```

#### Cards

```
Standard:    bg-card + border-soft + radius-md + padding 24
Elevated:    bg-card + border-soft + radius-lg + glow-soft + padding 32
Hero:        bg-card + border-accent + radius-xl + glow-medium + padding 40
Glass:       bg rgba(12,30,24,0.6) + backdrop-blur(24px) + border-soft
```

#### Inputs

```
Field:    bg-base + border-soft + radius-md + padding 14x18 + focus border-accent
Search:   bg-card + radius-full + padding 12x20 + icon left
Textarea: same as field, min-height 120
```

---

## FASE 3 — ARQUITECTURA DEL SISTEMA

### Mapa de pantallas (admin)

```
🏠 Dashboard
├── Hero KPI (revenue, retention, miembros)
├── Quick actions
├── Próximas clases (hoy)
├── Pipeline de leads (preview)
└── IA Assistant (acceso directo)

👥 Clientes
├── Lista (tabla + filtros)
├── Detalle cliente (perfil + historial)
├── Membresías (estado, vencimientos)
├── Asistencia (calendario)
└── Notas

📅 Horarios & Clases
├── Calendario semana/mes
├── Crear/editar clase
├── Asignar coach
└── Capacidad y reservas

💳 Pagos
├── Dashboard financiero
├── Cobros recurrentes
├── Historial transacciones
├── Métodos de pago
└── Exportar (CSV/Excel)

🎯 CRM Pipeline
├── Kanban (Lead → Cliente)
├── Detalle de lead
├── Próximos pasos automáticos
└── Conversación (WhatsApp embed)

🏋️ Coaches
├── Perfiles del equipo
├── Asignaciones de clase
├── Evaluaciones
└── Metas mensuales

📊 Analytics
├── Revenue + tendencia
├── Retención por cohort
├── Asistencia por clase
├── Top clientes (LTV)
└── Predicciones IA

🤖 IA
├── VELUM Assistant (chat)
├── VELUM Coach IA (workspace)
├── Historial de queries
└── Sugerencias automáticas

🎪 Marketing
├── Campañas activas
├── Leads de Meta Ads
├── Email/WA blasts
└── Métricas de conversión

⚙️ Configuración
├── Perfil del gym
├── Multi-gym (locations)
├── Integraciones (Stripe, Calendly)
└── Equipo y permisos
```

### Mapa de pantallas (atleta)

```
🏠 Home
├── Saludo personalizado
├── Próxima clase (countdown)
├── Anillo de progreso semanal
└── Quick check-in

📅 Mis clases
├── Calendario personal
├── Próximas (reservar)
├── Historial (asistencia)
└── Lista de espera

🏋️ Mi entrenamiento
├── Plan generado por Coach IA
├── Workout de hoy
├── Historial de PRs
└── Progreso (volumen, frecuencia)

💪 Body
├── Métricas (peso, %grasa)
├── Medidas
├── Tracking de progreso
└── Fotos antes/después

💳 Mi membresía
├── Estado y vencimiento
├── Historial de pagos
├── Cambio de plan
└── Cancelar/pausar

👤 Perfil
├── Datos personales
├── Coach asignado
├── Notas del coach
└── Notificaciones
```

### Navegación principal

**Admin:** sidebar izquierdo collapse + header sticky con search global
**Atleta:** bottom tab bar (5 tabs) + header sutil
**Kiosko check-in:** sin navegación, solo CTA único enorme

---

## FASE 4 — DETALLES PREMIUM (microinteracciones)

### Lo que separa "bueno" de "clase mundial"

#### 1. KPI hero — counting animation
Cuando carga el dashboard, los números no aparecen — **cuentan** desde 0 hasta el valor real en 800ms con ease-out. El cerebro asocia esto con "data real, en tiempo real".

#### 2. Check-in QR — pulse halo
El QR en kiosko tiene un halo verde teal pulsante (heartbeat 1.5s). Cuando alguien escanea, se rompe el halo y aparece un checkmark con spring animation. Sonido sutil "ding".

#### 3. IA Assistant — typing breathing
Mientras la IA "piensa", el cursor parpadea con ritmo de respiración (no flat). Las respuestas escriben token por token a velocidad humana (no flash). Genera percepción de inteligencia real.

#### 4. Card hover — z-lift sutil
Cards interactivas se elevan 2px + ganan glow-soft en hover. 200ms ease-out. No flota — se "presenta".

#### 5. Sparkle ✦ — siempre vivo
El símbolo VELUM tiene una animación sutil idle (rotation muy suave + opacity breathing). Cuando hay un evento importante (cierre, nuevo cliente), pulsa más fuerte.

#### 6. Streaming charts
Las gráficas no aparecen completas — se dibujan de izquierda a derecha en 600ms. Da sensación de "live data".

#### 7. Page transitions
Navegación entre módulos: fade out 150ms → fade in 200ms con slight slide up (8px). Nunca jarring cuts.

#### 8. Loading states
Skeletons con shimmer animation (gradient barrido). Nunca spinners genéricos.

#### 9. Empty states
Cada empty state tiene ilustración propia + CTA claro. Nunca "no hay datos".

#### 10. Tap feedback (atleta)
En mobile, cada tap genera ripple effect sutil + haptic feedback (donde el navegador lo soporte).

---

## FASE 5 — ROADMAP DE IMPLEMENTACIÓN

### Sprint 1 — Foundation (1 semana)
- [ ] Setup design tokens en código (CSS variables)
- [ ] Migrar tipografía (cargar fonts: Outfit + Inter + Geist Mono)
- [ ] Implementar sistema de espaciado uniforme
- [ ] Crear componentes base (Button, Card, Input)

### Sprint 2 — Dashboard Admin (1 semana)
- [ ] Rediseñar dashboard con KPI hero
- [ ] Implementar counting animation
- [ ] Charts con streaming animation
- [ ] Pipeline preview

### Sprint 3 — App Atleta (1 semana)
- [ ] Home con anillos de progreso
- [ ] Calendario personal
- [ ] Mi entrenamiento (Coach IA integration)
- [ ] Bottom navigation

### Sprint 4 — IA Premium (1 semana)
- [ ] Chat Assistant con streaming
- [ ] Coach IA workspace
- [ ] Sparkle animations
- [ ] Microinteracciones

### Sprint 5 — Kiosko + CRM (1 semana)
- [ ] Check-in QR fullscreen con halo
- [ ] Kanban CRM premium
- [ ] Drag & drop fluido

### Sprint 6 — Pulir + QA (1 semana)
- [ ] Page transitions
- [ ] Loading states
- [ ] Empty states
- [ ] Color grading final
- [ ] Mobile responsive
- [ ] Accesibilidad (contraste, navegación teclado)

**Total estimado: 6 semanas para migración completa.**

---

## ANEXO — Stack tecnológico recomendado

```
Frontend:       React 18 + Vite (mantener PWA)
Styling:        Tailwind CSS + CSS variables
Animation:      Framer Motion 11
Components:     Custom basados en shadcn/ui
Icons:          Lucide React (consistencia, ligero)
Charts:         Recharts (con custom theme)
Fonts:          Outfit + Inter + Geist Mono (Google Fonts)
State:          Zustand (ligero, suficiente)
```

---

## ANEXO B — Decisiones UX clave que justifico

### ¿Por qué KPI hero gigante?
**Inspiración:** Apple Fitness, Whoop. Un número dominante es procesado en 0.5s. Un dashboard con 12 KPIs balanceados toma 8-10s. Roy necesita decisiones rápidas → hero dominante.

### ¿Por qué bottom nav en atleta y sidebar en admin?
**Mobile-first behavior:** los atletas usan VELUM en celular (camino al gym, en el kiosko). Bottom nav es estándar mobile.
**Power-user behavior:** los admins usan VELUM en escritorio horas/día. Sidebar permite más densidad sin perder navegación.

### ¿Por qué glassmorphism sutil y no fuerte?
**Glass demasiado fuerte:** rompe legibilidad, parece efecto. **Glass sutil (8-16% opacity + 24px blur):** da profundidad sin obstaculizar lectura. Linear y Notion lo usan así.

### ¿Por qué animaciones de 200-320ms?
Investigación de Material Design + Apple HIG: <100ms se siente "snap" (sin transición), >500ms se siente "lento". Sweet spot 200-320ms para feedback inmediato.

### ¿Por qué dark mode como default (sin opción light)?
**1)** Es tu brand (no es decisión arbitraria). **2)** Admins usan VELUM en gym (luz baja). **3)** Atletas usan en celular (común dark mode preferred). **4)** Diferenciación vs competencia (Mindbody/Glofox son light).

### ¿Por qué NO agregamos light mode?
Por ahora, **opinionated design**. Después de validar PMF puedes considerar light mode como feature premium. Empezar con light + dark = doble trabajo, retrasa launch.

---

**(FORGE — Elite Product Design)**

Este design system es el blueprint completo. El siguiente entregable es el HTML mockup interactivo con 5 pantallas navegables para que veas el resultado real, no solo specs.
