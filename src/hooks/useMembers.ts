import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

      // 1) Create placeholder profile (email optional, not unique)
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .insert({
          display_name: displayName.trim(),
          email: email ? email.trim().toLowerCase() : null,
          auth_user_id: null,
        })
        .select('id')
        .single();

      if (pErr || !prof) {
        setError(pErr?.message ?? 'Could not create profile');
        return false;
      }

      // 2) Insert membership (unique (group_id, user_id) prevents dupes)
      const { error: mErr } = await supabase
        .from('memberships')
        .insert({ group_id: groupId, user_id: prof.id, role: 'member' });

      if (mErr) {
        // If duplicate (constraint 23505), show friendly error
        // Supabase PG error code exposed as mErr.code when available
        // If not available, just show message.
        // @ts-ignore
        if (mErr.code === '23505') {
          setError('That person is already in this group.');
        } else {
          setError(mErr.message);
        }
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
