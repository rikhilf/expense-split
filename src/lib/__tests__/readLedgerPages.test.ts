import { readLedgerPages } from '../readLedgerPages';

it('continues past a full page without dropping older ledger entries', async () => {
  const fetch = jest.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }).mockResolvedValueOnce({ data: [{ id: 500 }], error: null });
  const result = await readLedgerPages(fetch);
  expect(result.data).toHaveLength(501);
  expect(fetch.mock.calls).toEqual([[0, 499], [500, 999]]);
});
it('does not expose a partial ledger when a later page fails', async () => {
  const fetch = jest.fn().mockResolvedValueOnce({ data: Array(500).fill({ id: 1 }), error: null }).mockResolvedValueOnce({ data: null, error: { message: 'Offline' } });
  expect(await readLedgerPages(fetch)).toEqual({ data: null, error: { message: 'Offline' } });
});
