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

    try {
      const expense = await addExpense(group.id, {
        description: description.trim(),
        amount: numericAmount,
        date,
        splitMode,
        participantIds: selectedIds,
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
              <View style={styles.sharesNote}>
                <Text style={styles.sharesNoteText}>
                  Custom shares feature coming soon! For now, expenses will be split equally.
                </Text>
              </View>
            )}

            <Text style={styles.label}>Participants</Text>
            <View style={styles.selectAllRow}>
              <Text style={styles.selectedCountText}>
                Selected: {selectedIds.length} of {(members ?? []).length}
              </Text>
              <View style={styles.selectButtonsRow}>
                <TouchableOpacity
                  style={[styles.smallButton, styles.smallButtonPrimary]}
                  onPress={() => {
                    const all: Record<string, boolean> = {};
                    members.forEach(m => (all[m.user_id] = true));
                    setSelectedMap(all);
                  }}
                  disabled={membersLoading}
                >
                  <Text style={styles.smallButtonText}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, styles.smallButtonGhost, styles.smallButtonMarginLeft]}
                  onPress={() => {
                    const none: Record<string, boolean> = {};
                    members.forEach(m => (none[m.user_id] = false));
                    setSelectedMap(none);
                  }}
                  disabled={membersLoading}
                >
                  <Text style={styles.smallButtonGhostText}>Deselect All</Text>
                </TouchableOpacity>
              </View>
            </View>

            {membersError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{membersError}</Text>
              </View>
            )}

            <View style={styles.membersList}>
              {(members ?? []).map(member => (
                <View key={member.user_id} style={styles.memberRow}>
                  <Text style={styles.memberName}>
                    {member.user?.display_name || 'Member'}
                  </Text>
                  <Switch
                    value={!!selectedMap[member.user_id]}
                    onValueChange={(val) =>
                      setSelectedMap(prev => ({ ...prev, [member.user_id]: val }))
                    }
                  />
                </View>
              ))}
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

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleAddExpense}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Adding...' : 'Add Expense'}
              </Text>
            </TouchableOpacity>

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
  },
  membersLoadingText: {
    textAlign: 'center',
    color: '#666',
    padding: 8,
  },
}); 
