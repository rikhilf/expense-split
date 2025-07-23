import { useSupabase } from '../useSupabase';
import { supabase as supabaseClient } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: { test: 'client' },
}));

describe('useSupabase', () => {
  it('returns the supabase client', () => {
    const { supabase } = useSupabase();
    expect(supabase).toEqual({ test: 'client' });
  });
});
