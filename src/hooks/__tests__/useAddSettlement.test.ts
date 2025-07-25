import { renderHook, act } from '@testing-library/react';
import { useAddSettlement } from '../useAddSettlement';
import { useSettlements } from '../useSettlements';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getUser: jest.fn() },
  },
}));

import { supabase } from '../../lib/supabase';

describe('useAddSettlement', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('adds settlement with expense id and fetches it', async () => {
    const insert = jest.fn(() => ({
      select: () => ({
        single: jest.fn().mockResolvedValue({
          data: { id: 's1', group_id: 'g1', expense_id: 'e1' },
          error: null,
        }),
      }),
    }));
    const order = jest.fn().mockResolvedValue({
      data: [{ id: 's1', group_id: 'g1', expense_id: 'e1' }],
      error: null,
    });
    const eqExpense = jest.fn(() => ({ order }));
    const eqGroup = jest.fn(() => ({ eq: eqExpense }));
    const select = jest.fn(() => ({ eq: eqGroup }));

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'settlements') {
        return { insert, select } as any;
      }
      return {} as any;
    });

    const { result: addHook } = renderHook(() => useAddSettlement());

    await act(async () => {
      await addHook.current.addSettlement({
        group_id: 'g1',
        paid_by: 'u1',
        paid_to: 'u2',
        amount: 5,
        expense_id: 'e1',
      });
    });

    expect(insert).toHaveBeenCalledWith({
      group_id: 'g1',
      paid_by: 'u1',
      paid_to: 'u2',
      amount: 5,
      expense_id: 'e1',
    });

    const { result } = renderHook(() => useSettlements('g1', 'e1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.settlements).toEqual([
      { id: 's1', group_id: 'g1', expense_id: 'e1' },
    ]);
    expect(eqGroup).toHaveBeenCalledWith('group_id', 'g1');
    expect(eqExpense).toHaveBeenCalledWith('expense_id', 'e1');
  });

  it('adds settlement without expense id', async () => {
    const insert = jest.fn(() => ({
      select: () => ({
        single: jest.fn().mockResolvedValue({
          data: { id: 's2', group_id: 'g1', expense_id: null },
          error: null,
        }),
      }),
    }));

    (supabase.from as jest.Mock).mockReturnValue({ insert } as any);

    const { result: addHook } = renderHook(() => useAddSettlement());

    await act(async () => {
      await addHook.current.addSettlement({
        group_id: 'g1',
        paid_by: 'u1',
        paid_to: 'u2',
        amount: 10,
      });
    });

    expect(insert).toHaveBeenCalledWith({
      group_id: 'g1',
      paid_by: 'u1',
      paid_to: 'u2',
      amount: 10,
      expense_id: null,
    });
  });
});
