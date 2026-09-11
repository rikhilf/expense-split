export type SettlementStatus = 'pending' | 'confirmed' | 'voided';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'venmo' | 'cashapp' | 'paypal' | 'other';

export type SettlementRecord = {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  status: SettlementStatus;
  payment_method: string | null;
  note: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  voided_by: string | null;
  created_at: string;
  payment_date?: string | null;
  confirmed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type GroupBalance = { profile_id: string; balance: number };
export type LedgerExpense = import('./db').Expense & {
  expense_splits: { expense_id: string; user_id: string; amount: number }[];
};
export type CreateSettlementInput = {
  paidBy: string;
  paidTo: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod | null;
  note: string;
  idempotencyKey: string;
};
