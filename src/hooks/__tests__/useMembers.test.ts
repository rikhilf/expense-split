import { renderHook, act } from '@testing-library/react';
import { useMembers } from '../useMembers';

jest.mock('../../contexts/ProfileContext', () => ({
  useProfile: jest.fn(),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/ProfileContext';

describe('useMembers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches members for a group', async () => {
    (useProfile as jest.Mock).mockReturnValue({ profileId: 'p-self', profile: { id: 'p-self' }, loading: false, error: null, refresh: jest.fn(), reset: jest.fn() });
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
  user:profiles ( id, display_name, email, avatar_url, auth_user_id )
`);
    expect(eq).toHaveBeenCalledWith('group_id', 'g1');
    expect(returns).toHaveBeenCalled();
  });

  it('invites a member via edge function (email path)', async () => {
    (useProfile as jest.Mock).mockReturnValue({ profileId: 'p-self', profile: { id: 'p-self' }, loading: false, error: null, refresh: jest.fn(), reset: jest.fn() });
    const fetchReturns = jest.fn().mockResolvedValue({ data: [], error: null });
    const fetchEq = jest.fn(() => ({ returns: fetchReturns }));
    const fetchSelect = jest.fn(() => ({ eq: fetchEq }));

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'memberships') {
        return {
          select: fetchSelect,
          delete: jest.fn(),
        } as any;
      }
      return {} as any;
    });

    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { membership: { id: 'm1' }, profile: { id: 'p1' }, created: true },
      error: null,
    });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      const ok = await result.current.inviteMember({ displayName: 'Alice', email: 'a@b.com' });
      expect(ok).toBe(true);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('invite_member', {
      body: { group_id: 'g1', email: 'a@b.com', display_name: 'Alice', role: 'member' },
    });
  });

  it('invites a placeholder member via edge function (name only)', async () => {
    (useProfile as jest.Mock).mockReturnValue({ profileId: 'p-self', profile: { id: 'p-self' }, loading: false, error: null, refresh: jest.fn(), reset: jest.fn() });
    const fetchReturns = jest.fn().mockResolvedValue({ data: [], error: null });
    const fetchEq = jest.fn(() => ({ returns: fetchReturns }));
    const fetchSelect = jest.fn(() => ({ eq: fetchEq }));

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'memberships') {
        return {
          select: fetchSelect,
          delete: jest.fn(),
        } as any;
      }
      return {} as any;
    });

    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { membership: { id: 'm2' }, profile: { id: 'p2' }, created: true },
      error: null,
    });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      const ok = await result.current.inviteMember({ displayName: 'Bob' });
      expect(ok).toBe(true);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('invite_member', {
      body: { group_id: 'g1', display_name: 'Bob', role: 'member' },
    });
  });
});
