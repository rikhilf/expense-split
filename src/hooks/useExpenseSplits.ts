import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type ExpenseSplitRow = {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  share: number | null;
  user: {
    id: string;
    display_name: string;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

export const useExpenseSplits = (expenseId: string) => {
  const [splits, setSplits] = useState<ExpenseSplitRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSplits = async () => {
    if (!expenseId) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('expense_splits')
        .select(`
          id,
          expense_id,
          user_id,
          amount,
          share,
          user:profiles ( id, display_name, email, avatar_url )
        `)
        .eq('expense_id', expenseId)
        .returns<ExpenseSplitRow[]>();

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setSplits(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSplits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  return {
    splits,
    loading,
    error,
    refetch: fetchSplits,
  };
};

