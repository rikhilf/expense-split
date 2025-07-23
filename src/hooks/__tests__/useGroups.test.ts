import { renderHook, act } from '@testing-library/react';
// Hook used for fetching and creating groups
import { useGroups } from '../useGroups';

// Mock the Supabase module so tests don't hit the network
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

// Test suite for the useGroups hook which handles retrieving and creating groups
describe('useGroups', () => {
  beforeEach(() => {
    // Reset mock implementations before each test
    jest.resetAllMocks();
  });

  it('fetches groups on mount', async () => {
    const user = { id: '1' };
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

  it('creates a group', async () => {
    const user = { id: '1' };
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user } });

    const group = { id: 'g1', name: 'New' };

    // Mock database calls for inserting the group and membership
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

    let resultValue;
    await act(async () => {
      resultValue = await result.current.createGroup('New');
    });
    // Return value should be the created group and the correct table invoked
    expect(resultValue).toEqual(group);

    expect(supabase.from).toHaveBeenCalledWith('groups');
  });
});
