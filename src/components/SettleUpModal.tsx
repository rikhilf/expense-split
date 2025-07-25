import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useAddSettlement } from '../hooks/useAddSettlement';

export interface ExpenseSelection {
  id: string;
  description: string;
  amountOwed: number;
}

interface Props {
  isVisible: boolean;
  onClose: () => void;
  groupId: string;
  userId: string;
  otherUserId: string;
  defaultAmount: number;
  expenseList: ExpenseSelection[];
}

export const SettleUpModal: React.FC<Props> = ({
  isVisible,
  onClose,
  groupId,
  userId,
  otherUserId,
  defaultAmount,
  expenseList,
}) => {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [selected, setSelected] = useState<string[]>([]);
  const { addSettlement, loading, error } = useAddSettlement();

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleConfirm = async () => {
    const amt = parseFloat(amount) || 0;
    if (selected.length > 0) {
      for (const id of selected) {
        await addSettlement({
          group_id: groupId,
          paid_by: userId,
          paid_to: otherUserId,
          amount: amt,
          expense_id: id,
        });
      }
    } else {
      await addSettlement({
        group_id: groupId,
        paid_by: userId,
        paid_to: otherUserId,
        amount: amt,
        expense_id: null,
      });
    }
    onClose();
  };

  return (
    <Modal visible={isVisible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Settle Up</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <ScrollView style={styles.list}>
            {expenseList.map((exp) => (
              <TouchableOpacity
                key={exp.id}
                style={styles.item}
                onPress={() => toggle(exp.id)}
              >
                <Text style={styles.checkbox}>
                  {selected.includes(exp.id) ? '☑' : '☐'}
                </Text>
                <Text style={styles.itemText}>
                  {exp.description} - ${exp.amountOwed.toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.button} onPress={onClose}>
              <Text>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.primary]}
              onPress={handleConfirm}
              disabled={loading}
            >
              <Text>{loading ? 'Saving...' : 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  list: { maxHeight: 200 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  checkbox: { marginRight: 8 },
  itemText: { flex: 1 },
  error: { color: 'red', marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  button: { marginLeft: 8, padding: 8 },
  primary: { backgroundColor: '#007AFF', borderRadius: 4 },
});
