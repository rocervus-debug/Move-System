#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AUDITOR DE DENSIDAD VISUAL — VELUM
Mide cuánto falta para que el panel cumpla el sistema de densidad.
No opina: cuenta. Mientras el total no sea 0, la cruzada no está terminada.

Uso:  python3 scripts/audit-densidad.py [archivo.html]
"""
import re, sys, collections

ARCHIVO = sys.argv[1] if len(sys.argv) > 1 else 'VELUM_Sistema_Interno.html'

# Escala permitida (px). Todo lo de abajo de 12px es violación dura.
ESCALA_OK = {12, 13, 14, 15, 17, 20, 24, 30}
PISO = 12  # ningún texto por debajo de esto

def cargar(path):
    with open(path, encoding='utf-8') as f:
        return f.read()

def sin_style(h):
    """Devuelve (css, resto) separando los bloques <style>."""
    bloques = re.findall(r'<style[^>]*>.*?</style>', h, re.S)
    resto = h
    for b in bloques:
        resto = resto.replace(b, '')
    return ''.join(bloques), resto

def violaciones_fuente(txt):
    """font-size fuera de la escala o por debajo del piso."""
    chicos, fuera = [], []
    for m in re.finditer(r'font-size:\s*(\d+(?:\.\d+)?)px', txt):
        v = float(m.group(1))
        if v < PISO:
            chicos.append(v)
        elif v not in ESCALA_OK:
            fuera.append(v)
    return chicos, fuera

def hex_sueltos(txt):
    """Colores hex hardcodeados que SÍ deberían ser var(--token).

    Excluye los hex entre comillas en JS: son dinámicos (Chart.js, canvas,
    concatenaciones tipo `${color}44`). Convertirlos a var() rompe el panel,
    así que no cuentan como violación — son excepción justificada, no deuda.
    """
    dinamicos = set()
    for m in re.finditer(r"""(['"])(#[0-9a-fA-F]{3,8})\1""", txt):
        dinamicos.add(m.span(2))
    return [m.group(0) for m in re.finditer(r'#[0-9a-fA-F]{3,8}\b', txt)
            if m.span() not in dinamicos]

def main():
    h = cargar(ARCHIVO)
    css, resto = sin_style(h)

    print("=" * 62)
    print("  AUDITOR DE DENSIDAD VISUAL — %s" % ARCHIVO)
    print("=" * 62)

    total = 0
    for etiqueta, txt in (("CSS (<style>)", css), ("INLINE (JS/HTML)", resto)):
        chicos, fuera = violaciones_fuente(txt)
        hexes = hex_sueltos(txt)
        n = len(chicos) + len(fuera) + len(hexes)
        total += n
        print("\n%s" % etiqueta)
        print("  texto < %dpx .............. %4d  %s" % (
            PISO, len(chicos), "OK" if not chicos else "<-- ilegible"))
        print("  fuera de escala .......... %4d" % len(fuera))
        print("  hex hardcodeado .......... %4d" % len(hexes))
        if chicos:
            c = collections.Counter(chicos).most_common(5)
            print("     tamaños chicos: %s" % ", ".join("%gpx x%d" % (k, v) for k, v in c))

    print("\n" + "-" * 62)
    print("  TOTAL DE VIOLACIONES: %d" % total)
    print("  META: 0  ->  %s" % ("CRUZADA COMPLETA" if total == 0 else "faltan %d" % total))
    print("-" * 62)
    return 0 if total == 0 else 1

# ── G6: contraste sobre VIDRIO (cruzada Glass) ──────────────────────────
# Compone escena -> lámina -> tarjeta en los DOS extremos de cada vertical
# (tope claro de la niebla y fondo oscuro) y exige AA. Chequear extremos sin
# blur es CONSERVADOR: el blur promedia hacia el centro, nunca empeora.
def _lum(rgb):
    c = [v / 255 for v in rgb]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def _ratio(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def _hex(h):
    h = h.lstrip('#')
    return [int(h[i:i+2], 16) for i in (0, 2, 4)]

def _comp(fg, alpha, bg):
    return [fg[i] * alpha + bg[i] * (1 - alpha) for i in range(3)]

def glass_check():
    # Valores del bloque GLASS VELUM (VELUM_Sistema_Interno.html)
    SHEET = (_hex('101518'), 0.45)   # rgba(16,21,24,.45)
    CARD  = (_hex('0D1210'), 0.40)   # rgba(13,18,16,.40)
    ESCENAS = {
        'gym':      ('7E93A0', '1D2A32'),
        'studios':  ('A18E7E', '2A1F18'),
        'recovery': ('8E9B8C', '242F29'),
    }
    TEXTOS = {'--text': 'E9EDF3', '--text2': 'A8B4C0', '--text3': 'A2AEBB', '--text4': '8793A0'}
    MINIMO = {'--text': 7.0, '--text2': 4.5, '--text3': 4.5, '--text4': 3.0}
    print("\nCONTRASTE SOBRE VIDRIO (peor caso escena+lámina+tarjeta)")
    fallos = 0
    for vert, (claro, oscuro) in ESCENAS.items():
        for extremo in (claro, oscuro):
            base = _comp(*SHEET, _hex(extremo))
            base = _comp(*CARD, base)
            for tok, hexv in TEXTOS.items():
                r = _ratio(_hex(hexv), base)
                ok = r >= MINIMO[tok]
                if not ok:
                    fallos += 1
                    print("  FALLA %-8s %-8s sobre #%s: %.2f (pide %.1f)" % (
                        vert, tok, extremo, r, MINIMO[tok]))
    if fallos == 0:
        print("  OK: los 4 textos pasan AA en los 6 extremos de escena")
    return fallos

if __name__ == '__main__':
    code = main()
    fallos = glass_check()
    sys.exit(1 if (code or fallos) else 0)
