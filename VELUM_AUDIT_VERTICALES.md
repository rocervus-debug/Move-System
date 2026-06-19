# VELUM — Auditoría de Verticales: qué falta para dejarlo perfecto

**Fecha:** 18 jun 2026 · **Para:** Roy · **Autor:** FORJA
**Contexto:** VELUM = plataforma con 3 verticales: **gym** (Funcional/hyrox/tradicional), **studios** (boutique), **recovery** (wellness/fisio). El objetivo es que cada giro se sienta como **un producto hecho para él**, no un gym recoloreado.

---

## 0. Resumen ejecutivo

| Vertical | Identidad | Estado |
|---|---|---|
| **gym** | el sistema base, cian | 🟢 Maduro. Curado (oculta marketing-agencia). |
| **recovery** | salvia, fisio/wellness | 🟢 **Bespoke**: dashboard + agenda por recurso + recursos + protocolos + paquetes; vocabulario 100% wellness; sin cyan; sin kiosco. |
| **studios** | champagne, boutique | 🟡 **A medias**: tema + curación + strip de KPIs + spots/reformers + waitlist en roster. **Falta lo bespoke** (calendario semanal, dashboard completo, mapa de reformers). |

**La brecha grande hoy = STUDIOS.** Recovery quedó al nivel del mockup; studios tiene la fundación pero le faltan las 2 pantallas diferenciadoras.

---

## 1. STUDIOS — lo que falta (prioridad alta)

### 1.1 Dashboard boutique completo (P1)
Hoy: un *strip* de 4 KPIs (`renderStudiosDash`) **encima** del dashboard genérico de gym → se mezcla.
Meta (mockup `studios-dashboard`): hero que **reemplaza** el genérico, con:
- KPIs: Ocupación hoy · Reservas · No-shows 7d · En lista de espera (ya calculados ✓).
- **Clases de hoy** (lista): hora · tipo · instructor · barra de ocupación (reservados/cupo) · badge de waitlist.
- **Requiere atención**: clases llenas con waitlist, no-shows altos, créditos por vencer.
- (Opcional) Ocupación por horario (mini-chart) · Instructores de hoy.
**Plan técnico:** clonar el patrón de `renderRecoveryDash` (ocultar hijos de `#v-dashboard` menos `#studios-dash-strip`, restaurar al salir) + 1 query extra `horarios` de hoy ⨯ `reservas`/`waitlist` agrupadas por `horario_id`. Reusar CSS `.rd-*`. Riesgo bajo (gated a studios = solo FRWD).
**Importante:** coordinar el ocultar/restaurar con `renderRecoveryDash` (ambos corren en `applyVertical`) para que no se pisen los flags `rhHidden`.

### 1.2 Calendario de clases semanal (P1) — el diferenciador
Hoy: la vista `horario` es la genérica (mensual/plantilla).
Meta (mockup `studios-calendario`): **grid semanal** (columnas = días, filas = horas) con cada clase como bloque (tipo + instructor + ocupación), + panel lateral de la clase seleccionada con **mapa de reformers/spots (12/12)** + **lista de espera** inline.
**Plan técnico:** vista nueva `v-studios-cal` (o branch de `horario` para studios) con grid CSS como el de recovery-citas. Reusa `horarios` (plantilla semanal) + `reservas`/`waitlist`. El mapa de spots ya existe parcial (`asignarSpot` en el roster) — portarlo al panel del calendario.

### 1.3 Localización fina (P2)
- Paquete de **créditos** (ya: el wizard dice "Paquete de créditos" en studios ✓).
- Revisar copys de Clientes/Pagos para studios (créditos/clases) — el patrón `_verticalizeUI` ya está, solo agregar relabels studios donde aplique.

---

## 2. RECOVERY — pulido fino restante (prioridad baja)

Recovery ya está al nivel del mockup. Detalles menores opcionales:
- **Cuerpos profundos de Config** (panel de Metas, Storefront) pueden tener algún "clase/coach" en el texto largo — repaso fino.
- **Protocolos**: hoy es CRUD simple (nombre + pasos). El mockup insinúa pasos *encadenados con recurso + duración por paso*. Si quieres, evolucionar `protocolos.pasos` a estructura (recurso+min por paso) y mostrarlo así en la cita.
- **Paquetes de recovery en el dashboard/cita**: el mockup muestra "créditos restantes" por cliente. Hoy el paquete guarda `num_classes` (=sesiones) pero no se ve el saldo en la ficha de cita. Mejora: mostrar sesiones restantes del cliente en el panel de cita.

---

## 3. GYM — mantenimiento (prioridad baja)
Gym es el base maduro. Sugerencias:
- Confirmar que la curación minimal (oculta CRM/marketing/etc.) es lo que quieres para TODOS los gyms de paga, o si algún gym quiere recuperar módulos (es 1 línea en `_VERTICAL_NAV.gym.hide`).
- Nada urgente.

---

## 4. TRANSVERSAL (aplica a las 3 verticales)

### 4.1 Theming residual (P2)
- Quedan ~48 `#00D4FF` sólidos. Casi todos son **datos/marca** (catálogo de temas, defaults, logo, botón IA) y deben quedarse. Vale un repaso de 2-3 que sí sean CSS (ej. gradientes de algún componente) para que studios/recovery no muestren ni un pixel cian.

### 4.2 Sistema de vocabulario centralizado (P2 — deuda técnica sana)
Hoy la localización vive en 3 lugares: `_VERTICAL_NAV` (nav), `_VERTICAL_TOPSUB/TOPTITLE/TOPBTN` (topbar) y `_verticalizeUI` (in-page, por selector/texto). Funciona y es idempotente, pero a futuro conviene **un solo diccionario** `_TERMS[vertical][key]` y un `data-term="key"` en el HTML, para no cazar por texto. No urge; el approach actual escala bien para lo que falta.

### 4.3 App del atleta por vertical (P1 si vas a vender recovery/studios)
El panel ya está tematizado, pero **la app del atleta** (`atleta.html`) aún no lee `gyms.vertical` para cambiar piel/vocabulario. Para un cliente de recovery/studios, su app debería verse en salvia/champagne y hablar de "sesiones/citas" o "clases/reservas". Es el cierre del círculo para vender esas verticales.

### 4.4 Storefront público por vertical (P2)
El storefront (página pública del gym) probablemente asume gym. Verificar que un recovery/studios se vea acorde (paquetes de sesiones, agenda).

---

## 5. Roadmap recomendado (orden sugerido)

1. **Studios Dashboard bespoke** (1.1) — la primera impresión, mayor impacto visible.
2. **Studios Calendario semanal + reformers + waitlist** (1.2) — el diferenciador.
3. **App del atleta tematizada por vertical** (4.3) — necesario para vender recovery/studios.
4. Pulido fino recovery (2) + theming residual (4.1).
5. Storefront por vertical (4.4) + diccionario centralizado (4.2) cuando haya tiempo.

**Nada de esto bloquea a los gyms de paga** (todo gated por vertical; gym base intacto). Es construcción aditiva para que studios y recovery se vendan como productos propios.

---

## Apéndice — qué se hizo en esta racha (jun 18)
Theming sistémico anti-cian (color-mix→`--accent`) · logo/letras VELUM por acento · **Recovery bespoke**: dashboard (KPIs+timeline+recursos+alertas), agenda grid por recurso con panel de protocolo · **Paquetes** sacado de Config al sidebar · **Localización recovery**: sesiones (no clases), Sesión suelta, Terapeutas, Portal de Clientes, Kiosco oculto, emoji caja→◈ · **Studios**: filtros boutique (Membresías/Drop-in). Todo idempotente y reversible; gym intacto.
