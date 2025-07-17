import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAddExpense } from '../useAddExpense';
vi.mock('react', () => ({
  useState: (v: any) => [v, vi.fn()],
  useEffect: vi.fn()
}));

var mockFrom: any;
var mockSupabase: any;
vi.mock('../../lib/supabase', () => {
  mockFrom = vi.fn();
  mockSupabase = { auth: { getUser: vi.fn() }, from: mockFrom };
  return { supabase: mockSupabase };
});

const mockExpenseData = {
  description: 'Lunch',
  amount: 20,
  date: '2024-01-01',
  splitMode: 'equal' as const
};

function setupInsertMocks() {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockFrom
    .mockImplementationOnce(() => ({
      insert: vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      select: vi.fn().mockReturnThis(),
      single: vi.fn()
    }))
    .mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ user_id: 'u1' }], error: null })
    }))
    .mockImplementationOnce(() => ({
      insert: vi.fn().mockResolvedValue({ error: null })
    }));
}

describe('useAddExpense', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSupabase.auth.getUser.mockReset();
  });

  it('adds an expense', async () => {
    setupInsertMocks();
    const { addExpense } = useAddExpense();
    await addExpense('g1', mockExpenseData);
    expect(mockFrom).toHaveBeenCalledWith('expenses');
  });
});
