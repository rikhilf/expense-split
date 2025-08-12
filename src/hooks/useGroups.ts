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

      if (profileLoading) await refreshProfile();
      if (!profileId) {
        setError('No profile for current user');
        return null;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({ name, created_by: user.id })
        .select('*')
        .single();

      if (groupError || !group) {
        setError(groupError?.message ?? 'Could not create group');
        return null;
      }

      const { error: membershipError } = await supabase
        .from('memberships')
        .insert({
          user_id: profileId, // profiles.id from context
          group_id: group.id,
          role: 'admin',
        });

      if (membershipError) {
        setError(membershipError.message);
        return null;
      }

      await fetchGroups();
      return group;
    } catch (e: any) {
      setError(e?.message ?? 'An error occurred');
      return null;
    }
  }, [profileId, profileLoading, refreshProfile, fetchGroups]);

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
