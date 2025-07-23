import { renderHook, actAsync } from '../helpers';
import { useExpenses } from '../useExpenses';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

describe('useExpenses', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches expenses for a group', async () => {
    const data = [{ id: 'e1' }];
    const order = jest.fn().mockResolvedValue({ data, error: null });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const { result } = renderHook(() => useExpenses('g1'));
    await actAsync(async () => {
      await Promise.resolve();
    });

    expect(result.current.expenses).toEqual(data);
    expect(supabase.from).toHaveBeenCalledWith('expenses');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('group_id', 'g1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
