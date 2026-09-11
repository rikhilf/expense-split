/** Read every ledger page: truncating history would silently change explanations. */
export async function readLedgerPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const data: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const page = await fetchPage(from, from + size - 1);
    if (page.error) return { data: null, error: page.error };
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < size) return { data, error: null };
  }
}
