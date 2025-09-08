import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Animated,
  Easing,
  Modal,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import React, { useState, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useExpenses } from '../hooks/useExpenses';
import { useMembers } from '../hooks/useMembers';
import { Group, Expense } from '../types/db';
import { useProfile } from '../contexts/ProfileContext';

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
  const {
    members,
    loading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
    inviteMember,
    removeMember,
    isCurrentUserAdmin,
  } = useMembers(group.id);
  const { profileId } = useProfile();
  const [activeTab, setActiveTab] = useState<'expenses' | 'members'>('expenses');
  const [refreshing, setRefreshing] = useState(false);
  const hasRefetchedRef = useRef(false);

  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);

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
    if (activeTab === 'members') {
      await refetchMembers();
    } else {
      await refetch();
    }
    setRefreshing(false);
  };

  const handleAddExpense = () => {
    navigation.navigate('AddExpense', { group });
  };

  const handleExpensePress = (expense: Expense) => {
    navigation.navigate('ExpenseDetail', { expense, group });
  };

  const handleAddMember = () => {
    setInviteName('');
    setInviteEmail('');
    setAddMemberVisible(true);
  };

  const submitInvite = async () => {
    if (!inviteName.trim()) {
      Alert.alert('Name required', 'Please enter a name for the new member.');
      return;
    }
    try {
      setSubmittingInvite(true);
      const ok = await inviteMember({
        displayName: inviteName.trim(),
        email: inviteEmail ? inviteEmail.trim().toLowerCase() : undefined,
      });
      if (ok) {
        setAddMemberVisible(false);
      } else if (membersError) {
        Alert.alert('Error', membersError);
      }
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRemoveMember = (membershipId: string) => {
    const target = members.find(m => m.id === membershipId);
    const name = target?.user?.display_name ?? 'this member';
    const adminWarning =
      'Removing this member will also remove their expense splits from all expenses in this group. This may change totals.';

    const message = isCurrentUserAdmin
      ? `${adminWarning}\n\nProceed to remove ${name}?`
      : 'Are you sure you want to remove this placeholder member?';

    Alert.alert('Remove Member', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeMember(membershipId),
      },
    ]);
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
    // if (loading && !refreshing) {
    //   return (
    //     <View style={styles.centerContainer}>
    //       <Text style={styles.loadingText}>Loading expenses...</Text>
    //     </View>
    //   );
    // }

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

  const renderMembersContent = () => {
    if (membersError) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{membersError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetchMembers}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (membersLoading && members.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading members...</Text>
        </View>
      );
    }

    return (
      <View style={styles.membersList}>
        {members.map((member) => {
          const isPlaceholder = !member.user?.auth_user_id;
          const canRemove = isCurrentUserAdmin || isPlaceholder;
          const isYou = profileId === member.user_id;
          return (
            <View key={member.id} style={styles.memberItem}>
              <View style={styles.memberLeft}>
                <Text style={styles.memberEmail}>{member.user?.display_name || member.user_id}</Text>
                {member.role === 'admin' && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                )}
                {isYou && (
                  <View style={styles.youBadge}>
                    <Text style={styles.youBadgeText}>You</Text>
                  </View>
                )}
              </View>
              {canRemove && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveMember(member.id)}
                >
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // Animated loading bar
  const loadingBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading && expenses.length > 0) {
      loadingBarAnim.setValue(0);
      Animated.loop(
        Animated.timing(loadingBarAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      ).start();
    } else {
      loadingBarAnim.stopAnimation();
      loadingBarAnim.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, expenses.length]);

  const barWidth = loadingBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Animated loading bar (only when refetching) */}
      {loading && expenses.length > 0 && (
        <View style={styles.loadingBarContainer}>
          <Animated.View
            style={[
              styles.loadingBar,
              { width: barWidth },
            ]}
          />
        </View>
      )}
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
            <>
              <View style={styles.expensesHeader}>
                <Text style={styles.sectionTitle}>Members</Text>
                <TouchableOpacity style={styles.addButton} onPress={handleAddMember}>
                  <Text style={styles.addButtonText}>+ Add Member</Text>
                </TouchableOpacity>
              </View>
              {renderMembersContent()}
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={addMemberVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddMemberVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Member</Text>
            <TextInput
              style={styles.input}
              placeholder="Name (required)"
              value={inviteName}
              onChangeText={setInviteName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={inviteEmail}
              onChangeText={setInviteEmail}
            />
            {!!membersError && <Text style={styles.errorText}>{membersError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setAddMemberVisible(false)}
                disabled={submittingInvite}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalPrimary]}
                onPress={submitInvite}
                disabled={submittingInvite}
              >
                <Text style={styles.modalButtonText}>
                  {submittingInvite ? 'Adding…' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  loadingBar: {
    height: 4,
    backgroundColor: '#007AFF',
    borderRadius: 2,
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
  membersList: {
    padding: 16,
  },
  memberItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  memberEmail: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminBadge: {
    backgroundColor: '#E8F0FE',
    borderColor: '#3578E5',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  adminBadgeText: {
    color: '#1B66CA',
    fontSize: 12,
    fontWeight: '700',
  },
  youBadge: {
    backgroundColor: '#F2F2F7',
    borderColor: '#C7C7CC',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  youBadgeText: {
    color: '#3A3A3C',
    fontSize: 12,
    fontWeight: '700',
  },
  removeButton: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  modalActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalCancel: {
    backgroundColor: '#eee',
  },
  modalPrimary: {
    backgroundColor: '#007AFF',
  },
  modalButtonText: {
    color: '#111',
    fontWeight: '600',
  },
});
