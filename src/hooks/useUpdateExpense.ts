import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Expense } from '../types/db';
import { AddExpenseData } from './useAddExpense';

type UpdateExpenseResponse = {
  expense: Expense;
};

export const useUpdateExpense = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateExpense = async (expenseId: string, expenseData: AddExpenseData) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke<UpdateExpenseResponse>(
        'update_expense',
        {
          body: {
            expense_id: expenseId,
            description: expenseData.description,
            amount: expenseData.amount,
            date: expenseData.date,
            split_mode: expenseData.splitMode,
            participant_ids: expenseData.participantIds ?? [],
            shares: expenseData.shares?.map((share) => ({
              user_id: share.userId,
              share: share.share,
            })),
          },
        }
      );

      if (fnError) {
        setError(fnError.message ?? 'Failed to update expense');
        return null;
      }

      return data?.expense ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    updateExpense,
    loading,
    error,
  };
};
