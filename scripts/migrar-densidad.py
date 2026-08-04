#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MIGRADOR DE DENSIDAD VISUAL — VELUM
Convierte los font-size sueltos (px) a los tokens de la escala.
Determinístico: mismo archivo de entrada -> mismo resultado.

Uso:
  python3 scripts/migrar-densidad.py --dry     # solo reporta, no escribe
  python3 scripts/migrar-densidad.py           # aplica
"""
import re, sys, shutil, collections

ARCHIVO = 'VELUM_Sistema_Interno.html'
DRY = '--dry' in sys.argv

# Mapeo px -> token. Todo lo <12px SUBE (piso de legibilidad).
# >34px se deja intacto: son cifras hero/display, casos deliberados.
def token(px):
    if px <= 10:            return '--fs-xs'    # 8/9/9.5/10 -> 12px
    if px <= 11.5:          return '--fs-sm'    # 11/11.5    -> 13px
    if px < 13:             return '--fs-xs'    # 12/12.5    -> 12px
    if px < 14:             return '--fs-sm'    # 13/13.5    -> 13px
    if px <= 16:            return '--fs-base'  # 14/15/16   -> 15px
    if px <= 18:            return '--fs-lg'    # 17/18      -> 17px
    if px <= 22:            return '--fs-xl'    # 19-22      -> 20px
    if px <= 26:            return '--fs-2xl'   # 23-26      -> 24px
    if px <= 34:            return '--fs-3xl'   # 27-34      -> 30px
    return None                                  # hero: intacto

def main():
    with open(ARCHIVO, encoding='utf-8') as f:
        h = f.read()

    stats = collections.Counter()
    intactos = collections.Counter()

    def repl(m):
        px = float(m.group(1))
        t = token(px)
        if t is None:
            intactos[px] += 1
            return m.group(0)
        stats['%gpx -> var(%s)' % (px, t)] += 1
        return 'font-size:var(%s)' % t

    # \b evita que 111px se lea como 11px; el separador tolera espacios.
    nuevo = re.sub(r'font-size:\s*(\d+(?:\.\d+)?)px', repl, h)

    total = sum(stats.values())
    print("=" * 58)
    print("  MIGRADOR DE DENSIDAD — %s" % ('SIMULACRO' if DRY else 'APLICANDO'))
    print("=" * 58)
    for k, v in sorted(stats.items(), key=lambda x: -x[1]):
        print("  %-28s %4d" % (k, v))
    print("-" * 58)
    print("  TOTAL migrados: %d" % total)
    if intactos:
        print("  Intactos (>34px, hero/display): %s" % dict(intactos))

    if DRY:
        print("\n  (simulacro — no se escribió nada)")
        return

    shutil.copyfile(ARCHIVO, ARCHIVO + '.bak')
    with open(ARCHIVO, 'w', encoding='utf-8') as f:
        f.write(nuevo)
    print("\n  Escrito. Respaldo en %s.bak" % ARCHIVO)

if __name__ == '__main__':
    main()
