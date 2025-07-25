import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Expense, Group, ExpenseSplit } from '../types/db';
import { useDeleteExpense } from '../hooks/useDeleteExpense';
import { useSettlements } from '../hooks/useSettlements';
import { supabase } from '../lib/supabase';

interface Props {
  navigation: any;
  route: {
    params: {
      expense: Expense;
      group: Group;
    };
  };
}

export const ExpenseDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { expense, group } = route.params;
  const { deleteExpense, loading: deleting, error: deleteError } = useDeleteExpense();

  const [splits, setSplits] = useState<(ExpenseSplit & { user: { id: string; email: string } })[]>([]);
  const [splitsLoading, setSplitsLoading] = useState(true);
  const [splitsError, setSplitsError] = useState<string | null>(null);

  const { settlements, loading: settlementsLoading } = useSettlements(
    group.id,
    expense.id
  );

  useEffect(() => {
    const fetchSplits = async () => {
      try {
        setSplitsLoading(true);
        setSplitsError(null);
        const { data, error } = await supabase
          .from('expense_splits')
          .select('*, user: user_id (id, email)')
          .eq('expense_id', expense.id);
        if (error) {
          setSplitsError(error.message);
          return;
        }
        setSplits((data as any) || []);
      } catch (err) {
        setSplitsError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setSplitsLoading(false);
      }
    };
    fetchSplits();
  }, [expense.id]);

  const handleEditExpense = () => {
    // TODO: Implement edit expense functionality
    Alert.alert('Coming Soon', 'Edit expense functionality will be available soon!');
  };

  const handleDeleteExpense = () => {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteExpense(expense.id);
            if (success) {
              navigation.goBack();
            } else {
              Alert.alert('Error', deleteError || 'Failed to delete expense');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{expense.description}</Text>
          <Text style={styles.amount}>${expense.amount.toFixed(2)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>
              {new Date(expense.date).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Group:</Text>
            <Text style={styles.detailValue}>{group.name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created:</Text>
            <Text style={styles.detailValue}>
              {new Date(expense.created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Split Breakdown</Text>
          {splitsLoading ? (
            <ActivityIndicator />
          ) : splitsError ? (
            <Text style={styles.breakdownNote}>{splitsError}</Text>
          ) : (
            <View style={styles.breakdownContainer}>
              {splits.map((s) => {
                const paid = settlements.some(
                  (set) => set.paid_by === s.user_id && set.expense_id === expense.id
                );
                return (
                  <View key={s.id} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{s.user.email}</Text>
                    <Text style={styles.detailValue}>${s.amount.toFixed(2)}</Text>
                    {paid && <Text style={styles.paidLabel}>Paid</Text>}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <TouchableOpacity style={styles.actionButton} onPress={handleEditExpense}>
            <Text style={styles.actionButtonText}>Edit Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDeleteExpense}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteButtonText}>Delete Expense</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settlements</Text>
          <View style={styles.settlementsContainer}>
            {settlementsLoading ? (
              <ActivityIndicator />
            ) : settlements.length === 0 ? (
              <Text style={styles.settlementsNote}>No repayments yet.</Text>
            ) : (
              settlements.map((s) => (
                <Text key={s.id} style={styles.settlementsNote}>
                  {s.paid_by} paid {s.paid_to} ${s.amount.toFixed(2)}
                </Text>
              ))
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    padding: 20,
  },
  header: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  amount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  breakdownContainer: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  breakdownNote: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  paidLabel: {
    fontSize: 12,
    color: '#28a745',
    marginLeft: 8,
  },
  settlementsContainer: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  settlementsNote: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
}); 