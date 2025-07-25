import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settlement } from '../types/db';

export const useSettlements = (groupId: string, expenseId?: string) => {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettlements = async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('settlements')
        .select('*')
        .eq('group_id', groupId);
      if (expenseId) {
        query = query.eq('expense_id', expenseId);
      }
      const { data, error: fetchError } = await query.order('settled_at', {
        ascending: false,
      });
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setSettlements(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlements();
  }, [groupId, expenseId]);

  return { settlements, loading, error, refetch: fetchSettlements };
};
