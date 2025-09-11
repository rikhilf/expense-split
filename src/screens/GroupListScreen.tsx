import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useGroups } from '../hooks/useGroups';
import { Group } from '../types/db';

interface Props {
  navigation: any;
}

const GROUPS_CACHE_KEY = 'groups_cache_v1';
const STALE_MS = 60_000; // 1 minute staleness window

export const GroupListScreen: React.FC<Props> = ({ navigation }) => {
  const { groups, loading, error, refetch } = useGroups();
  const route = useRoute<any>();
  const [displayGroups, setDisplayGroups] = useState<Group[]>([]);
  const [hydratedFromCache, setHydratedFromCache] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      // If a child screen requested an invalidate, force a refetch and clear the flag.
      // Example usage from a child: navigation.navigate('GroupList', { invalidate: true })
      // or navigation.setParams({ invalidate: true }) before goBack().
      // We clear the flag here to avoid loops.
      // @ts-ignore - route params may be undefined
      const shouldInvalidate = (route as any)?.params?.invalidate;
      if (shouldInvalidate) {
        refetch().finally(() => {
          lastFetchRef.current = Date.now();
          // Clear the flag
          // @ts-ignore
          navigation.setParams({ invalidate: undefined });
        });
        return;
      }
      const now = Date.now();
      const isStale = now - lastFetchRef.current > STALE_MS;
      // Only refetch when we have no data to show OR when cache is stale
      if (displayGroups.length === 0 || isStale) {
        refetch().finally(() => {
          lastFetchRef.current = Date.now();
        });
      }
    }, [displayGroups.length, refetch, navigation, route])
  );

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(GROUPS_CACHE_KEY);
        if (raw) {
          const cached: Group[] = JSON.parse(raw);
          if (Array.isArray(cached) && cached.length > 0) {
            setDisplayGroups(cached);
          }
        }
      } catch (e) {
        // ignore cache errors
      } finally {
        setHydratedFromCache(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (groups && groups.length > 0) {
      setDisplayGroups(groups);
      AsyncStorage.setItem(GROUPS_CACHE_KEY, JSON.stringify(groups)).catch(() => {});
    } else if (!loading && hydratedFromCache && groups.length === 0) {
      // if server says empty and we were showing cache, reflect it (avoid clearing while a fetch is in-flight)
      setDisplayGroups([]);
      AsyncStorage.removeItem(GROUPS_CACHE_KEY).catch(() => {});
    }
  }, [groups, loading, hydratedFromCache]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    lastFetchRef.current = Date.now();
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
    if ((loading && displayGroups.length === 0) || (!hydratedFromCache && displayGroups.length === 0)) {
      return (
        <View style={styles.groupsList}>
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

    if (displayGroups.length === 0 && !loading) {
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
        {displayGroups.map((group) => (
          <View key={group.id}>
            {renderGroupItem(group)}
          </View>
        ))}
      </View>
    );
  };

  // Animated loading bar
  const loadingBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading && displayGroups.length > 0) {
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
  }, [loading, displayGroups.length]);

  const barWidth = loadingBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Animated loading bar (only when refetching) */}
      {loading && displayGroups.length > 0 && (
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
  },
});