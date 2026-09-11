import { calculateBalances, moneyToCents } from './settlementBalances';
import type { LedgerExpense, SettlementRecord } from '../types/settlements';
import { paymentDate } from './settlementHistory';

export type BalanceLine = { key: string; label: string; cents: number; expense?: LedgerExpense };

export function balanceBreakdown(profileId: string, expenses: LedgerExpense[], settlements: SettlementRecord[], expectedCents: number): BalanceLine[] {
  const calculated = calculateBalances(expenses, expenses.flatMap(expense => expense.expense_splits), settlements);
  if ((calculated.find(balance => balance.profileId === profileId)?.balanceCents ?? 0) !== expectedCents) {
    throw new Error('The details have changed or are incomplete. Refresh to see the current breakdown.');
  }
  const lines: BalanceLine[] = [];
  for (const expense of expenses) {
    const title = expense.description || 'Untitled expense';
    if ((expense.paid_by ?? expense.created_by) === profileId) {
      lines.push({ key: `${expense.id}:paid`, label: `${title} · Paid for the group`, cents: moneyToCents(expense.amount), expense });
    }
    for (const split of expense.expense_splits.filter(split => split.user_id === profileId)) {
      lines.push({ key: `${expense.id}:share`, label: `${title} · Assigned share`, cents: -moneyToCents(split.amount), expense });
    }
  }
  for (const settlement of settlements.filter(payment => payment.status === 'confirmed')) {
    if (settlement.paid_by === profileId || settlement.paid_to === profileId) {
      const sent = settlement.paid_by === profileId;
      lines.push({ key: settlement.id, label: `Recorded payment ${sent ? 'sent' : 'received'} · ${paymentDate(settlement)}`, cents: moneyToCents(settlement.amount) * (sent ? 1 : -1) });
    }
  }
  return lines;
}
