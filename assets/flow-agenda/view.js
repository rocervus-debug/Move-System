/* Agenda Flow: presentación de lectura, sin HTML construido con datos del servidor. */
(function(){
 'use strict';
 const fmt=new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long'});
 const dateLabel=date=>fmt.format(new Date(date+'T12:00:00Z'));
 const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const states={open:'Disponible',full:'Completa',canceled:'Cancelada',unknown:'Por verificar'};
 function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function mount(root,{today,onChange,canReceive,onReceive}){
  let date=today,span=1,snapshot={status:'loading',events:[]},disposed=false,returnTo=null;
  root.classList.add('flow-agenda');root.replaceChildren();
  function button(text,label,fn){const b=node('button','',text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',fn);return b;}
  const head=node('header','fa-head'),intro=node('div');intro.append(node('p','fa-eyebrow','TU ESTUDIO, EN MOVIMIENTO'),node('h2','','Agenda'),node('p','fa-muted','Cada clase, en su momento.'));
  const search=node('input');search.type='search';search.placeholder='Buscar clase o instructor…';search.setAttribute('aria-label','Buscar clase o instructor');head.append(intro,search);
  const surface=node('section','fa-surface'),toolbar=node('div','fa-toolbar'),nav=node('div','fa-navigation'),title=node('h3');
  function request(){hideDetail();onChange(date,span);}
  function shift(n){const next=VelumAgendaModel.add(date,n);if(VelumAgendaModel.validDate(next)&&VelumAgendaModel.validDate(VelumAgendaModel.add(next,span-1))){date=next;input.value=date;request();}}
  nav.append(button('←','Periodo anterior',()=>shift(-span)),button('→','Periodo siguiente',()=>shift(span)),title);
  const input=node('input');input.type='date';input.value=today;input.min='2000-01-01';input.max='2099-12-25';input.setAttribute('aria-label','Fecha de la agenda');
  input.addEventListener('change',()=>{if(VelumAgendaModel.validDate(input.value)&&VelumAgendaModel.validDate(VelumAgendaModel.add(input.value,span-1))){date=input.value;request();}else input.value=date;});
  const controls=node('div','fa-controls'),modes=node('div','fa-modes');modes.setAttribute('aria-label','Periodo de agenda');
  const day=button('Día',null,()=>setSpan(1)),upcoming=button('Próximas',null,()=>setSpan(7));modes.append(day,upcoming);
  function setSpan(value){span=value;request();}
  controls.append(button('Hoy',null,()=>{date=today;input.value=today;request();}),input,modes);toolbar.append(nav,controls);
  const filters=node('div','fa-filters');
  function select(label){const s=node('select');s.setAttribute('aria-label',label);s.addEventListener('change',renderList);return s;}
  const activity=select('Actividad'),coach=select('Instructor'),count=node('span','fa-muted');
  function options(select,values,all){const previous=select.value;select.replaceChildren();const option=node('option','',all);option.value='';select.append(option);for(const value of [...new Set(values)].sort((a,b)=>a.localeCompare(b,'es'))){const o=node('option','',value);o.value=value;select.append(o);}select.value=values.includes(previous)?previous:'';}
  filters.append(activity,coach,button('Limpiar filtros',null,()=>{search.value='';activity.value='';coach.value='';renderList();}),count);
  const notice=node('p','fa-notice');notice.setAttribute('role','status');const list=node('div','fa-list');const detail=node('section','fa-detail');detail.hidden=true;detail.tabIndex=-1;detail.setAttribute('aria-label','Detalle de clase');
  function hideDetail(){detail.hidden=true;detail.replaceChildren();returnTo=null;}
  function showDetail(event,source){
   returnTo=source;detail.replaceChildren();detail.hidden=false;
   detail.append(node('p','fa-eyebrow',dateLabel(event.date)+' · '+event.time),node('h3','',event.activity));
   const dl=node('dl');for(const [label,value] of [['Instructor',event.coach],['Estado',states[event.state]],['Reservas',occupancy(event)],['En espera',event.wait===null?'Por verificar':String(event.wait)]]){dl.append(node('dt','',label),node('dd','',value));}
   detail.append(dl);
   if(canReceive?.(event)) detail.append(button('Abrir en recepción',null,()=>onReceive(event)));
   detail.append(button('Cerrar detalle',null,()=>{const previous=returnTo;hideDetail();previous?.focus();}));detail.focus();
  }
  detail.addEventListener('keydown',e=>{if(e.key==='Escape'){const previous=returnTo;hideDetail();previous?.focus();}});
  function occupancy(e){return (e.reserved===null?'Reservas por verificar':e.reserved+' reservas')+(e.capacity===null?' · Cupo por verificar':' / '+e.capacity+' lugares');}
  function renderList(){
   hideDetail();list.replaceChildren();
   const ready=snapshot.status==='ready';filters.hidden=!ready;count.textContent='';
   if(!ready){notice.textContent=snapshot.status==='loading'?'Cargando agenda…':'No pudimos consultar la agenda completa. Intenta actualizar.';if(snapshot.status==='error')list.append(button('Reintentar',null,request));return;}
   const query=normalize(search.value.trim());
   const events=snapshot.events.filter(e=>(!activity.value||e.activity===activity.value)&&(!coach.value||e.coach===coach.value)&&normalize(e.activity+' '+e.coach).includes(query));
   count.textContent=events.length+' '+(events.length===1?'clase':'clases')+' en vista';
   notice.textContent=snapshot.partial?'Hay información por verificar. La disponibilidad puede estar incompleta.':events.length?'Horarios de inicio · Consulta de solo lectura':'No hay clases para esta fecha y estos filtros.';
   let previousDate='';
   for(const e of events){
    if(e.date!==previousDate){list.append(node('h4','fa-date',dateLabel(e.date)));previousDate=e.date;}
    const row=button('',null,()=>showDetail(e,row));row.className='fa-event';row.dataset.key=e.key;row.dataset.state=e.state;
    const time=node('span','fa-time',e.time),body=node('span','fa-event-body'),meta=node('span','fa-event-meta');
    body.append(node('strong','',e.activity),node('span','fa-muted',e.coach));meta.append(node('span','fa-badge',states[e.state]),node('span','fa-muted',occupancy(e)));
    if(e.wait===null||e.wait>0)meta.append(node('span','fa-muted',e.wait===null?'Espera por verificar':e.wait+' en espera'));
    row.append(time,body,meta,node('span','fa-arrow','↗'));list.append(row);
   }
  }
  search.addEventListener('input',renderList);
  surface.append(toolbar,filters,notice,list);root.append(head,surface,detail);
  function update(next){if(disposed)return;snapshot=next;title.textContent=span===1?dateLabel(date):dateLabel(date)+' — '+dateLabel(VelumAgendaModel.add(date,6));day.setAttribute('aria-pressed',String(span===1));upcoming.setAttribute('aria-pressed',String(span===7));if(next.status==='ready'){options(activity,next.events.map(e=>e.activity),'Todas las actividades');options(coach,next.events.map(e=>e.coach),'Todo el equipo');}renderList();}
  return {update,dispose(){disposed=true;root.replaceChildren();}};
 }
 window.VelumAgendaView=Object.freeze({mount});
})();
