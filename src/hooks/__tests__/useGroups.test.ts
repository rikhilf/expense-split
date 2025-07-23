import { renderHook, actAsync } from '../helpers';
import { useGroups } from '../useGroups';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

describe('useGroups', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches groups on mount', async () => {
    const user = { id: '1' };
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user } });

    const membershipsData = [{ group_id: 'g1' }];
    const groupsData = [{ id: 'g1', name: 'test' }];

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'memberships') {
        return {
          select: () => ({
            eq: jest.fn().mockResolvedValue({ data: membershipsData, error: null })
          })
        };
      }
      if (table === 'groups') {
        return {
          select: () => ({
            in: jest.fn().mockResolvedValue({ data: groupsData, error: null })
          })
        };
      }
      return {} as any;
    });

    const { result } = renderHook(() => useGroups());
    await actAsync(async () => {
      await Promise.resolve();
    });

    expect(result.current.groups).toEqual(groupsData);
    expect(result.current.error).toBeNull();
  });

  it('creates a group', async () => {
    const user = { id: '1' };
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user } });

    const group = { id: 'g1', name: 'New' };

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'groups') {
        return {
          insert: () => ({ select: () => ({ single: jest.fn().mockResolvedValue({ data: group, error: null }) }) }),
          select: () => ({ eq: () => ({ single: jest.fn().mockResolvedValue({ data: group, error: null }) }) }),
        };
      }
      if (table === 'memberships') {
        return { insert: jest.fn().mockResolvedValue({ data: {}, error: null }) };
      }
      return { select: () => ({ eq: jest.fn().mockResolvedValue({ data: [], error: null }) }) };
    });

    const { result } = renderHook(() => useGroups());

    await actAsync(async () => {
      const created = await result.current.createGroup('New');
      expect(created).toEqual(group);
    });

    expect(supabase.from).toHaveBeenCalledWith('groups');
  });
});
