import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Group, GroupWithMembers } from '../types/db';

export const useGroups = () => {
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('User not authenticated');
        return;
      }

      // First get the user's memberships
      const { data: memberships, error: membershipError } = await supabase
        .from('memberships')
        .select('group_id')
        .eq('user_id', user.id);

      if (membershipError) {
        setError(membershipError.message);
        return;
      }

      if (!memberships || memberships.length === 0) {
        setGroups([]);
        return;
      }

      // Then get the groups
      const groupIds = memberships.map(m => m.group_id);
      const { data, error: fetchError } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds);

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setGroups(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async (name: string) => {
    try {
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('User not authenticated');
        return null;
      }


      // Insert the group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({ name })
        .select()
        .single();

      if (groupError) {
        setError(groupError.message);
        return null;
      }
      
      // Add current user as admin
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .insert({
          user_id: user.id,
          group_id: group.id,
          role: 'admin'
        });

      if (membershipError) {
        setError(membershipError.message);
        return null;
      }

      const {data: createdGroup, error: createdGroupError} = await supabase
        .from('groups')
        .select('*')
        .eq('id', group.id)
        .single();

      if (createdGroupError) {
        setError(createdGroupError.message);
        return null;
      }

      // Refresh groups
      await fetchGroups();

      return createdGroup;

      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return null;
    }

  };

  useEffect(() => {
    fetchGroups();
  }, []);

  return {
    groups,
    loading,
    error,
    refetch: fetchGroups,
    createGroup
  };
}; 