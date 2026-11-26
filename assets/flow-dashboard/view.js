(function(){
  'use strict';
  const currency=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:2});
  const dateFormat=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const dateLabel=date=>dateFormat.format(new Date(date+'T12:00:00Z'));
  function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function mount(root,{onReload,onNavigate}){
    let disposed=false;
    root.classList.add('flow-dashboard');root.replaceChildren();
    function button(text,fn){const b=node('button','',text);b.type='button';b.addEventListener('click',fn);return b;}
    const head=node('header','fd-head'),intro=node('div');intro.append(node('p','fd-eyebrow','TU ESTUDIO, EN UN VISTAZO'),node('h2','','Inicio'));
    const date=node('p','fd-muted');intro.append(date);head.append(intro,button('Actualizar',onReload));
    const status=node('p','fd-status');status.setAttribute('role','status');const content=node('div','fd-content');root.append(head,status,content);
    function card(title,cls=''){const section=node('section','fd-card '+cls);section.append(node('h3','',title));return section;}
    function update(data){
      if(disposed)return;content.replaceChildren();status.hidden=false;
      if(data.status!=='ready'){date.textContent='';status.textContent=data.status==='loading'?'Consultando la operación del día…':'No pudimos preparar el resumen. Intenta actualizar.';return;}
      date.textContent=dateLabel(data.date)+' · Actualiza para consultar los últimos registros';status.hidden=true;
      const metrics=node('section','fd-metrics');metrics.setAttribute('aria-label','Resumen de registros');
      function metric(label,value,description,hero=false){const m=node('div','fd-metric'+(hero?' fd-hero':''));m.append(node('p','fd-muted',label),node('strong','',value===null?'Por verificar':String(value)),node('p','fd-muted',description));metrics.append(m);}
      if(data.canMoney)metric('Cobros registrados del mes',data.total===null?null:currency.format(data.total)+' MXN',dateLabel(data.start)+' — '+dateLabel(data.date)+'. Suma de importes registrados; no saldo bancario ni neto de reembolsos.',true);
      if(data.canCustomers)metric('Clientes en directorio',data.customers,'Registros visibles. No equivale a membresías activas.');
      metric('Check-ins de hoy',data.visits,'Registros del '+dateLabel(data.date)+'. No personas únicas.');
      if(data.canAgenda)metric('Clases en agenda',data.classes,'Horarios del día, incluidas las canceladas.');
      content.append(metrics);
      const columns=node('div','fd-columns'),attention=card('Requiere tu atención'),schedule=card('Hoy en el estudio');
      attention.append(node('p','fd-muted','Cada pendiente, con su contexto.'));
      function item(title,body,destination){const row=node('div','fd-attention-row');row.append(node('strong','',title),node('p','fd-muted',body));if(destination)row.append(button(destination==='horario'?'Revisar agenda ↗':'Revisar clientes ↗',()=>onNavigate(destination)));attention.append(row);}
      if(data.canAgenda){
        if(data.waiting===null)item('Espera por verificar','No se pudo confirmar el total de solicitudes en espera.','horario');
        else if(data.waiting>0)item(data.waiting+(data.waiting===1?' solicitud en espera':' solicitudes en espera'),'En clases no canceladas de hoy. Una persona puede tener varias solicitudes.','horario');
        if(data.uncertain===null||data.uncertain>0||data.agendaPartial)item('Agenda por verificar',data.uncertain===null?'No se pudieron consultar las clases de hoy.':data.uncertain+(data.uncertain===1?' clase con información por confirmar.':' clases con información por confirmar.')+(data.agendaPartial?' La consulta de reservas o espera está incompleta.':''),'horario');
        if(data.waiting===0&&data.uncertain===0&&!data.agendaPartial)item('Sin alertas de agenda','En los registros consultados de hoy.');
      }
      if(data.canCustomers)item('Membresías por verificar','Este resumen todavía no acredita vigencias ni saldos individuales. Consulta la ficha antes de tomar decisiones.','clientes');
      if(data.canMoney&&data.total===null)item('Cobros por verificar','La consulta de importes está incompleta o falló. Actualiza antes de usar el total.');
      if(data.visits===null)item('Check-ins por verificar','No se pudo confirmar el conteo de hoy.');
      schedule.append(node('p','fd-muted','Horarios de inicio · '+dateLabel(data.date)));
      if(!data.canAgenda)schedule.append(node('p','fd-empty','Agenda no disponible para este rol.'));
      else if(!data.events)schedule.append(node('p','fd-empty','No pudimos consultar la agenda.'));
      else if(!data.events.length)schedule.append(node('p','fd-empty','No hay clases programadas para hoy.'));
      else{
        for(const event of data.events.slice(0,6)){
          const row=node('div','fd-event'),body=node('div','fd-event-body'),occupancy=node('div','fd-occupancy');
          body.append(node('strong','',event.activity),node('span','fd-muted',event.coach));
          const state=event.state==='canceled'?'Cancelada':event.state==='unknown'?'Por verificar':event.reserved+' / '+event.capacity+' reservas';
          occupancy.append(node('strong','',state));
          if(event.state!=='canceled')occupancy.append(node('span','fd-muted',event.wait===null?'Espera por verificar':event.wait+' en espera'));
          row.dataset.state=event.state;row.append(node('time','fd-time',event.time),body,occupancy);schedule.append(row);
        }
        if(data.events.length>6)schedule.append(node('p','fd-muted','Mostrando 6 de '+data.events.length+' clases.'));
      }
      if(data.canAgenda)schedule.append(button('Ver agenda ↗',()=>onNavigate('horario')));
      columns.append(attention,schedule);content.append(columns);
      if(data.canMoney){
        const chart=card('Cobros registrados por día','fd-trend');chart.append(node('p','fd-muted',dateLabel(data.start)+' — '+dateLabel(data.date)+' · MXN'));
        if(!data.series)chart.append(node('p','fd-empty','No hay un total confirmado para graficar.'));
        else{
          const bars=node('div','fd-bars');bars.setAttribute('aria-hidden','true');const max=Math.max(1,...data.series.map(d=>d.amount));
          for(const day of data.series){const column=node('div','fd-bar-column'),bar=node('span','fd-bar');bar.style.height=(day.amount/max*100)+'%';column.title=dateLabel(day.date)+': '+currency.format(day.amount);column.append(bar,node('small','',String(Number(day.date.slice(8)))));bars.append(column);}
          chart.append(bars);const details=node('details'),summary=node('summary','','Ver importes por día');details.append(summary);
          const table=node('table');table.setAttribute('aria-label','Cobros registrados por día');const header=node('tr');for(const text of ['Fecha','Importe MXN']){const th=node('th','',text);th.scope='col';header.append(th);}const thead=node('thead');thead.append(header);table.append(thead);const tbody=node('tbody');for(const day of data.series){const row=node('tr');row.append(node('td','',dateLabel(day.date)),node('td','',currency.format(day.amount)));tbody.append(row);}table.append(tbody);details.append(table);chart.append(details);
        }
        content.append(chart);
      }
    }
    return{update,dispose(){disposed=true;root.replaceChildren();}};
  }
  window.VelumDashboardView=Object.freeze({mount});
})();
