import {
  BalanceSettlement, calculateBalances, centsToMoney, moneyToCents, suggestSettlements,
} from '../settlementBalances';

const expenses = [{ id: 'dinner', amount: 90, created_by: 'alex' }];
const splits = ['alex', 'bailey', 'casey'].map(user_id => ({ expense_id: 'dinner', user_id, amount: 30 }));
const payment: BalanceSettlement = {
  id: 'payment', paid_by: 'bailey', paid_to: 'alex', amount: 20, status: 'confirmed',
};

describe('money conversion', () => {
  test.each([[0, 0], [0.29, 29], [19.99, 1999], ['12.30', 1230], [-2.15, -215], [0.1 + 0.2, 30]])(
    'converts %s to exact integer cents', (amount, cents) => {
      expect(moneyToCents(amount)).toBe(cents);
      expect(moneyToCents(centsToMoney(cents as number))).toBe(cents);
    },
  );
  test.each([NaN, Infinity, -Infinity, 1.005, '1.001', '', ' ', '1e2', '$2', Number.MAX_VALUE])(
    'rejects invalid or lossy money %s', amount => expect(() => moneyToCents(amount)).toThrow(),
  );
  test('rejects fractional or unsafe cents', () => {
    expect(() => centsToMoney(1.1)).toThrow();
    expect(() => centsToMoney(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});

describe('group balances', () => {
  test('credits payer and debits consumed shares, including payer share', () => {
    expect(calculateBalances(expenses, splits, [])).toEqual([
      { profileId: 'alex', balanceCents: 6000 },
      { profileId: 'bailey', balanceCents: -3000 },
      { profileId: 'casey', balanceCents: -3000 },
    ]);
  });
  test('confirmed partial payment changes balances without changing original splits', () => {
    const before = JSON.stringify(splits);
    expect(calculateBalances(expenses, splits, [payment])).toEqual([
      { profileId: 'alex', balanceCents: 4000 },
      { profileId: 'bailey', balanceCents: -1000 },
      { profileId: 'casey', balanceCents: -3000 },
    ]);
    expect(JSON.stringify(splits)).toBe(before);
  });
  test.each(['pending', 'voided'] as const)('%s payment has no balance impact', status => {
    expect(calculateBalances(expenses, splits, [{ ...payment, status }]))
      .toEqual(calculateBalances(expenses, splits, []));
  });
  test('profile payer may be a placeholder, different from creator, and excluded from shares', () => {
    expect(calculateBalances(
      [{ id: 'e', amount: '10.00', paid_by: 'placeholder', created_by: 'admin' }],
      [{ expense_id: 'e', user_id: 'member', amount: 10 }], [], ['admin'],
    )).toEqual([
      { profileId: 'admin', balanceCents: 0 },
      { profileId: 'member', balanceCents: -1000 },
      { profileId: 'placeholder', balanceCents: 1000 },
    ]);
  });
  test('cent remainder allocations remain zero sum', () => {
    const balances = calculateBalances([{ id: 'e', amount: 10, created_by: 'a' }], [
      { expense_id: 'e', user_id: 'a', amount: 3.34 },
      { expense_id: 'e', user_id: 'b', amount: 3.33 },
      { expense_id: 'e', user_id: 'c', amount: 3.33 },
    ], []);
    expect(balances.map(b => b.balanceCents)).toEqual([666, -333, -333]);
    expect(balances.reduce((sum, b) => sum + b.balanceCents, 0)).toBe(0);
  });
  test('empty ledger and zero balance members are safe', () => {
    expect(calculateBalances([], [], [])).toEqual([]);
    expect(calculateBalances([], [], [], ['p', 'p'])).toEqual([{ profileId: 'p', balanceCents: 0 }]);
  });
  test('regression: incomplete expense write cannot produce misleading settlement suggestions', () => {
    expect(() => calculateBalances(expenses, [], [])).toThrow('splits must add up');
    expect(() => calculateBalances(expenses, splits.slice(1), [])).toThrow('splits must add up');
  });
  test('rejects duplicate ledger rows and unknown expenses', () => {
    expect(() => calculateBalances([...expenses, ...expenses], splits, [])).toThrow('Duplicate expense');
    expect(() => calculateBalances(expenses, [...splits, splits[0]], [])).toThrow('Duplicate participant split');
    expect(() => calculateBalances(expenses, splits, [payment, payment])).toThrow('Duplicate settlement');
    expect(() => calculateBalances([], splits, [])).toThrow('no matching expense');
  });
  test('rejects negative or invalid financial events', () => {
    expect(() => calculateBalances([{ ...expenses[0], amount: -90 }], splits, [])).toThrow();
    expect(() => calculateBalances(expenses, [{ ...splits[0], amount: -30 }], [])).toThrow();
    for (const amount of [0, -10, NaN, 1.001]) {
      expect(() => calculateBalances(expenses, splits, [{ ...payment, amount }])).toThrow();
    }
    expect(() => calculateBalances(expenses, splits, [{ ...payment, paid_to: 'bailey' }])).toThrow('yourself');
    expect(() => calculateBalances([{ ...expenses[0], created_by: '' }], splits, [])).toThrow('missing');
  });
  test('multiple partial payments fully settle; voiding one reopens only that amount', () => {
    const payments = [payment, { ...payment, id: 'p2', amount: 10 }, { ...payment, id: 'p3', paid_by: 'casey', amount: 30 }];
    expect(calculateBalances(expenses, splits, payments).every(b => b.balanceCents === 0)).toBe(true);
    expect(suggestSettlements(calculateBalances(expenses, splits, payments.map(p =>
      p.id === 'payment' ? { ...p, status: 'voided' as const } : p,
    )))).toEqual([{ paidByProfileId: 'bailey', paidToProfileId: 'alex', amountCents: 2000 }]);
  });
});

describe('settlement suggestions', () => {
  test('largest remaining debts first; stable ID tie breaks independent of input order', () => {
    const balances = [
      { profileId: 'b', balanceCents: -3000 }, { profileId: 'a', balanceCents: -3000 },
      { profileId: 'c', balanceCents: 4000 }, { profileId: 'd', balanceCents: 2000 },
    ];
    const original = JSON.stringify(balances);
    expect(suggestSettlements(balances)).toEqual([
      { paidByProfileId: 'a', paidToProfileId: 'c', amountCents: 3000 },
      { paidByProfileId: 'b', paidToProfileId: 'd', amountCents: 2000 },
      { paidByProfileId: 'b', paidToProfileId: 'c', amountCents: 1000 },
    ]);
    expect(suggestSettlements([...balances].reverse())).toEqual(suggestSettlements(balances));
    expect(JSON.stringify(balances)).toBe(original);
  });
  test('suggestions settle varied zero-sum ledgers exactly with positive integer transfers', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const balances = Array.from({ length: 8 }, (_, i) => ({
        profileId: `p${i}`, balanceCents: ((seed * (i + 7) * 37) % 2001) - 1000,
      }));
      balances.push({ profileId: 'last', balanceCents: -balances.reduce((sum, b) => sum + b.balanceCents, 0) });
      const remaining = new Map(balances.map(b => [b.profileId, b.balanceCents]));
      const suggestions = suggestSettlements(balances);
      for (const s of suggestions) {
        expect(Number.isSafeInteger(s.amountCents) && s.amountCents > 0).toBe(true);
        remaining.set(s.paidByProfileId, remaining.get(s.paidByProfileId)! + s.amountCents);
        remaining.set(s.paidToProfileId, remaining.get(s.paidToProfileId)! - s.amountCents);
      }
      expect([...remaining.values()].every(v => v === 0)).toBe(true);
      expect(suggestions.length).toBeLessThanOrEqual(balances.length - 1);
    }
  });
  test('empty/settled balances need no payments', () => {
    expect(suggestSettlements([])).toEqual([]);
    expect(suggestSettlements([{ profileId: 'p', balanceCents: 0 }])).toEqual([]);
  });
  test('rejects unbalanced, duplicate, fractional, or unsafe balances', () => {
    expect(() => suggestSettlements([{ profileId: 'a', balanceCents: 1 }])).toThrow('sum to zero');
    expect(() => suggestSettlements([{ profileId: 'a', balanceCents: 0 }, { profileId: 'a', balanceCents: 0 }])).toThrow('Duplicate');
    expect(() => suggestSettlements([{ profileId: 'a', balanceCents: 0.1 }])).toThrow();
    expect(() => suggestSettlements([{ profileId: 'a', balanceCents: Infinity }])).toThrow();
  });
});
