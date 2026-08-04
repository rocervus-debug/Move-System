#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MIGRADOR DE AIRE — VELUM (Olas 4-8 de la cruzada de densidad)
Sube el padding de las filas/tarjetas de CONTENIDO a la escala de espaciado.

NO toca (y es deliberado):
  - celdas de parrilla/calendario (.hor-cell, .sc-cell, .rc-cell, .sched-cell,
    .prog-day-cell): crecerlas deforma los calendarios semanales/mensuales.
  - chips y badges (.chip, .hor-coach-chip, .prog-day-multi-chip, .hor-legend-item):
    son etiquetas, deben quedarse compactas — Nessty también las tiene chicas.
  - nav (.nav-item, .mbn-item): ya se ajustaron en cruzadas anteriores.

Uso:
  python3 scripts/migrar-aire.py --dry
  python3 scripts/migrar-aire.py
"""
import re, sys, shutil

ARCHIVO = 'VELUM_Sistema_Interno.html'
DRY = '--dry' in sys.argv

# selector -> padding nuevo
MAPA = {
    '.eval-row':          '14px',
    '.dash-item':         '13px 14px',
    '.sr-item':           '13px 14px',
    '.user-card':         '13px 12px',
    '.asist-search-item': '13px 14px',
    '.bal-row':           '14px',
    '.contact-entry':     '14px',
    '.notif-item':        '13px',
    '.persona-row':       '14px',
    '.rd-row':            '14px',
    '.rd-tl-row':         '14px',
    '.alert-item':        '14px',
    '.cmdk-item':         '14px 16px',
    '.nota-card':         '14px',
    '.color-custom-row':  '14px',
    '.kpi-card':          '16px',
    '.settings-row':      '15px',
    '.sf-item-card':      '15px',
    '.user-row':          '15px',
    '.cfg-menu-item':     '14px 16px',
    '.sol-item':          '15px',
}

def main():
    with open(ARCHIVO, encoding='utf-8') as f:
        h = f.read()

    cambios = []

    def procesa(sel, nuevo, texto):
        # Bloque cuyo selector es EXACTAMENTE sel (evita .row tocando .cli-row).
        patron = re.compile(
            r'(^|[},])(\s*)(' + re.escape(sel) + r')(\s*\{)([^}]*?)(\})',
            re.M)

        def repl(m):
            cuerpo = m.group(5)
            pm = re.search(r'padding:\s*[^;}]+', cuerpo)
            if not pm:
                return m.group(0)
            viejo = pm.group(0)
            # solo subir, nunca bajar
            vals = re.findall(r'([\d.]+)px', viejo)
            if vals and float(vals[0]) >= float(re.findall(r'([\d.]+)px', nuevo)[0]):
                return m.group(0)
            # Si el horizontal era 0, ES DELIBERADO (la fila vive dentro de un
            # contenedor que ya pone su margen lateral). Meterle padding la
            # desalinea del resto de la vista -> se conserva el 0.
            destino = nuevo
            if re.search(r'padding:\s*[\d.]+px\s+0\s*$', viejo.strip()):
                destino = re.findall(r'([\d.]+px)', nuevo)[0] + ' 0'
            cuerpo2 = cuerpo.replace(viejo, 'padding:' + destino, 1)
            nuevo_txt = destino
            cambios.append('%-20s %-18s -> padding:%s' % (sel, viejo.strip(), nuevo_txt))
            return m.group(1) + m.group(2) + m.group(3) + m.group(4) + cuerpo2 + m.group(6)

        return patron.sub(repl, texto)

    for sel, nuevo in MAPA.items():
        h = procesa(sel, nuevo, h)

    print("=" * 62)
    print("  MIGRADOR DE AIRE — %s" % ('SIMULACRO' if DRY else 'APLICANDO'))
    print("=" * 62)
    for c in cambios:
        print("  " + c)
    print("-" * 62)
    print("  TOTAL de reglas ajustadas: %d" % len(cambios))

    if DRY:
        print("\n  (simulacro — no se escribió nada)")
        return
    shutil.copyfile(ARCHIVO, ARCHIVO + '.bak')
    with open(ARCHIVO, 'w', encoding='utf-8') as f:
        f.write(h)
    print("\n  Escrito. Respaldo en %s.bak" % ARCHIVO)

if __name__ == '__main__':
    main()
