/** Apply saved visual order; newly added and unknown fields keep their default
 * relative positions after the saved entries. Field objects are not cloned. */
export function orderFields<T extends { id: string }>(fields: T[], order?: string[]): T[] {
  const ranks = new Map<string, number>();
  for (const id of order || []) {
    if (!ranks.has(id)) ranks.set(id, ranks.size);
  }
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const leftRank = ranks.get(left.field.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = ranks.get(right.field.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ field }) => field);
}

/** Move one ID relative to another without modifying the caller's order list. */
export function moveField(
  order: string[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after',
): string[] {
  const result = [...order];
  const sourceIndex = result.indexOf(sourceId);
  if (sourceId === targetId || sourceIndex < 0 || !result.includes(targetId)) return result;
  result.splice(sourceIndex, 1);
  const targetIndex = result.indexOf(targetId);
  result.splice(targetIndex + (position === 'after' ? 1 : 0), 0, sourceId);
  return result;
}
