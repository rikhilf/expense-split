import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';

export function renderHook<T>(callback: () => T): { result: { current: T } } {
  const result: { current: T } = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = callback();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(TestComponent));
  });
  return { result };
}

export async function actAsync(cb: () => Promise<void>) {
  await act(cb);
}
