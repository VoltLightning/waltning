import { useCallback } from "react";
import { type CategoryNamed, categoryLabel } from "./category-label.ts";
import { useT } from "./provider";

/**
 * `categoryLabel` bound to the current language. The returned function changes
 * identity with the language, so a memo that lists it re-labels on a switch.
 */
export function useCategoryLabel(): (category: CategoryNamed) => string {
  const t = useT();
  return useCallback((category: CategoryNamed) => categoryLabel(t, category), [t]);
}
