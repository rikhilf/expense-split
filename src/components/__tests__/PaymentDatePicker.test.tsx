import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Platform } from 'react-native';
import { PaymentDatePicker } from '../PaymentDatePicker';

let pickerProps: any;
jest.mock('react-native', () => {
  const React = require('react');
  return {
    Platform: { OS: 'ios' },
    View: ({ children }: any) => React.createElement('div', {}, children),
    Text: ({ children }: any) => React.createElement('span', {}, children),
    TouchableOpacity: ({ children, onPress }: any) => React.createElement('button', { onClick: onPress }, children),
  };
});
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (props: any) => { pickerProps = props; return null; },
}));

it('uses the native iOS date control and preserves the chosen local calendar day', () => {
  const change = jest.fn();
  render(<PaymentDatePicker value="2026-03-08" onChange={change} />);
  expect(pickerProps.display).toBe('compact');
  expect(pickerProps.mode).toBe('date');
  expect(pickerProps.value.getFullYear()).toBe(2026);
  expect(pickerProps.value.getMonth()).toBe(2);
  expect(pickerProps.value.getDate()).toBe(8);
  pickerProps.onChange({ type: 'set' }, new Date(2026, 2, 7, 23, 30));
  expect(change).toHaveBeenCalledWith('2026-03-07');
  expect(pickerProps.maximumDate.getTime()).toBeLessThanOrEqual(Date.now());
});

it('keeps the selected date when the Android dialog is dismissed', () => {
  Platform.OS = 'android';
  const change = jest.fn();
  render(<PaymentDatePicker value="2026-03-08" onChange={change} />);
  fireEvent.click(screen.getByRole('button'));
  act(() => pickerProps.onChange({ type: 'dismissed' }, new Date(2026, 2, 9)));
  expect(change).not.toHaveBeenCalled();
  Platform.OS = 'ios';
});
