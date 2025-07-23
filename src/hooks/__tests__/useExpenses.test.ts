import { renderHook, act } from '@testing-library/react';
// Hook for retrieving expenses belonging to a group
import { useExpenses } from '../useExpenses';

// Mock the Supabase client module
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

// Tests for fetching a list of expenses for a specific group
describe('useExpenses', () => {
  beforeEach(() => {
    // Reset mocks between tests
    jest.resetAllMocks();
  });

  it('fetches expenses for a group', async () => {
    const data = [{ id: 'e1' }];
    // Mock the chain of supabase query builders
    const order = jest.fn().mockResolvedValue({ data, error: null });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockReturnValue({ select });

    // Render the hook with a sample group id
    const { result } = renderHook(() => useExpenses('g1'));
    
    await act(async () => {
      // Wait for the effect inside the hook to complete
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // The hook should expose the fetched expenses and call the correct queries
    expect(result.current.expenses).toEqual(data);
    expect(supabase.from).toHaveBeenCalledWith('expenses');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('group_id', 'g1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
