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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      flash?: string;
      invalidate?: 'expenses' | 'members' | true;
    };
  };
}

const EXPENSES_CACHE_KEY_PREFIX = 'expenses_cache_v1:';
const MEMBERS_CACHE_KEY_PREFIX = 'members_cache_v1:';
const STALE_MS = 60_000; // 1 minute staleness window

export const GroupDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const routeKey = (navigation?.getState?.()?.routes ?? []).find((r: any) => r.name === 'GroupDetail')?.key;
  const { group } = route.params;
  const invalidate = (route.params as any)?.invalidate as 'expenses' | 'members' | true | undefined;
  const flash = (route.params as any)?.flash as string | undefined;
  const { expenses, loading, error, refetch } = useExpenses(group.id);
  const {
    members,
    loading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
    inviteMember,
    removeMember,
    leaveGroup,
    isCurrentUserAdmin,
  } = useMembers(group.id);
  const { profileId } = useProfile();
  const [activeTab, setActiveTab] = useState<'expenses' | 'members'>('expenses');
  const [refreshing, setRefreshing] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;

  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Cache/display state and hydration flags
  const [displayExpenses, setDisplayExpenses] = useState<Expense[]>([]);
  const [displayMembers, setDisplayMembers] = useState<typeof members>([]);
  const [hydratedExpenses, setHydratedExpenses] = useState(false);
  const [hydratedMembers, setHydratedMembers] = useState(false);
  const [hasFetchedExpenses, setHasFetchedExpenses] = useState(false);
  const lastExpensesFetchRef = useRef<number>(0);
  const lastMembersFetchRef = useRef<number>(0);
  const lastExpensesCacheRef = useRef<string | null>(null);
  const lastMembersCacheRef = useRef<string | null>(null);
  const expensesCacheKey = EXPENSES_CACHE_KEY_PREFIX + group.id;
  const membersCacheKey = MEMBERS_CACHE_KEY_PREFIX + group.id;

  // Staleness-gated refresh on focus, with route param–based invalidation
  useFocusEffect(
    React.useCallback(() => {
      // Check if a child screen requested an invalidate on return
      if (invalidate) {
        const clearFlag = () => setTimeout(() => {
          // defer clearing params to avoid scheduling updates during insertion
          navigation.setParams({ invalidate: undefined });
        }, 0);

        if (invalidate === 'members') {
          refetchMembers().finally(() => {
            lastMembersFetchRef.current = Date.now();
            clearFlag();
          });
        } else {
          // default to expenses when true or 'expenses'
          refetch().finally(() => {
            lastExpensesFetchRef.current = Date.now();
            clearFlag();
          });
        }
        return;
      }

      const now = Date.now();
      const expensesStale = now - lastExpensesFetchRef.current > STALE_MS;
      const membersStale = now - lastMembersFetchRef.current > STALE_MS;

      if (activeTab === 'expenses') {
        if (!loading && (displayExpenses.length === 0 || expensesStale)) {
          refetch().finally(() => {
            lastExpensesFetchRef.current = Date.now();
          });
        }
      } else {
        if (!membersLoading && (displayMembers.length === 0 || membersStale)) {
          refetchMembers().finally(() => {
            lastMembersFetchRef.current = Date.now();
          });
        }
      }
    }, [activeTab, displayExpenses.length, displayMembers.length, refetch, refetchMembers, invalidate, navigation, loading, membersLoading])
  );

  // Show transient flash message if provided via params
  useEffect(() => {
    if (flash) {
      setFlashMessage(flash);
      // Defer clearing to avoid scheduling updates during insertion
      setTimeout(() => {
        navigation.setParams({ flash: undefined });
      }, 0);

      // Fade in
      Animated.timing(flashOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Hold for 2s, then fade out and clear message
        const hold = setTimeout(() => {
          Animated.timing(flashOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => setFlashMessage(null));
        }, 2000);
        // Cleanup timeout if effect re-runs
        return () => clearTimeout(hold);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, navigation, flashOpacity]);

  useEffect(() => {
    setHasFetchedExpenses(false);
    lastExpensesCacheRef.current = null;
    lastMembersCacheRef.current = null;
  }, [expensesCacheKey]);

  useEffect(() => {
    if (!loading) {
      setHasFetchedExpenses(true);
    }
  }, [loading]);

  useEffect(() => {
    if (!loading) {
      lastExpensesFetchRef.current = Date.now();
    }
  }, [loading]);

  useEffect(() => {
    if (!membersLoading) {
      lastMembersFetchRef.current = Date.now();
    }
  }, [membersLoading]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'members') {
      await refetchMembers();
      lastMembersFetchRef.current = Date.now();
    } else {
      await refetch();
      lastExpensesFetchRef.current = Date.now();
    }
    setRefreshing(false);
  };

  const handleAddExpense = () => {
    navigation.navigate('AddExpense', { group, fromKey: routeKey as any });
  };

  const handleExpensePress = (expense: Expense) => {
    const creatorDisplayName = displayMembers.find(m => m.user_id === expense.created_by)?.user?.display_name ?? null;
    navigation.navigate('ExpenseDetail', { expense, group, creatorDisplayName, fromKey: routeKey as any });
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
        await refetchMembers();
        lastMembersFetchRef.current = Date.now();
      } else if (membersError) {
        Alert.alert('Error', membersError);
      }
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRemoveMember = (membershipId: string) => {
    const target = members.find(m => m.id === membershipId);
    const isYou = target?.user_id === profileId;
    const name = target?.user?.display_name ?? 'this member';

    if (isYou) {
      const authenticatedCount = members.filter(member => member.authenticated).length;
      const isLastAuthenticatedMember = !!target?.authenticated && authenticatedCount === 1;
      const hasGroupExpenses = displayExpenses.length > 0 || (expenses ?? []).length > 0;

      const confirmTitle = isLastAuthenticatedMember ? 'Delete Group' : 'Leave Group';
      const confirmBody = isLastAuthenticatedMember && hasGroupExpenses
        ? 'You are the last non-placeholder member, and this group still has expenses. Leaving will permanently delete the group and all expense history. Do you want to proceed?'
        : isLastAuthenticatedMember
          ? 'You are the last non-placeholder member. Are you sure you want to leave and delete the group?'
          : 'Are you sure you want to leave the group?';
      const confirmAction = isLastAuthenticatedMember ? 'Delete Group' : 'Leave';

      Alert.alert(
        confirmTitle,
        confirmBody,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: confirmAction,
            style: 'destructive',
            onPress: async () => {
              const result = await leaveGroup({
                confirmDeleteWithExpenses: isLastAuthenticatedMember && hasGroupExpenses,
              });
              if (result.ok) {
                const flashText = result.deletedGroup ? 'Group deleted.' : 'You left the group.';
                navigation.navigate('GroupList', { invalidate: true, flash: flashText });
              } else {
                Alert.alert('Error', result.error ?? 'Failed to leave group.');
              }
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Remove Member',
      'Are you sure you want to remove this member?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeMember(membershipId);
            if (!result.ok) {
              Alert.alert('Unable to Remove Member', result.error ?? 'Failed to remove member.');
            }
          },
        },
      ]
    );
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
    if (displayExpenses.length === 0 && (!hydratedExpenses || (!hasFetchedExpenses && loading))) {
      return (
        <View style={styles.expensesList}>
          {[0,1,2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonSubtitle} />
            </View>
          ))}
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

    if (displayExpenses.length === 0) {
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
        {displayExpenses.map((expense) => (
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

    if ((membersLoading && displayMembers.length === 0) || (!hydratedMembers && displayMembers.length === 0)) {
      return (
        <View style={styles.membersList}>
          {[0,1,2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonSubtitle} />
            </View>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.membersList}>
        {displayMembers.map((member) => {
          const isPlaceholder = !member.authenticated;
          const isYou = profileId === member.user_id;
          const canRemove = isCurrentUserAdmin || isPlaceholder || isYou;
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
                {!member.authenticated && (
                  <View style={styles.placeholderBadge}>
                    <Text style={styles.placeholderBadgeText}>Placeholder</Text>
                  </View>
                )}
              </View>
              {canRemove && (
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() => {
                      if (!member.user) return;
                  navigation.navigate('MemberProfile', {
                        groupId: group.id,
                        profile: {
                          id: member.user_id,
                          display_name: member.user.display_name,
                          email: member.user.email,
                          venmo_username: member.user.venmo_username as any,
                          cashapp_username: member.user.cashapp_username as any,
                          paypal_username: member.user.paypal_username as any,
                          authenticated: member.authenticated,
                        },
                        canEdit: isCurrentUserAdmin && !member.authenticated,
                        fromKey: routeKey as any,
                      });
                    }}
                  >
                    <Text style={styles.viewButtonText}>View Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveMember(member.id)}
                  >
                    <Text style={styles.removeButtonText}>{isYou ? 'Leave' : 'Remove'}</Text>
                  </TouchableOpacity>
                </View>
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
    if (loading && displayExpenses.length > 0) {
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
  }, [loading, displayExpenses.length]);

  const barWidth = loadingBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Hydrate expenses cache on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(expensesCacheKey);
        if (raw) {
          const cached: Expense[] = JSON.parse(raw);
          if (Array.isArray(cached) && cached.length >= 0) {
            setDisplayExpenses(cached);
            lastExpensesCacheRef.current = raw;
          }
        }
      } catch {}
      finally {
        setHydratedExpenses(true);
      }
    })();
  }, [membersCacheKey]);

  // Hydrate members cache on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(membersCacheKey);
        if (raw) {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached) && cached.length >= 0) {
            setDisplayMembers(cached);
            lastMembersCacheRef.current = raw;
          }
        }
      } catch {}
      finally {
        setHydratedMembers(true);
      }
    })();
  }, [group.id]);

  // Sync expenses to cache/display without wiping cached UI while loading
  useEffect(() => {
    if (!hydratedExpenses) return;
    const list = expenses ?? [];
    if (!loading) {
      setDisplayExpenses(list);
      const serialized = JSON.stringify(list);
      if (serialized !== lastExpensesCacheRef.current) {
        lastExpensesCacheRef.current = serialized;
        AsyncStorage.setItem(expensesCacheKey, serialized).catch(() => {});
      }
    } else if (list.length > 0) {
      // if loading but we already have data (e.g., from a quick refetch), reflect it
      setDisplayExpenses(list);
      const serialized = JSON.stringify(list);
      if (serialized !== lastExpensesCacheRef.current) {
        lastExpensesCacheRef.current = serialized;
        AsyncStorage.setItem(expensesCacheKey, serialized).catch(() => {});
      }
    }
  }, [expenses, loading, hydratedExpenses, expensesCacheKey]);

  // Sync members to cache/display without wiping cached UI while loading
  useEffect(() => {
    if (!hydratedMembers) return;
    const list = members ?? [];
    if (!membersLoading) {
      setDisplayMembers(list);
      const serialized = JSON.stringify(list);
      if (serialized !== lastMembersCacheRef.current) {
        lastMembersCacheRef.current = serialized;
        AsyncStorage.setItem(membersCacheKey, serialized).catch(() => {});
      }
    } else if (list.length > 0) {
      setDisplayMembers(list);
      const serialized = JSON.stringify(list);
      if (serialized !== lastMembersCacheRef.current) {
        lastMembersCacheRef.current = serialized;
        AsyncStorage.setItem(membersCacheKey, serialized).catch(() => {});
      }
    }
  }, [members, membersLoading, hydratedMembers, membersCacheKey]);

  return (
    <View style={styles.container}>
      {flashMessage && (
        <Animated.View style={[styles.flashContainer, { opacity: flashOpacity }]} pointerEvents="none">
          <Text style={styles.flashText}>{flashMessage}</Text>
        </Animated.View>
      )}
      {/* Animated loading bar (only when refetching) */}
      {loading && displayExpenses.length > 0 && (
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
            Created {group.created_at ? new Date(group.created_at).toLocaleDateString() : 'Unknown'}
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
              autoCapitalize="sentences"
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
  flashContainer: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'center',
  },
  flashText: {
    color: '#155724',
    textAlign: 'center',
    fontWeight: '600',
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
  placeholderBadge: {
    backgroundColor: '#FFF4E5',
    borderColor: '#FFD6A5',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  placeholderBadgeText: {
    color: '#7A4D00',
    fontSize: 12,
    fontWeight: '700',
  },
  removeButton: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewButton: {
    backgroundColor: '#E9EEF6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewButtonText: {
    color: '#1B66CA',
    fontSize: 14,
    fontWeight: '600',
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
  skeletonCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  skeletonTitle: {
    height: 18,
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    marginBottom: 8,
    width: '60%',
  },
  skeletonSubtitle: {
    height: 14,
    backgroundColor: '#f0f2f4',
    borderRadius: 6,
    width: '40%',
  }
});
