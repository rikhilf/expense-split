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
  authenticated,
  user:profiles ( id, display_name, email, avatar_url, venmo_username, cashapp_username, paypal_username )
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

  it('leaves a group via edge function', async () => {
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
      data: { deleted_group: false },
      error: null,
    });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      const leaveResult = await result.current.leaveGroup();
      expect(leaveResult).toEqual({ ok: true, deletedGroup: false, error: null });
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete_group_if_last_member', {
      body: { group_id: 'g1', confirm_delete_with_expenses: false },
    });
  });

  it('confirms leave-group deletion when deleting a group with expenses', async () => {
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
      data: { deleted_group: true },
      error: null,
    });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      const leaveResult = await result.current.leaveGroup({ confirmDeleteWithExpenses: true });
      expect(leaveResult).toEqual({ ok: true, deletedGroup: true, error: null });
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete_group_if_last_member', {
      body: { group_id: 'g1', confirm_delete_with_expenses: true },
    });
  });

  it('surfaces leave-group edge function error messages', async () => {
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
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: jest.fn().mockResolvedValue({
            error: 'You still have expense splits in this group. Edit the expense to reallocate those splits before leaving.',
          }),
        },
      },
    });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      const leaveResult = await result.current.leaveGroup();
      expect(leaveResult).toEqual({
        ok: false,
        deletedGroup: false,
        error: 'You still have expense splits in this group. Edit the expense to reallocate those splits before leaving.',
      });
    });
  });

  it('blocks member removal when the member still has expense splits', async () => {
    (useProfile as jest.Mock).mockReturnValue({
      profileId: 'p-self',
      profile: { id: 'p-self' },
      loading: false,
      error: null,
      refresh: jest.fn(),
      reset: jest.fn(),
    });

    const membersData = [
      {
        id: 'm-self',
        user_id: 'p-self',
        role: 'admin',
        authenticated: true,
        user: { id: 'p-self', display_name: 'Self', email: 'self@example.com', avatar_url: null },
      },
      {
        id: 'm-target',
        user_id: 'p-target',
        role: 'member',
        authenticated: true,
        user: { id: 'p-target', display_name: 'Target', email: 'target@example.com', avatar_url: null },
      },
    ];

    const fetchReturns = jest.fn().mockResolvedValue({ data: membersData, error: null });
    const fetchEq = jest.fn(() => ({ returns: fetchReturns }));
    const fetchSelect = jest.fn(() => ({ eq: fetchEq }));

    const expensesEq = jest.fn().mockResolvedValue({
      data: [{ id: 'expense-1' }],
      error: null,
    });
    const expensesSelect = jest.fn(() => ({ eq: expensesEq }));

    const splitLimit = jest.fn().mockResolvedValue({
      data: [{ id: 'split-1' }],
      error: null,
    });
    const splitIn = jest.fn(() => ({ limit: splitLimit }));
    const splitEq = jest.fn(() => ({ in: splitIn }));
    const splitSelect = jest.fn(() => ({ eq: splitEq }));
    const splitDelete = jest.fn();

    const membershipDeleteEq = jest.fn();
    const membershipDelete = jest.fn(() => ({ eq: membershipDeleteEq }));

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'memberships') {
        return {
          select: fetchSelect,
          delete: membershipDelete,
        } as any;
      }
      if (table === 'expenses') return { select: expensesSelect } as any;
      if (table === 'expense_splits') {
        return {
          select: splitSelect,
          delete: splitDelete,
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      const removeResult = await result.current.removeMember('m-target');
      expect(removeResult).toEqual({
        ok: false,
        error: 'This member still has expense splits in this group. Edit the expense to reallocate those splits before removing them.',
      });
    });

    expect(splitSelect).toHaveBeenCalledWith('id');
    expect(splitEq).toHaveBeenCalledWith('user_id', 'p-target');
    expect(splitIn).toHaveBeenCalledWith('expense_id', ['expense-1']);
    expect(splitLimit).toHaveBeenCalledWith(1);
    expect(splitDelete).not.toHaveBeenCalled();
    expect(membershipDelete).not.toHaveBeenCalled();
  });
});
