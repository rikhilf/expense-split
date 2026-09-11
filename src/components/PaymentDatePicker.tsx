import React, { useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { localDate } from '../lib/settlementHistory';

export type PaymentDatePickerProps = { value: string; onChange: (date: string) => void };

export const PaymentDatePicker = ({ value, onChange }: PaymentDatePickerProps) => {
  const [open, setOpen] = useState(false);
  // Parse as a local calendar date, not UTC: selecting a day must not shift it.
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  const ios = Platform.OS === 'ios';
  return <View>
    {!ios && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose payment date" onPress={() => setOpen(true)} style={{ paddingVertical: 12 }}>
      <Text>{date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
    </TouchableOpacity>}
    {(ios || open) && <DateTimePicker
      accessibilityLabel="Payment date"
      value={date}
      mode="date"
      display={ios ? 'compact' : 'default'}
      minimumDate={new Date(1900, 0, 1)}
      maximumDate={new Date()}
      onChange={(event, selectedDate) => {
        if (!ios) setOpen(false);
        if (event.type === 'set' && selectedDate) onChange(localDate(selectedDate));
      }}
    />}
  </View>;
};
