/* Agenda de lectura: identidad por horario+fecha; no determina derechos ni modifica reservas. */
(function(){
 'use strict';
 const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 function validDate(s){if(typeof s!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
 function add(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 function timeMinutes(time){const m=String(time).trim().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);if(!m)return 9999;let h=Number(m[1]),n=Number(m[2]);if(n>59||h>23||(m[3]&&(h<1||h>12)))return 9999;if(m[3])h=h%12+(m[3].toLowerCase()==='pm'?12:0);return h*60+n;}
 function rows(result,gym){
  if(result?.error||!Array.isArray(result?.data)||!Number.isSafeInteger(result.count)||result.count!==result.data.length)return null;
  const ids=new Set(),own=[];
  for(const row of result.data){
   if(String(row?.gym_id)!==String(gym))continue;
   if(!uuid(row.id)||ids.has(row.id.toLowerCase()))return null;
   ids.add(row.id.toLowerCase());own.push({...row,id:row.id.toLowerCase(),horario_id:typeof row.horario_id==='string'?row.horario_id.toLowerCase():row.horario_id});
  }
  return own;
 }
 function build({gym,date,span=1,horarios,cancelaciones,reservas,espera}){
  if(!validDate(date)||![1,7].includes(span))return {status:'error',events:[]};
  const schedules=rows(horarios,gym);
  if(!schedules||schedules.some(h=>typeof h.hora!=='string'||typeof h.tipo!=='string'||typeof h.dia!=='string'||typeof h.fecha!=='string'))return {status:'error',events:[]};
  const canceled=rows(cancelaciones,gym),bookings=rows(reservas,gym),waiting=rows(espera,gym);
  const validRelation=r=>uuid(r.horario_id)&&validDate(r.fecha);
  const cancellationsKnown=!!canceled&&canceled.every(validRelation);
  // Reservas sin vínculo no se atribuyen por nombre/hora; desconocidos impiden afirmar disponibilidad.
  const bookingsKnown=!!bookings&&bookings.every(r=>validRelation(r)&&typeof r.estado==='string');
  const waitingKnown=!!waiting&&waiting.every(r=>validRelation(r)&&r.estado==='espera');
  const events=[];
  for(let offset=0;offset<span;offset++){
   const current=add(date,offset),day=days[new Date(current+'T12:00:00Z').getUTCDay()];
   const overrides=schedules.filter(h=>h.fecha===current),overridden=new Set(overrides.map(h=>h.hora));
   const effective=[...schedules.filter(h=>h.fecha===''&&h.dia===day&&!overridden.has(h.hora)),...overrides].filter(h=>h.tipo!=='CERRADO');
   for(const h of effective){
    const related=r=>r.horario_id===h.id&&r.fecha===current;
    const cancelled=cancellationsKnown?canceled.some(related):null;
    const reserved=bookingsKnown?bookings.filter(r=>related(r)&&r.estado!=='cancelado').length:null;
    const capacity=Number.isSafeInteger(h.cupo)&&h.cupo>0?h.cupo:null;
    const wait=waitingKnown?waiting.filter(related).length:null;
    const state=cancelled===true?'canceled':cancelled===null||reserved===null||capacity===null?'unknown':reserved>=capacity?'full':'open';
    events.push({key:current+'/'+h.id,id:h.id,date:current,time:h.hora,start:timeMinutes(h.hora),activity:h.tipo||'Clase',coach:typeof h.coach_nombre==='string'&&h.coach_nombre.trim()?h.coach_nombre:'Instructor por confirmar',reserved,capacity,wait,state});
   }
  }
  events.sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start||a.id.localeCompare(b.id));
  return {status:'ready',events,partial:!cancellationsKnown||!bookingsKnown||!waitingKnown};
 }
 const api={validDate,add,timeMinutes,build};if(typeof module!=='undefined')module.exports=api;if(typeof window!=='undefined')window.VelumAgendaModel=Object.freeze(api);
})();
