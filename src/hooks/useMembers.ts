import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MembershipWithProfile } from '../types/db';

export const useMembers = (groupId: string) => {
  const [members, setMembers] = useState<MembershipWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = async () => {
    if (!groupId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('memberships')
        .select('*, user:profiles(*)')
        .eq('group_id', groupId);

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setMembers((data as unknown as MembershipWithProfile[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const inviteMember = async (email: string) => {
    try {
      setError(null);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (profileError || !profile) {
        setError(profileError?.message || 'User not found');
        return false;
      }

      const { error: insertError } = await supabase
        .from('memberships')
        .insert({
          user_id: profile.id,
          group_id: groupId,
          role: 'member',
        });

      if (insertError) {
        setError(insertError.message);
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
