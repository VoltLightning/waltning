import { useSyncExternalStore } from "react";
import { scrollToTopCount, subscribeScrollToTop } from "./scroll-to-top-request.ts";

/** Rises each time the shell asks the screen to scroll to its top. */
export function useScrollToTopRequest(): number {
  return useSyncExternalStore(subscribeScrollToTop, scrollToTopCount, scrollToTopCount);
}
