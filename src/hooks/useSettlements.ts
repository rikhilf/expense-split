import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { readLedgerPages } from '../lib/readLedgerPages';
import type { CreateSettlementInput, GroupBalance, SettlementRecord, LedgerExpense } from '../types/settlements';

// Kept narrow so the client contract is explicit even while database types regenerate.
type SettlementRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: { message: string } | null;
}>;
const rpc = supabase.rpc.bind(supabase) as unknown as SettlementRpc;
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not update settlements. Please try again.';

export const useSettlements = (groupId: string) => {
  const [balances, setBalances] = useState<GroupBalance[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = useRef(false);
  const fetchSequence = useRef(0);

  const refetch = useCallback(async () => {
    const sequence = ++fetchSequence.current;
    setLoading(true);
    setError(null);
    try {
      const [balanceResult, settlementResult, expenseResult] = await Promise.all([
        rpc('get_group_balances', { p_group_id: groupId }),
        readLedgerPages((from, to) => supabase.from('settlements').select('*').eq('group_id', groupId).order('id').range(from, to)),
        readLedgerPages((from, to) => supabase.from('expenses').select('*, expense_splits(expense_id, user_id, amount)').eq('group_id', groupId).order('id').range(from, to)),
      ]);
      if (sequence === fetchSequence.current) {
        setDetailsError(expenseResult.error?.message ?? null);
        setExpenses(expenseResult.error ? [] : (expenseResult.data ?? []) as LedgerExpense[]);
        if (!settlementResult.error) setSettlements((settlementResult.data ?? []) as unknown as SettlementRecord[]);
        if (!balanceResult.error) setBalances((balanceResult.data ?? []) as GroupBalance[]);
      }
      if (balanceResult.error) throw new Error(balanceResult.error.message);
      if (settlementResult.error) throw new Error(settlementResult.error.message);
    } catch (err) {
      if (sequence === fetchSequence.current) setError(message(err));
    } finally {
      if (sequence === fetchSequence.current) setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    setBalances([]);
    setSettlements([]);
    setExpenses([]);
    setDetailsError(null);
    void refetch();
    return () => { ++fetchSequence.current; };
  }, [refetch]);

  const mutate = useCallback(async (name: string, args: Record<string, unknown>) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    setActionError(null);
    try {
      const result = await rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      // A refresh failure must not imply a successful payment write failed.
      await refetch();
      return true;
    } catch (err) {
      setActionError(message(err));
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [refetch]);

  const createSettlement = (input: CreateSettlementInput) => mutate('record_settlement', {
    p_group_id: groupId,
    p_paid_by: input.paidBy,
    p_paid_to: input.paidTo,
    p_amount: input.amount,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod,
    p_note: input.note.trim() || null,
    p_idempotency_key: input.idempotencyKey,
  });

  return {
    balances, settlements, expenses, detailsError, loading, saving, error, actionError, refetch, createSettlement,
    clearActionError: () => setActionError(null),
    confirmSettlement: (id: string) => mutate('confirm_settlement', { p_settlement_id: id }),
    voidSettlement: (id: string, note = '') => mutate('void_settlement', { p_settlement_id: id, p_note: note.trim() || null }),
  };
};
