import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import { useProfile } from '../contexts/ProfileContext';
import { PaymentDatePicker } from '../components/PaymentDatePicker';
import { useMembers } from '../hooks/useMembers';
import { useSettlements } from '../hooks/useSettlements';
import { moneyToCents, suggestSettlements } from '../lib/settlementBalances';
import { balanceBreakdown } from '../lib/balanceBreakdown';
import type { AppStackParamList } from '../types/navigation';
import { openPaymentLink, paymentLinks, PaymentProvider, providerLabels } from '../lib/paymentLinks';
import { historyMonths, localDate, paymentDate, validatePaymentDate } from '../lib/settlementHistory';

type Props = StackScreenProps<AppStackParamList, 'GroupBalances'>;
type Draft = { paidBy: string; paidTo: string; amount: string; maximumCents: number; provider: PaymentProvider; handle: string; note: string; paymentDate: string; mode: 'pay' | 'record' };
const providers: PaymentProvider[] = ['venmo', 'cashapp', 'paypal'];
const money = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`;
// An operation identifier, not a secret. Preserved for retries of the same payload.
const operationId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const value = Math.floor(Math.random() * 16);
  return (c === 'x' ? value : (value & 3) | 8).toString(16);
});

export const GroupBalancesScreen: React.FC<Props> = ({ route, navigation }) => {
  const { group } = route.params;
  const { profileId } = useProfile();
  const insets = useSafeAreaInsets();
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const { members, isCurrentUserAdmin, loading: membersLoading, error: membersError, refetch: refetchMembers } = useMembers(group.id);
  const ledger = useSettlements(group.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openingPayment, setOpeningPayment] = useState(false);
  const [paymentOpened, setPaymentOpened] = useState(false);
  const opening = useRef(false);
  const [visibleMonths, setVisibleMonths] = useState(3);
  const history = historyMonths(ledger.settlements, visibleMonths);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidNote, setVoidNote] = useState('');
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const name = (id: string | null) => id ? members.find(member => member.user_id === id)?.user?.display_name || `Member ${id.slice(0, 8)}` : 'Unknown member';
  const savedHandle = (id: string, provider: PaymentProvider) => {
    const user = members.find(member => member.user_id === id)?.user;
    return (provider === 'venmo' ? user?.venmo_username : provider === 'cashapp' ? user?.cashapp_username : user?.paypal_username) || '';
  };
  const calculation = useMemo(() => {
    try {
      const balances = ledger.balances.map(balance => ({ profileId: balance.profile_id, balanceCents: moneyToCents(balance.balance) }));
      return { balances, suggestions: suggestSettlements(balances), error: null };
    } catch (error) {
      return { balances: [], suggestions: [], error: error instanceof Error ? error.message : 'Balances could not be calculated.' };
    }
  }, [ledger.balances]);
  const unavailable = ledger.loading || membersLoading || !!ledger.error || !!membersError || !!calculation.error;
  const refresh = () => { void ledger.refetch(); void refetchMembers(); };
  const myBalance = calculation.balances.find(balance => balance.profileId === profileId)?.balanceCents ?? 0;
  const debtors = calculation.balances.filter(balance => balance.balanceCents < 0);
  const creditors = calculation.balances.filter(balance => balance.balanceCents > 0);
  const canRecord = (paidBy: string, paidTo: string) => isCurrentUserAdmin || [paidBy, paidTo].includes(profileId ?? '');
  const paymentLabel = (paidBy: string, paidTo: string) => paidBy === profileId ? 'Settle up' : paidTo === profileId ? 'Record received payment' : 'Record payment for members';
  const breakdown = useMemo(() => {
    if (!expandedProfile || unavailable) return { lines: [], error: null };
    try {
      if (ledger.detailsError) throw new Error(ledger.detailsError);
      return { lines: balanceBreakdown(expandedProfile, ledger.expenses, ledger.settlements, calculation.balances.find(balance => balance.profileId === expandedProfile)?.balanceCents ?? 0), error: null };
    } catch (error) {
      return { lines: [], error: error instanceof Error ? error.message : 'Could not load balance details.' };
    }
  }, [expandedProfile, unavailable, ledger.detailsError, ledger.expenses, ledger.settlements, calculation.balances]);
  const maximumFor = (paidBy: string, paidTo: string) => Math.min(
    -(calculation.balances.find(balance => balance.profileId === paidBy)?.balanceCents ?? 0),
    calculation.balances.find(balance => balance.profileId === paidTo)?.balanceCents ?? 0,
  );
  const begin = (paidBy: string, paidTo: string, amountCents: number) => {
    if (!canRecord(paidBy, paidTo)) return;
    ledger.clearActionError(); setLocalError(null); setNotice(null); setReviewing(false);
    operation.current = null;
    setPaymentOpened(false);
    setDraft({ paidBy, paidTo, amount: (amountCents / 100).toFixed(2), maximumCents: amountCents, provider: 'venmo', handle: savedHandle(paidTo, 'venmo'), note: '', paymentDate: localDate(), mode: 'record' });
  };
  const changePair = (paidBy: string, paidTo: string) => {
    if (!draft || !canRecord(paidBy, paidTo)) return;
    const maximumCents = maximumFor(paidBy, paidTo);
    setPaymentOpened(false);
    setDraft({ ...draft, paidBy, paidTo, maximumCents, amount: (maximumCents / 100).toFixed(2), handle: savedHandle(paidTo, draft.provider), mode: paidBy === profileId ? draft.mode : 'record' });
    setLocalError(null);
  };
  const review = () => {
    try {
      if (!draft || !/^\d+(\.\d{1,2})?$/.test(draft.amount.trim())) throw new Error('Enter an amount with at most two decimal places.');
      const cents = moneyToCents(draft.amount.trim());
      if (cents <= 0 || cents > draft.maximumCents) throw new Error(`Enter an amount from $0.01 to ${money(draft.maximumCents)}.`);
      validatePaymentDate(draft.paymentDate);
      if (draft.mode === 'pay') paymentLinks(draft.provider, draft.handle, draft.amount, draft.note);
      setLocalError(null); setReviewing(true);
    } catch (error) { setLocalError(error instanceof Error ? error.message : 'Check the amount.'); }
  };
  const save = async () => {
    if (!draft || unavailable || !canRecord(draft.paidBy, draft.paidTo)) return;
    const input = { paidBy: draft.paidBy, paidTo: draft.paidTo, amount: Number(draft.amount), paymentDate: draft.paymentDate, paymentMethod: draft.mode === 'pay' ? draft.provider : null, note: draft.note };
    const payload = JSON.stringify(input);
    if (operation.current?.payload !== payload) operation.current = { payload, key: operationId() };
    const ok = await ledger.createSettlement({ ...input, idempotencyKey: operation.current.key });
    if (ok) {
      setDraft(null); operation.current = null;
      setNotice('Payment recorded. Balances updated when the refresh completes.');
    }
  };
  const openPaymentProfile = async () => {
    if (!draft || draft.paidBy !== profileId || opening.current) return;
    opening.current = true; setOpeningPayment(true); setLocalError(null);
    try {
      await openPaymentLink(paymentLinks(draft.provider, draft.handle, draft.amount, draft.note), Platform.OS !== 'web', url => Linking.openURL(url));
      setPaymentOpened(true);
    } catch (error) { setLocalError(error instanceof Error ? error.message : 'Could not open the payment app. You can still record a payment made elsewhere.'); }
    finally { opening.current = false; setOpeningPayment(false); }
  };
  const button = (label: string, action: () => void, disabled = false, secondary = false) => (
    <TouchableOpacity accessibilityRole="button" onPress={action} disabled={disabled} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}>
      <Text style={secondary ? styles.secondaryText : styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={ledger.loading || membersLoading} onRefresh={refresh} />}>
      <Text style={styles.title}>{group.name}</Text>
      {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
      {(ledger.loading || membersLoading) && <ActivityIndicator accessibilityLabel="Loading balances" />}
      {(ledger.error || membersError || calculation.error) && <View style={styles.card}>
        <Text style={styles.error}>{ledger.error || membersError || calculation.error}</Text>
        <Text style={styles.body}>If an expense total does not match its splits, correct it in Expenses before settling.</Text>
        {button('Retry', refresh)}
        {button('Review expenses', () => navigation.goBack(), false, true)}
      </View>}
      {!unavailable && <>
        <Text style={styles.summary}>{myBalance < 0 ? `You owe ${money(myBalance)}` : myBalance > 0 ? `You are owed ${money(myBalance)}` : 'You are settled up'}</Text>
        <Text style={styles.body}>Recorded payments update balances immediately. Amounts are in USD.</Text>
        <Text style={styles.caption}>Positive (+) means money is owed to a person; negative (−) means they owe. Tap a breakdown to see why.</Text>
        <View style={styles.card}>{calculation.balances.map(balance => <View key={balance.profileId}>
          <View style={styles.row}>
          <Text style={styles.body}>{name(balance.profileId)}{balance.profileId === profileId ? ' (you)' : ''}</Text>
          <Text style={styles.body}>{balance.balanceCents < 0 ? 'Owes ' : balance.balanceCents > 0 ? 'Is owed ' : ''}{money(balance.balanceCents)}</Text>
          </View>
          {button(`${expandedProfile === balance.profileId ? 'Hide' : 'Show'} breakdown for ${name(balance.profileId)}`, () => setExpandedProfile(expandedProfile === balance.profileId ? null : balance.profileId), false, true)}
          {expandedProfile === balance.profileId && <View style={styles.card}>
            {breakdown.error ? <><Text style={styles.error}>{breakdown.error}</Text>{button('Refresh details', refresh)}</> : <>
              {breakdown.lines.length === 0 && <Text style={styles.caption}>No expenses or confirmed payments yet.</Text>}
              {breakdown.lines.map(line => <View key={line.key} style={styles.row}>
                {line.expense ? <TouchableOpacity accessibilityRole="button" style={{ flex: 1 }} onPress={() => navigation.navigate('ExpenseDetail', { expense: line.expense!, group })}><Text style={styles.link}>{line.label}</Text><Text style={styles.caption}>{line.expense.date}</Text></TouchableOpacity> : <Text style={[styles.body, { flex: 1 }]}>{line.label}</Text>}
                <Text style={styles.body}>{line.cents < 0 ? '−' : '+'}{money(line.cents)}</Text>
              </View>)}
              <Text style={styles.heading}>Total: {balance.balanceCents < 0 ? '−' : '+'}{money(balance.balanceCents)}</Text>
              <Text style={styles.caption}>Paid for group − assigned shares + confirmed payments sent − confirmed payments received. Pending and voided payments are excluded.</Text>
            </>}
          </View>}
        </View>)}</View>
        <Text style={styles.heading}>Suggested payments</Text>
        {debtors.length > 0 && creditors.length > 0 && (isCurrentUserAdmin || myBalance !== 0) && button('Record a different payment', () => {
          const paidBy = debtors.find(balance => balance.profileId === profileId)?.profileId ?? debtors[0].profileId;
          const paidTo = creditors.find(balance => balance.profileId === profileId)?.profileId ?? creditors[0].profileId;
          begin(paidBy, paidTo, maximumFor(paidBy, paidTo));
        }, ledger.saving)}
        <Text style={styles.body}>These suggestions simplify the group's debts. Check payment history before sending money again.</Text>
        <Text style={styles.caption}>You can record a payment you sent or received. Group admins can also record payments between other members; their name stays in the history. Recording a payment does not send money or transfer someone else's debt to you.</Text>
        {calculation.suggestions.length === 0 && <Text style={styles.body}>Everyone is settled up.</Text>}
        {calculation.suggestions.map(suggestion => <View key={`${suggestion.paidByProfileId}:${suggestion.paidToProfileId}`} style={styles.card}>
          <Text style={styles.body}>{name(suggestion.paidByProfileId)} pays {name(suggestion.paidToProfileId)}</Text>
          <Text style={styles.heading}>{money(suggestion.amountCents)}</Text>
          {canRecord(suggestion.paidByProfileId, suggestion.paidToProfileId) && button(paymentLabel(suggestion.paidByProfileId, suggestion.paidToProfileId), () => begin(suggestion.paidByProfileId, suggestion.paidToProfileId, suggestion.amountCents), ledger.saving)}
        </View>)}
      </>}
      <Text style={styles.heading}>Payment history</Text>
      {ledger.actionError && !draft && <Text accessibilityLiveRegion="polite" style={styles.error}>{ledger.actionError}</Text>}
      {!ledger.loading && !ledger.error && ledger.settlements.length === 0 && <Text style={styles.body}>No payments recorded yet.</Text>}
      <Text style={styles.caption}>Showing the last {visibleMonths} months. Older history is retained. Any older pending payments stay visible until resolved.</Text>
      {history.groups.map(month => <View key={month.key} style={{ gap: 12 }}><Text style={styles.heading}>{month.label}</Text>{month.payments.map(settlement => <View key={settlement.id} style={styles.card}>
        <Text style={styles.body}>{name(settlement.paid_by)} → {name(settlement.paid_to)} · {money(moneyToCents(settlement.amount))}</Text>
        <Text style={styles.heading}>{settlement.status === 'confirmed' ? 'RECORDED' : settlement.status === 'pending' ? 'AWAITING RECEIPT (LEGACY)' : 'VOIDED'}</Text>
        <Text style={styles.body}>{settlement.payment_method ? `${settlement.payment_method.replace('_', ' ')} · ` : ''}{paymentDate(settlement)}</Text>
        <Text style={styles.caption}>Recorded by {name(settlement.created_by)}</Text>
        <Text style={styles.caption}>Entered {new Date(settlement.created_at).toLocaleDateString()}</Text>
        {settlement.voided_by && <Text style={styles.caption}>Voided by {name(settlement.voided_by)}</Text>}
        {!!settlement.void_reason && <Text style={styles.caption}>Reason: {settlement.void_reason}</Text>}
        {!!settlement.note && <Text style={styles.body}>{settlement.note}</Text>}
        {settlement.status === 'pending' && (profileId === settlement.paid_to || isCurrentUserAdmin) && button('Confirm received', () => { void ledger.confirmSettlement(settlement.id); }, ledger.saving || unavailable)}
        {settlement.status !== 'voided' && (isCurrentUserAdmin || [settlement.paid_by, settlement.paid_to].includes(profileId ?? '')) && button(settlement.status === 'pending' ? 'Cancel payment record' : 'Undo payment record', () => { setVoidId(settlement.id); setVoidNote(''); }, ledger.saving, true)}
      </View>)}</View>)}
      {history.older && button('Load older months', () => setVisibleMonths(value => value + 3), false, true)}
      <Modal visible={!!draft} transparent={Platform.OS !== 'ios'} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'} animationType="slide" onRequestClose={() => { if (!ledger.saving && !openingPayment) setDraft(null); }}>
        <KeyboardAvoidingView style={Platform.OS === 'ios' ? styles.nativeSheet : [styles.overlay, { paddingBottom: Math.max(insets.bottom, 24) + 20, paddingTop: Math.max(insets.top, 20) }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView style={Platform.OS === 'ios' ? styles.nativeSheet : styles.sheet} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.modal, Platform.OS === 'ios' && { maxWidth: undefined, paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Text style={styles.heading}>{reviewing ? 'Confirm payment record' : 'Settle up'}</Text>
          {draft && <>
            <Text style={styles.body}>{name(draft.paidBy)} pays {name(draft.paidTo)}</Text>
            {draft.paidBy !== profileId && draft.paidTo !== profileId && <Text style={styles.notice}>You are recording a payment between these members as a group admin. You will be listed as the recorder; your own balance will not change.</Text>}
            {ledger.settlements.some(settlement => settlement.status === 'pending' && settlement.paid_by === draft.paidBy && settlement.paid_to === draft.paidTo) && <Text style={styles.error}>A payment between these members is awaiting confirmation. Check it before recording another payment.</Text>}
            {reviewing ? <>
              <Text style={styles.summary}>{money(moneyToCents(draft.amount))}</Text>
              <Text style={styles.body}>Payment date: {draft.paymentDate}</Text>
              {draft.mode === 'pay' && <>
                <Text style={styles.body}>{providerLabels[draft.provider]} recipient: {draft.handle}</Text>
                <Text style={styles.caption}>Check the recipient and amount in the payment app before paying. Prefilled details may vary by app version.</Text>
                {button(openingPayment ? 'Opening…' : `${paymentOpened ? 'Reopen' : 'Open'} ${providerLabels[draft.provider]}`, () => { void openPaymentProfile(); }, openingPayment || ledger.saving)}
                {paymentOpened && <Text style={styles.notice}>Opening the app does not confirm payment. If you canceled there, go back or close this sheet. Record only after you have paid.</Text>}
              </>}
              <Text style={styles.body}>Confirm this payment has already happened. Recording it updates balances immediately; it does not transfer money.</Text>
              {!!draft.note && <Text style={styles.caption}>Note: {draft.note}</Text>}
            </> : <>
              <Text style={styles.caption}>Who paid?</Text>
              <View style={styles.wrap}>{debtors.filter(member => canRecord(member.profileId, draft.paidTo)).map(member => <TouchableOpacity accessibilityRole="button" key={member.profileId} style={[styles.chip, member.profileId === draft.paidBy && styles.selected]} onPress={() => changePair(member.profileId, draft.paidTo)}><Text>{name(member.profileId)}</Text></TouchableOpacity>)}</View>
              <Text style={styles.caption}>Who received?</Text>
              <View style={styles.wrap}>{creditors.filter(member => canRecord(draft.paidBy, member.profileId)).map(member => <TouchableOpacity accessibilityRole="button" key={member.profileId} style={[styles.chip, member.profileId === draft.paidTo && styles.selected]} onPress={() => changePair(draft.paidBy, member.profileId)}><Text>{name(member.profileId)}</Text></TouchableOpacity>)}</View>
              <Text style={styles.caption}>Amount (up to {money(draft.maximumCents)}; partial payments welcome)</Text>
              <TextInput accessibilityLabel="Payment amount" style={styles.input} keyboardType="decimal-pad" value={draft.amount} onChangeText={amount => setDraft({ ...draft, amount })} />
              {draft.paidBy === profileId && <View style={styles.wrap}>
                {(['record', 'pay'] as const).map(mode => <TouchableOpacity key={mode} accessibilityRole="button" accessibilityState={{ selected: draft.mode === mode }} style={[styles.chip, draft.mode === mode && styles.selected]} onPress={() => { setDraft({ ...draft, mode, paymentDate: mode === 'pay' ? localDate() : draft.paymentDate }); setPaymentOpened(false); setLocalError(null); }}><Text>{mode === 'pay' ? 'Pay now' : 'Record payment'}</Text></TouchableOpacity>)}
              </View>}
              {draft.mode === 'pay' && draft.paidBy === profileId && <>
                <View style={styles.wrap}>{providers.map(provider => <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: provider === draft.provider }} key={provider} style={[styles.chip, provider === draft.provider && styles.selected]} onPress={() => { setDraft({ ...draft, provider, handle: savedHandle(draft.paidTo, provider) }); setPaymentOpened(false); }}><Text>{providerLabels[provider]}</Text></TouchableOpacity>)}</View>
                <Text style={styles.caption}>{name(draft.paidTo)}’s {providerLabels[draft.provider]} username</Text>
                <TextInput accessibilityLabel="Recipient payment handle" placeholder="Enter username" autoCapitalize="none" autoCorrect={false} style={styles.input} value={draft.handle} maxLength={100} onChangeText={handle => setDraft({ ...draft, handle })} />
                <Text style={styles.caption}>Use a saved username or enter one for this payment. This does not change their profile. You will review the details before opening the payment app.</Text>
              </>}
              <Text style={styles.caption}>Payment date</Text>
              {draft.mode === 'pay' ? <Text style={styles.body}>Today</Text> : <PaymentDatePicker value={draft.paymentDate} onChange={paymentDate => setDraft({ ...draft, paymentDate })} />}
              <TextInput accessibilityLabel="Payment note" placeholder="Note (optional)" style={styles.input} value={draft.note} maxLength={1000} onChangeText={note => setDraft({ ...draft, note })} />
              <Text style={styles.caption}>{draft.mode === 'pay' ? 'Pay in the payment app, then return here to record it.' : 'Log a payment already made, using any payment method. No account details are needed.'}</Text>
            </>}
            {(localError || ledger.actionError) && <Text accessibilityLiveRegion="polite" style={styles.error}>{localError || ledger.actionError}</Text>}
            {!isCurrentUserAdmin && ![draft.paidBy, draft.paidTo].includes(profileId ?? '') && <Text style={styles.error}>Only a participant in this payment or a group admin can record it.</Text>}
            {button(ledger.saving ? 'Saving…' : reviewing ? 'Record completed payment' : 'Review payment', reviewing ? () => { void save(); } : review, ledger.saving || openingPayment || unavailable || (reviewing && draft.mode === 'pay' && !paymentOpened) || (!isCurrentUserAdmin && ![draft.paidBy, draft.paidTo].includes(profileId ?? '')))}
            {button(reviewing ? 'Back' : 'Cancel', () => { setPaymentOpened(false); reviewing ? setReviewing(false) : setDraft(null); }, ledger.saving || openingPayment, true)}
          </>}
        </ScrollView></KeyboardAvoidingView>
      </Modal>
      <Modal visible={!!voidId} transparent onRequestClose={() => { if (!ledger.saving) setVoidId(null); }}>
        <View style={styles.overlay}><View style={styles.modal}>
          <Text style={styles.heading}>Void this payment record?</Text>
          <Text style={styles.body}>The record stays in history. Any confirmed balance adjustment is reversed. This does not refund money through your payment provider.</Text>
          <TextInput accessibilityLabel="Reason for voiding" placeholder="Reason (optional)" style={styles.input} value={voidNote} maxLength={1000} onChangeText={setVoidNote} />
          {ledger.actionError && <Text style={styles.error}>{ledger.actionError}</Text>}
          {button('Void record', () => { if (voidId) void ledger.voidSettlement(voidId, voidNote).then(ok => { if (ok) setVoidId(null); }); }, ledger.saving)}
          {button('Keep record', () => setVoidId(null), ledger.saving, true)}
        </View></View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8f9fa' }, content: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#1a1a1a' }, summary: { fontSize: 24, fontWeight: '600', color: '#1468ba', marginVertical: 8 },
  heading: { fontSize: 18, fontWeight: '600', marginVertical: 6, color: '#1a1a1a' }, body: { fontSize: 15, lineHeight: 22, color: '#333' }, caption: { fontSize: 13, lineHeight: 19, color: '#666' },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#fff', gap: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  button: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center', marginVertical: 4 }, buttonText: { color: '#fff', fontWeight: '600' },
  secondary: { backgroundColor: '#e9eef6' }, secondaryText: { color: '#1b66ca', fontWeight: '600' }, disabled: { opacity: 0.45 }, error: { color: '#b42318', lineHeight: 21 }, notice: { color: '#155724', padding: 12, backgroundColor: '#d4edda', borderRadius: 8 },
  link: { color: '#1468ba', fontSize: 15, lineHeight: 22, textDecorationLine: 'underline' },
  nativeSheet: { flex: 1, backgroundColor: '#fff' },
  sheet: { flexGrow: 0, maxHeight: '85%', width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 16, backgroundColor: '#fff' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', padding: 16 }, modal: { backgroundColor: '#fff', padding: 20, borderRadius: 16, gap: 10, width: '100%', maxWidth: 520, alignSelf: 'center' },
  input: { borderWidth: 1, borderColor: '#ccd3dc', borderRadius: 8, padding: 12, fontSize: 16 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderColor: '#ccd3dc', padding: 10, borderRadius: 8 }, selected: { backgroundColor: '#d9ebff', borderColor: '#007AFF' },
});
