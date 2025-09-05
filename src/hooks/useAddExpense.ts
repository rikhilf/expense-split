import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ExpenseInsert, ExpenseSplitInsert } from '../types/db';
import { useProfile, getOrCreateProfileId } from '../contexts/ProfileContext';

export type SplitMode = 'equal' | 'shares';

export type AddExpenseData = {
  description: string;
  amount: number;
  date: string;
  splitMode: SplitMode;
  shares?: { userId: string; share: number }[];
};

export const useAddExpense = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { profileId } = useProfile();

  const addExpense = async (groupId: string, expenseData: AddExpenseData) => {
    try {
      setLoading(true);
      setError(null);
      // Resolve a profile id (prefer context, fallback to on-demand resolver)
      const currentProfileId = profileId ?? (await getOrCreateProfileId());
      if (!currentProfileId) {
        setError('User not authenticated');
        return null;
      }

      // Insert the expense
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          group_id: groupId,
          created_by: currentProfileId,
          description: expenseData.description,
          amount: expenseData.amount,
          date: expenseData.date,
          type: 'manual'
        })
        .select()
        .single();

      if (expenseError) {
        setError(expenseError.message);
        return null;
      }

      // Get group members
      const { data: memberships, error: membershipError } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('group_id', groupId);

      if (membershipError) {
        setError(membershipError.message);
        return null;
      }

      if (!memberships || memberships.length === 0) {
        setError('No members found in group');
        return null;
      }

      // Calculate splits
      let splits: ExpenseSplitInsert[] = [];
      
      if (expenseData.splitMode === 'equal') {
        const memberCount = memberships.length;
        const shareAmount = expenseData.amount / memberCount;
        
        splits = memberships.map(membership => ({
          expense_id: expense.id,
          user_id: membership.user_id,
          share: 1 / memberCount,
          amount: shareAmount
        }));
      } else if (expenseData.splitMode === 'shares' && expenseData.shares) {
        const totalShares = expenseData.shares.reduce((sum, share) => sum + share.share, 0);
        
        splits = expenseData.shares.map(share => ({
          expense_id: expense.id,
          user_id: share.userId,
          share: share.share / totalShares,
          amount: (share.share / totalShares) * expenseData.amount
        }));
      }

      // Insert expense splits
      if (splits.length > 0) {
        const { error: splitsError } = await supabase
          .from('expense_splits')
          .insert(splits);

        if (splitsError) {
          setError(splitsError.message);
          return null;
        }
      }

      return expense;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    addExpense,
    loading,
    error
  };
}; 
