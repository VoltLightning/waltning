/**
 * The English catalogue — **the source of truth for both the keys and the type.**
 *
 * Every other language is checked against this file at compile time: `Messages`
 * is derived from it, so a language missing a key does not compile and a
 * language inventing one does not either. That is the property a folder of
 * loose `.json` files cannot have, and the reason the catalogues are TypeScript
 * rather than data files loaded at runtime. Nothing here is fetched — the same
 * call `fonts.ts` makes, for the same reason: a phone with no signal must not
 * render in a fallback.
 *
 * **Exactly two levels: section, then key.** `Messages` is a mapped type over
 * that shape, so a third level would silently stop being checked. The sections
 * mirror `packages/ui/src/` — `accounts`, `transactions`, `shell` — plus
 * `common` for the words that belong to no domain and `routes` for the titles
 * the navigator owns.
 *
 * **Interpolation is `{{name}}`**, i18next's own syntax, and the placeholder
 * names are part of the contract: `t()` is typed from this object, so passing
 * the wrong variable name to a message that takes one is a compile error.
 */

export const en = {
  common: {
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    name: "Name",
    loading: "Loading…",
    search: "Search…",
    /** A filter that matched nothing must say so — an empty panel reads as broken. */
    noMatches: "Nothing matches.",
    /** A token's whole accessible name — the visible label plus the verb. */
    remove: "Remove {{value}}",
    /**
     * The product's name. In the catalogue and identical in every language,
     * because the rule that no word reaches a screen except through here is
     * worth more than the one exemption a brand name would earn — an
     * allowlist is a door, and the next thing through it is not a brand name.
     */
    appName: "Waltning",
    /** §P5: a machine-filled field says so in text, not in tint alone. */
    autoFilled: " ·auto",
    autoFilledLabel: "{{field}}: {{value}}, filled automatically",
    fieldValue: "{{field}}: {{value}}",
    /** Heading over a form's unmatched errors — architecture/12. */
    couldNotSave: "Couldn't save",
  },
  accounts: {
    currency: "Currency",
    create: "Create account…",
  },
  transactions: {
    amount: "Amount",
    account: "Account",
    /**
     * §14.6: holding a currency and capturing in it are separate capabilities.
     * The message names the currency because the person chose the account, not
     * the currency, and the two are one step apart.
     */
    needsRate: "{{currency}} needs an exchange rate before an expense can be recorded in it.",
  },
  shell: {
    today: "Today",
    /** The floating add button. A verb, because a `+` has no name a screen reader can say. */
    add: "Add",
    /** The parked tab that brings the add button back. */
    showAdd: "Show the add button",
    /** §6.7 — lower case, deliberately: a label beneath a figure, not a heading. */
    mine: "mine",
    ours: "ours",
    noAccounts: "No accounts yet",
    noAccountsBody: "Create one account to start your ledger.",
    /**
     * Said, not implied. Two figures stacked read as a sum and a component of
     * it, which is the shape `DualTotal` uses to mean exactly that.
     */
    heldSeparately: "Held separately — not a total.",
    accounts: "Accounts",
    recent: "Recent",
    ownCurrency: "Each balance is in its own account's currency — not a total.",
    morePages: "More transactions exist — paging is not built yet.",
    thisOrigin: "this origin",
  },
  preview: {
    appearance: "Appearance",
    system: "System",
    light: "Light",
    dark: "Dark",
    appearanceFailed: "Appearance could not be saved.",
    resetTitle: "Delete preview data",
    resetPrompt: "Delete every account and transaction from this phone?",
    resetAction: "Reset preview data",
  },
  routes: {
    expense: "Expense",
    createAccount: "Create account",
  },
} as const;

/**
 * The shape every language must have, with the values widened to `string`.
 *
 * `typeof en` alone would demand the *English literals* of every translation,
 * which is the opposite of the point. The mapped type keeps the keys exact and
 * lets the words differ.
 */
export type Messages = {
  [Section in keyof typeof en]: { [Key in keyof (typeof en)[Section]]: string };
};
