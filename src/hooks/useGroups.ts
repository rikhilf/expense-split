import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useProfile } from '../contexts/ProfileContext';
import { GroupWithMembers } from '../types/db';

export const useGroups = () => {
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { profileId, loading: profileLoading, error: profileError, refresh: refreshProfile } = useProfile();

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (profileLoading) return;
      if (!profileId) {
        if (profileError) setError(profileError);
        setGroups([]);
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('memberships')
        .select('group_id')
        .eq('user_id', profileId);

      if (membershipError) {
        setError(membershipError.message);
        return;
      }

      if (!memberships?.length) {
        setGroups([]);
        return;
      }

      const groupIds = memberships.map(m => m.group_id);
      const { data, error: fetchError } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds);

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setGroups((data as GroupWithMembers[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [profileId, profileLoading, profileError]);

  const createGroup = useCallback(async (name: string) => {
    try {
      setError(null);

      // Call Edge Function which creates group and seeds admin membership
      const { data, error: fnError } = await supabase.functions.invoke(
        'create_group_and_seed_admin',
        { body: { name } }
      );

      if (fnError) {
        setError(fnError.message ?? 'Could not create group');
        return null;
      }

      const group = (data as any)?.group ?? null;

      // Refresh local groups state
      await fetchGroups();
      return group;
    } catch (e: any) {
      setError(e?.message ?? 'An error occurred');
      return null;
    }
  }, [fetchGroups]);

  useEffect(() => {
    if (!profileLoading) {
      void fetchGroups();
    }
  }, [profileLoading, profileId, fetchGroups]);

  return {
    groups,
    loading,
    error,
    refetch: fetchGroups,
    createGroup
  };
};
