import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Expense, Group } from '../types/db';
import { useDeleteExpense } from '../hooks/useDeleteExpense';
import { useExpenseSplits } from '../hooks/useExpenseSplits';

interface Props {
  navigation: any;
  route: {
    params: {
      expense: Expense;
      group: Group;
      creatorDisplayName?: string | null;
    };
  };
}

export const ExpenseDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { expense, group, creatorDisplayName } = route.params;
  const { deleteExpense, loading: deleting, error: deleteError } = useDeleteExpense();
  const { splits, loading: splitsLoading, error: splitsError } = useExpenseSplits(expense.id);

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
            <Text style={styles.detailLabel}>Added by:</Text>
            <Text style={styles.detailValue}>
              {creatorDisplayName ?? 'Unknown'}
            </Text>
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
          <View style={styles.breakdownContainer}>
            {splitsLoading ? (
              <ActivityIndicator />
            ) : splitsError ? (
              <Text style={styles.errorText}>{splitsError}</Text>
            ) : splits.length === 0 ? (
              <Text style={styles.breakdownNote}>No splits recorded for this expense.</Text>
            ) : (
              splits.map((split) => {
                const pctValue = split.share != null
                  ? split.share * 100
                  : (split.amount / (expense.amount || 1)) * 100;
                const pct = pctValue.toFixed(1);
                return (
                  <View key={split.id} style={styles.splitRow}>
                    <View style={styles.splitLeft}>
                      <Text style={styles.splitName}>{split.user?.display_name ?? 'Unknown'}</Text>
                      <Text style={styles.splitShare}>{pct}%</Text>
                    </View>
                    <Text style={styles.splitAmount}>${split.amount.toFixed(2)}</Text>
                  </View>
                );
              })
            )}
          </View>
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
            <Text style={styles.settlementsNote}>
              Settlement tracking will be available when settlements are implemented.
            </Text>
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
  errorText: {
    fontSize: 14,
    color: '#ff3b30',
    textAlign: 'center',
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  splitLeft: {
    flexDirection: 'column',
  },
  splitName: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  splitShare: {
    fontSize: 12,
    color: '#666',
  },
  splitAmount: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '600',
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
