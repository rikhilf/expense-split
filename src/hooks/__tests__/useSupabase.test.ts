import { useSupabase } from '../useSupabase';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: 'SUPABASE_CLIENT' }));

describe('useSupabase', () => {
  it('returns the supabase client', () => {
    expect(useSupabase()).toEqual({ supabase: 'SUPABASE_CLIENT' });
  });
});
