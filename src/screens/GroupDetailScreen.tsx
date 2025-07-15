import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useExpenses } from '../hooks/useExpenses';
import { Group, Expense } from '../types/db';

interface Props {
  navigation: any;
  route: {
    params: {
      group: Group;
    };
  };
}

export const GroupDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { group } = route.params;
  const { expenses, loading, error, refetch } = useExpenses(group.id);
  const [activeTab, setActiveTab] = useState<'expenses' | 'members'>('expenses');
  const [refreshing, setRefreshing] = useState(false);
  const hasRefetchedRef = useRef(false);

  // Auto-refresh when screen comes into focus (e.g., returning from AddExpense)
  useFocusEffect(
    React.useCallback(() => {
      if (activeTab === 'expenses' && !hasRefetchedRef.current) {
        hasRefetchedRef.current = true;
        refetch();
      }
    }, [activeTab, refetch])
  );

  // Reset the ref when the screen loses focus
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        hasRefetchedRef.current = false;
      };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleAddExpense = () => {
    navigation.navigate('AddExpense', { group });
  };

  const handleExpensePress = (expense: Expense) => {
    navigation.navigate('ExpenseDetail', { expense, group });
  };

  const renderExpenseItem = (expense: Expense) => (
    <TouchableOpacity
      style={styles.expenseItem}
      onPress={() => handleExpensePress(expense)}
    >
      <View style={styles.expenseInfo}>
        <Text style={styles.expenseDescription}>{expense.description}</Text>
        <Text style={styles.expenseDate}>
          {new Date(expense.date).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.expenseAmount}>${expense.amount.toFixed(2)}</Text>
    </TouchableOpacity>
  );

  const renderExpensesContent = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading expenses...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (expenses.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No expenses yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your first expense to start tracking
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleAddExpense}>
            <Text style={styles.emptyButtonText}>Add Expense</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.expensesList}>
        {expenses.map((expense) => (
          <View key={expense.id}>
            {renderExpenseItem(expense)}
          </View>
        ))}
      </View>
    );
  };

  const renderMembersContent = () => (
    <View style={styles.centerContainer}>
      <Text style={styles.comingSoonText}>Member management coming soon!</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.groupDate}>
            Created {new Date(group.created_at).toLocaleDateString()}
          </Text>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'expenses' && styles.activeTab]}
            onPress={() => setActiveTab('expenses')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'expenses' && styles.activeTabText,
              ]}
            >
              Expenses
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'members' && styles.activeTab]}
            onPress={() => setActiveTab('members')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'members' && styles.activeTabText,
              ]}
            >
              Members
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'expenses' ? (
            <>
              <View style={styles.expensesHeader}>
                <Text style={styles.sectionTitle}>Expenses</Text>
                <TouchableOpacity style={styles.addButton} onPress={handleAddExpense}>
                  <Text style={styles.addButtonText}>+ Add Expense</Text>
                </TouchableOpacity>
              </View>
              {renderExpensesContent()}
            </>
          ) : (
            renderMembersContent()
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  groupDate: {
    fontSize: 14,
    color: '#666',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  expensesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  expensesList: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  expenseItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  expenseDate: {
    fontSize: 14,
    color: '#666',
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#ff3b30',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  comingSoonText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
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