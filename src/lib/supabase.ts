import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra;
const supabaseUrl = extra?.SUPABASE_URL;
const supabaseAnonKey = extra?.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  console.error('SUPABASE_URL:', supabaseUrl);
  console.error('SUPABASE_ANON_KEY:', supabaseAnonKey ? '[HIDDEN]' : 'undefined');
  throw new Error('Missing Supabase environment variables. Please check your .env file and app.config.js');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      groups: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      memberships: {
        Row: {
          id: string;
          user_id: string;
          group_id: string;
          role: 'admin' | 'member';
          joined_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          group_id: string;
          role?: 'admin' | 'member';
          joined_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          group_id?: string;
          role?: 'admin' | 'member';
          joined_at?: string;
        };
      };
      expenses: {
        Row: {
          id: string;
          group_id: string;
          created_by: string;
          description: string;
          amount: number;
          date: string;
          type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          created_by: string;
          description: string;
          amount: number;
          date: string;
          type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          created_by?: string;
          description?: string;
          amount?: number;
          date?: string;
          type?: string;
          created_at?: string;
        };
      };
      expense_splits: {
        Row: {
          id: string;
          expense_id: string;
          user_id: string;
          share: number;
          amount: number;
        };
        Insert: {
          id?: string;
          expense_id: string;
          user_id: string;
          share: number;
          amount: number;
        };
        Update: {
          id?: string;
          expense_id?: string;
          user_id?: string;
          share?: number;
          amount?: number;
        };
      };
      settlements: {
        Row: {
          id: string;
          group_id: string;
          paid_by: string | null;
          paid_to: string | null;
          amount: number;
          settled_at: string;
          note: string | null;
          expense_id: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          paid_by?: string | null;
          paid_to?: string | null;
          amount: number;
          settled_at?: string;
          note?: string | null;
          expense_id?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          paid_by?: string | null;
          paid_to?: string | null;
          amount?: number;
          settled_at?: string;
          note?: string | null;
          expense_id?: string | null;
        };
      };
      settlement_items: {
        Row: {
          id: string;
          settlement_id: string;
          expense_id: string;
          amount: number;
        };
        Insert: {
          id?: string;
          settlement_id: string;
          expense_id: string;
          amount: number;
        };
        Update: {
          id?: string;
          settlement_id?: string;
          expense_id?: string;
          amount?: number;
        };
      };
    };
  };
}; 