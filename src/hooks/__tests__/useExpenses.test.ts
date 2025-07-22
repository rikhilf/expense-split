import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useExpenses } from '../useExpenses';
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

function setupFetchMock() {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: [{ id: 'e1' }], error: null })
      })
    })
  });
}

describe('useExpenses', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('fetches expenses for a group', async () => {
    setupFetchMock();
    const { refetch } = useExpenses('g1');
    await refetch();
    expect(mockFrom).toHaveBeenCalledWith('expenses');
  });
});
