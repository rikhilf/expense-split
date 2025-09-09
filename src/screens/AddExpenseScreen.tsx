import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
} from 'react-native';
import { useAddExpense, SplitMode } from '../hooks/useAddExpense';
import { Group } from '../types/db';
import { useMembers } from '../hooks/useMembers';

interface Props {
  navigation: any;
  route: {
    params: {
      group: Group;
    };
  };
}

export const AddExpenseScreen: React.FC<Props> = ({ navigation, route }) => {
  const { group } = route.params;
  const { addExpense, loading, error } = useAddExpense();
  const { members, loading: membersLoading, error: membersError } = useMembers(group.id);
  
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [sharesMap, setSharesMap] = useState<Record<string, string>>({}); // percent strings per user id
  const [manualShares, setManualShares] = useState(false); // has user edited shares manually?
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({}); // members that were manually changed
  const [lastEditedId, setLastEditedId] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'percent' | 'amount'>('amount');
  const [amountDraftMap, setAmountDraftMap] = useState<Record<string, string>>({});
  // Removed success timer UI in favor of immediate navigation + toast/flash

  // Initialize selection to all members once members load
  useEffect(() => {
    if ((members?.length ?? 0) > 0 && Object.keys(selectedMap).length === 0) {
      const init: Record<string, boolean> = {};
      members.forEach(m => {
        init[m.user_id] = true;
      });
      setSelectedMap(init);
    }
  }, [members]);

  const selectedIds = useMemo(
    () => Object.keys(selectedMap).filter(id => selectedMap[id]),
    [selectedMap]
  );

  const amountNumber = useMemo(() => {
    const n = parseFloat(amount);
    return isNaN(n) ? 0 : n;
  }, [amount]);

  // Compute totals directly to ensure live updates even mid-typing
  const computeTotals = () => {
    if (splitMode !== 'shares') {
      const dollars = selectedIds.length > 0 ? amountNumber : 0;
      const pct = selectedIds.length > 0 ? 100 : 0;
      return { dollars, pct };
    }
    if (inputMode === 'amount') {
      const dollars = selectedIds.reduce((sum, id) => {
        if (amountDraftMap[id] !== undefined) {
          const v = parseFloat(amountDraftMap[id] || '0') || 0;
          return sum + v;
        }
        const pct = parseFloat(sharesMap[id] ?? '0') || 0;
        return sum + (amountNumber * pct) / 100;
      }, 0);
      const pct = amountNumber > 0 ? (dollars / amountNumber) * 100 : 0;
      return { dollars, pct };
    }
    const pct = selectedIds.reduce((sum, id) => sum + (parseFloat(sharesMap[id] ?? '0') || 0), 0);
    const dollars = (pct / 100) * amountNumber;
    return { dollars, pct };
  };

  // Utility: compute equal shares (in percentage strings with two decimals) that sum exactly to 100.00
  const computeEqualShares = (ids: string[]) => {
    const n = ids.length;
    if (n === 0) return {} as Record<string, string>;
    const totalUnits = 10000; // hundredths of a percent
    const base = Math.floor(totalUnits / n);
    let remainder = totalUnits - base * n;
    const result: Record<string, string> = {};
    ids.forEach((id, idx) => {
      const units = base + (idx < remainder ? 1 : 0);
      result[id] = (units / 100).toFixed(2);
    });
    return result;
  };

  // Distribute remaining units (hundredths) equally among ids, summing to exactly remainderUnits
  const distributeUnits = (ids: string[], remainderUnits: number) => {
    const n = ids.length;
    const res: Record<string, string> = {};
    if (n === 0) return res;
    const base = Math.floor(remainderUnits / n);
    let rem = remainderUnits - base * n;
    ids.forEach((id, idx) => {
      const units = base + (idx < rem ? 1 : 0);
      res[id] = (units / 100).toFixed(2);
    });
    return res;
  };

  // When switching to shares mode, initialize equal distribution among selected members (unless user already edited)
  useEffect(() => {
    if (splitMode === 'shares') {
      if (!manualShares) {
        const eq = computeEqualShares(selectedIds);
        setSharesMap(prev => ({ ...prev, ...eq }));
        setLockedMap({});
        setLastEditedId(null);
      }
    }
  }, [splitMode]);

  // If membership selection changes while in shares mode and user hasn't manually edited, keep equal distribution
  useEffect(() => {
    if (splitMode !== 'shares') return;
    if (!manualShares) {
      const eq = computeEqualShares(selectedIds);
      setSharesMap(prev => ({ ...prev, ...eq }));
      return;
    }
    // When selection changes and we have manual shares, keep locked values and rebalance the rest
    const lockedIds = selectedIds.filter(id => lockedMap[id]);
    const unlockedIds = selectedIds.filter(id => !lockedMap[id]);
    const lockedUnits = lockedIds.reduce((sum, id) => {
      const v = Math.round(((parseFloat(sharesMap[id] ?? '0') || 0) * 100));
      return sum + v;
    }, 0);
    const remainderUnits = Math.max(0, 10000 - lockedUnits);
    const distributed = distributeUnits(unlockedIds, remainderUnits);
    setSharesMap(prev => ({ ...prev, ...distributed }));
  }, [selectedIds, splitMode]);

  const totalSelectedPercent = useMemo(() => {
    return selectedIds.reduce((sum, id) => sum + (parseFloat(sharesMap[id] ?? '0') || 0), 0);
  }, [selectedIds, sharesMap]);

  const isSharesTotalValid = useMemo(() => {
    if (splitMode !== 'shares') return true;
    // Allow tiny floating tolerance within 0.01%
    return Math.abs(totalSelectedPercent - 100) <= 0.01 && selectedIds.length > 0;
  }, [splitMode, totalSelectedPercent, selectedIds.length]);

  const handleAmountChange = (text: string) => {
    // Allow digits and a single decimal point
    let sanitized = text.replace(/[^0-9.]/g, '');
    // Keep only the first decimal point
    sanitized = sanitized.replace(/(\..*)\./g, '$1');
    // Normalize leading decimal to 0.
    if (sanitized.startsWith('.')) sanitized = `0${sanitized}`;
    // Prevent leading zeros unless it's "0." format
    if (sanitized.startsWith('0') && !sanitized.startsWith('0.')) {
      sanitized = sanitized.replace(/^0+/, '');
      if (sanitized === '') sanitized = '0';
    }
    // Limit to two decimal places if present
    if (sanitized.includes('.')) {
      const [intPart, fracPart] = sanitized.split('.');
      sanitized = `${intPart}.${(fracPart || '').slice(0, 2)}`;
    }
    setAmount(sanitized);
  };

  const handleAddExpense = async () => {
    if (!description.trim() || !amount.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (selectedIds.length === 0) {
      Alert.alert('Error', 'Please select at least one participant');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (splitMode === 'shares' && !isSharesTotalValid) {
      Alert.alert('Invalid Shares', 'Please ensure shares total 100%.');
      return;
    }

    try {
      const expense = await addExpense(group.id, {
        description: description.trim(),
        amount: numericAmount,
        date,
        splitMode,
        participantIds: selectedIds,
        ...(splitMode === 'shares'
          ? {
              shares: selectedIds.map((id) => ({
                userId: id,
                share: parseFloat(sharesMap[id] ?? '0') || 0,
              })),
            }
          : {}),
      });

      if (expense) {
        // Navigate back to Group Detail with a cross-platform flash message
        navigation.navigate('GroupDetail', { group, flash: 'Expense created' });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add expense');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.content}>
          <Text style={styles.title}>Add Expense</Text>
          <Text style={styles.subtitle}>Add a new expense to {group.name}</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={styles.input}
              placeholder="What was this expense for?"
              value={description}
              onChangeText={setDescription}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={styles.label}>Amount *</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={amount}
              onChangeText={handleAmountChange}
              keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
            />

            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={date}
              onChangeText={setDate}
              keyboardType="default"
            />

            <Text style={styles.label}>Split Mode</Text>
            <View style={styles.splitModeContainer}>
              <TouchableOpacity
                style={[
                  styles.splitModeButton,
                  splitMode === 'equal' && styles.activeSplitMode,
                ]}
                onPress={() => setSplitMode('equal')}
              >
                <Text
                  style={[
                    styles.splitModeText,
                    splitMode === 'equal' && styles.activeSplitModeText,
                  ]}
                >
                  Equal Split
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.splitModeButton,
                  splitMode === 'shares' && styles.activeSplitMode,
                ]}
                onPress={() => setSplitMode('shares')}
              >
                <Text
                  style={[
                    styles.splitModeText,
                    splitMode === 'shares' && styles.activeSplitModeText,
                  ]}
                >
                  Custom Shares
                </Text>
              </TouchableOpacity>
            </View>

            {splitMode === 'shares' && (
              <View style={styles.sharesContainer}>
                <View style={styles.sharesHeaderRow}>
                  <Text style={styles.sharesHeaderText}>Custom Shares</Text>
                  <View style={styles.sharesHeaderRight}>
                    <View style={styles.toggleGroup}>
                      <TouchableOpacity
                        style={[styles.toggleButton, inputMode === 'percent' ? styles.toggleActive : styles.toggleInactive]}
                        onPress={() => setInputMode('percent')}
                      >
                        <Text style={inputMode === 'percent' ? styles.toggleActiveText : styles.toggleInactiveText}>%</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.toggleButton, inputMode === 'amount' ? styles.toggleActive : styles.toggleInactive, styles.toggleRight]}
                        onPress={() => setInputMode('amount')}
                      >
                        <Text style={inputMode === 'amount' ? styles.toggleActiveText : styles.toggleInactiveText}>$</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={[styles.smallButton, styles.smallButtonGhost, styles.smallButtonMarginLeft]}
                      onPress={() => {
                        const eq = computeEqualShares(selectedIds);
                        setSharesMap(prev => ({ ...prev, ...eq }));
                        setManualShares(false);
                        setLockedMap({});
                        setLastEditedId(null);
                        setAmountDraftMap({});
                      }}
                    >
                      <Text style={styles.smallButtonGhostText}>Reset</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {(() => {
                  const t = computeTotals();
                  return (
                    <Text style={[styles.sharesTotalText, isSharesTotalValid ? styles.sharesTotalOk : styles.sharesTotalError]}>
                      {`Total: $${t.dollars.toFixed(2)} (${t.pct.toFixed(2)}%)`}
                    </Text>
                  );
                })()}
              </View>
            )}

            <Text style={styles.label}>Participants</Text>
            <View style={styles.selectAllRow}>
              <Text style={styles.selectedCountText}>
                Selected: {selectedIds.length} of {(members ?? []).length}
              </Text>
              {(() => {
                const totalMembers = (members ?? []).length;
                const allSelected = totalMembers > 0 && selectedIds.length === totalMembers;
                return (
                  <TouchableOpacity
                    style={[
                      styles.smallButton,
                      allSelected ? styles.smallButtonPrimary : styles.smallButtonGhost,
                    ]}
                    onPress={() => {
                      const nextSelectedMap: Record<string, boolean> = {};
                      const nextSelectedIds: string[] = [];
                      if (allSelected) {
                        // Deselect everyone
                        members.forEach(m => {
                          nextSelectedMap[m.user_id] = false;
                        });
                      } else {
                        // Select everyone
                        members.forEach(m => {
                          nextSelectedMap[m.user_id] = true;
                          nextSelectedIds.push(m.user_id);
                        });
                      }

                      setSelectedMap(nextSelectedMap);

                      if (splitMode === 'shares') {
                        if (!manualShares) {
                          const eq = computeEqualShares(nextSelectedIds);
                          setSharesMap(prev => ({ ...prev, ...eq }));
                          setLockedMap({});
                          setLastEditedId(null);
                        } else {
                          const lockedIds = nextSelectedIds.filter(x => lockedMap[x]);
                          const unlockedIds = nextSelectedIds.filter(x => !lockedMap[x]);
                          const lockedUnits = lockedIds.reduce((sum, x) => {
                            const v = Math.round(((parseFloat(sharesMap[x] ?? '0') || 0) * 100));
                            return sum + v;
                          }, 0);
                          const remainderUnits = Math.max(0, 10000 - lockedUnits);
                          const distributed = distributeUnits(unlockedIds, remainderUnits);
                          setSharesMap(prev => ({ ...prev, ...distributed }));
                        }
                      }
                    }}
                    disabled={membersLoading}
                  >
                    <Text style={allSelected ? styles.smallButtonText : styles.smallButtonGhostText}>Everyone</Text>
                  </TouchableOpacity>
                );
              })()}
            </View>

            {membersError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{membersError}</Text>
              </View>
            )}

            <View style={styles.membersList}>
              {(members ?? []).map(member => {
                const id = member.user_id;
                const selected = !!selectedMap[id];
                return (
                  <View key={id} style={styles.memberRow}>
                    <Text style={styles.memberName}>
                      {member.user?.display_name || 'Member'}
                    </Text>
                    <View style={styles.memberRight}>
                      {splitMode === 'equal' && selected ? (
                        <Text style={styles.memberAmount}>
                          ${(
                            selectedIds.length > 0 ? (amountNumber / selectedIds.length) : 0
                          ).toFixed(2)}
                        </Text>
                      ) : null}
                      {splitMode === 'shares' && selected && inputMode === 'percent' ? (
                        <View style={styles.percentInputWrapper}>
                          <TextInput
                            style={styles.percentInput}
                            value={sharesMap[id] ?? ''}
                            selectTextOnFocus={true}
                            onChangeText={(text) => {
                              // Sanitize to numeric with up to 2 decimals
                              let sanitized = text.replace(/[^0-9.]/g, '');
                              sanitized = sanitized.replace(/(\..*)\./g, '$1');
                              if (sanitized.startsWith('.')) sanitized = `0${sanitized}`;
                              if (sanitized.includes('.')) {
                                const [i, f] = sanitized.split('.');
                                sanitized = `${i}.${(f || '').slice(0, 2)}`;
                              }

                              // Calculate distribution live while typing; do not clamp this field
                              const newUnitsForThis = Math.round(((parseFloat(sanitized || '0') || 0) * 100));
                              const newLocked = { ...lockedMap, [id]: true };
                              const lockedIds = selectedIds.filter(x => newLocked[x]);
                              const unlockedIds = selectedIds.filter(x => !newLocked[x]);

                              const lockedUnits = lockedIds.reduce((sum, x) => {
                                if (x === id) return sum + newUnitsForThis;
                                const v = Math.round(((parseFloat(sharesMap[x] ?? '0') || 0) * 100));
                                return sum + v;
                              }, 0);
                              const remainderUnits = Math.max(0, 10000 - lockedUnits);
                              const distributed = distributeUnits(unlockedIds, remainderUnits);

                              setManualShares(true);
                              setLastEditedId(id);
                              setLockedMap(newLocked);
                              setSharesMap(prev => ({
                                ...prev,
                                [id]: sanitized, // keep raw sanitized input; others receive fixed 2-decimal values
                                ...distributed,
                              }));
                            }}
                            placeholder="0"
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                          />
                          <Text style={styles.percentSuffix}>%</Text>
                        </View>
                      ) : null}
                      {splitMode === 'shares' && selected && inputMode === 'amount' ? (
                        <View style={styles.amountInputWrapper}>
                          <Text style={styles.dollarPrefix}>$</Text>
                          <TextInput
                            style={styles.amountInput}
                            value={
                              amountDraftMap[id] !== undefined
                                ? amountDraftMap[id]
                                : ((amountNumber * ((parseFloat(sharesMap[id] ?? '0') || 0)) / 100) || 0).toFixed(2)
                            }
                            selectTextOnFocus={true}
                            editable={amountNumber > 0}
                            onChangeText={(text) => {
                              // Sanitize currency with up to 2 decimals
                              let sanitized = text.replace(/[^0-9.]/g, '');
                              sanitized = sanitized.replace(/(\..*)\./g, '$1');
                              if (sanitized.startsWith('.')) sanitized = `0${sanitized}`;
                              if (sanitized.includes('.')) {
                                const [i, f] = sanitized.split('.');
                                sanitized = `${i}.${(f || '').slice(0, 2)}`;
                              }
                              setAmountDraftMap(prev => ({ ...prev, [id]: sanitized }));
                              const amountVal = parseFloat(sanitized || '0') || 0;
                              // Convert dollars -> percent units; rebalance others live
                              const newUnitsForThis = amountNumber > 0
                                ? Math.round((amountVal / amountNumber) * 10000)
                                : 0;
                              const newPercent = (newUnitsForThis / 100).toFixed(2);

                              const newLocked = { ...lockedMap, [id]: true };
                              const lockedIds = selectedIds.filter(x => newLocked[x]);
                              const unlockedIds = selectedIds.filter(x => !newLocked[x]);

                              const lockedUnits = lockedIds.reduce((sum, x) => {
                                if (x === id) return sum + newUnitsForThis;
                                const v = Math.round(((parseFloat(sharesMap[x] ?? '0') || 0) * 100));
                                return sum + v;
                              }, 0);
                              const remainderUnits = Math.max(0, 10000 - lockedUnits);
                              const distributed = distributeUnits(unlockedIds, remainderUnits);

                              setManualShares(true);
                              setLastEditedId(id);
                              setLockedMap(newLocked);
                              setSharesMap(prev => ({
                                ...prev,
                                [id]: newPercent,
                                ...distributed,
                              }));
                            }}
                            placeholder="0.00"
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            onBlur={() => {
                              // Clear draft value so computed value formats in next render
                              setAmountDraftMap(prev => {
                                const next = { ...prev };
                                delete next[id];
                                return next;
                              });
                            }}
                          />
                        </View>
                      ) : null}
                      <Switch
                        value={selected}
                        onValueChange={(val) => {
                          const nextSelectedIds = val
                            ? Array.from(new Set([...selectedIds, id]))
                            : selectedIds.filter(x => x !== id);

                          setSelectedMap(prev => ({ ...prev, [id]: val }));

                          if (splitMode === 'shares') {
                            if (!manualShares) {
                              // equalize among next selection
                              const eq = computeEqualShares(nextSelectedIds);
                              setSharesMap(prev => ({ ...prev, ...eq }));
                              setLockedMap({});
                              setLastEditedId(null);
                            } else {
                              // keep locked, rebalance remaining among next selection
                              const lockedIds = nextSelectedIds.filter(x => lockedMap[x]);
                              const unlockedIds = nextSelectedIds.filter(x => !lockedMap[x]);
                              const lockedUnits = lockedIds.reduce((sum, x) => {
                                const v = Math.round(((parseFloat(sharesMap[x] ?? '0') || 0) * 100));
                                return sum + v;
                              }, 0);
                              const remainderUnits = Math.max(0, 10000 - lockedUnits);
                              const distributed = distributeUnits(unlockedIds, remainderUnits);
                              setSharesMap(prev => ({ ...prev, ...distributed }));
                            }
                          }
                        }}
                      />
                    </View>
                  </View>
                );
              })}
              {membersLoading && (
                <Text style={styles.membersLoadingText}>Loading members…</Text>
              )}
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Success UI removed; feedback shown via toast/flash on previous screen */}

            {(() => {
              const isAddDisabled = loading || (splitMode === 'shares' && !isSharesTotalValid);
              return (
                <TouchableOpacity
                  style={[
                    styles.button,
                    isAddDisabled ? styles.primaryButtonDisabled : styles.primaryButton,
                    isAddDisabled && styles.buttonDisabled,
                  ]}
                  onPress={handleAddExpense}
                  disabled={isAddDisabled}
                >
                  <Text style={styles.buttonText}>
                    {loading ? 'Adding...' : 'Add Expense'}
                  </Text>
                </TouchableOpacity>
              );
            })()}

            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
    lineHeight: 24,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#fff',
  },
  splitModeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  splitModeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    marginHorizontal: 4,
    alignItems: 'center',
  },
  activeSplitMode: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  splitModeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeSplitModeText: {
    color: '#fff',
    fontWeight: '600',
  },
  sharesNote: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffeaa7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  sharesNoteText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  sharesContainer: {
    marginBottom: 12,
  },
  sharesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sharesHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  sharesHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRight: {
    borderLeftWidth: 1,
    borderLeftColor: '#e1e5e9',
  },
  toggleActive: {
    backgroundColor: '#007AFF',
  },
  toggleInactive: {
    backgroundColor: '#fff',
  },
  toggleActiveText: {
    color: '#fff',
    fontWeight: '600',
  },
  toggleInactiveText: {
    color: '#666',
    fontWeight: '600',
  },
  sharesTotalText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sharesTotalOk: {
    color: '#198754',
  },
  sharesTotalError: {
    color: '#dc3545',
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    borderWidth: 1,
    borderColor: '#f5c6cb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#721c24',
    textAlign: 'center',
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  primaryButtonDisabled: {
    backgroundColor: '#A7C8FF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    backgroundColor: '#d4edda',
    borderWidth: 1,
    borderColor: '#c3e6cb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  successText: {
    fontSize: 16,
    color: '#155724',
    fontWeight: '600',
    textAlign: 'center',
  },
  successSubtext: {
    fontSize: 14,
    color: '#155724',
    textAlign: 'center',
    marginTop: 4,
  },
  selectAllRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  smallButtonMarginLeft: {
    marginLeft: 8,
  },
  smallButtonPrimary: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  smallButtonGhost: {
    backgroundColor: 'transparent',
    borderColor: '#e1e5e9',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  smallButtonGhostText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedCountText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '500',
  },
  membersList: {
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 8,
    paddingVertical: 4,
    marginBottom: 20,
  },
  memberRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f4',
  },
  memberName: {
    fontSize: 16,
    color: '#1a1a1a',
    flex: 1,
    paddingRight: 8,
  },
  memberRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  memberAmount: {
    marginRight: 8,
    color: '#666',
    fontSize: 14,
  },
  percentInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 6,
    paddingHorizontal: 8,
    marginRight: 8,
    height: 36,
    minWidth: 96,
  },
  percentInput: {
    width: 64,
    paddingVertical: 6,
    fontSize: 14,
    },
  percentSuffix: {
    marginLeft: 2,
    color: '#666',
    fontSize: 14,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 6,
    paddingHorizontal: 8,
    marginRight: 8,
    height: 36,
    minWidth: 116,
  },
  dollarPrefix: {
    color: '#666',
    fontSize: 14,
    marginRight: 4,
  },
  amountInput: {
    width: 90,
    paddingVertical: 6,
    fontSize: 14,
  },
  membersLoadingText: {
    textAlign: 'center',
    color: '#666',
    padding: 8,
  },
}); 
