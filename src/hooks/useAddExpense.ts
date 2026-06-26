import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ExpenseInsert, ExpenseSplitInsert } from '../types/db';
import { useProfile, getOrCreateProfileId } from '../contexts/ProfileContext';
import { distributeAmountByWeights, distributeAmountEvenly } from '../lib/splitAmounts';

export type SplitMode = 'equal' | 'shares';

export type AddExpenseData = {
  description: string;
  amount: number;
  date: string;
  splitMode: SplitMode;
  shares?: { userId: string; share: number }[];
  // Optional: restrict the split to these user ids
  participantIds?: string[];
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

      // Apply participant filter if provided, preserving the UI order so
      // remainder cents are saved for the same people shown in the preview.
      const membershipsByUserId = new Map(memberships.map(m => [m.user_id, m]));
      const selectedMemberships = expenseData.participantIds && expenseData.participantIds.length > 0
        ? expenseData.participantIds
            .map(userId => membershipsByUserId.get(userId))
            .filter((membership): membership is { user_id: string } => !!membership)
        : [...memberships].sort((a, b) => a.user_id.localeCompare(b.user_id));

      if (!selectedMemberships || selectedMemberships.length === 0) {
        setError('At least one participant must be selected');
        return null;
      }

      // Calculate splits
      let splits: ExpenseSplitInsert[] = [];
      
      if (expenseData.splitMode === 'equal') {
        const memberCount = selectedMemberships.length;
        const shareAmounts = distributeAmountEvenly(
          expenseData.amount,
          selectedMemberships.map((membership) => membership.user_id)
        );
        
        splits = selectedMemberships.map((membership) => ({
          expense_id: expense.id,
          user_id: membership.user_id,
          share: 1 / memberCount,
          amount: shareAmounts[membership.user_id]
        }));
      } else if (expenseData.splitMode === 'shares' && expenseData.shares) {
        const positiveShares = expenseData.shares.filter(share => share.share > 0);
        const totalShares = positiveShares.reduce((sum, share) => sum + share.share, 0);
        if (!totalShares || totalShares <= 0) {
          setError('Total shares must be greater than zero');
          return null;
        }

        const shareAmounts = distributeAmountByWeights(
          expenseData.amount,
          positiveShares.map((share) => ({
            id: share.userId,
            weight: share.share,
          }))
        );
        
        splits = positiveShares.map(share => ({
          expense_id: expense.id,
          user_id: share.userId,
          share: share.share / totalShares,
          amount: shareAmounts[share.userId] ?? 0
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
