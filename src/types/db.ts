import { Database } from '../lib/supabase';

export type Group = Database['public']['Tables']['groups']['Row'];
export type GroupInsert = Database['public']['Tables']['groups']['Insert'];
export type GroupUpdate = Database['public']['Tables']['groups']['Update'];

export type Membership = Database['public']['Tables']['memberships']['Row'];
export type MembershipInsert = Database['public']['Tables']['memberships']['Insert'];
export type MembershipUpdate = Database['public']['Tables']['memberships']['Update'];

export type Expense = Database['public']['Tables']['expenses']['Row'];
export type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
export type ExpenseUpdate = Database['public']['Tables']['expenses']['Update'];

export type ExpenseSplit = Database['public']['Tables']['expense_splits']['Row'];
export type ExpenseSplitInsert = Database['public']['Tables']['expense_splits']['Insert'];
export type ExpenseSplitUpdate = Database['public']['Tables']['expense_splits']['Update'];

export type Settlement = Database['public']['Tables']['settlements']['Row'];
export type SettlementInsert = Database['public']['Tables']['settlements']['Insert'];
export type SettlementUpdate = Database['public']['Tables']['settlements']['Update'];

export type User = {
  id: string;
  email: string;
  created_at: string;
};

export type GroupWithMembers = Group & {
  memberships: (Membership & {
    user: User;
  })[];
};

export type ExpenseWithSplits = Expense & {
  expense_splits: (ExpenseSplit & {
    user: User;
  })[];
  created_by_user: User;
}; 