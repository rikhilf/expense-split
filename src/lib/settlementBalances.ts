/** All identities in this module are profiles.id, including placeholder members. */
export type ProfileBalance = { profileId: string; balanceCents: number };
export type SettlementSuggestion = {
  paidByProfileId: string;
  paidToProfileId: string;
  amountCents: number;
};
type Money = number | string;
export type BalanceExpense = {
  id: string;
  amount: Money;
  paid_by?: string | null;
  created_by: string;
};
export type BalanceSplit = { expense_id: string; user_id: string; amount: Money };
export type BalanceSettlement = {
  id: string;
  paid_by: string;
  paid_to: string;
  amount: Money;
  status: 'pending' | 'confirmed' | 'voided';
};

function safeCents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Amount exceeds safe integer cents');
  return value === 0 ? 0 : value;
}

/** Reject fractional cents instead of silently changing the recorded amount. */
export function moneyToCents(value: Money): number {
  if (typeof value === 'string' && !/^-?\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error('Amount must have at most two decimal places');
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('Amount must be a number');
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('Amount must be finite');
  const scaled = amount * 100;
  const cents = Math.round(scaled);
  // Accommodate binary floating-point noise (e.g. 0.29 * 100).
  if (Math.abs(scaled - cents) > 0.0000001) {
    throw new Error('Amount must have at most two decimal places');
  }
  return safeCents(cents);
}

export function centsToMoney(cents: number): number {
  return safeCents(cents) / 100;
}

function requireId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new Error('A profile or event ID is missing');
}

/** Positive balances receive money; negative balances owe money. One group/currency per call. */
export function calculateBalances(
  expenses: readonly BalanceExpense[],
  splits: readonly BalanceSplit[],
  settlements: readonly BalanceSettlement[],
  memberProfileIds: readonly string[] = [],
): ProfileBalance[] {
  const balances = new Map<string, number>();
  const adjust = (id: string, cents: number) => {
    requireId(id);
    balances.set(id, safeCents((balances.get(id) ?? 0) + cents));
  };
  memberProfileIds.forEach(id => adjust(id, 0));
  const expenseById = new Map<string, BalanceExpense>();
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    requireId(expense.id);
    if (expenseById.has(expense.id)) throw new Error('Duplicate expense');
    const amount = moneyToCents(expense.amount);
    if (amount <= 0) throw new Error('Expense amount must be positive');
    expenseById.set(expense.id, expense);
    totals.set(expense.id, 0);
    adjust(expense.paid_by ?? expense.created_by, amount);
  }
  const splitKeys = new Set<string>();
  for (const split of splits) {
    if (!expenseById.has(split.expense_id)) throw new Error('Split has no matching expense');
    const key = JSON.stringify([split.expense_id, split.user_id]);
    if (splitKeys.has(key)) throw new Error('Duplicate participant split');
    splitKeys.add(key);
    const amount = moneyToCents(split.amount);
    if (amount < 0) throw new Error('Split amount cannot be negative');
    totals.set(split.expense_id, safeCents(totals.get(split.expense_id)! + amount));
    adjust(split.user_id, -amount);
  }
  for (const expense of expenses) {
    if (totals.get(expense.id) !== moneyToCents(expense.amount)) {
      throw new Error('Expense splits must add up to the expense amount');
    }
  }
  const settlementIds = new Set<string>();
  for (const settlement of settlements) {
    requireId(settlement.id);
    if (settlementIds.has(settlement.id)) throw new Error('Duplicate settlement');
    settlementIds.add(settlement.id);
    if (!['pending', 'confirmed', 'voided'].includes(settlement.status)) {
      throw new Error('Unknown settlement status');
    }
    if (settlement.status !== 'confirmed') continue;
    if (settlement.paid_by === settlement.paid_to) throw new Error('Cannot settle with yourself');
    const amount = moneyToCents(settlement.amount);
    if (amount <= 0) throw new Error('Settlement amount must be positive');
    adjust(settlement.paid_by, amount);
    adjust(settlement.paid_to, -amount);
  }
  return [...balances].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([profileId, balanceCents]) => ({ profileId, balanceCents }));
}

/** Greedy debt simplification; deterministic, but not guaranteed globally fewest payments. */
export function suggestSettlements(balances: readonly ProfileBalance[]): SettlementSuggestion[] {
  const seen = new Set<string>();
  let total = 0;
  for (const balance of balances) {
    requireId(balance.profileId);
    if (seen.has(balance.profileId)) throw new Error('Duplicate profile balance');
    seen.add(balance.profileId);
    total = safeCents(total + safeCents(balance.balanceCents));
  }
  if (total !== 0) throw new Error('Balances must sum to zero');
  const debtors = balances.filter(b => b.balanceCents < 0)
    .map(b => ({ id: b.profileId, remaining: -b.balanceCents }));
  const creditors = balances.filter(b => b.balanceCents > 0)
    .map(b => ({ id: b.profileId, remaining: b.balanceCents }));
  const sort = (a: { id: string; remaining: number }, b: { id: string; remaining: number }) =>
    b.remaining - a.remaining || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const suggestions: SettlementSuggestion[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(sort);
    creditors.sort(sort);
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amountCents = Math.min(debtor.remaining, creditor.remaining);
    suggestions.push({ paidByProfileId: debtor.id, paidToProfileId: creditor.id, amountCents });
    debtor.remaining -= amountCents;
    creditor.remaining -= amountCents;
    if (!debtor.remaining) debtors.shift();
    if (!creditor.remaining) creditors.shift();
  }
  return suggestions;
}
