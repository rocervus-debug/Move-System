// All arithmetic uses Stripe's integer minor units. Only MXN belongs in the MXN ledger.
export function stripeSettlement(charge: any, amountCents: number, expectedAppFee: number, direct: boolean) {
  const pending = {
    stripe_balance_transaction_id: null as string | null,
    stripe_available_on: null as string | null,
    stripe_fee_mxn: null as number | null,
    net_to_gym_mxn: null as number | null,
    velum_commission_mxn: expectedAppFee / 100,
  };
  const destination = !direct && charge?.transfer_data?.destination;
  const transfer = destination ? charge.transfer : null;
  if (destination && (transfer?.destination !== destination || charge.currency !== 'mxn' ||
      charge.amount !== amountCents || transfer.currency !== 'mxn' || !Number.isSafeInteger(transfer.amount) ||
      transfer.amount <= 0 || transfer.amount > amountCents)) return pending;
  const receivedCents = destination ? transfer.amount : amountCents;
  const bt = destination ? transfer.destination_payment?.balance_transaction : charge?.balance_transaction;
  if (!bt?.id || bt.currency !== 'mxn' || bt.amount !== receivedCents ||
      !Number.isSafeInteger(bt.fee) || bt.net !== receivedCents - bt.fee ||
      !Array.isArray(bt.fee_details) || !Number.isFinite(bt.available_on)) return pending;

  const includedAppFee = bt.fee_details.filter((f: any) => f.type === 'application_fee')
    .reduce((sum: number, f: any) => sum + f.amount, 0);
  if (!Number.isSafeInteger(includedAppFee) || includedAppFee < 0 || includedAppFee > bt.fee) return pending;
  // A destination charge can collect the platform fee separately from this transaction.
  const appFee = destination ? (charge.application_fee_amount ?? 0)
    : direct ? includedAppFee : (charge.application_fee_amount ?? expectedAppFee);
  if (!Number.isSafeInteger(appFee) || appFee < includedAppFee || appFee > receivedCents) return pending;
  return {
    stripe_balance_transaction_id: bt.id as string,
    stripe_available_on: new Date(bt.available_on * 1000).toISOString().slice(0, 10),
    stripe_fee_mxn: (bt.fee - includedAppFee) / 100,
    net_to_gym_mxn: (bt.net - (appFee - includedAppFee)) / 100,
    velum_commission_mxn: (amountCents - receivedCents + appFee) / 100,
  };
}

export async function withDestinationPayment(charge: any, get: (path: string, account?: string) => Promise<any>) {
  const destination = charge?.transfer_data?.destination;
  if (!destination || typeof charge.transfer !== 'string') return charge;
  const transfer = await get(`/transfers/${encodeURIComponent(charge.transfer)}`);
  if (transfer?.destination !== destination || typeof transfer.destination_payment !== 'string') return charge;
  const payment = await get(`/charges/${encodeURIComponent(transfer.destination_payment)}?expand[]=balance_transaction`, destination);
  if (payment?.id !== transfer.destination_payment) return charge;
  return { ...charge, transfer: { ...transfer, destination_payment: payment } };
}
