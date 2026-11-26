/* Indicadores de registros, sin inferir derechos por nombre ni liquidación bancaria. */
(function(root, factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.VelumDashboardModel=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  function validDate(s){if(typeof s!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
  const count=r=>r&&!r.error&&Number.isSafeInteger(r.count)&&r.count>=0?r.count:null;
  function build({gym,date,payments,customers,visits,agenda,canMoney}){
    if(!validDate(date))return {status:'error'};
    const start=date.slice(0,8)+'01';
    let total=null,series=null;
    if(canMoney&&payments&&!payments.error&&Array.isArray(payments.data)&&count(payments)===payments.data.length&&payments.data.every(p=>String(p.gym_id)===String(gym)&&validDate(p.fecha)&&p.fecha>=start&&p.fecha<=date&&Number.isFinite(p.monto)&&p.monto>=0&&Math.round(p.monto*100)/100===p.monto)){
      const sum=payments.data.reduce((sum,p)=>sum+Math.round(p.monto*100),0);
      if(Number.isSafeInteger(sum)){
        total=sum/100;series=Array.from({length:Number(date.slice(8))},(_,i)=>({date:date.slice(0,8)+String(i+1).padStart(2,'0'),amount:0}));
        for(const p of payments.data)series[Number(p.fecha.slice(8))-1].amount+=Math.round(p.monto*100);
        for(const day of series)day.amount/=100;
      }
    }
    const events=agenda?.status==='ready'?agenda.events:null;
    const waiting=events&&!agenda.partial&&events.every(e=>e.wait!==null)?events.filter(e=>e.state!=='canceled').reduce((sum,e)=>sum+e.wait,0):null;
    const uncertain=events?events.filter(e=>e.state==='unknown'||e.coach==='Instructor por confirmar'||e.start===9999).length:null;
    return {status:'ready',date,start,total,series,canMoney:!!canMoney,customers:count(customers),visits:count(visits),events,
      classes:events?.length??null,waiting,uncertain,agendaPartial:!events||!!agenda.partial};
  }
  return Object.freeze({build,validDate});
});
