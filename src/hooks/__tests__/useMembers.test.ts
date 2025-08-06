import { renderHook, act } from '@testing-library/react';
import { useMembers } from '../useMembers';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '../../lib/supabase';

describe('useMembers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches members for a group', async () => {
    const data = [{ id: 'm1', user: { email: 'test@example.com' } }];
    const eq = jest.fn().mockResolvedValue({ data, error: null });
    const select = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const { result } = renderHook(() => useMembers('g1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.members).toEqual(data);
    expect(supabase.from).toHaveBeenCalledWith('memberships');
    expect(select).toHaveBeenCalledWith('*, user:profiles(*)');
    expect(eq).toHaveBeenCalledWith('group_id', 'g1');
  });
});
