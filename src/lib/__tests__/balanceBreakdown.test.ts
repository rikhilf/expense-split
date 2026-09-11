import { balanceBreakdown } from '../balanceBreakdown';
import type { LedgerExpense, SettlementRecord } from '../../types/settlements';

const expenses = [{ id: 'dinner', amount: 90, paid_by: 'alex', created_by: 'recorder', description: 'Dinner', date: '2026-09-11', expense_splits: ['alex', 'bailey', 'placeholder'].map(user_id => ({ expense_id: 'dinner', user_id, amount: 30 })) }] as LedgerExpense[];
const payment = { id: 's1', paid_by: 'bailey', paid_to: 'alex', amount: 20, status: 'confirmed', created_at: '2026-09-11' } as SettlementRecord;

it('explains actual payer credit, personal shares, and both sides of confirmed payments', () => {
  const alex = balanceBreakdown('alex', expenses, [payment], 4000);
  expect(alex.map(line => line.cents)).toEqual([9000, -3000, -2000]);
  expect(alex.reduce((total, line) => total + line.cents, 0)).toBe(4000);
  expect(balanceBreakdown('bailey', expenses, [payment], -1000).map(line => line.cents)).toEqual([-3000, 2000]);
  expect(balanceBreakdown('placeholder', expenses, [payment], -3000).map(line => line.cents)).toEqual([-3000]);
  expect(balanceBreakdown('recorder', expenses, [payment], 0)).toEqual([]);
});

it.each(['pending', 'voided'] as const)('excludes %s records from the explanation', status => {
  expect(balanceBreakdown('bailey', expenses, [{ ...payment, status }], -3000).map(line => line.cents)).toEqual([-3000]);
});

it('rejects missing details or stale data rather than presenting an incorrect total', () => {
  expect(() => balanceBreakdown('alex', [], [], 6000)).toThrow(/incomplete/);
  expect(() => balanceBreakdown('alex', expenses, [payment], 6000)).toThrow(/incomplete/);
  expect(() => balanceBreakdown('alex', [{ ...expenses[0], expense_splits: [] }], [], 6000)).toThrow(/add up/);
});
