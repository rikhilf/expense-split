import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function useDeleteExpense() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteExpense = async (expenseId: string) => {
    setLoading(true);
    setError(null);
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  };

  return { deleteExpense, loading, error };
} 