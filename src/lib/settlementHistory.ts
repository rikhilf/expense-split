import type { SettlementRecord } from '../types/settlements';

export const localDate = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export function validatePaymentDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > localDate()) throw new Error('Enter a valid payment date (YYYY-MM-DD), no later than today.');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Enter a valid calendar date.');
}
export const paymentDate = (record: SettlementRecord) => record.payment_date || localDate(new Date(record.created_at));
export function historyMonths(records: SettlementRecord[], months: number, now = new Date()) {
  const cutoff = localDate(new Date(now.getFullYear(), now.getMonth() - months + 1, 1));
  const groups = new Map<string, SettlementRecord[]>();
  let older = false;
  for (const record of [...records].sort((a, b) => paymentDate(b).localeCompare(paymentDate(a)) || b.created_at.localeCompare(a.created_at))) {
    const date = paymentDate(record);
    if (date < cutoff && record.status !== 'pending') { older = true; continue; }
    const key = date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return { groups: [...groups].map(([key, payments]) => ({ key, label: new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), payments })), older };
}
