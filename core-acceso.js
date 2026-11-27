async function coreAcceso(body) {
  const res = await fetch(supabaseUrl + '/functions/v1/core-acceso', {
    method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', body:JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

function abrirDialogoCore(titulo, contenido) {
  document.getElementById('core-acceso-dialog')?.close();
  const dialog = document.createElement('dialog');
  dialog.id = 'core-acceso-dialog';
  dialog.setAttribute('aria-labelledby','core-acceso-titulo');
  dialog.innerHTML = '<header><h2 id="core-acceso-titulo"></h2><button type="button" class="btn btn-outline" aria-label="Cerrar">Cerrar</button></header>' + contenido;
  dialog.querySelector('h2').textContent = titulo;
  dialog.querySelector('header button').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

function showPasswordReset() {
  const dialog = abrirDialogoCore('Recuperar contraseña', `
    <form data-request>
      <label>Correo del personal<input name="email" type="email" required autocomplete="email"></label>
      <button class="btn btn-primary">Enviar código</button>
      <button class="btn btn-outline" type="button" data-have>Ya tengo un código</button>
    </form>
    <form data-confirm hidden>
      <label>Código del correo<input name="code" autocomplete="one-time-code" required maxlength="40" spellcheck="false"></label>
      <label>Nueva contraseña (12 a 128 caracteres)<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
      <label>Confirma la contraseña<input type="password" name="repeat" autocomplete="new-password" required></label>
      <button class="btn btn-primary">Guardar contraseña</button>
      <button type="button" class="btn btn-outline" data-back>Solicitar otro código</button>
    </form>
    <p role="status"></p>`);
  const request = dialog.querySelector('[data-request]'), confirm = dialog.querySelector('[data-confirm]'), status = dialog.querySelector('[role=status]');
  request.elements.email.value = document.getElementById('login-email').value;
  function step(next) {
    request.hidden = next; confirm.hidden = !next; status.textContent = '';
    (next ? confirm.elements.code : request.elements.email).focus();
  }
  dialog.querySelector('[data-have]').onclick = () => step(true);
  dialog.querySelector('[data-back]').onclick = () => step(false);
  request.onsubmit = async event => {
    event.preventDefault();
    const button = request.querySelector('button'); button.disabled = true;
    try {
      await coreAcceso({action:'solicitar',email:request.elements.email.value});
      step(true); status.textContent = 'Si el correo corresponde a una cuenta de personal, recibirás un código válido durante 20 minutos. Revisa también el correo no deseado.';
    } catch (e) { status.textContent = e.message; }
    finally { button.disabled = false; }
  };
  confirm.onsubmit = async event => {
    event.preventDefault();
    if (confirm.elements.password.value !== confirm.elements.repeat.value) { status.textContent = 'Las contraseñas deben coincidir.'; return; }
    const button = confirm.querySelector('button'); button.disabled = true;
    try {
      await coreAcceso({action:'confirmar',code:confirm.elements.code.value,password:confirm.elements.password.value});
      if(request.elements.email.value) document.getElementById('login-email').value = request.elements.email.value;
      document.getElementById('login-pass').value = '';
      confirm.reset(); confirm.hidden = true;
      status.textContent = 'Contraseña actualizada. Cierra esta ventana e inicia sesión con tu nueva contraseña.';
      dialog.querySelector('header button').focus();
    } catch(e) { status.textContent = e.message; }
    finally { button.disabled = false; }
  };
}

const seccionesExportacion = {
  gimnasio:'Gimnasio',tienda:'Tienda pública',identidad:'Identidad del gimnasio',clientes:'Clientes',pagos:'Pagos',packages:'Paquetes',reservas:'Reservas',horarios:'Horarios',
  asistencias:'Asistencias',qr_checkins:'Entradas QR',usuarios:'Personal',coaches:'Coaches',gastos:'Gastos',
  programas:'Programas',medidas:'Medidas',evaluaciones:'Evaluaciones',visitas:'Visitas',leads:'Prospectos',campanas:'Campañas',
  citas:'Citas',waitlist:'Lista de espera',cliente_notas:'Notas de clientes',member_subscriptions:'Domiciliaciones',
  storefront_orders:'Pedidos',horario_cancelaciones:'Clases canceladas',recursos:'Recursos',protocolos:'Protocolos',
  config_programas:'Configuración de programas',solicitudes:'Solicitudes',contenidos:'Contenidos',coach_tarifas:'Tarifas de coaches',
  nomina_tabulador:'Tabulador de nómina',storefront_leads:'Prospectos de tienda',storefront_listings:'Catálogo público',bitacora_atleta:'Bitácora de atletas'
};

function abrirExportacionCore(permiso) {
  const dialog = abrirDialogoCore('Datos de tu gimnasio', `
    <p>Tu suscripción está cancelada. Durante los 30 días posteriores a la baja, administración puede consultar y descargar los datos del gimnasio.</p>
    <label>Sección<select></select></label>
    <div class="core-tabla" tabindex="0" aria-label="Registros de la sección"></div>
    <footer><button class="btn btn-outline" data-prev>Anterior</button><button class="btn btn-outline" data-next>Siguiente</button>
    <button class="btn btn-primary" data-save>Descargar todas las secciones (JSON)</button></footer>
    <p role="status"></p>`);
  const select=dialog.querySelector('select'), area=dialog.querySelector('.core-tabla'), status=dialog.querySelector('[role=status]');
  const prev=dialog.querySelector('[data-prev]'), next=dialog.querySelector('[data-next]'), save=dialog.querySelector('[data-save]');
  for(const [id,label] of Object.entries(seccionesExportacion)) select.add(new Option(label,id));
  let historial=[''], siguiente=null;
  const read = (section,after) => coreAcceso({action:'leer',code:permiso.code,section,after});
  function busy(value) {select.disabled=value; save.disabled=value; prev.disabled=value||historial.length===1; next.disabled=value||!siguiente;}
  async function mostrar() {
    busy(true); area.replaceChildren(); status.textContent='Cargando…';
    try {
      const pagina=await read(select.value,historial.at(-1)); siguiente=pagina.next;
      if(!pagina.rows.length) {status.textContent='Sin registros en esta sección.'; return;}
      const columns=Object.keys(pagina.rows[0]), table=document.createElement('table');
      const head=table.createTHead().insertRow();
      for(const col of columns){const th=document.createElement('th'); th.textContent=col; head.append(th);}
      const body=table.createTBody();
      for(const row of pagina.rows){const tr=body.insertRow();for(const col of columns){const v=row[col];tr.insertCell().textContent=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);}}
      area.append(table);status.textContent='Página '+historial.length+' · '+pagina.rows.length+' registros.';
    } catch(e){siguiente=null;status.textContent=e.message;}
    finally{busy(false);}
  }
  select.onchange=()=>{historial=[''];siguiente=null;mostrar();};
  prev.onclick=()=>{historial.pop();mostrar();};
  next.onclick=()=>{if(siguiente){historial.push(siguiente);mostrar();}};
  save.onclick=async()=>{
    busy(true);
    try {
      const datos={};
      for(const [id,label] of Object.entries(seccionesExportacion)){
        datos[id]=[]; let after='';
        do{
          if(!dialog.open) return;
          status.textContent='Exportando '+label+'…';
          const pagina=await read(id,after);datos[id].push(...pagina.rows);after=pagina.next;
        }while(after);
      }
      if(!dialog.open)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify(datos,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='VELUM-gimnasio-'+new Date().toISOString().slice(0,10)+'.json';dialog.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Exportación completa. Revisa tus descargas.';
    }catch(e){status.textContent=e.message;}
    finally{busy(false);}
  };
  dialog.addEventListener('close',()=>{permiso.code='';},{once:true});
  mostrar();
}
