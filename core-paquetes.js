// La tienda y el catálogo leen el mismo precio y las mismas condiciones del paquete.
window.CorePaquetes = (() => {
  const pesos = new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:0, minimumFractionDigits:0 });
  const centavos = new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' });
  function importe(p) {
    const valor = p.price_mxn;
    if (valor == null || String(valor).trim() === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  // El checkout con tarjeta acepta importes desde $10 MXN. Las solicitudes gratuitas usan otro flujo.
  function admiteCheckout(precio) {
    return precio !== null && Math.round(precio*100) >= 1000;
  }
  function recurrente(p) {
    return p.billing_type != null ? p.billing_type === 'recurring' : p.recurring === true;
  }
  function explicacionCobro(p) {
    const precio = importe(p);
    if (precio === null) return 'Precio por confirmar';
    if (precio === 0) return 'Sin cobro';
    return recurrente(p) ? 'Se cobra cada mes automáticamente' : 'Se cobra una vez';
  }
  function revisarNombreCobro(p) {
    const n = String(p.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const unico = /\b(pago unico|una sola vez|una vez|one[ -]time|sin (?:cobro automatico|domiciliaci[oó]n|domiciliar|renovacion automatica)|no domiciliad[oa])\b/.test(n);
    const automatico = !unico && /\b(domiciliad[oa]s?|domiciliacion|recurrente|cobro automatico|renovacion automatica|suscripcion)\b/.test(n);
    if (importe(p) === 0) return automatico;
    return recurrente(p) ? unico : automatico;
  }
  function resumen(p, unidad='clases') {
    const precio = importe(p);
    const frecuencia = precio === null ? 'Cobro por confirmar' : precio === 0 ? 'Sin cobro' : recurrente(p) ? 'Cobro mensual automático' : 'Pago único';
    const etiquetas = {
      clases:['Clases', 'Ilimitadas'], sesiones:['Sesiones', 'Ilimitadas'], créditos:['Créditos', 'Ilimitados']
    };
    const [label, ilimitados] = etiquetas[unidad] || etiquetas.clases;
    const cant = Number(p.num_classes);
    const cantidad = (p.unlimited_classes ?? p.unlimited) === true ? ilimitados
      : p.num_classes != null && p.num_classes !== '' && Number.isSafeInteger(cant) && cant >= 0 ? String(cant) : 'Por confirmar';
    const dias = Number(p.duration_days);
    const vigencia = Number.isSafeInteger(dias) && dias > 0 ? dias+' '+(dias===1?'día':'días') : 'Por confirmar';
    const monto = precio === null ? 'Precio por confirmar' : precio === 0 ? 'Gratis' : (Number.isInteger(precio)?pesos:centavos).format(precio);
    const condicion = p.solo_primera_vez === true && admiteCheckout(precio)
      ? '<p class="vplan-condicion">Solo para primera visita</p>' : '';
    return `<div class="vplan-price">${monto}${precio > 0 ? ' <small>MXN</small>':''}</div>
      <p class="vplan-frequency">${frecuencia}</p>
      <dl class="vplan-facts"><div><dt>${label}</dt><dd>${cantidad}</dd></div><div><dt>Vigencia</dt><dd>${vigencia}</dd></div></dl>${condicion}`;
  }
  return { importe, admiteCheckout, recurrente, explicacionCobro, revisarNombreCobro, resumen };
})();
