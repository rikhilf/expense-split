import { moneyToCents } from './settlementBalances';

export type PaymentProvider = 'venmo' | 'cashapp' | 'paypal';
export const providerLabels: Record<PaymentProvider, string> = { venmo: 'Venmo', cashapp: 'Cash App', paypal: 'PayPal' };

export function paymentLinks(provider: PaymentProvider, handle: string, amount: string, note: string) {
  const clean = handle.trim().replace(/^[@$]/, '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(clean)) throw new Error('Enter a payment username, not a URL, email, or phone number.');
  const cents = moneyToCents(amount);
  if (cents <= 0) throw new Error('Enter a positive payment amount.');
  const value = (cents / 100).toFixed(2);
  const user = encodeURIComponent(clean);
  // Venmo's app route is best effort; opening it does not verify the recipient or payment.
  const query = `txn=pay&recipients=${user}&amount=${value}&note=${encodeURIComponent(note || 'Expense settlement')}`;
  if (provider === 'venmo') return { native: `venmo://paycharge?${query}`, web: `https://venmo.com/u/${user}?${query}` };
  if (provider === 'cashapp') return { native: null, web: `https://cash.app/$${user}/${value}` };
  return { native: null, web: `https://www.paypal.com/paypalme/${user}/${value}USD` };
}

export async function openPaymentLink(links: ReturnType<typeof paymentLinks>, native: boolean, openURL: (url: string) => Promise<unknown>) {
  if (native && links.native) {
    try { await openURL(links.native); return; } catch { /* App absent: use HTTPS fallback. */ }
  }
  await openURL(links.web);
}
