/** Shared geometry for property-list and card portal cells; dimensions are pixels. */
export function portalLogoLayout(count: number, photoHeight = 96, availableWidth = Infinity, logoCounts: number[] = []) {
  const gap = 4;
  const statusHeight = 16;
  const statusGap = 4;
  const boxSize = Math.max(1, Math.min(24, Math.floor((photoHeight - statusHeight - statusGap - 2 * gap) / 3)));
  const logoSize = Math.max(1, boxSize - 6);
  let columns = Math.max(1, Math.min(8, Math.ceil(count / 3)));
  const geometry = (cols: number) => {
    const capacity = cols * 3;
    const visibleCount = count > capacity ? capacity - 1 : count;
    const slots = visibleCount + (count > capacity ? 1 : 0);
    const widths = Array.from({ length: cols }, (_, col) => {
      let width = boxSize;
      for (let i = col; i < visibleCount; i += cols) {
        width = Math.max(width, boxSize + Math.max(0, (logoCounts[i] ?? 1) - 1) * (logoSize + gap));
      }
      return width;
    });
    return { visibleCount, hiddenCount: count - visibleCount, rows: Math.ceil(slots / cols), widths, width: widths.reduce((a, b) => a + b, 0) + (cols - 1) * gap };
  };
  let grid = geometry(columns);
  while (columns > 1 && grid.width > availableWidth) grid = geometry(--columns);
  return { ...grid, columns, boxSize, logoSize, dotSize: Math.max(1, Math.round(boxSize * 7 / 24)), gap, statusHeight, statusGap,
    height: grid.rows * boxSize + Math.max(0, grid.rows - 1) * gap + statusGap + statusHeight };
}