/**
 * Which categories are debts (§6.6) — the one place the rule is written.
 *
 * **Keyed by the taxonomy's seed key, never by a display name.** A category's
 * name is the person's to rename and the language's to translate; its
 * `seed:<key>` tag (`external_id`) is what both engines agree on and what
 * survives either. So this reads the tag, and a category someone made
 * themselves — which carries none — never reads as a debt by accident.
 *
 * Four categories carry it, two on each side of the ledger:
 *
 * | Seed key             | Kind    | Side                                   |
 * |----------------------|---------|----------------------------------------|
 * | `borrowed`           | income  | `owe` — money you received             |
 * | `repayment-made`     | expense | `owe` — money you returned             |
 * | `lent-out`           | expense | `owed` — money you handed over         |
 * | `repayment-received` | income  | `owed` — money that came back          |
 *
 * `direction` names which side of the debt ledger the category lives on, so a
 * repayment sits beside the debt it settles. The sign of the balance is not
 * stored here: it is derived from the row's own type, as it always was.
 */

export type DebtIntent = {
  role: "debt";
  /** `owe`: the category concerns what you owe; `owed`: what you are owed. */
  direction: "owe" | "owed";
  /** A repayment settles an existing debt; the other two open one. */
  settles: boolean;
};

const INTENTS: Readonly<Record<string, DebtIntent>> = {
  borrowed: { role: "debt", direction: "owe", settles: false },
  "repayment-made": { role: "debt", direction: "owe", settles: true },
  "lent-out": { role: "debt", direction: "owed", settles: false },
  "repayment-received": { role: "debt", direction: "owed", settles: true },
};

/** The seed key out of a category's `external_id` (`seed:borrowed` → `borrowed`); `null` for anything else. */
export function seedKeyOf(externalId: string | null | undefined): string | null {
  if (externalId === null || externalId === undefined) return null;
  return externalId.startsWith("seed:") ? externalId.slice("seed:".length) : null;
}

/** What picking this seed key means — or `null` when it means nothing about debt. */
export function debtIntent(seedKey: string | null | undefined): DebtIntent | null {
  if (seedKey === null || seedKey === undefined) return null;
  // An own-property lookup: a seed key named `constructor` is not a debt.
  return Object.hasOwn(INTENTS, seedKey) ? (INTENTS[seedKey] ?? null) : null;
}

/** `debtIntent` from the tag a category row carries. */
export function debtIntentOf(externalId: string | null | undefined): DebtIntent | null {
  return debtIntent(seedKeyOf(externalId));
}

/**
 * The obligation role a draft carries, given the role a person *chose* and the
 * category it is in.
 *
 * **Derived, never stored.** A debt category is what makes the role `debt`, so
 * the role is a function of the category rather than a value the category
 * writes into the draft: change to any other category and it is simply gone,
 * with nothing to remember to clear. A role a person chose by hand is a
 * separate value the draft keeps, so it survives every category change and
 * is what reads again once the debt category goes away.
 */
export function effectiveRole<Role extends string>(
  chosen: Role | null,
  intent: DebtIntent | null,
): Role | "debt" | null {
  return intent === null ? chosen : intent.role;
}
