import { historyMonths, validatePaymentDate } from '../settlementHistory';
import type { SettlementRecord } from '../../types/settlements';

it('groups by actual payment month, reveals older months, and keeps old pending records accessible', () => {
  const rows = [
    { id: 'new', payment_date: '2026-08-31', created_at: '2026-09-11', status: 'confirmed' },
    { id: 'old', payment_date: '2026-05-01', created_at: '2026-09-11', status: 'confirmed' },
    { id: 'pending', created_at: '2026-01-01T12:00:00Z', status: 'pending' },
  ] as SettlementRecord[];
  const page = historyMonths(rows, 3, new Date(2026, 8, 11));
  expect(page.groups.map(group => group.key)).toEqual(['2026-08', '2026-01']);
  expect(page.older).toBe(true);
  expect(historyMonths(rows, 6, new Date(2026, 8, 11)).groups.flatMap(group => group.payments).map(row => row.id)).toEqual(['new', 'old', 'pending']);
  expect(rows).toHaveLength(3);
});
it.each(['2026-02-30', '2099-01-01', '2026-13-01', '09/11/2026'])('rejects invalid or future date %s', date => {
  expect(() => validatePaymentDate(date)).toThrow();
});
it('accepts a real historical payment date', () => { expect(() => validatePaymentDate('2024-02-29')).not.toThrow(); });
