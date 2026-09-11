import { renderHook, act } from '@testing-library/react';
import { useAddExpense, AddExpenseData } from '../useAddExpense';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../../contexts/ProfileContext', () => ({
  useProfile: jest.fn(), getOrCreateProfileId: jest.fn(),
}));
import { supabase } from '../../lib/supabase';
import { useProfile, getOrCreateProfileId } from '../../contexts/ProfileContext';

const input: AddExpenseData = {
  description: ' Dinner ', amount: 100, date: '2026-09-10', splitMode: 'equal',
};
const mockMembers = jest.fn();
const expense = { id: 'e1', paid_by: 'p1' };

describe('useAddExpense atomic creation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (useProfile as jest.Mock).mockReturnValue({ profileId: 'p1' });
    mockMembers.mockResolvedValue({ data: ['p1', 'p2', 'p3'].map(user_id => ({ user_id })), error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table !== 'memberships') throw new Error('Unexpected direct table write: ' + table);
      return { select: jest.fn(() => ({ eq: mockMembers })) };
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: expense, error: null });
  });

  it('saves expense and equal splits atomically with profile payer', async () => {
    const { result } = renderHook(() => useAddExpense());
    await act(async () => {
      expect(await result.current.addExpense('g1', { ...input, participantIds: ['p1', 'p2'] })).toEqual(expense);
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('create_expense_with_splits', {
      p_group_id: 'g1', p_description: 'Dinner', p_amount: 100, p_date: input.date, p_paid_by: 'p1',
      p_splits: [{ user_id: 'p1', amount: 50, share: 0.5 }, { user_id: 'p2', amount: 50, share: 0.5 }],
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(mockMembers).toHaveBeenCalledWith('group_id', 'g1');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('allocates remainder cents in selected participant order', async () => {
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { await result.current.addExpense('g1', { ...input, amount: 20, participantIds: ['p3', 'p1', 'p2'] }); });
    expect(supabase.rpc).toHaveBeenCalledWith('create_expense_with_splits', expect.objectContaining({
      p_splits: [
        { user_id: 'p3', amount: 6.67, share: 1 / 3 },
        { user_id: 'p1', amount: 6.67, share: 1 / 3 },
        { user_id: 'p2', amount: 6.66, share: 1 / 3 },
      ],
    }));
  });

  it('sorts implicitly selected members for deterministic remainder allocation', async () => {
    mockMembers.mockResolvedValue({ data: ['p3', 'p2', 'p1'].map(user_id => ({ user_id })), error: null });
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { await result.current.addExpense('g1', { ...input, amount: 0.01 }); });
    expect((supabase.rpc as jest.Mock).mock.calls[0][1].p_splits).toEqual([
      { user_id: 'p1', amount: 0.01, share: 1 / 3 },
      { user_id: 'p2', amount: 0, share: 1 / 3 },
      { user_id: 'p3', amount: 0, share: 1 / 3 },
    ]);
  });

  it('normalizes custom shares and omits zero shares', async () => {
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { await result.current.addExpense('g1', {
      ...input, amount: 90, splitMode: 'shares', participantIds: ['p1', 'p2'],
      shares: [{ userId: 'p1', share: 1 }, { userId: 'p2', share: 2 }, { userId: 'p3', share: 0 }],
    }); });
    expect(supabase.rpc).toHaveBeenCalledWith('create_expense_with_splits', expect.objectContaining({
      p_splits: [{ user_id: 'p1', amount: 30, share: 1 / 3 }, { user_id: 'p2', amount: 60, share: 2 / 3 }],
    }));
  });

  it('accepts an explicit placeholder payer excluded from the split', async () => {
    mockMembers.mockResolvedValue({ data: ['p1', 'placeholder'].map(user_id => ({ user_id })), error: null });
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { await result.current.addExpense('g1', { ...input, paidBy: 'placeholder', participantIds: ['p1'] }); });
    expect(supabase.rpc).toHaveBeenCalledWith('create_expense_with_splits', expect.objectContaining({
      p_paid_by: 'placeholder', p_splits: [{ user_id: 'p1', amount: 100, share: 1 }],
    }));
  });

  it('does not save when membership fetch fails', async () => {
    mockMembers.mockResolvedValue({ data: null, error: { message: 'Members unavailable' } });
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { expect(await result.current.addExpense('g1', input)).toBeNull(); });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Members unavailable');
    expect(result.current.loading).toBe(false);
  });

  it.each([
    ['outsider participant', { participantIds: ['outsider'] }],
    ['duplicate participants', { participantIds: ['p1', 'p1'] }],
    ['empty participants', { participantIds: [] }],
    ['outsider payer', { paidBy: 'outsider' }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -1 }],
    ['fractional cents', { amount: 1.001 }],
    ['non-finite amount', { amount: Infinity }],
    ['invalid amount', { amount: NaN }],
    ['unsafe amount', { amount: Number.MAX_VALUE }],
    ['empty shares', { splitMode: 'shares', shares: [] }],
    ['negative share', { splitMode: 'shares', shares: [{ userId: 'p1', share: -1 }] }],
    ['non-finite share', { splitMode: 'shares', shares: [{ userId: 'p1', share: Infinity }] }],
    ['duplicate shares', { splitMode: 'shares', shares: [{ userId: 'p1', share: 1 }, { userId: 'p1', share: 1 }] }],
    ['outsider share', { splitMode: 'shares', shares: [{ userId: 'outsider', share: 1 }] }],
    ['mismatched shares', { splitMode: 'shares', participantIds: ['p1', 'p2'], shares: [{ userId: 'p1', share: 1 }] }],
  ])('rejects %s before saving', async (_label, override) => {
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { expect(await result.current.addExpense('g1', { ...input, ...override } as AddExpenseData)).toBeNull(); });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });

  it('rejects an empty group', async () => {
    mockMembers.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { expect(await result.current.addExpense('g1', input)).toBeNull(); });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('uses a recovered profile ID and rejects an unauthenticated caller', async () => {
    (useProfile as jest.Mock).mockReturnValue({ profileId: null });
    (getOrCreateProfileId as jest.Mock).mockResolvedValueOnce('p2').mockResolvedValueOnce(null);
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { await result.current.addExpense('g1', input); });
    expect(supabase.rpc).toHaveBeenCalledWith('create_expense_with_splits', expect.objectContaining({ p_paid_by: 'p2' }));
    await act(async () => { expect(await result.current.addExpense('g1', input)).toBeNull(); });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('User not authenticated');
  });

  it('surfaces atomic RPC failure with no direct-write fallback and allows retry', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: { message: 'Invalid split total' } });
    const { result } = renderHook(() => useAddExpense());
    await act(async () => { expect(await result.current.addExpense('g1', input)).toBeNull(); });
    expect(result.current.error).toBe('Invalid split total');
    expect(result.current.loading).toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await result.current.addExpense('g1', input)).toEqual(expense); });
    expect(result.current.error).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('guards rapid double taps before React renders loading state', async () => {
    let complete!: (value: { data: typeof expense; error: null }) => void;
    (supabase.rpc as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const { result } = renderHook(() => useAddExpense());
    let first!: Promise<unknown>;
    await act(async () => {
      first = result.current.addExpense('g1', input);
      expect(await result.current.addExpense('g1', input)).toBeNull();
    });
    expect(result.current.loading).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { complete({ data: expense, error: null }); expect(await first).toEqual(expense); });
    expect(result.current.loading).toBe(false);
  });
});
