import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGroups } from '../useGroups';
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

function setupFetchMocks() {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockFrom.mockImplementationOnce(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: [{ group_id: 'g1' }], error: null })
  }));
  mockFrom.mockImplementationOnce(() => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [{ id: 'g1', name: 'Group1' }], error: null })
  }));
}

describe('useGroups', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSupabase.auth.getUser.mockReset();
  });

  it('fetches groups for the current user', async () => {
    setupFetchMocks();
    const { refetch } = useGroups();
    await refetch();
    expect(mockFrom).toHaveBeenCalledWith('memberships');
    expect(mockFrom).toHaveBeenCalledWith('groups');
  });

  it('creates a group', async () => {
    setupFetchMocks();
    mockFrom.mockImplementationOnce(() => ({
      insert: vi.fn().mockResolvedValue({ data: { id: 'g2', name: 'New' }, error: null }),
      select: vi.fn().mockReturnThis(),
      single: vi.fn()
    }));
    mockFrom.mockImplementationOnce(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null })
    }));
    mockFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: { id: 'g2', name: 'New' }, error: null }),
      single: vi.fn()
    }));

    const { createGroup } = useGroups();
    await createGroup('New');
    expect(mockFrom).toHaveBeenCalledWith('groups');
  });
});
