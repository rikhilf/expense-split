import { renderHook, act } from '@testing-library/react';
import { useDeleteExpense } from '../useDeleteExpense';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

describe('useDeleteExpense', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('deletes an expense', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    const { result } = renderHook(() => useDeleteExpense());

    let resultValue;
    await act(async () => {
      resultValue = await result.current.deleteExpense('123');
    });
    expect(resultValue).toBe(true);

    expect(supabase.from).toHaveBeenCalledWith('expenses');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', '123');
  });
});
