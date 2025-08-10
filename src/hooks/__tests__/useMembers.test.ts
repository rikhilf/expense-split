import { renderHook, act } from '@testing-library/react';
import { useMembers } from '../useMembers';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

describe('useMembers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches members for a group', async () => {
    const data = [{ id: 'm1', user: { display_name: 'Test', email: 'test@example.com' } }];
    const returns = jest.fn().mockResolvedValue({ data, error: null });
    const eq = jest.fn(() => ({ returns }));
    const select = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.members).toEqual(data);
    expect(supabase.from).toHaveBeenCalledWith('memberships');
    expect(select).toHaveBeenCalledWith(`
  id,
  role,
  user_id,
  user:profiles ( id, display_name, email, avatar_url )
`);
    expect(eq).toHaveBeenCalledWith('group_id', 'g1');
    expect(returns).toHaveBeenCalled();
  });

  it('invites a member', async () => {
    const fetchReturns = jest.fn().mockResolvedValue({ data: [], error: null });
    const fetchEq = jest.fn(() => ({ returns: fetchReturns }));
    const fetchSelect = jest.fn(() => ({ eq: fetchEq }));

    const insertMembership = jest.fn().mockResolvedValue({ error: null });
    const insertProfile = jest.fn(() => ({ select: () => ({ single: jest.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }) }) }));

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'memberships') {
        return {
          select: fetchSelect,
          insert: insertMembership,
          delete: jest.fn(),
        } as any;
      }
      if (table === 'profiles') {
        return { insert: insertProfile } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      const ok = await result.current.inviteMember({ displayName: 'Alice', email: 'a@b.com' });
      expect(ok).toBe(true);
    });

    expect(insertProfile).toHaveBeenCalledWith({
      display_name: 'Alice',
      email: 'a@b.com',
      auth_user_id: null,
    });
    expect(insertMembership).toHaveBeenCalledWith({ group_id: 'g1', user_id: 'p1', role: 'member' });
  });
});
