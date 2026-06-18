import { renderHook, act } from '@testing-library/react';
import { useUpdateExpense } from '../useUpdateExpense';
import { AddExpenseData } from '../useAddExpense';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { supabase } from '../../lib/supabase';

describe('useUpdateExpense', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('invokes the update_expense Edge Function with equal split payload', async () => {
    const updatedExpense = { id: 'e1', description: 'Dinner' };
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { expense: updatedExpense },
      error: null,
    });

    const { result } = renderHook(() => useUpdateExpense());

    const data: AddExpenseData = {
      description: 'Dinner',
      amount: 80,
      date: '2026-06-16',
      splitMode: 'equal',
      participantIds: ['p1', 'p2'],
    };

    let resultValue;
    await act(async () => {
      resultValue = await result.current.updateExpense('e1', data);
    });

    expect(resultValue).toEqual(updatedExpense);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('update_expense', {
      body: {
        expense_id: 'e1',
        description: 'Dinner',
        amount: 80,
        date: '2026-06-16',
        split_mode: 'equal',
        participant_ids: ['p1', 'p2'],
        shares: undefined,
      },
    });
  });

  it('maps custom share user ids for the Edge Function payload', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { expense: { id: 'e1' } },
      error: null,
    });

    const { result } = renderHook(() => useUpdateExpense());

    await act(async () => {
      await result.current.updateExpense('e1', {
        description: 'Trip',
        amount: 120,
        date: '2026-06-16',
        splitMode: 'shares',
        participantIds: ['p1', 'p2'],
        shares: [
          { userId: 'p1', share: 25 },
          { userId: 'p2', share: 75 },
        ],
      });
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('update_expense', {
      body: expect.objectContaining({
        split_mode: 'shares',
        shares: [
          { user_id: 'p1', share: 25 },
          { user_id: 'p2', share: 75 },
        ],
      }),
    });
  });
});
