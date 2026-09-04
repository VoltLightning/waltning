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
    note: "Note",
    memo: "Memo",
    /** `SearchField`'s clear control — shown only once there is a value to clear. */
    clear: "Clear",
    /** `Keypad`'s delete key. */
    delete: "Delete",
    /** `DateField`'s second shortcut chip. The first reuses `shell.today`. */
    yesterday: "Yesterday",
    /**
     * `SearchField`'s live result count. Two flat forms rather than i18next's
     * plural suffixes — the catalogue carries none of those yet (`i18n.test.tsx`
     * proves the machinery, not a real message), so this picks between the two
     * this product actually needs: one match, or any other count including zero.
     */
    resultsOne: "{{count}} result",
    resultsMany: "{{count}} results",
    /** A `Dock` mode that has no screen yet — the accessibility hint on top of `disabled`. */
    later: "Later",
    retry: "Try again",
  },
  accounts: {
    currency: "Currency",
    create: "Create account…",
    moreDetails: "More details",
    fewerDetails: "Fewer details",
    kind: "Kind",
    /** `AccountKind`'s nine values, flat — `Messages` is exactly two levels. */
    kindCash: "Cash",
    kindBank: "Bank",
    kindCard: "Card",
    kindLoanReceivable: "Loan (receivable)",
    kindLoanPayable: "Loan (payable)",
    kindClearing: "Clearing",
    kindInvestment: "Investment",
    kindDeposit: "Deposit",
    kindOther: "Other",
    ownership: "Ownership",
    ownershipOwn: "Own",
    ownershipShared: "Shared",
    business: "Business",
    openingBalance: "Opening balance",
    openingDate: "Opening date",
    openingDateHint: "As of this date — usually the day you opened it.",
    openingDateInvalid: "Enter a date as YYYY-MM-DD.",
    group: "Group",
    noGroup: "No group",
  },
  transactions: {
    amount: "Amount",
    account: "Account",
    /**
     * §14.6: holding a currency and capturing in it are separate capabilities.
     * The message names the currency because the person chose the account, not
     * the currency, and the two are one step apart. No longer names "expense"
     * — B3 put income through the same field, and the refusal is about the
     * currency, not the direction.
     */
    needsRate: "{{currency}} needs an exchange rate before a transaction can be recorded in it.",
    expense: "Expense",
    income: "Income",
    category: "Category",
    noCategory: "No category",
    more: "More",
    date: "Date",
    invalidDate: "Not a valid date (YYYY-MM-DD).",
    business: "Business",
    counterparty: "Counterparty",
    noCounterparty: "No counterparty",
    role: "Role",
    /** §6.6 — what naming a counterparty on this row means. */
    "role.debt": "Debt — expected back",
    "role.contribution": "Contribution to a shared account",
    "role.reference": "Just involved — no obligation",
  },
  categories: {
    /** The search field's placeholder, doubling as the leaf count (§3 mobile). */
    search: "Search {{count}} categories",
    /** The pinned footer's create affordance. */
    new: "New",
    /** `EmptyState(filtered)`'s primary action — scoped to the chosen group, never at top level (§6). */
    create: 'Create "{{query}}"',
    /**
     * The pinned footer's primary, before a leaf is highlighted — the
     * keyboard path; a tap on the leaf itself is the ordinary one (§7).
     * `useLeaf` below is the same button once one is.
     */
    use: "Use",
    useLeaf: 'Use "{{name}}"',
    /** Heading over D2's proposal row. */
    suggested: "Suggested",
    /** §14's 0.85 display threshold, rendered as text — never tint alone (P5). */
    lowConfidence: "Low confidence — check before using.",
    noMatchTitle: "No matching category",
    noMatchBody: 'Nothing here matches "{{query}}".',
    /** The create row's group chooser, shown when no group chip narrowed the sheet first. */
    chooseGroup: "Choose a group",
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
    /**
     * `DeskBand`'s command-bar slot (`02-tokens` §2.10) — a disabled
     * placeholder until DESK2 wires `N` to a real composer.
     */
    deskAddPlaceholder: "Add — press N",
    /** The scope `SegmentControl` on `DeskBand` — `SPEC.md` §6.7's partition. */
    scopeAll: "All",
    scopeMine: "Mine",
    scopeShared: "Shared",
    scopeBusiness: "Business",
    /** `PeriodHeader`'s arrows — C2. Accessible names, not visible labels. */
    periodPrevious: "Previous period",
    periodNext: "Next period",
    /** `StatTile` labels — C2, S04 §3. Lower case, matching `mine`/`ours` above. */
    spent: "spent",
    net: "net",
    showAll: "Show all →",
    /** The unsettled-clearing banner (§8) — C2. `Open` goes to the account, filtered. */
    unsettled: "{{amount}} {{currency}} unallocated · {{account}}",
    unsettledOpen: "Open",
    /** S04 §6 — the balance query failed; the hero keeps its last known figure. */
    balanceQueryFailed: "Couldn't refresh",
    balanceQueryFailedBody: "Showing the numbers from the last successful load.",
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
    ledger: "Ledger",
    calendar: "Calendar",
    debt: "Debt",
  },
  states: {
    /**
     * `filtered`'s excluded count (§8.1). Deliberately a number beside a noun
     * that does not decline, rather than a caller-built plural sentence — the
     * catalogue carries no `_one`/`_few`/`_many`/`_other` forms yet (blocked on
     * a build), and this is the one message a screen cannot get wrong by
     * composing its own.
     */
    filteredHidden: "Hidden by filters: {{count}}",
    /** §8.2 — the badge naming which of the three claims an `ErrorState` is making. */
    "error.recoverable": "Temporary",
    "error.terminal": "Won't retry",
    "error.partial": "Partly done",
    /** §8.4 — the one recovery verb, reused by `UndoToast` everywhere it appears. */
    undo: "Undo",
    /** Rapid repeats collapse into one toast with a count (§8.4). */
    "toast.repeatCount": "×{{count}}",
    "toast.dismiss": "Dismiss",
    /** §8.4 — two equal actions, no default. */
    "matchWarning.same": "This is the same one",
    "matchWarning.different": "These are different",
    "matchWarning.transactionCount": "Transactions: {{count}}",
    /** §8.5 — the phase with no output yet. */
    "thinking.thinking": "Thinking…",
    /** §8.5 — after 20 s, explicit rather than a silent spinner. */
    "thinking.stillWorking": "Still working",
    threshold: "Confidence threshold",
    /** §8.6 row 13 — `RuleHealthTag`'s five states. */
    "rule.healthy": "Healthy",
    "rule.endingSoon": "Ending soon",
    "rule.amountDrifted": "Amount drifted",
    "rule.overdue": "Overdue",
    "rule.neverPosted": "Never posted",
    /** The tab stubs (Ledger · Calendar · Debt) until their own arcs build the real screen. */
    "stub.body": "This screen isn't built yet.",
    "stub.goToToday": "Go to Today",
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
