/**
 * A re-tap on the selected tab asks the screen under it to scroll to its top.
 * The request is a count the screen reads (`use-scroll-to-top-request.ts`), so
 * the shell and the screen share no ref and no route.
 */

let count = 0;
const listeners = new Set<() => void>();

export function requestScrollToTop(): void {
  count += 1;
  for (const listener of listeners) listener();
}

export function subscribeScrollToTop(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function scrollToTopCount(): number {
  return count;
}
