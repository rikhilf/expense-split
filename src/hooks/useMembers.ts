import { useCallback, useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import { useProfile } from '../contexts/ProfileContext';

type MemberRow = {
  id: string;
  role: 'member' | 'admin';
  user_id: string;
  authenticated: boolean;
  user: {
    id: string;
    display_name: string;
    email: string | null;
    avatar_url: string | null;
    venmo_username?: string | null;
    cashapp_username?: string | null;
    paypal_username?: string | null;
  } | null;
};

type InviteInput = { displayName: string; email?: string };

type InviteMemberResponse = {
  membership: Database['public']['Tables']['memberships']['Row'];
  profile: Database['public']['Tables']['profiles']['Row'];
  created: boolean;
  placeholder_created?: boolean;
  already_member?: boolean;
};

type LeaveGroupResponse = {
  deleted_group: boolean;
};

type LeaveGroupResult = {
  ok: boolean;
  deletedGroup: boolean;
  error?: string | null;
};

type LeaveGroupOptions = {
  confirmDeleteWithExpenses?: boolean;
};

type RemoveMemberResult = {
  ok: boolean;
  error?: string | null;
};

const MEMBER_HAS_SPLITS_MESSAGE =
  'This member still has expense splits in this group. Edit the expense to reallocate those splits before removing them.';

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  const body = await context?.json?.().catch(() => null);
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error;
  }

  return error instanceof Error ? error.message : fallback;
};

export const useMembers = (groupId: string) => {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { profileId } = useProfile();

  const isCurrentUserAdmin = useMemo(() => {
    if (!profileId) return false;
    const me = members.find(m => m.user_id === profileId);
    return me?.role === 'admin';
  }, [members, profileId]);

  const fetchMembers = useCallback(async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('memberships')
        .select(`
  id,
  role,
  user_id,
  authenticated,
  user:profiles ( id, display_name, email, avatar_url, venmo_username, cashapp_username, paypal_username )
`)
        .eq('group_id', groupId)
        .returns<MemberRow[]>();

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setMembers(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const inviteMember = async ({ displayName, email }: InviteInput) => {
    try {
      setError(null);

      // If an email is provided, use the Edge Function directly.
      if (email && email.trim()) {
        const { data, error: fnError } = await supabase.functions.invoke<InviteMemberResponse>(
          'invite_member',
          {
            body: {
              group_id: groupId,
              email: email.trim().toLowerCase(),
              display_name: displayName.trim(),
              role: 'member',
            },
          }
        );

        if (fnError) {
          setError(fnError.message ?? 'Failed to invite member');
          return false;
        }

        if ((data as any)?.already_member) {
          setError('That person is already in this group.');
          return false;
        }

        await fetchMembers();
        return true;
      }

      // Name-only flow: call Edge Function to create placeholder + membership.
      const { data, error: fnError } = await supabase.functions.invoke<InviteMemberResponse>(
        'invite_member',
        {
          body: {
            group_id: groupId,
            display_name: displayName.trim(),
            role: 'member',
          },
        }
      );

      if (fnError) {
        setError(fnError.message ?? 'Failed to add member');
        return false;
      }

      if ((data as any)?.already_member) {
        setError('That person is already in this group.');
        return false;
      }

      await fetchMembers();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return false;
    }
  };

  const removeMember = async (membershipId: string): Promise<RemoveMemberResult> => {
    try {
      setError(null);

      // Find the target membership info from local state
      const target = members.find(m => m.id === membershipId);
      if (!target) {
        const message = 'Could not find that member in this group.';
        return { ok: false, error: message };
      }

      const isPlaceholder = !target.authenticated;
      const isSelf = target.user_id === profileId;

      // Permissions:
      // - Admins can remove anyone
      // - Non-admins can remove placeholders
      // - Anyone can remove themselves (leave group)
      if (!isCurrentUserAdmin && !isPlaceholder && !isSelf) {
        const message = 'Only a group admin can remove this group member';
        return { ok: false, error: message };
      }

      // Preserve expense history: block removal while this member still has splits in the group.
      const { data: groupExpenses, error: expensesError } = await supabase
        .from('expenses')
        .select('id')
        .eq('group_id', groupId);
      if (expensesError) {
        const message = expensesError.message ?? 'Failed to look up group expenses';
        return { ok: false, error: message };
      }

      const expenseIds = (groupExpenses ?? []).map(e => e.id);
      if (expenseIds.length > 0) {
        const { data: existingSplits, error: splitsError } = await supabase
          .from('expense_splits')
          .select('id')
          .eq('user_id', target.user_id)
          .in('expense_id', expenseIds)
          .limit(1);
        if (splitsError) {
          const message = splitsError.message ?? 'Failed to check member expense splits';
          return { ok: false, error: message };
        }

        if ((existingSplits ?? []).length > 0) {
          return { ok: false, error: MEMBER_HAS_SPLITS_MESSAGE };
        }
      }

      // Now delete the membership itself
      const { error: deleteError } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membershipId);

      if (deleteError) {
        const message = deleteError.message;
        console.error('Failed to delete membership:', deleteError);
        return { ok: false, error: message };
      }

      setMembers(prev => prev.filter(m => m.id !== membershipId));
      return { ok: true, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      return { ok: false, error: message };
    }
  };

  const leaveGroup = async (options: LeaveGroupOptions = {}): Promise<LeaveGroupResult> => {
    try {
      setError(null);

      if (!groupId) {
        const message = 'Missing group id.';
        return { ok: false, deletedGroup: false, error: message };
      }

      if (!profileId) {
        const message = 'Could not resolve your profile.';
        return { ok: false, deletedGroup: false, error: message };
      }

      const { data, error: fnError } = await supabase.functions.invoke<LeaveGroupResponse>(
        'delete_group_if_last_member',
        {
          body: {
            group_id: groupId,
            confirm_delete_with_expenses: !!options.confirmDeleteWithExpenses,
          },
        }
      );

      if (fnError) {
        const message = await getFunctionErrorMessage(fnError, 'Failed to leave group');
        return { ok: false, deletedGroup: false, error: message };
      }

      const deletedGroup = !!data?.deleted_group;

      if (!deletedGroup) {
        setMembers(prev => prev.filter(member => member.user_id !== profileId));
      }

      return { ok: true, deletedGroup, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      return { ok: false, deletedGroup: false, error: message };
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return {
    members,
    loading,
    error,
    refetch: fetchMembers,
    inviteMember,
    removeMember,
    leaveGroup,
    isCurrentUserAdmin,
  };
};
