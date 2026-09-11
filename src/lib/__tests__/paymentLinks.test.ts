import { openPaymentLink, paymentLinks } from '../paymentLinks';

it('encodes a single recipient, amount, and note in the Venmo payment route', () => {
  const links = paymentLinks('venmo', '@alex-smith', '12.34', 'Dinner & drinks?');
  expect(links.native).toBe('venmo://paycharge?txn=pay&recipients=alex-smith&amount=12.34&note=Dinner%20%26%20drinks%3F');
  expect(links.web).toMatch(/^https:\/\/venmo.com\/u\/alex-smith\?/);
});
it.each(['', 'https://evil.test', 'alex&recipients=other', 'alex,other', 'a/b'])('rejects unsafe or ambiguous recipient %s', handle => {
  expect(() => paymentLinks('venmo', handle, '10', '')).toThrow();
});
it('uses the native route and falls back to HTTPS only on failure', async () => {
  const links = paymentLinks('venmo', 'alex', '10', '');
  const open = jest.fn().mockRejectedValueOnce(new Error('App absent')).mockResolvedValueOnce(undefined);
  await openPaymentLink(links, true, open);
  expect(open.mock.calls).toEqual([[links.native], [links.web]]);
  open.mockClear();
  await openPaymentLink(links, false, open);
  expect(open.mock.calls).toEqual([[links.web]]);
});
it('builds Cash App and PayPal payment links with the amount', () => {
  expect(paymentLinks('cashapp', '$Alex', '10', '').web).toBe('https://cash.app/$Alex/10.00');
  expect(paymentLinks('paypal', 'Alex', '10', '').web).toBe('https://www.paypal.com/paypalme/Alex/10.00USD');
});
