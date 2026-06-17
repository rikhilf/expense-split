export type WeightedSplitItem = {
  id: string;
  weight: number;
};

export const distributeAmountEvenly = (totalAmount: number, ids: string[]) => {
  const result: Record<string, number> = {};
  if (ids.length === 0) return result;

  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / ids.length);
  const remainderCents = totalCents - baseCents * ids.length;

  ids.forEach((id, idx) => {
    result[id] = (baseCents + (idx < remainderCents ? 1 : 0)) / 100;
  });

  return result;
};

export const distributeAmountByWeights = (
  totalAmount: number,
  items: WeightedSplitItem[]
) => {
  const result: Record<string, number> = {};
  const weightedItems = items.filter(item => item.weight > 0);
  if (weightedItems.length === 0) return result;

  const totalCents = Math.round(totalAmount * 100);
  const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
  const allocations = weightedItems.map((item, idx) => {
    const rawCents = (totalCents * item.weight) / totalWeight;
    return {
      id: item.id,
      cents: Math.floor(rawCents),
      remainder: rawCents - Math.floor(rawCents),
      idx,
    };
  });

  let remainingCents = totalCents - allocations.reduce((sum, item) => sum + item.cents, 0);
  [...allocations]
    .sort((a, b) => (b.remainder - a.remainder) || (a.idx - b.idx))
    .forEach((item) => {
      if (remainingCents <= 0) return;
      item.cents += 1;
      remainingCents -= 1;
    });

  allocations.forEach((item) => {
    result[item.id] = item.cents / 100;
  });

  return result;
};
