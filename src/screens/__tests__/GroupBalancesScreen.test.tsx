import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GroupBalancesScreen } from '../GroupBalancesScreen';
import { useSettlements } from '../../hooks/useSettlements';
import { useMembers } from '../../hooks/useMembers';
import { Linking } from 'react-native';

// Render native controls as DOM controls to exercise the real screen handlers.
jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: ({ children }: any) => React.createElement('div', {}, children),
    KeyboardAvoidingView: ({ children }: any) => React.createElement('div', {}, children),
    Platform: { OS: 'web' },
    Text: ({ children }: any) => React.createElement('span', {}, children),
    ScrollView: ({ children }: any) => React.createElement('div', {}, children),
    TouchableOpacity: ({ children, onPress, disabled }: any) => React.createElement('button', { onClick: onPress, disabled }, children),
    TextInput: ({ accessibilityLabel, value, onChangeText }: any) => React.createElement('input', { 'aria-label': accessibilityLabel, value, onChange: (e: any) => onChangeText(e.target.value) }),
    Modal: ({ visible, children }: any) => visible ? React.createElement('div', {}, children) : null,
    ActivityIndicator: () => null, RefreshControl: () => null,
    StyleSheet: { create: (styles: unknown) => styles }, Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
  };
});
jest.mock('../../hooks/useSettlements', () => ({ useSettlements: jest.fn() }));
jest.mock('../../components/PaymentDatePicker', () => require('../../components/PaymentDatePicker.web'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../hooks/useMembers', () => ({ useMembers: jest.fn() }));
jest.mock('../../contexts/ProfileContext', () => ({ useProfile: () => ({ profileId: 'payer' }) }));

describe('GroupBalancesScreen', () => {
  let ledger: any;
  const show = () => render(<GroupBalancesScreen route={{ params: { group: { id: 'g1', name: 'House' } } } as any} navigation={{ goBack: jest.fn() } as any} />);
  beforeEach(() => {
    jest.clearAllMocks();
    ledger = {
      balances: [{ profile_id: 'payer', balance: -30 }, { profile_id: 'recipient', balance: 30 }],
      settlements: [], loading: false, saving: false, error: null, actionError: null,
      expenses: [], detailsError: null,
      refetch: jest.fn(), clearActionError: jest.fn(), createSettlement: jest.fn().mockResolvedValue(true), confirmSettlement: jest.fn().mockResolvedValue(true), voidSettlement: jest.fn().mockResolvedValue(true),
    };
    (useSettlements as jest.Mock).mockImplementation(() => ledger);
    (useMembers as jest.Mock).mockReturnValue({ members: [{ user_id: 'payer', user: { display_name: 'Alex' } }, { user_id: 'recipient', user: { display_name: 'Bailey', paypal_username: 'bailey' } }], isCurrentUserAdmin: false, loading: false, error: null, refetch: jest.fn() });
  });

  it('rejects overpayments and records a partial completed payment only after review', async () => {
    show();
    fireEvent.click(screen.getByText('Settle up'));
    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '31' } });
    fireEvent.click(screen.getByText('Review payment'));
    expect(screen.getByText('Enter an amount from $0.01 to $30.00.')).toBeTruthy();
    expect(ledger.createSettlement).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Review payment'));
    expect(ledger.createSettlement).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Record completed payment'));
    await waitFor(() => expect(ledger.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ paidBy: 'payer', paidTo: 'recipient', amount: 10, paymentDate: expect.any(String) })));
  });

  it('opens a payment profile without creating a payment and confirms completed records explicitly', async () => {
    show();
    fireEvent.click(screen.getByText('Settle up'));
    fireEvent.click(screen.getByText('Pay now'));
    fireEvent.click(screen.getByText('PayPal'));
    fireEvent.click(screen.getByText('Review payment'));
    fireEvent.click(screen.getByText('Open PayPal'));
    expect(Linking.openURL).toHaveBeenCalled();
    expect(ledger.createSettlement).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Opening the app does not confirm payment/)).toBeTruthy());
    fireEvent.click(screen.getByText('Record completed payment'));
    await waitFor(() => expect(ledger.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'paypal' })));
  });

  it('keeps a retry idempotency key after an uncertain write response', async () => {
    ledger.createSettlement.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    show();
    fireEvent.click(screen.getByText('Settle up'));
    fireEvent.click(screen.getByText('Review payment'));
    fireEvent.click(screen.getByText('Record completed payment'));
    await waitFor(() => expect(ledger.createSettlement).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('Record completed payment'));
    await waitFor(() => expect(ledger.createSettlement).toHaveBeenCalledTimes(2));
    expect(ledger.createSettlement.mock.calls[0][0].idempotencyKey).toBe(ledger.createSettlement.mock.calls[1][0].idempotencyKey);
  });

  it('retains void access while invalid expenses block new payments', async () => {
    ledger.error = 'Expense splits do not match the expense total';
    ledger.settlements = [{ id: 's1', paid_by: 'payer', paid_to: 'recipient', amount: 10, status: 'confirmed', created_by: null, created_at: '2026-09-10' }];
    show();
    expect(screen.queryByText('Settle up')).toBeNull();
    expect(screen.getByText('Recorded by Unknown member')).toBeTruthy();
    fireEvent.click(screen.getByText('Undo payment record'));
    fireEvent.change(screen.getByLabelText('Reason for voiding'), { target: { value: 'Recorded twice' } });
    fireEvent.click(screen.getByText('Void record'));
    await waitFor(() => expect(ledger.voidSettlement).toHaveBeenCalledWith('s1', 'Recorded twice'));
  });

  it('lets a payer record a different creditor than the suggested one', async () => {
    ledger.balances = [{ profile_id: 'payer', balance: -30 }, { profile_id: 'recipient', balance: 20 }, { profile_id: 'other', balance: 10 }];
    (useMembers as jest.Mock).mockReturnValue({ members: [{ user_id: 'payer', user: { display_name: 'Alex' } }, { user_id: 'recipient', user: { display_name: 'Bailey' } }, { user_id: 'other', user: { display_name: 'Casey' } }], isCurrentUserAdmin: false, loading: false, error: null, refetch: jest.fn() });
    show();
    fireEvent.click(screen.getByText('Record a different payment'));
    fireEvent.click(screen.getByRole('button', { name: 'Casey' }));
    expect((screen.getByLabelText('Payment amount') as HTMLInputElement).value).toBe('10.00');
    fireEvent.click(screen.getByText('Review payment'));
    fireEvent.click(screen.getByText('Record completed payment'));
    await waitFor(() => expect(ledger.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ paidBy: 'payer', paidTo: 'other', amount: 10 })));
  });

  it('explains signed expense shares and hides incomplete breakdowns', () => {
    ledger.expenses = [{ id: 'e1', amount: 60, paid_by: 'recipient', created_by: 'recipient', description: 'Dinner', date: '2026-09-11', expense_splits: [{ expense_id: 'e1', user_id: 'payer', amount: 30 }, { expense_id: 'e1', user_id: 'recipient', amount: 30 }] }];
    show();
    fireEvent.click(screen.getByText('Show breakdown for Alex'));
    expect(screen.getByText('Dinner · Assigned share')).toBeTruthy();
    expect(screen.getByText('Total: −$30.00')).toBeTruthy();
    fireEvent.click(screen.getByText('Show breakdown for Bailey'));
    expect(screen.getByText('Dinner · Paid for the group')).toBeTruthy();
    expect(screen.getByText('+$60.00')).toBeTruthy();
    expect(screen.getByText('−$30.00')).toBeTruthy();
  });

  it('does not show a false itemized total when detail data disagrees with the server', () => {
    show();
    fireEvent.click(screen.getByText('Show breakdown for Alex'));
    expect(screen.getByText(/details have changed or are incomplete/)).toBeTruthy();
    expect(screen.queryByText('Total: −$30.00')).toBeNull();
  });

  it('allows an admin to record other members without pretending to be the payer', async () => {
    ledger.balances = [{ profile_id: 'other', balance: -30 }, { profile_id: 'recipient', balance: 30 }];
    (useMembers as jest.Mock).mockReturnValue({ members: [], isCurrentUserAdmin: true, loading: false, refetch: jest.fn() });
    show();
    fireEvent.click(screen.getByText('Record payment for members'));
    expect(screen.getByText(/You will be listed as the recorder/)).toBeTruthy();
    fireEvent.click(screen.getByText('Review payment'));
    fireEvent.click(screen.getByText('Record completed payment'));
    await waitFor(() => expect(ledger.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ paidBy: 'other', paidTo: 'recipient', paymentDate: expect.any(String) })));
  });

  it('hides payment actions for an uninvolved ordinary member', () => {
    ledger.balances = [{ profile_id: 'other', balance: -30 }, { profile_id: 'recipient', balance: 30 }];
    show();
    expect(screen.queryByText('Settle up')).toBeNull();
    expect(screen.queryByText('Record a different payment')).toBeNull();
    expect(screen.queryByText('Record payment for members')).toBeNull();
  });

  it('accepts a manually entered Venmo handle but never records on app launch', async () => {
    show();
    fireEvent.click(screen.getByText('Settle up'));
    expect(screen.queryByText('Mark as sent (await confirmation)')).toBeNull();
    fireEvent.click(screen.getByText('Pay now'));
    fireEvent.change(screen.getByLabelText('Recipient payment handle'), { target: { value: '@bailey-test' } });
    fireEvent.click(screen.getByText('Review payment'));
    expect((screen.getByRole('button', { name: 'Record completed payment' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Open Venmo'));
    await waitFor(() => expect(screen.getByText(/Opening the app does not confirm payment/)).toBeTruthy());
    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('https://venmo.com/u/bailey-test?txn=pay'));
    expect(ledger.createSettlement).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(ledger.createSettlement).not.toHaveBeenCalled();
  });

  it('records an admin payment without handles or a method', async () => {
    ledger.balances = [{ profile_id: 'other', balance: -30 }, { profile_id: 'recipient', balance: 30 }];
    (useMembers as jest.Mock).mockReturnValue({ members: [], isCurrentUserAdmin: true, loading: false, refetch: jest.fn() });
    show();
    fireEvent.click(screen.getByText('Record payment for members'));
    expect(screen.queryByText('Pay now')).toBeNull();
    expect(screen.queryByLabelText('Recipient payment handle')).toBeNull();
    expect(screen.queryByText('Venmo')).toBeNull();
    fireEvent.click(screen.getByText('Review payment'));
    fireEvent.click(screen.getByText('Record completed payment'));
    await waitFor(() => expect(ledger.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ paidBy: 'other', paidTo: 'recipient', paymentMethod: null })));
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('does not unlock record-payment after a failed external launch', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('Could not open Venmo'));
    show();
    fireEvent.click(screen.getByText('Settle up'));
    fireEvent.click(screen.getByText('Pay now'));
    fireEvent.change(screen.getByLabelText('Recipient payment handle'), { target: { value: 'bailey' } });
    fireEvent.click(screen.getByText('Review payment'));
    fireEvent.click(screen.getByText('Open Venmo'));
    await waitFor(() => expect(screen.getByText('Could not open Venmo')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Record completed payment' }) as HTMLButtonElement).disabled).toBe(true);
    expect(ledger.createSettlement).not.toHaveBeenCalled();
  });
});
