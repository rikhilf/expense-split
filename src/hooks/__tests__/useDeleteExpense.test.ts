import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDeleteExpense } from '../useDeleteExpense';
vi.mock('react', () => ({
  useState: (v: any) => [v, vi.fn()],
  useEffect: vi.fn()
}));

var mockFrom: any;
var mockSupabase: any;
vi.mock('../../lib/supabase', () => {
  mockFrom = vi.fn();
  mockSupabase = { from: mockFrom };
  return { supabase: mockSupabase };
});

describe('useDeleteExpense', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('deletes an expense by id', async () => {
    mockFrom.mockReturnValue({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) })
    });
    const { deleteExpense } = useDeleteExpense();
    await deleteExpense('e1');
    expect(mockFrom).toHaveBeenCalledWith('expenses');
  });
});
