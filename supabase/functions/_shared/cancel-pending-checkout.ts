import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Checkout = {
  id:string; mode:string; status:string; payment_status?:string;
  metadata?:Record<string,string>;
};
type Stripe = (path:string, method:'GET'|'POST', account:string) => Promise<any>;
type Pending = {
  id:number; gym_id:number; package_id:number; customer_email:string; stripe_account_id:string;
  stripe_subscription_id:string|null; stripe_checkout_session_id:string|null; status:string;
  created_at:string; updated_at:string;
};

export class PendingCheckoutError extends Error {
  readonly status:number;
  constructor(message:string,status=409){ super(message); this.status=status; }
}
const ambiguous = () => new PendingCheckoutError('No se pudo identificar un solo enlace de Stripe para esta activación anterior. Revisa la sesión en Stripe antes de cancelarla.');
function matches(session:Checkout, row:Pending){
  const m=session.metadata;
  return session.mode==='subscription' && m?.velum_member_sub==='true' && Number(m.gym_id)===row.gym_id &&
    Number(m.package_id)===row.package_id && String(m.customer_email||'').trim().toLowerCase()===row.customer_email.trim().toLowerCase();
}

// Los enlaces históricos se emitían antes de crear (o actualizar) la fila. Nunca elegir por nombre.
async function legacySession(db:SupabaseClient,row:Pending,stripe:Stripe){
  if (!row.customer_email) throw ambiguous();
  const {data:siblings,error}=await db.from('member_subscriptions').select('id').eq('gym_id',row.gym_id)
    .eq('package_id',row.package_id).eq('customer_email',row.customer_email).is('stripe_checkout_session_id',null)
    .eq('status','incomplete').limit(2);
  if(error) throw error;
  if(siblings?.length!==1 || siblings[0].id!==row.id) throw ambiguous();
  const from=Math.floor(Date.parse(row.created_at)/1000)-120;
  const until=Math.ceil(Date.parse(row.updated_at||row.created_at)/1000)+30;
  if(!Number.isFinite(from) || !Number.isFinite(until)) throw ambiguous();
  const q=new URLSearchParams({limit:'100','created[gte]':String(from),'created[lte]':String(until)});
  let found:Checkout|undefined;
  for(let page=0;page<20;page++){
    const res=await stripe('/checkout/sessions?'+q,'GET',row.stripe_account_id);
    if(!Array.isArray(res.data) || typeof res.has_more!=='boolean') throw ambiguous();
    for(const s of res.data){
      if(s.metadata?.core_checkout==='tracked' || !matches(s,row)) continue;
      if(found) throw ambiguous();
      found=s;
    }
    if(!res.has_more){if(found) return found;throw ambiguous();}
    const cursor=res.data.at(-1)?.id;
    if(!cursor || cursor===q.get('starting_after')) throw ambiguous();
    q.set('starting_after',cursor);
  }
  throw ambiguous();
}

async function expire(session:Checkout,account:string,stripe:Stripe){
  const path='/checkout/sessions/'+encodeURIComponent(session.id);
  if(session.status==='open' && session.payment_status!=='paid'){
    // Si el cliente paga a la vez o se pierde la respuesta, Stripe decide qué ocurrió primero.
    try {session=await stripe(path+'/expire','POST',account);}
    catch {session=await stripe(path,'GET',account);}
  }
  if(session.status!=='expired' || session.payment_status==='paid')
    throw new PendingCheckoutError('El enlace ya se completó o está procesando el pago. Actualiza los movimientos para ver su estado.');
}

export async function cancelPendingCheckout(db:SupabaseClient,gym:number,body:{kind?:string;id?:number;token?:string},stripe:Stripe){
  if(body.kind==='link' && /^[A-Za-z0-9_-]{16,64}$/.test(body.token||'')){
    const {data:link,error}=await db.from('payment_links').select('session_id').eq('gym_id',gym).eq('token',body.token!).maybeSingle();
    if(error) throw error;
    if(!link) throw new PendingCheckoutError('No encontramos este enlace en tu gimnasio.',404);
    const {data:g,error:ge}=await db.from('gyms').select('stripe_account_id').eq('id',gym).maybeSingle();
    if(ge) throw ge;
    if(!g?.stripe_account_id) throw ambiguous();
    const session=await stripe('/checkout/sessions/'+encodeURIComponent(link.session_id),'GET',g.stripe_account_id);
    if(session.id!==link.session_id || session.mode!=='payment' || Number(session.metadata?.gym_id)!==gym || session.metadata?.source!=='manual_link') throw ambiguous();
    await expire(session,g.stripe_account_id,stripe);
    const {error:saveError}=await db.from('payment_links').update({vence:new Date().toISOString()}).eq('gym_id',gym).eq('token',body.token!);
    if(saveError) throw saveError;
    return {canceled:true};
  }
  if(body.kind!=='activation' || !Number.isSafeInteger(body.id) || Number(body.id)<1) throw new PendingCheckoutError('Referencia de activación inválida.',400);
  const {data,error}=await db.from('member_subscriptions').select('id,gym_id,package_id,customer_email,stripe_account_id,stripe_subscription_id,stripe_checkout_session_id,status,created_at,updated_at')
    .eq('gym_id',gym).eq('id',body.id!).maybeSingle();
  if(error) throw error;
  const row=data as Pending|null;
  if(!row) throw new PendingCheckoutError('No encontramos esta activación en tu gimnasio.',404);
  if(row.stripe_subscription_id) throw new PendingCheckoutError('Ya existe una suscripción. Revisa su estado en Administrar mensualidades.');
  if(row.status==='canceled') return {canceled:true};
  if(row.status!=='incomplete' || !row.stripe_account_id) throw ambiguous();
  const session=row.stripe_checkout_session_id
    ? await stripe('/checkout/sessions/'+encodeURIComponent(row.stripe_checkout_session_id),'GET',row.stripe_account_id)
    : await legacySession(db,row,stripe);
  if(!matches(session,row) || (row.stripe_checkout_session_id && row.stripe_checkout_session_id!==session.id)) throw ambiguous();
  await expire(session,row.stripe_account_id,stripe);
  const {data:saved,error:saveError}=await db.from('member_subscriptions')
    .update({status:'canceled',stripe_checkout_session_id:session.id,canceled_at:new Date().toISOString()})
    .eq('id',row.id).eq('gym_id',gym).in('status',['incomplete','canceled']).is('stripe_subscription_id',null).select('id').maybeSingle();
  if(saveError) throw saveError;
  if(!saved) throw new PendingCheckoutError('La activación cambió. Actualiza los movimientos.');
  return {canceled:true};
}
