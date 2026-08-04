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

if __name__ == '__main__':
    sys.exit(main())
