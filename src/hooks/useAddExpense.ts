import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useProfile, getOrCreateProfileId } from '../contexts/ProfileContext';
import { distributeAmountByWeights, distributeAmountEvenly } from '../lib/splitAmounts';

export type SplitMode = 'equal' | 'shares';
export type AddExpenseData = {
  description: string;
  amount: number;
  date: string;
  splitMode: SplitMode;
  paidBy?: string;
  shares?: { userId: string; share: number }[];
  participantIds?: string[];
};

export const useAddExpense = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const { profileId } = useProfile();

  const addExpense = async (groupId: string, input: AddExpenseData) => {
    if (busy.current) return null;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const actor = profileId ?? await getOrCreateProfileId();
      if (!actor) throw new Error('User not authenticated');
      if (!Number.isFinite(input.amount) || input.amount <= 0 ||
          !Number.isSafeInteger(Math.round(input.amount * 100)) ||
          Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) {
        throw new Error('Enter a positive amount with at most two decimal places');
      }
      const { data: members, error: memberError } = await supabase
        .from('memberships').select('user_id').eq('group_id', groupId);
      if (memberError) throw memberError;
      const memberIds = new Set((members ?? []).map(member => member.user_id));
      const ids = input.participantIds ?? [...memberIds].sort();
      if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !memberIds.has(id))) {
        throw new Error('Select valid, distinct group participants');
      }
      const paidBy = input.paidBy ?? actor;
      if (!memberIds.has(paidBy)) throw new Error('The payer must be a group member');
      let splits: { user_id: string; amount: number; share: number }[];
      if (input.splitMode === 'equal') {
        const amounts = distributeAmountEvenly(input.amount, ids);
        splits = ids.map(id => ({ user_id: id, amount: amounts[id], share: 1 / ids.length }));
      } else if (input.splitMode === 'shares') {
        const shares = input.shares ?? [];
        if (shares.some(s => !Number.isFinite(s.share) || s.share < 0)) {
          throw new Error('Shares must be finite, non-negative numbers');
        }
        const positive = shares.filter(s => s.share > 0);
        const shareIds = positive.map(s => s.userId);
        if (!positive.length || new Set(shareIds).size !== shareIds.length ||
            shareIds.some(id => !memberIds.has(id)) ||
            (input.participantIds && (shareIds.length !== ids.length || ids.some(id => !shareIds.includes(id))))) {
          throw new Error('Positive shares must match the selected participants');
        }
        const total = positive.reduce((sum, s) => sum + s.share, 0);
        if (!Number.isFinite(total)) throw new Error('Share total is too large');
        const amounts = distributeAmountByWeights(input.amount, positive.map(s => ({ id: s.userId, weight: s.share })));
        splits = positive.map(s => ({ user_id: s.userId, amount: amounts[s.userId], share: s.share / total }));
      } else {
        throw new Error('Choose an equal or custom split');
      }
      // The database validates and saves the expense and every split in one transaction.
      const { data, error: saveError } = await supabase.rpc('create_expense_with_splits', {
        p_group_id: groupId, p_description: input.description.trim(), p_amount: input.amount,
        p_date: input.date, p_paid_by: paidBy, p_splits: splits,
      });
      if (saveError) throw saveError;
      return data;
    } catch (err) {
      setError(err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Failed to add expense');
      return null;
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };
  return { addExpense, loading, error };
};
