import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { GroupListScreen } from '../screens/GroupListScreen';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { GroupDetailScreen } from '../screens/GroupDetailScreen';
import { AddExpenseScreen } from '../screens/AddExpenseScreen';
import { ExpenseDetailScreen } from '../screens/ExpenseDetailScreen';
import { AppStackParamList } from '../types/navigation';

const Stack = createStackNavigator<AppStackParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="GroupList"
      screenOptions={{
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTintColor: '#007AFF',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Stack.Screen 
        name="GroupList" 
        component={GroupListScreen}
        options={{
          title: 'Expense Split',
        }}
      />
      <Stack.Screen 
        name="CreateGroup" 
        component={CreateGroupScreen}
        options={{
          title: 'Create Group',
        }}
      />
      <Stack.Screen 
        name="GroupDetail" 
        component={GroupDetailScreen}
        options={({ route }) => ({
          title: route.params?.group?.name || 'Group',
        })}
      />
      <Stack.Screen 
        name="AddExpense" 
        component={AddExpenseScreen}
        options={{
          title: 'Add Expense',
        }}
      />
      <Stack.Screen 
        name="ExpenseDetail" 
        component={ExpenseDetailScreen}
        options={{
          title: 'Expense Details',
        }}
      />
    </Stack.Navigator>
  );
}; 