import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GroupListScreen } from '../screens/GroupListScreen';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { GroupDetailScreen } from '../screens/GroupDetailScreen';
import { AddExpenseScreen } from '../screens/AddExpenseScreen';
import { ExpenseDetailScreen } from '../screens/ExpenseDetailScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AppStackParamList } from '../types/navigation';
import { Ionicons } from '@expo/vector-icons';

const HomeStack = createStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator();

const HomeStackNavigator: React.FC = () => (
  <HomeStack.Navigator
    initialRouteName="GroupList"
    screenOptions={{
      headerStyle: { backgroundColor: '#fff' },
      headerTintColor: '#007AFF',
      headerTitleStyle: { fontWeight: '600' },
    }}
  >
    <HomeStack.Screen
      name="GroupList"
      component={GroupListScreen}
      options={{ title: 'Expense Split' }}
    />
    <HomeStack.Screen
      name="CreateGroup"
      component={CreateGroupScreen}
      options={{ title: 'Create Group' }}
    />
    <HomeStack.Screen
      name="GroupDetail"
      component={GroupDetailScreen}
      options={({ route }) => ({ title: route.params?.group?.name || 'Group' })}
    />
    <HomeStack.Screen
      name="AddExpense"
      component={AddExpenseScreen}
      options={{ title: 'Add Expense' }}
    />
    <HomeStack.Screen
      name="ExpenseDetail"
      component={ExpenseDetailScreen}
      options={{ title: 'Expense Details' }}
    />
  </HomeStack.Navigator>
);

export const AppNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const iconName = route.name === 'Home' ? 'home' : 'person-circle';
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#888',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: true, headerTitle: 'Your Profile' }}
      />
    </Tab.Navigator>
  );
};
