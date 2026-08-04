#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MIGRADOR DE COLOR — VELUM (cierre de la cruzada de densidad)
Convierte hex hardcodeados a los tokens SEMÁNTICOS del tema.

POR QUÉ EL MAPA ES MANUAL Y NO AUTOMÁTICO:
  un mapeo por valor elige el primer token que coincide y manda #00D4FF a
  var(--velum-emerald) — la paleta de marca CRUDA. Eso congelaría el cyan en
  studios (bronce) y recovery (salvia), rompiendo el theming por vertical.
  El token correcto es var(--accent), que sí cambia por giro de negocio.

NO TOCA (deliberado):
  - hex entre comillas en JS: dinámicos (Chart.js, canvas, `${color}44`).
  - las DEFINICIONES de tokens (`--algo:#hex`): mapearlas crea un ciclo
    var(--accent):var(--accent) y deja el panel sin color.
  - #ffffff: blanco puro con usos legítimos; el token que coincide por valor
    (--sidebar-text-active) es semánticamente equivocado para texto general.

Uso:
  python3 scripts/migrar-color.py --dry
  python3 scripts/migrar-color.py
"""
import re, sys, shutil, collections

ARCHIVO = 'VELUM_Sistema_Interno.html'
DRY = '--dry' in sys.argv

# hex -> token SEMÁNTICO (el que respeta el theming por vertical)
MAPA = {
    '#00d4ff': '--accent',
    '#e8edf5': '--text',
    '#7abfcc': '--text2',
    '#040c14': '--bg',
    '#08121e': '--bg-card',
    '#0d1b2a': '--card2',
    '#f87171': '--danger',
    '#ef4444': '--danger',   # unifica los dos rojos en uno
    '#fbbf24': '--warn',
    '#10e8a0': '--ok',
    '#c084fc': '--hyrox',
    '#a78bfa': '--violet',   # categoría "paquetes" (token nuevo)
    '#25d366': '--wa',       # verde de WhatsApp (marca externa, fijo)
    '#60a5fa': '--blue',     # informativo (token nuevo)
    # 2ª pasada: fondos y grises que NO cambiaban por vertical (en studios el
    # fondo es #0E0A12, así que un #001828 fijo se veía fuera de tema).
    '#001828': '--bg-card',
    '#04040c': '--bg',
    '#6b7280': '--text3',
    '#9ca3af': '--text3',
    '#00ff80': '--ok',
    '#ff8a80': '--danger',
}
# NO se tokenizan #fff y #000: blanco y negro puros son universales, no
# dependen del tema, y un token para ellos solo añade indirección.

def norm(x):
    x = x.lower()
    return '#' + ''.join(c * 2 for c in x[1:]) if len(x) == 4 else x

def main():
    with open(ARCHIVO, encoding='utf-8') as f:
        h = f.read()

    # 1) posiciones intocables
    prohibidas = set()
    for m in re.finditer(r"""(['"])(#[0-9a-fA-F]{3,8})\1""", h):      # dinámicos en JS
        prohibidas.add(m.span(2))
    for m in re.finditer(r'--[\w-]+\s*:\s*(#[0-9a-fA-F]{3,8})', h):   # definiciones de token
        prohibidas.add(m.span(1))

    stats = collections.Counter()
    piezas, ult = [], 0
    for m in re.finditer(r'#[0-9a-fA-F]{3,8}\b', h):
        if m.span() in prohibidas:
            continue
        tok = MAPA.get(norm(m.group(0)))
        if not tok:
            continue
        piezas.append(h[ult:m.start()])
        piezas.append('var(%s)' % tok)
        ult = m.end()
        stats['%s -> var(%s)' % (norm(m.group(0)), tok)] += 1
    piezas.append(h[ult:])
    nuevo = ''.join(piezas)

    print("=" * 60)
    print("  MIGRADOR DE COLOR — %s" % ('SIMULACRO' if DRY else 'APLICANDO'))
    print("=" * 60)
    for k, v in sorted(stats.items(), key=lambda x: -x[1]):
        print("  %-34s %4d" % (k, v))
    print("-" * 60)
    print("  TOTAL migrados: %d" % sum(stats.values()))

    if DRY:
        print("\n  (simulacro — no se escribió nada)")
        return
    shutil.copyfile(ARCHIVO, ARCHIVO + '.bak')
    with open(ARCHIVO, 'w', encoding='utf-8') as f:
        f.write(nuevo)
    print("\n  Escrito. Respaldo en %s.bak" % ARCHIVO)

if __name__ == '__main__':
    main()
