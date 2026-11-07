/**
 * Which sources the "Source" filter offers, and whether that control is shown
 * at all.
 *
 * The published `sources` array describes the live board (NYC), so the control
 * used to render only for NY / New York. But a `?src=` URL parameter keeps
 * filtering after the user switches to another city, and the only control that
 * could clear it had just disappeared — leaving a thinned-out list with no
 * visible cause. So: an active filter always keeps its control on screen, and
 * always lists the sources it is filtering by, even ones the live board's
 * `sources` array doesn't mention.
 */
export function sourceFilterOptions(
  sourcesInData: { source: string }[],
  active: string[],
): string[] {
  const options = sourcesInData.map((s) => s.source);
  const known = new Set(options);
  for (const source of active) {
    if (!known.has(source)) {
      known.add(source);
      options.push(source);
    }
  }
  return options;
}

/**
 * Show the control on the live board when there's a real choice to make, and
 * anywhere else only while a filter is actually applied (so it can be cleared).
 */
export function shouldShowSourceFilter(
  onLiveBoard: boolean,
  options: string[],
  active: string[],
): boolean {
  if (active.length > 0) return true;
  return onLiveBoard && options.length > 1;
}
