import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useGroups } from '../hooks/useGroups';
import { Group } from '../types/db';

interface Props {
  navigation: any;
}

export const GroupListScreen: React.FC<Props> = ({ navigation }) => {
  const { groups, loading, error, refetch } = useGroups();
  const [refreshing, setRefreshing] = useState(false);
  const hasRefetchedRef = useRef(false);

  // Auto-refresh when screen comes into focus (e.g., returning from CreateGroup)
  useFocusEffect(
    React.useCallback(() => {
      if (!hasRefetchedRef.current) {
        hasRefetchedRef.current = true;
        refetch();
      }
    }, [refetch])
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

  const handleCreateGroup = () => {
    navigation.navigate('CreateGroup');
  };

  const handleGroupPress = (group: Group) => {
    navigation.navigate('GroupDetail', { group });
  };

  const renderGroupItem = (group: Group) => (
    <TouchableOpacity
      style={styles.groupItem}
      onPress={() => handleGroupPress(group)}
    >
      <View style={styles.groupInfo}>
        <Text style={styles.groupName}>{group.name}</Text>
        <Text style={styles.groupDate}>
          Created {new Date(group.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading groups...</Text>
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

    if (groups.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first group to start splitting expenses
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleCreateGroup}>
            <Text style={styles.emptyButtonText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.groupsList}>
        {groups.map((group) => (
          <View key={group.id}>
            {renderGroupItem(group)}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Groups</Text>
          <TouchableOpacity style={styles.createButton} onPress={handleCreateGroup}>
            <Text style={styles.createButtonText}>+ New Group</Text>
          </TouchableOpacity>
        </View>

        {renderContent()}
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  groupsList: {
    padding: 16,
  },
  groupItem: {
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
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  groupDate: {
    fontSize: 14,
    color: '#666',
  },
  arrow: {
    fontSize: 20,
    color: '#666',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
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
}); 