import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import type { Database } from '../types/database.types';

const extra = Constants.expoConfig?.extra;
const supabaseUrl = extra?.SUPABASE_URL;
const supabaseAnonKey = extra?.SUPABASE_ANON_KEY;
const supabaseFunctionsUrl: string | undefined = (extra as any)?.SUPABASE_FUNCTIONS_URL;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  console.error('SUPABASE_URL:', supabaseUrl);
  console.error('SUPABASE_ANON_KEY:', supabaseAnonKey ? '[HIDDEN]' : 'undefined');
  throw new Error('Missing Supabase environment variables. Please check your .env file and app.config.js');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  functions: {
    // Allows hitting local Edge Functions in dev (e.g. http://127.0.0.1:54321/functions/v1)
    url: supabaseFunctionsUrl,
  },
});
