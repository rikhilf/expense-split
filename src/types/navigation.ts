import { Group, Expense } from './db';

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

export type AppStackParamList = {
  GroupList: undefined;
  CreateGroup: undefined;
  GroupDetail: { group: Group; flash?: string };
  AddExpense: { group: Group };
  ExpenseDetail: { expense: Expense; group: Group };
  MemberProfile: {
    groupId: string;
    profile: {
      id: string;
      display_name: string;
      email: string | null;
      venmo_username?: string | null;
      cashapp_username?: string | null;
      paypal_username?: string | null;
      authenticated: boolean;
    };
    canEdit: boolean;
  };
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
}; 
