import React, { useCallback, useLayoutEffect } from 'react';
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
import { useMembers } from '../hooks/useMembers';
import { useProfile } from '../contexts/ProfileContext';
import { ExpenseActions } from '../components/ExpenseActions';

interface Props {
  navigation: any;
  route: {
    params: {
      expense: Expense;
      group: Group;
      creatorDisplayName?: string | null;
      fromKey?: string;
    };
  };
}

export const ExpenseDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { expense, group, creatorDisplayName, fromKey } = route.params;
  const { deleteExpense, loading: deleting, error: deleteError } = useDeleteExpense();
  const { splits, loading: splitsLoading, error: splitsError } = useExpenseSplits(expense.id);
  const formatDate = (date: string | null) =>
    date ? new Date(date).toLocaleDateString() : 'Unknown';
  const { profileId } = useProfile();
  const { isCurrentUserAdmin, members } = useMembers(group.id);
  const canManageExpense = expense.created_by === profileId || isCurrentUserAdmin;
  const allocatedCents = splits.reduce((sum, split) => sum + Math.round(Number(split.amount) * 100), 0);
  const incompleteSplits = !splitsLoading && !splitsError &&
    (splits.length === 0 || allocatedCents !== Math.round(Number(expense.amount) * 100));

  const handleEditExpense = useCallback(() => {
    if (!canManageExpense || deleting) return;
    navigation.navigate('AddExpense', { group, expense, fromKey });
  }, [canManageExpense, deleting, navigation, group, expense, fromKey]);

  const handleDeleteExpense = useCallback(() => {
    if (!canManageExpense || deleting) return;
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
              setTimeout(() => {
                navigation.navigate({
                  name: 'GroupDetail',
                  params: { invalidate: 'expenses' as any },
                  merge: true,
                } as any);
              }, 0);
            } else {
              Alert.alert('Error', deleteError || 'Failed to delete expense');
            }
          },
        },
      ]
    );
  }, [canManageExpense, deleting, deleteExpense, expense.id, navigation, deleteError]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManageExpense ? () => <ExpenseActions disabled={deleting} onEdit={handleEditExpense} onDelete={handleDeleteExpense} /> : undefined,
    });
  }, [navigation, canManageExpense, deleting, handleEditExpense, handleDeleteExpense]);

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
            <Text style={styles.detailLabel}>Paid by:</Text>
            <Text style={styles.detailValue}>
              {members.find(member => member.user_id === (expense.paid_by ?? expense.created_by))?.user?.display_name ?? 'Unknown'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>
              {formatDate(expense.date)}
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
              {formatDate(expense.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Split Breakdown</Text>
          {incompleteSplits && (
            <Text style={styles.errorText}>
              These shares total ${(allocatedCents / 100).toFixed(2)}, but the expense is ${Number(expense.amount).toFixed(2)}.
              {' '}{canManageExpense ? 'Edit this expense to correct its shares before settling.' : 'Ask the creator or a group admin to correct the shares before settling.'}
            </Text>
          )}
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
          <Text style={styles.sectionTitle}>Settlements</Text>
          <View style={styles.settlementsContainer}>
            <Text style={styles.settlementsNote}>
              Payments reduce the group balance and keep the original expense shares intact.
            </Text>
            <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('GroupBalances', { group })}>
              <Text style={styles.actionButtonText}>View balances and payments</Text>
            </TouchableOpacity>
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
  actionButtonText: {
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
