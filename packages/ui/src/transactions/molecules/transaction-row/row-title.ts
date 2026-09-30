import type { TransactionType } from "./transaction-row";

/** What a row is called, and what is left to say under it. */
export type RowTitle = {
  title: string;
  /** The category, unless it became the title — a line must not repeat its own heading. */
  category: string | null;
};

/**
 * S10 §4 — a row's title is **its entered name; failing that its category;
 * failing that its kind**. An imported or quick-captured row often has no
 * payee, and a dash over a `?` monogram says the row is broken when it is
 * merely unnamed. The category is what the money was for, which is the next
 * best thing to say about it, and the kind is the last thing that is always
 * true.
 *
 * The subtitle drops whatever became the title, so `Salary` is not said twice.
 */
export function rowTitle(input: {
  enteredName: string;
  category: string | null | undefined;
  type: TransactionType | undefined;
  /** The localised word for each kind — this module holds no words of its own. */
  kindLabel: (type: TransactionType) => string;
}): RowTitle {
  const name = input.enteredName.trim();
  const category = input.category?.trim() ? input.category.trim() : null;
  if (name !== "") return { title: name, category };
  if (category !== null) return { title: category, category: null };
  return { title: input.kindLabel(input.type ?? "expense"), category: null };
}
