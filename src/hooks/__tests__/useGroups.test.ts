import { renderHook, act } from '@testing-library/react';
// Hook used for fetching and creating groups
import { useGroups } from '../useGroups';

// Mock the Supabase module so tests don't hit the network
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('../../contexts/ProfileContext', () => ({
  useProfile: jest.fn(),
}));

import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/ProfileContext';

// Test suite for the useGroups hook which handles retrieving and creating groups
describe('useGroups', () => {
  beforeEach(() => {
    // Reset mock implementations before each test
    jest.resetAllMocks();
  });

  it('fetches groups on mount', async () => {
    const user = { id: '1' };
    (useProfile as jest.Mock).mockReturnValue({
      profileId: 'p1',
      loading: false,
      error: null,
      refresh: jest.fn(),
      reset: jest.fn(),
    });
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user } });

    const membershipsData = [{ group_id: 'g1' }];
    const groupsData = [{ id: 'g1', name: 'test' }];

    // Mock out the various table queries used by the hook
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

    // Render the hook which automatically fetches groups on mount
    const { result } = renderHook(() => useGroups());

    await act(async () => {
      // Wait for the initial fetch effect to complete
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // The hook should store the groups and not report an error
    expect(result.current.groups).toEqual(groupsData);
    expect(result.current.error).toBeNull();
  });

  it('creates a group via edge function', async () => {
    const user = { id: '1' };
    (useProfile as jest.Mock).mockReturnValue({
      profileId: 'p1',
      loading: false,
      error: null,
      refresh: jest.fn(),
      reset: jest.fn(),
    });
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user } });

    const group = { id: 'g1', name: 'New' };

    // Mock the edge function response and subsequent membership/groups fetch
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { group }, error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'memberships') {
        return {
          select: () => ({ eq: jest.fn().mockResolvedValue({ data: [{ group_id: group.id }], error: null }) }),
        } as any;
      }
      if (table === 'groups') {
        return {
          select: () => ({ in: jest.fn().mockResolvedValue({ data: [group], error: null }) }),
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useGroups());

    let resultValue;
    await act(async () => {
      resultValue = await result.current.createGroup('New');
    });
    // Return value should be the created group and the edge function invoked
    expect(resultValue).toEqual(group);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create_group_and_seed_admin', { body: { name: 'New' } });
  });
});
