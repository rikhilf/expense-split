import { renderHook, act } from '@testing-library/react';
// Hook responsible for deleting an expense by id
import { useDeleteExpense } from '../useDeleteExpense';

// Mock Supabase client used by the hook
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

// Basic tests ensuring the deleteExpense helper properly issues a delete request
describe('useDeleteExpense', () => {
  beforeEach(() => {
    // Clear mocks before each test run
    jest.resetAllMocks();
  });

  it('deletes an expense', async () => {
    // Mock chained supabase methods for deletion
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
