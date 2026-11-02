/** Mută elementul de pe `from` pe `to`, păstrând ordinea celorlalte. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Regula unică: prima fotografie (după poziție) este principala. */
export function withPrimaryFirst<T extends { id: string }>(
  list: readonly T[],
): (T & { position: number; is_primary: boolean })[] {
  return list.map((img, idx) => ({ ...img, position: idx, is_primary: idx === 0 }));
}
