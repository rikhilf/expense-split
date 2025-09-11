import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useProfile } from '../contexts/ProfileContext';
import { supabase } from '../lib/supabase';

export const ProfileScreen: React.FC = () => {
  const { profile, loading: profileLoading, refresh } = useProfile();
  const [displayName, setDisplayName] = useState('');
  const [venmo, setVenmo] = useState('');
  const [cashapp, setCashapp] = useState('');
  const [paypal, setPaypal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setVenmo((profile.venmo_username as string) || '');
      setCashapp((profile.cashapp_username as string) || '');
      setPaypal((profile.paypal_username as string) || '');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      Alert.alert('Validation', 'Name cannot be empty');
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: trimmedName,
          venmo_username: venmo.trim() || null,
          cashapp_username: cashapp.trim() || null,
          paypal_username: paypal.trim() || null,
        })
        .eq('id', profile.id);

      if (error) {
        Alert.alert('Error', error.message ?? 'Failed to save changes');
        return;
      }

      await refresh();
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (profileLoading && !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.card}>

          <Text style={styles.label}>Email</Text>
          <View style={styles.readonlyBox}>
            <Text style={styles.readonlyText}>{profile?.email ?? '—'}</Text>
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            autoCapitalize="words"
          />

          <Text style={styles.label}>Venmo Username (optional)</Text>
          <TextInput
            style={styles.input}
            value={venmo}
            onChangeText={setVenmo}
            placeholder="e.g. @yourname or yourname"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Cash App Username (optional)</Text>
          <TextInput
            style={styles.input}
            value={cashapp}
            onChangeText={setCashapp}
            placeholder="e.g. $yourname or yourname"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>PayPal Username (optional)</Text>
          <TextInput
            style={styles.input}
            value={paypal}
            onChangeText={setPaypal}
            placeholder="e.g. yourname"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={[styles.button, saving ? styles.buttonDisabled : styles.primaryButton]} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  scrollContainer: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8, color: '#666' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
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
  button: {
    marginTop: 20,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButton: { backgroundColor: '#007AFF' },
  buttonDisabled: { backgroundColor: '#A7C8FF' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
