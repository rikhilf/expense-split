import React from 'react';
import { localDate } from '../lib/settlementHistory';
import type { PaymentDatePickerProps } from './PaymentDatePicker';

export const PaymentDatePicker = ({ value, onChange }: PaymentDatePickerProps) => (
  <input
    aria-label="Payment date"
    type="date"
    value={value}
    min="1900-01-01"
    max={localDate()}
    onChange={event => { if (event.target.value) onChange(event.target.value); }}
    style={{ padding: 12, fontSize: 16, border: '1px solid #ccd3dc', borderRadius: 8, background: '#fff', color: '#333' }}
  />
);
