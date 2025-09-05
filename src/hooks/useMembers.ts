import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

type MemberRow = {
  id: string;
  role: 'member' | 'admin';
  user_id: string;
  user: {
    id: string;
    display_name: string;
    email: string | null;
    avatar_url: string | null;
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

export const useMembers = (groupId: string) => {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = async () => {
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
  user:profiles ( id, display_name, email, avatar_url )
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
  };

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

  const removeMember = async (membershipId: string) => {
    try {
      setError(null);

      const { error: deleteError } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membershipId);

      if (deleteError) {
        setError(deleteError.message);
        return false;
      }

      setMembers(prev => prev.filter(m => m.id !== membershipId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return false;
    }
  };

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  return {
    members,
    loading,
    error,
    refetch: fetchMembers,
    inviteMember,
    removeMember,
  };
};
