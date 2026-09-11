import { act, renderHook, waitFor } from '@testing-library/react';
import { useSettlements } from '../useSettlements';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const initialBalances = [{ profile_id: 'payer-profile', balance: -30 }, { profile_id: 'recipient-profile', balance: 30 }];
const input = { paidBy: 'payer-profile', paidTo: 'recipient-profile', amount: 10, paymentDate: '2026-09-11', paymentMethod: 'cash' as const, note: '', idempotencyKey: 'operation-1' };

describe('useSettlements', () => {
  let history: unknown[];
  let balances: typeof initialBalances;
  let order: jest.Mock;
  let expenseOrder: jest.Mock;
  beforeEach(() => {
    jest.resetAllMocks();
    history = [];
    balances = initialBalances;
    order = jest.fn().mockImplementation(async () => ({ data: history, error: null }));
    expenseOrder = jest.fn().mockResolvedValue({ data: [], error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => ({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: table === 'expenses' ? expenseOrder : order }) }) }) }));
    (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => name === 'get_group_balances' ? { data: balances, error: null } : { data: {}, error: null });
  });

  it('loads profile-ID balances and group-filtered history', async () => {
    const { result } = renderHook(() => useSettlements('group-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.balances).toEqual(initialBalances);
    expect(supabase.rpc).toHaveBeenCalledWith('get_group_balances', { p_group_id: 'group-1' });
    expect(supabase.from).toHaveBeenCalledWith('settlements');
    expect((supabase.from as jest.Mock).mock.results[0].value.select().eq).toHaveBeenCalledWith('group_id', 'group-1');
  });

  it('preserves balances on rejected writes and reuses the supplied retry key', async () => {
    const { result } = renderHook(() => useSettlements('group-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => name === 'get_group_balances' ? { data: balances, error: null } : { data: null, error: { message: 'Payment exceeds the outstanding balance' } });
    await act(async () => { expect(await result.current.createSettlement(input)).toBe(false); });
    await act(async () => { expect(await result.current.createSettlement(input)).toBe(false); });
    expect(result.current.actionError).toBe('Payment exceeds the outstanding balance');
    expect(result.current.balances).toEqual(initialBalances);
    const writes = (supabase.rpc as jest.Mock).mock.calls.filter(([name]) => name === 'record_settlement');
    expect(writes).toHaveLength(2);
    expect(writes[0][1]).toMatchObject({ p_paid_by: 'payer-profile', p_paid_to: 'recipient-profile', p_payment_date: '2026-09-11', p_idempotency_key: 'operation-1' });
    expect(writes[1][1].p_idempotency_key).toBe(writes[0][1].p_idempotency_key);
  });

  it('loads nested profile splits and keeps detail errors separate from payment history', async () => {
    const expenses = [{ id: 'e1', expense_splits: [{ expense_id: 'e1', user_id: 'payer-profile', amount: 30 }] }];
    expenseOrder.mockResolvedValueOnce({ data: expenses, error: null });
    const { result } = renderHook(() => useSettlements('group-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.expenses).toEqual(expenses);
    const index = (supabase.from as jest.Mock).mock.calls.findIndex(([table]) => table === 'expenses');
    const query = (supabase.from as jest.Mock).mock.results[index].value;
    expect(query.select).toHaveBeenCalledWith('*, expense_splits(expense_id, user_id, amount)');
    expect(query.select().eq).toHaveBeenCalledWith('group_id', 'group-1');
    expenseOrder.mockResolvedValue({ data: null, error: { message: 'Details unavailable' } });
    await act(async () => { await result.current.refetch(); });
    expect(result.current.detailsError).toBe('Details unavailable');
    expect(result.current.expenses).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.balances).toEqual(initialBalances);
  });

  it('refreshes pending, confirmed, and voided records from server truth', async () => {
    const { result } = renderHook(() => useSettlements('group-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => {
      if (name === 'get_group_balances') return { data: balances, error: null };
      const status = name === 'record_settlement' || name === 'confirm_settlement' ? 'confirmed' : 'voided';
      history = [{ id: 's1', status, paid_by: 'payer-profile', paid_to: 'recipient-profile', amount: 10 }];
      balances = status === 'confirmed' ? [{ profile_id: 'payer-profile', balance: -20 }, { profile_id: 'recipient-profile', balance: 20 }] : initialBalances;
      return { data: history[0], error: null };
    });
    await act(async () => { expect(await result.current.createSettlement(input)).toBe(true); });
    expect(result.current.settlements[0].status).toBe('confirmed');
    expect(result.current.balances[0].balance).toBe(-20);
    await act(async () => { expect(await result.current.confirmSettlement('s1')).toBe(true); });
    expect(result.current.settlements[0].status).toBe('confirmed');
    expect(result.current.balances[0].balance).toBe(-20);
    await act(async () => { expect(await result.current.voidSettlement('s1', 'Mistake')).toBe(true); });
    expect(result.current.settlements[0].status).toBe('voided');
    expect(result.current.balances).toEqual(initialBalances);
    expect(supabase.rpc).toHaveBeenCalledWith('void_settlement', { p_settlement_id: 's1', p_note: 'Mistake' });
  });

  it('blocks double clicks while a write is in flight', async () => {
    const { result } = renderHook(() => useSettlements('group-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let resolve!: (value: unknown) => void;
    (supabase.rpc as jest.Mock).mockImplementation((name: string) => name === 'get_group_balances' ? Promise.resolve({ data: balances, error: null }) : new Promise(done => { resolve = done; }));
    await act(async () => {
      const first = result.current.createSettlement(input);
      expect(await result.current.createSettlement(input)).toBe(false);
      resolve({ data: {}, error: null });
      expect(await first).toBe(true);
    });
    expect((supabase.rpc as jest.Mock).mock.calls.filter(([name]) => name === 'record_settlement')).toHaveLength(1);
  });

  it('reports refresh failure separately after a successful payment write', async () => {
    const { result } = renderHook(() => useSettlements('group-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => name === 'get_group_balances' ? { data: null, error: { message: 'Connection lost' } } : { data: {}, error: null });
    await act(async () => { expect(await result.current.createSettlement(input)).toBe(true); });
    expect(result.current.error).toBe('Connection lost');
    expect(result.current.actionError).toBeNull();
  });

  it('loads history even when malformed expenses prevent a balance calculation', async () => {
    history = [{ id: 's1', status: 'confirmed', paid_by: 'payer-profile', paid_to: 'recipient-profile', amount: 10 }];
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'Expense total does not match its splits' } });
    const { result } = renderHook(() => useSettlements('group-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Expense total does not match its splits');
    expect(result.current.settlements).toEqual(history);
  });
});
