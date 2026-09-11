import React, { useRef, useState } from 'react';
import { ActionSheetIOS, findNodeHandle, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = { disabled: boolean; onEdit: () => void; onDelete: () => void };

export const ExpenseActions = ({ disabled, onEdit, onDelete }: Props) => {
  const [open, setOpen] = useState(false);
  const anchor = useRef<View>(null);
  const show = () => {
    if (disabled) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({
        options: ['Edit Expense', 'Delete Expense', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
        anchor: findNodeHandle(anchor.current) ?? undefined,
      }, index => {
        if (index === 0) onEdit();
        if (index === 1) onDelete();
      });
    } else setOpen(true);
  };
  return <>
    <Pressable ref={anchor} accessibilityRole="button" accessibilityLabel="Expense options" disabled={disabled} onPress={show} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8, opacity: disabled ? 0.4 : 1 }}>
      <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color="#007AFF" />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable accessibilityLabel="Dismiss expense options" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'flex-end', padding: 20, paddingTop: 60 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 14, width: 220, overflow: 'hidden' }}>
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onEdit(); }} style={{ padding: 16 }}><Text style={{ color: '#007AFF', fontSize: 17 }}>Edit Expense</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onDelete(); }} style={{ padding: 16 }}><Text style={{ color: '#ff3b30', fontSize: 17 }}>Delete Expense</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ padding: 16 }}><Text style={{ fontSize: 17 }}>Cancel</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  </>;
};
