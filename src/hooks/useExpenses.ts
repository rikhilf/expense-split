import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Expense, ExpenseWithSplits } from '../types/db';

export const useExpenses = (groupId: string) => {
  const [expenses, setExpenses] = useState<ExpenseWithSplits[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExpenses = async () => {
    if (!groupId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('expenses')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setExpenses(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [groupId]);

  return {
    expenses,
    loading,
    error,
    refetch: fetchExpenses
  };
}; 