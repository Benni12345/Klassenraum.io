/**
 * Tracks UI that covers the play area (modals, tutorial, boss overlay).
 *
 * The bottom banner must not refresh while something is drawn over it — the
 * refresh timer pauses while any overlay is open and resumes afterwards.
 */

let depth = 0;
const listeners = new Set<(covered: boolean) => void>();

function notify(): void {
  const covered = depth > 0;
  for (const fn of listeners) fn(covered);
}

/** Registers an open overlay; call the returned function when it closes. */
export function pushOverlay(): () => void {
  depth += 1;
  if (depth === 1) notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth === 0) notify();
  };
}

export function isCovered(): boolean {
  return depth > 0;
}

export function onCoverChange(fn: (covered: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
