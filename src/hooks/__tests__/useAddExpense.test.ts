import { renderHook, act } from '@testing-library/react';
// Hook under test and its input type
import { useAddExpense, AddExpenseData } from '../useAddExpense';

// Mock the Supabase client that the hook relies on
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

// Mock profile context used by the hook
jest.mock('../../contexts/ProfileContext', () => ({
  useProfile: jest.fn(),
  getOrCreateProfileId: jest.fn(),
}));

import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/ProfileContext';

// Tests around creating a new expense and generating the corresponding splits
describe('useAddExpense', () => {
  beforeEach(() => {
    // Ensure mocks from previous tests don't affect the current one
    jest.resetAllMocks();
  });

  // When splitMode is "equal" each member should pay the same amount
  it('adds an expense with equal split', async () => {
    // Provide a profile id from context
    (useProfile as jest.Mock).mockReturnValue({
      profileId: 'p1',
      loading: false,
      error: null,
      refresh: jest.fn(),
      reset: jest.fn(),
    });

    const expense = { id: 'e1' };

    // Mock all database calls used by the hook
    const expenseInsert = jest.fn(() => ({ select: () => ({ single: jest.fn().mockResolvedValue({ data: expense, error: null }) }) }));
    const membershipsSelect = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null }) }));
    const splitsInsert = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'expenses') return { insert: expenseInsert };
      if (table === 'memberships') return { select: membershipsSelect };
      if (table === 'expense_splits') return { insert: splitsInsert };
      return {} as any;
    });

    // Render the hook so we can call its methods
    const { result } = renderHook(() => useAddExpense());

    expect(result.current).toBeDefined();

    // Data passed into the hook to create the expense
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

    // The hook should calculate two equal splits
    const expectedSplits = [
      { expense_id: 'e1', user_id: 'u1', share: 0.5, amount: 50 },
      { expense_id: 'e1', user_id: 'u2', share: 0.5, amount: 50 },
    ];

    expect(splitsInsert).toHaveBeenCalledWith(expectedSplits);
  });

  // When splitMode is "shares" the amounts are divided based on share values
  it('adds an expense with share splits', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profileId: 'p1',
      loading: false,
      error: null,
      refresh: jest.fn(),
      reset: jest.fn(),
    });

    const expense = { id: 'e1' };

    // Again mock the required database methods
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

    // Shares define that user u1 has 1 part and u2 has 2 parts of the total
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

    // Expect one third vs two thirds of the amount based on shares
    const expectedSplits = [
      { expense_id: 'e1', user_id: 'u1', share: 1 / 3, amount: 30 },
      { expense_id: 'e1', user_id: 'u2', share: 2 / 3, amount: 60 },
    ];

    expect(splitsInsert).toHaveBeenCalledWith(expectedSplits);
  });
});
