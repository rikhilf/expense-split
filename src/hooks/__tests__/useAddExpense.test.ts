import { renderHook, act } from '@testing-library/react';
import { useAddExpense, AddExpenseData } from '../useAddExpense';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

describe('useAddExpense', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('adds an expense with equal split', async () => {
    const user = { id: 'u1' };
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user } });

    const expense = { id: 'e1' };

    const expenseInsert = jest.fn(() => ({ select: () => ({ single: jest.fn().mockResolvedValue({ data: expense, error: null }) }) }));
    const membershipsSelect = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null }) }));
    const splitsInsert = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'expenses') return { insert: expenseInsert };
      if (table === 'memberships') return { select: membershipsSelect };
      if (table === 'expense_splits') return { insert: splitsInsert };
      return {} as any;
    });

    const { result } = renderHook(() => useAddExpense());

    expect(result.current).toBeDefined();

    const data: AddExpenseData = {
      description: 'd',
      amount: 100,
      date: '2020-01-01',
      splitMode: 'equal',
    };

    let resultValue;
    await act(async () => {
      resultValue = await result.current.addExpense('g1', data);
    });
    expect(resultValue).toEqual(expense);

    const expectedSplits = [
      { expense_id: 'e1', user_id: 'u1', share: 0.5, amount: 50 },
      { expense_id: 'e1', user_id: 'u2', share: 0.5, amount: 50 },
    ];

    expect(splitsInsert).toHaveBeenCalledWith(expectedSplits);
  });

  it('adds an expense with share splits', async () => {
    const user = { id: 'u1' };
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user } });

    const expense = { id: 'e1' };

    const expenseInsert = jest.fn(() => ({ select: () => ({ single: jest.fn().mockResolvedValue({ data: expense, error: null }) }) }));
    const membershipsSelect = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null }) }));
    const splitsInsert = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'expenses') return { insert: expenseInsert };
      if (table === 'memberships') return { select: membershipsSelect };
      if (table === 'expense_splits') return { insert: splitsInsert };
      return {} as any;
    });

    const { result } = renderHook(() => useAddExpense());

    const data: AddExpenseData = {
      description: 'd',
      amount: 90,
      date: '2020-01-01',
      splitMode: 'shares',
      shares: [
        { userId: 'u1', share: 1 },
        { userId: 'u2', share: 2 },
      ],
    };

    let resultValue;
    await act(async () => {
      resultValue = await result.current.addExpense('g1', data);
    });
    expect(resultValue).toEqual(expense);

    const expectedSplits = [
      { expense_id: 'e1', user_id: 'u1', share: 1 / 3, amount: 30 },
      { expense_id: 'e1', user_id: 'u2', share: 2 / 3, amount: 60 },
    ];

    expect(splitsInsert).toHaveBeenCalledWith(expectedSplits);
  });
});
