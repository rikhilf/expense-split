import React, { useState } from 'react';
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
  
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleAddExpense = async () => {
    if (!description.trim() || !amount.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
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
      });

      if (expense) {
        console.log('expense', expense);
        
        // Show success message and navigate back after a short delay
        setShowSuccess(true);
        setTimeout(() => {
          navigation.goBack();
        }, 1500); // 1.5 second delay
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
              onChangeText={setAmount}
              keyboardType="decimal-pad"
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

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {showSuccess && (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>Expense added successfully!</Text>
                <Text style={styles.successSubtext}>Navigating back...</Text>
              </View>
            )}

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
}); 