import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type Profile = {
  id: string;
  auth_user_id: string | null;
  display_name: string;
  email: string | null;
  avatar_url?: string | null;
};

type ProfileContextValue = {
  profileId: string | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  reset: () => void;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

/** Module-level cache to avoid repeated Supabase calls within a session */
let cachedProfile: Profile | null = null;
let inFlight: Promise<Profile | null> | null = null;

async function ensureProfile(): Promise<Profile | null> {
  if (cachedProfile) return cachedProfile;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    if (!user) return null;

    // Try existing profile
    const { data: existing, error: getErr } = await supabase
      .from('profiles')
      .select('id, auth_user_id, display_name, email, avatar_url')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (getErr) throw getErr;

    if (existing) {
      cachedProfile = existing as Profile;
      return cachedProfile;
    }

    // Create if missing
    const displayName =
      (user.user_metadata?.full_name as string | undefined)
      ?? (typeof user.email === 'string' ? user.email.split('@')[0] : 'You');

    const { data: created, error: createErr } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: user.id,
        display_name: displayName,
        email: typeof user.email === 'string' ? user.email : null,
      })
      .select('id, auth_user_id, display_name, email, avatar_url')
      .single();

    if (createErr || !created) {
      throw createErr ?? new Error('Failed to create profile');
    }

    cachedProfile = created as Profile;
    return cachedProfile;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<Profile | null>(cachedProfile);
  const [loading, setLoading] = useState<boolean>(!cachedProfile);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const setSafe = useCallback(<T,>(fn: (v: T) => void, v: T) => { if (mountedRef.current) fn(v); }, []);

  const resolve = useCallback(async () => {
    try {
      setSafe(setLoading, true);
      setSafe(setError, null);
      const p = await ensureProfile();
      setSafe(setProfile, p);
    } catch (e: any) {
      setSafe(setError, e?.message ?? 'Failed to resolve profile');
      setSafe(setProfile, null);
      cachedProfile = null;
    } finally {
      setSafe(setLoading, false);
    }
  }, [setSafe]);

  const refresh = useCallback(async () => {
    cachedProfile = null;
    await resolve();
  }, [resolve]);

  const reset = useCallback(() => {
    cachedProfile = null;
    setProfile(null);
    setError(null);
    setLoading(false);
  }, []);

  // On mount: resolve if not cached
  useEffect(() => { if (!cachedProfile) { void resolve(); } }, [resolve]);

  // Respond to auth changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        reset();
      } else {
        await refresh();
      }
    });
    return () => { sub.subscription?.unsubscribe(); };
  }, [refresh, reset]);

  const value = useMemo<ProfileContextValue>(() => ({
    profileId: profile?.id ?? null,
    profile,
    loading,
    error,
    refresh,
    reset,
  }), [profile, loading, error, refresh, reset]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}

/** Optional: non-hook access for utility modules */
export async function getOrCreateProfileId(): Promise<string | null> {
  const p = await ensureProfile();
  return p?.id ?? null;
}
