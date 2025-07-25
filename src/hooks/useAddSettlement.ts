import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Settlement } from '../types/db';

export interface AddSettlementData {
  group_id: string;
  paid_by: string | null;
  paid_to: string | null;
  amount: number;
  expense_id?: string | null;
}

export const useAddSettlement = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSettlement = async (
    data: AddSettlementData
  ): Promise<Settlement | null> => {
    try {
      setLoading(true);
      setError(null);
      const { data: settlement, error: insertError } = await supabase
        .from('settlements')
        .insert({
          group_id: data.group_id,
          paid_by: data.paid_by,
          paid_to: data.paid_to,
          amount: data.amount,
          expense_id: data.expense_id ?? null,
        })
        .select()
        .single();
      if (insertError) {
        setError(insertError.message);
        return null;
      }
      return settlement;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { addSettlement, loading, error };
};
