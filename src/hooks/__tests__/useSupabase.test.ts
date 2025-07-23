import { useSupabase } from '../useSupabase';
// The actual supabase client is mocked in this test
import { supabase as supabaseClient } from '../../lib/supabase';

// Provide a simple mock supabase client to verify the hook returns it
jest.mock('../../lib/supabase', () => ({
  supabase: { test: 'client' },
}));

describe('useSupabase', () => {
  // The hook should simply expose the mocked client
  it('returns the supabase client', () => {
    const { supabase } = useSupabase();
    expect(supabase).toEqual({ test: 'client' });
  });
});
