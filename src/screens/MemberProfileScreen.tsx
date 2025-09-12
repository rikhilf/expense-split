import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import type { AppStackParamList } from '../types/navigation';

type MemberProfileRoute = RouteProp<AppStackParamList, 'MemberProfile'>;

export const MemberProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<MemberProfileRoute>();
  const { groupId, profile, canEdit } = route.params;

  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [email] = useState(profile.email || null);
  const [venmo, setVenmo] = useState((profile.venmo_username as string) || '');
  const [cashapp, setCashapp] = useState((profile.cashapp_username as string) || '');
  const [paypal, setPaypal] = useState((profile.paypal_username as string) || '');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: profile.display_name || 'Member Profile',
      headerRight: () => (
        canEdit ? (
          <TouchableOpacity
            onPress={() => {
              if (editMode) {
                // reset
                setDisplayName(profile.display_name || '');
                setVenmo((profile.venmo_username as string) || '');
                setCashapp((profile.cashapp_username as string) || '');
                setPaypal((profile.paypal_username as string) || '');
                setEditMode(false);
              } else {
                setEditMode(true);
              }
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Text style={{ color: '#007AFF', fontWeight: '700' }}>{editMode ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        ) : null
      ),
    });
  }, [navigation, profile, canEdit, editMode]);

  const dirty = useMemo(() => {
    return (
      displayName.trim() !== (profile.display_name || '') ||
      venmo.trim() !== ((profile.venmo_username as string) || '') ||
      cashapp.trim() !== ((profile.cashapp_username as string) || '') ||
      paypal.trim() !== ((profile.paypal_username as string) || '')
    );
  }, [displayName, venmo, cashapp, paypal, profile]);

  const handleSave = async () => {
    if (!canEdit || !profile || !profile.id) return;
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      Alert.alert('Validation', 'Name cannot be empty');
      return;
    }
    try {
      setSaving(true);
      const { data, error } = await supabase.functions.invoke('update_placeholder_profile', {
        body: {
          group_id: groupId,
          profile_id: profile.id,
          display_name: trimmedName,
          venmo_username: venmo.trim() || null,
          cashapp_username: cashapp.trim() || null,
          paypal_username: paypal.trim() || null,
        },
      });
      if (error) {
        Alert.alert('Error', error.message ?? 'Failed to save');
        return;
      }
      setEditMode(false);
      Alert.alert('Saved', 'Member profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {!profile.authenticated && (
          <View style={styles.placeholderBanner}>
            <Text style={styles.placeholderText}>Placeholder profile</Text>
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.readonlyBox}>
            <Text style={styles.readonlyText}>{email ?? '—'}</Text>
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={[styles.input, (!editMode || !canEdit) && styles.inputDisabled]}
            value={displayName}
            onChangeText={setDisplayName}
            editable={editMode && canEdit}
            placeholder="Name"
            autoCapitalize="words"
          />

          <Text style={styles.label}>Venmo Username (optional)</Text>
          <TextInput
            style={[styles.input, (!editMode || !canEdit) && styles.inputDisabled]}
            value={venmo}
            onChangeText={setVenmo}
            editable={editMode && canEdit}
            placeholder="e.g. @user or user"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Cash App Username (optional)</Text>
          <TextInput
            style={[styles.input, (!editMode || !canEdit) && styles.inputDisabled]}
            value={cashapp}
            onChangeText={setCashapp}
            editable={editMode && canEdit}
            placeholder="e.g. $user or user"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>PayPal Username (optional)</Text>
          <TextInput
            style={[styles.input, (!editMode || !canEdit) && styles.inputDisabled]}
            value={paypal}
            onChangeText={setPaypal}
            editable={editMode && canEdit}
            placeholder="e.g. user"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {canEdit && editMode && dirty && (
            <TouchableOpacity
              style={[styles.button, saving ? styles.buttonDisabled : styles.primaryButton]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  scrollContainer: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  placeholderBanner: {
    backgroundColor: '#FFF4E5',
    borderColor: '#FFD6A5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  placeholderText: { color: '#7A4D00', fontWeight: '600', textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 6 },
  readonlyBox: {
    backgroundColor: '#f2f4f7',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  readonlyText: { color: '#555' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  inputDisabled: { backgroundColor: '#f7f8fa' },
  button: { marginTop: 20, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryButton: { backgroundColor: '#007AFF' },
  buttonDisabled: { backgroundColor: '#A7C8FF' },
  buttonText: { color: '#fff', fontWeight: '700' },
});

