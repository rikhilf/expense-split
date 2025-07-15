import { Group, Expense } from './db';

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

export type AppStackParamList = {
  GroupList: undefined;
  CreateGroup: undefined;
  GroupDetail: { group: Group };
  AddExpense: { group: Group };
  ExpenseDetail: { expense: Expense; group: Group };
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
}; 