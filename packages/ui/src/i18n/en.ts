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
    back: "Back",
    save: "Save",
    close: "Close",
    name: "Name",
    loading: "Loading…",
    search: "Search…",
    /** A filter that matched nothing must say so — an empty panel reads as broken. */
    noMatches: "Nothing matches.",
    /**
     * The backdrop behind a `BottomSheet` — the sheet's own title is what
     * says *which* sheet a screen reader is being offered a way out of, so
     * the title is interpolated rather than the word "Close" repeated.
     */
    dismissSheet: "Dismiss {{title}}",
    /**
     * The backdrop behind `Select`'s option panel. Its own words rather than
     * `close`: the panel overlays the page, so the one thing a tap outside it
     * does is put the list away, and a screen reader meeting a second
     * "Close" inside a sheet would have two of them and no way to tell.
     */
    dismissOptions: "Dismiss the options",
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
    /** S05 §7 — the ✕ confirm, shown only over a machine-filled draft. */
    discard: "Discard",
    discardTitle: "Discard this transaction?",
    discardBody: "It carries an auto-filled account — discarding it is cheap to redo.",

    edit: "Edit",
    /** `05` §5.3's own pair — the desk table's batch-categorise confirm reuses them (DESK3). */
    approve: "Approve",
    decline: "Decline",
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
    /** `BalanceRow`'s own tags — S16 §4: `BIZ` · clearing's amber marker. */
    tagBiz: "BIZ",
    tagUnsettled: "Unsettled",
    /**
     * The **mark** for shared ownership, wherever it is drawn as a `Tag` —
     * `SharedGroup`'s card header (S16 §3) and `AccountPicker`'s rows.
     */
    shared: "Shared",
    /**
     * `SharedGroup`'s card title, and deliberately not the word its tag
     * carries. The card is a full-weight card among identical full-weight
     * kind cards, so the distinction is drawn by *adding* marks — an accent
     * edge and the `Shared` tag — and a title repeating the tag verbatim
     * would be one mark spent twice, saying nothing the tag had not.
     * S16 §6's own phrase for these accounts.
     */
    sharedHeading: "Jointly owned",
    /**
     * The archived toggle. `archivedShow` is the collapsed button, before
     * `loadArchived()` has ever run — the count is not known yet, which is
     * the whole point of loading lazily. `archivedCount` is the expanded
     * heading once it has, and doubles as the tap target that collapses it
     * again — no second query, the rows stay in the snapshot.
     */
    archivedShow: "Archived",
    archivedCount: "Archived ({{count}})",
    archive: "Archive",
    archivedToast: "Account archived.",
    reconcile: "Reconcile…",
    reconcileTitle: "Reconcile",
    computed: "Computed",
    observed: "You observed",
    difference: "Difference",
    asOf: "As of",
    newGroup: "+ New group",
    addGroup: "Add group",
    /** S16 §5 — shown above Save whenever the opening balance or date changed; not a dialog. */
    openingConfirm: "Changing this moves every balance from this date forward.",
    /** Field-error `messageKey`s the two write screens resolve — `architecture/12`. */
    staleVersion: "This account changed elsewhere — reload and try again.",
    sharedNotBusiness: "A shared account is never business.",
    nothingToReconcile: "The ledger already shows this balance.",
    /** S16 §5's last observation — `accounts.expected_balance`, no date column to pair it with yet. */
    lastObserved: "Last observed:",
    /** `AccountPicker`'s own strings — the grid the owner asked for over the 20-account list. */
    search: "Search {{count}} accounts",
    noMatchTitle: "No matching account",
    noMatchBody: 'Nothing here matches "{{query}}".',
    /** The last-used tile's own section, above the grouped grid (S05 §9.2). */
    recent: "Recent",
    /** The ungrouped accounts' own section header — last, under every real group. */
    otherGroup: "Other",
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
    /**
     * R4 L2 — `create_transaction`'s `LocalDeferral`: unlike `needsRate`
     * above (refused before the write, nothing saved), this fires *after*
     * the outbox entry has already committed — a currency added while
     * offline, with no last-known rate yet. The capture is not lost; it is
     * simply not valued yet, so the wording says "saved", never "failed".
     */
    deferredNoRate: "Saved — it will be valued once an exchange rate for {{currency}} is known.",
    /**
     * H2 — `createTransactionInput`'s `amountOriginal` cannot know the
     * account's currency, only the controller can: refused here, on
     * `amountOriginal`, rather than let a figure past the decimal places its
     * own currency holds.
     */
    tooManyDecimals: "{{currency}} holds {{decimals}} decimal places — this amount has more.",
    /**
     * H1 — a fee that fails `parseAmount` (`"1,234.56"`, `"1.2.3"`, `"12."`,
     * `"abc"`) used to be dropped silently and the transfer saved with no
     * fee at all. Named onto the field it refuses, the same as
     * `tooManyDecimals` above.
     */
    invalidAmount: "Enter a valid amount.",
    expense: "Expense",
    income: "Income",
    category: "Category",
    /**
     * H1-a — §14's display threshold, below which a proposal is a
     * suggestion, never a value: the category chip's own placeholder while
     * `categoryProposal.confidence < PROPOSAL_DISPLAY_THRESHOLD`, in the
     * placeholder's own ink (never machine-filled) rather than the chip
     * silently carrying the guess.
     */
    categorySuggested: "Suggested: {{name}}",
    /**
     * H1-b — `categories.kind` disagrees with `type` (income/expense). The
     * controller refuses this before the write (`transactions_category_
     * kind_matches_type`'s own guarantee), the same rule a type switch after
     * an auto-fill exists to prevent from ever reaching here.
     */
    categoryKindMismatch: "This category doesn't match {{type}}.",
    /**
     * H1a — the proposed (or previously picked) category is not among the
     * ones offered any more: archived, or deleted since. The controller
     * refuses this before the write, the same guarantee
     * `assert_category_not_archived` mirrors in Postgres (`WA019`) and the
     * replica's own triggers mirror on the phone.
     */
    categoryUnavailable: "This category is no longer available.",
    noCategory: "No category",
    more: "More",
    date: "Date",
    invalidDate: "Not a valid date (YYYY-MM-DD).",
    /**
     * L-b — `zAccountingDate`'s calendar refusal, in the reader's language.
     *
     * Zod's own issue text is an English literal by construction
     * (`transport/field-errors.ts`'s own note on `messageKey`), which is fine
     * for a field nobody types freehand and not fine for the command bar,
     * where the whole input *is* free text. Separate from `invalidDate`
     * above, which `DateField` shows *while* a date is being typed — there,
     * "not finished yet" and "not real" are the same thing to the person
     * mid-edit; here the line was already sent and came back refused, so the
     * sentence names the calendar rather than the format.
     */
    badDate: "That date isn't a real calendar day.",
    business: "Business",
    counterparty: "Counterparty",
    noCounterparty: "No counterparty",
    role: "Role",
    /** §6.6 — the counterparty chip's own value while a role is unresolved. Never defaulted. */
    counterpartyRoleMissing: "{{name}} · role?",
    /** §6.6 — what naming a counterparty on this row means. */
    "role.debt": "Debt — expected back",
    "role.contribution": "Contribution to a shared account",
    "role.reference": "Just involved — no obligation",
    /** `Dock`'s mode row (S05 §3) — the keypad is the one arc 1 builds; the other three are named, disabled. */
    modeKeypad: "Keypad",
    modeVoice: "Voice",
    modeReceipt: "Receipt",
    modeConverse: "Converse",
    /* ── S10 · the ledger list (C4) ─────────────────────────────────────── */
    /** `SearchField`'s placeholder — S10 §3 mobile. */
    searchPlaceholder: "Search payee, note, amount",
    /** The chip that opens `FilterSheet`. */
    addFilter: "+ Filter",
    /** The filter bar's own clear-all, distinct from one chip's own ✕ (S10 §3). */
    clearAllFilters: "Clear all",
    /** `EmptyState(filtered)`'s primary action when every filter is the reason. */
    clearFilters: "Clear filters",
    filterSheetTitle: "Filter",
    filterAccount: "Account",
    filterCategory: "Category",
    filterScope: "Scope",
    filterFrom: "From",
    filterTo: "To",
    /* ── S10 §4's remaining filter dimensions — the desk rail (DESK3 round 1, M) ── */
    /** §4 names currency and counterparty beside account, category and scope; the phone sheet has not grown them yet. */
    filterCurrency: "Currency",
    filterCounterparty: "Person or company",
    /** The "no filter on this dimension" option each of those two offers. */
    filterEveryCurrency: "Every currency",
    filterEveryCounterparty: "Everyone",
    /** The running total's row count — S10 §3's "1 284 transactions". */
    totalCountOne: "{{count}} transaction",
    totalCountMany: "{{count}} transactions",
    /**
     * S10 §9 — decided: the total always includes capital rows, and a second
     * line breaks the capital-excluded figure out *only* when one is present.
     * `{{amount}}` arrives pre-formatted (`forDisplay`), like every other
     * composed amount string in this catalogue.
     */
    totalExcludingCapitalOne: "{{amount}} excluding {{count}} one-off",
    totalExcludingCapitalMany: "{{amount}} excluding {{count}} one-offs",
    /** Drawn between the two accounts, and the two amounts, of a `TransferRow`. */
    transferArrow: "→",
    /** Short swipe's action (S10 §4, §7) — announced, not only shown. */
    categorise: "Categorise",
    /** `Skeleton`'s accessible label while a page loads. */
    loadingTransactions: "Loading transactions",
    emptyFirstRunTitle: "No transactions yet",
    emptyFirstRunBody: "Capture your first expense or income to start your ledger.",
    emptyFilteredTitle: "No matching transactions",
    /** Names the excluding filter and its hidden count (S10 §6) — `count` renders via `states.filteredHidden`. */
    emptyFilteredBody: "This filter is excluding every row.",
    /**
     * S04 §6's ordinary empty, and only S04's. Today's Recent is a five-row
     * window over a ledger that holds rows, so neither of the pair above is
     * true of it: *No transactions yet* is a claim about the whole ledger, and
     * *This filter is excluding every row* names a filter this screen does not
     * have. The window came back empty and the full list is where the rows
     * are — which is what *Show all* beside this does.
     */
    emptyRecentTitle: "Nothing recent",
    emptyRecentBody:
      "Your ledger has transactions, just none among the latest few. Show all opens the full list.",
    loadFailedTitle: "Couldn't load your transactions",
    loadFailedWhy: "Something went wrong reading the ledger.",
    /** The visible chip a filter arrives with from another screen (S10 §7 shared). */
    accountFilterFrom: "From {{account}}",
    /** S09's `FieldsCard`, and D4b's own chip label — a person types it there, D2 only ever reads it back. */
    payee: "Payee",
    /** D4b's chip row, empty — S05 §3: `[+ payee]`, typed, optional. */
    addPayee: "+ Payee",
    /** D4b's chip row, empty. */
    addNote: "+ Note",
    /** D4b's chip row, empty — offered only when the ledger holds a counterparty (S05 §5). */
    addPerson: "+ Person",
    /** D4b's scope chip label — Mine · Shared · Business, `shell.scope*`'s own words. */
    scope: "Scope",
    /** The scope sheet's own `SegmentControl` — why *Business* is unreachable for a shared account (§6.7). */
    sharedNeverBusiness: "A shared account is never business.",
    /** D4b's account sheet, machine-filled only — `useLastUsedAccount`'s own window (S05 §9.2). */
    lastCapture: "From your last capture, {{time}}",
    /**
     * S09: `update_transaction`, `delete_transaction` and
     * `set_transaction_lines` all refuse a stale version the same way — the
     * row moved under the writer between the read and this save.
     */
    changedElsewhere: "This transaction changed elsewhere — reload it before saving.",
    /** `Button(danger)` at the foot of S09 — the screen's one destructive control. */
    delete: "Delete",
    /** The `Toast` `deleteTransaction` leaves behind — no undo, see the shared plan. */
    deleted: "Transaction deleted.",
    /** S09's optional breakdown card (§10.3). */
    lines: "Breakdown",
    addLine: "+ Add",
    lineDescription: "Description",
    /** A line's own row, before it has a description — distinct from the `lineDescription` field label its editor opens with. */
    newLine: "New line",
    total: "Total",
    /** §6.9: every read path filters `deleted_at` — a soft-deleted row answers this, not a crash. */
    notFound: "This transaction no longer exists.",
    /* ── E5 · S14 settle sheet and S31 transfer ─────────────────────────── */
    /** `FloatingAdd`'s long-press picker (S05 §9.1), S16's row action, and the transfer route's own title. */
    transfer: "Transfer",
    /** `RateField`'s label on both S14 and S31 — the figure two typed amounts imply. */
    realized: "Realized",
    /** `RateField`'s reference line, one sentence rather than three words joined — word order is not the same in every language. */
    referenceRate: "reference {{rate}} · {{source}} · {{date}}",
    /** H2 — the reference line when the shown leg is carried forward: "reference 3.8100 · manual · carried 7 d from 2026-08-05" states the carry honestly rather than folding it silently into `{{date}}` alone. */
    referenceRateCarried: "reference {{rate}} · {{source}} · carried {{count}} d from {{date}}",
    /** The amber tag beside a rate a person typed directly (P4) — `RateField`'s own `manual` prop. */
    manualRate: "Manual",
    /** S31's account chips. */
    from: "From",
    to: "To",
    /** S31's swap control — an accessible name, not a visible label (§9.1's icon-only control). */
    swapDirection: "Swap direction",
    /** The destination `AmountField(hero)`'s accessible label — S31 §3's second amount. */
    destinationAmount: "Destination amount",
    /** S31's rate panel — the bank's spread against the reference (§7.5), and its optional stated fee. */
    margin: "Margin",
    fee: "Fee",
    /** C2 — `parseAmount` returns `null` for anything typed that is not a number; shown only once something has actually been typed. */
    feeInvalid: "Enter a number, or leave it blank.",
    /** S31 §6 — same account both sides. `transactions_transfer_distinct`'s own message already reaches the screen through the field error; this is the sheet's own inline caption when nothing has been typed wrong yet. */
    sameAccountRefused: "A transfer needs two different accounts.",

    /** S15's escape from S05's counterparty sheet — the same shape `onCreateAccount` gives the account sheet. */
    newCounterparty: "+ New person or company",

    /* ── DESK2 · the desk command bar, `screens/S05-quick-add.md` §3 web ── */
    /**
     * The bar's own placeholder — S05's worked example, one line resolving
     * into chips as it is typed. L2 — the word "cash" is deliberate, not
     * cosmetic: it is a literal account name (`grammar.test.ts`'s own
     * fixture, and this repo's seeded default), never an alias, because
     * nothing populates `PhoneAccount.aliases` today (`names.ts`'s own
     * `findName` takes them, but no data source fills them in) — a
     * placeholder claiming an alias resolution the app cannot make would be
     * worse than a plain one.
     */
    commandBarPlaceholder: "48.90 cash coffee yesterday",
    /** The bar's accessible name — a single-line composer with no room for a visible label above it. */
    commandBarLabel: "Add a transaction",
    /** The category chip's own placeholder — asked, not stated, until D2 proposes one or a category name is typed. */
    commandBarCategoryPrompt: "Category?",
    /** D1's `no_amount` refusal (`grammar.ts`) — nothing before the amount is worth resolving. */
    commandBarNoAmount: "No amount found — start the line with a number.",
    /** D1's `no_account` refusal. */
    commandBarNoAccount: "No account matched — name one to continue.",
    /**
     * D1's `no_date` refusal — a `YYYY-MM-DD` token that names no real day
     * (`grammar.ts`, `capture/dates.ts`). Said rather than swallowed: the
     * alternative is dating the row *today* and saving it, which is the one
     * outcome nobody typed.
     */
    commandBarNoDate: "That date isn't a real day — check the month and the day.",
    /** D1's `currency_mismatch` refusal. */
    commandBarCurrencyMismatch: "That currency doesn't match the named account.",
    /** D1's `too_much_unmatched` refusal. */
    commandBarTooMuchUnmatched: "Too much left over to make sense of — try a shorter line.",
    /**
     * L3 — the one rule about numbers a typed line cannot state for itself.
     * `amount.ts`'s grammar has exactly one thousands separator (whitespace)
     * and reads any `,` or `.` as the decimal mark, which is not the
     * convention half of Europe types; `1.234,56` resolves to `1.234` and
     * nothing on screen said it would. S05 §3 carries the same sentence.
     */
    commandBarHint: "Spaces group thousands; comma or point is the decimal mark.",
    /** The resolved chips' own group — a `listbox` the bar's `combobox` controls, named because a bare group announces nothing. */
    commandBarChipsLabel: "Resolved fields",

    /* ── S10 §3 web (DESK3) — the desk table ──────────────────────────── */
    /** `<LedgerTable>`'s own accessible name — a table with no visible title needs one. */
    ledgerTable: "Ledger table",
    /** The selection checkbox's accessible name — `payee` arrives already resolved, "—" included. */
    selectRow: "Select {{payee}}",
    /** `<LedgerSelectionBar>` — count is the same word whatever the count. */
    selectedCount: "{{count}} selected",
    /** `<CategorizeSelectionConfirm>`'s own summary line. */
    confirmCategorizeBatchOne: "Categorise {{count}} transaction as {{category}}?",
    confirmCategorizeBatchMany: "Categorise {{count}} transactions as {{category}}?",
    categorizeBatchAppliedOne: "{{count}} transaction recategorised",
    categorizeBatchAppliedMany: "{{count}} transactions recategorised",
    /** `transactions_category_shape`'s own refusal, stated once rather than the raw thrown message. */
    categorizeBatchFailedWhy:
      "One of the selected rows is no longer eligible — it may have been deleted, or it is a transfer or an adjustment.",
    /** The amount header's own caption while it is the sorted column (H3) — 200 EUR and 200 PLN are not one axis. */
    sortedByCurrency: "by currency, then amount",
    /** The confirm's "what is being left behind" line — `from` arrives already joined. */
    categorizeBatchFromTo: "from {{from}} → {{to}}",
    categorizeBatchAlreadyOne: "{{count}} row already {{category}}",
    categorizeBatchAlreadyMany: "{{count}} rows already {{category}}",
    /** A row that carries no category yet, named in the confirm's "from" list. */
    uncategorised: "Uncategorised",
    /** C2 (round 1) — a batch spanning both kinds has no single valid tree to offer. */
    mixedKindSelection:
      "The selection holds both income and expense rows. Categorise one kind at a time — an expense category cannot go on an income row.",
    /** The desk header once the whole filtered period is loaded, and once it is not (C1). */
    showingOfTotal: "showing {{shown}} of {{count}}",
    narrowTheFilter:
      "Only the first {{count}} rows are loaded, so sorting and the total cover those rows alone. Narrow the filter to see the whole period.",
    /** The desk rail's period label when no date range is set at all (H5). */
    periodAllTime: "All time",
    /** …and when the range is not one whole calendar month. */
    periodCustomRange: "{{from}} → {{to}}",
    /**
     * A selection of rows that can take no category at all — transfers and
     * adjustments only (`transactions_category_shape`). Pressing *Categorise*
     * used to do nothing at all, which reads as a broken button (L10).
     */
    uncategorisableSelection:
      "Nothing in the selection can take a category — transfers and adjustments never carry one.",
    /**
     * §4's per-control exclusion count. "Excludes" rather than "hides": the
     * rows are still in the ledger, and this control is the reason they are
     * not on screen.
     *
     * i18next's real `count`-driven suffixes, not a flat `One`/`Many` pair
     * picked between at the call site (L4, round 3). English's two
     * categories collapse onto two strings here, but Polish's four each
     * decline `wiersz` differently — 1 *wiersz*, 2–4 *wiersze*, 5+
     * *wierszy* — and a caller choosing between two keys can only ever
     * reach two of them, so every Polish reader with three excluded rows
     * read a form that does not exist. `en.ts` carries all four keys
     * regardless: `Messages` is the mapped type over *this* file's keys, so
     * a language with more grammar than English needs the same key set
     * here, `fx.noRatesYetFuture`'s own precedent.
     */
    filterExcludes_one: "Excludes {{count}} row",
    filterExcludes_few: "Excludes {{count}} rows",
    filterExcludes_many: "Excludes {{count}} rows",
    filterExcludes_other: "Excludes {{count}} rows",
    /**
     * L2 (round 2) — the drain stopped because a page came back empty while
     * still handing over a cursor. Distinct from `narrowTheFilter`: nothing
     * about the filter would fix this one, so the advice is different.
     */
    searchIncomplete:
      "The list stopped short at {{count}} rows — a page of results came back empty. Reload to try again.",
  },
  /* ── E5 · counterparties — S14's settle sheet ─────────────────────────── */
  counterparties: {
    /** `SettleSheet`'s title (S14 §3). */
    settlingWith: "Settling with {{name}}",
    /** The balance picker (S14 §9.1). */
    discharges: "Discharges",
    theyOweYou: "they owe you",
    youOweThem: "you owe them",
    /** A balance row's offline stamp (S14 §6) — the phone's own last write, never today's date. */
    asOf: "as of {{date}}",
    /** The account picker — label follows the balance's sign (S14 §3). */
    into: "Into",
    /** The primary action — full-width, S14 §7. */
    settle: "Settle",
    /** The result card, before commit, always (S14 §5). Lower case, matching `shell.spent`/`shell.net`. */
    resultDischarges: "discharges",
    resultRemaining: "remaining",
    resultRemainingEstimated: "remaining (estimated)",
    /** The amber line under a stale result (S14 §6) — the phone's own ledger, not the counterparty's. */
    stampedFrom: "From this device's ledger as of {{time}}.",
    /** Over-settlement, stated rather than clamped (S14 §9.2). */
    overSettled: "Becomes {{amount}} the other way.",
    /** Q11 — prompted, not required. */
    notePrompt: "A note here is what settles a dispute later.",

    /** M — every held balance is dust at its own currency's scale (M1's own filter, empty): nothing for Settle to discharge. */
    nothingToSettle: "Nothing to settle.",
    /** `DebtDirectionTag` — text, never colour alone (P5). */
    owesYou: "owes you",
    youOwe: "you owe",
    settled: "settled",
    kindPerson: "person",
    kindCompany: "company",
    settlesIn: "settles in {{currency}}",
    /** `CounterpartyForm`'s field label — distinct from `settlesIn`'s sentence fragment above. */
    settlementLabel: "Settles in",
    noSettlementCurrency: "No preference set",
    /** `AgeingBar` — O15: *old*, never *overdue* (no `payment_terms_days` field exists). */
    ageingDays: "{{days}} days · old",
    /* ── S12 · the register ─────────────────────────────────────────────── */
    segmentAll: "All",
    segmentTheyOwe: "They owe",
    segmentYouOwe: "You owe",
    /** The two direction totals — §6.6, never summed across people. */
    theyOweTotal: "they owe you",
    youOweTotal: "you owe",
    unallocated: "{{amount}} {{currency}} unallocated",
    unallocatedNamed: "{{amount}} {{currency}} unallocated · {{payee}} · {{date}}",
    allocate: "Allocate",
    add: "+ Add",
    emptyFirstRunTitle: "No one yet",
    emptyFirstRunBody: "Add a person or company to track what you owe, or what they owe you.",
    /** Distinct from `first-run` — a success, not a blank (S12 §6). */
    emptySettledTitle: "All settled",
    emptySettledBody: "Nobody owes anything right now.",
    loadFailedTitle: "Couldn't load your counterparties",
    loadFailedWhy: "Something went wrong reading the debt ledger.",
    /** M1 — the loading state (S12 §6, S13 §6, S15), never the no-pivot error, while `snapshot.revision` is still `0` and the first `refresh()` has not landed. */
    loadingDebts: "Loading debts",
    loadingLedger: "Loading counterparty ledger",
    loadingEditor: "Loading counterparty editor",
    /**
     * H — a pivot-less replica after a completed refresh (`snapshot.revision
     * > 0`) is an invariant violation (`architecture/09`'s bootstrap
     * guarantee), never a state to silently render past as "All settled" or
     * a blank screen. M1 — this is distinct from the first `refresh()` still
     * being in flight (loading, above), and covers an empty currency list
     * after a successful refresh too — no currency held is still no
     * reference currency held.
     */
    noPivotTitle: "Couldn't read your currencies",
    noPivotWhy: "No currency in this ledger is marked as the reference one.",
    /** M — `directionTotals` throwing on a genuine invariant violation (S12 debt-screen.tsx); the executor's own message is diagnostics-only. */
    totalsInconsistentWhy: "Something went wrong totalling what's owed.",
    /* ── S13 · one person's whole position ──────────────────────────────── */
    netIn: "net in {{currency}}",
    /** L (this round) — the ledger card (S13 §6, `BalanceLedger`) and the history section below it (`historySettled`) each own their key now, rather than the history section borrowing S12's `emptySettledTitle`/`Body` — two unrelated screens sharing a key meant an edit to one's copy silently changed the other's. */
    ledgerSettled: "All settled",
    ledgerSettledBody: "Nothing open with them right now.",
    /** The history section's own empty state (S13 §3) — same words `emptySettledTitle`/`Body` (S12) carried before the two were split apart, kept unchanged. */
    historySettled: "All settled",
    historySettledBody: "No debt rows yet: {{name}}.",
    /** P1 — the derived total's own rate and date, never shown without both. */
    atRateDate: "@ {{rate}} · {{date}}",
    /** S13 — after a successful settle: the residual, named in words, never a bare sign (P5). */
    settledToast: "Settled. {{amount}} {{currency}} {{direction}}.",
    addTransaction: "Add transaction",
    history: "History",
    /** S13 §3's own toggle — the count it is hiding is stated, never silent. */
    debtsOnlyToggle: "debts only · {{count}} other rows",
    allRowsToggle: "showing every row",
    /** `TransactionRow`'s `roleTag` — the same three values `transactions."role.*"` names, kept short for a tag. */
    "role.debt": "debt",
    "role.contribution": "contribution",
    "role.reference": "reference",
    /** S13's overflow — one live merge into this record. */
    mergedInto: "Merged {{name}} into this record · {{count}} rows",
    unmerge: "Unmerge",
    unmergeToast: "Merge undone — the record is restored.",
    /* ── S15 · create and edit ───────────────────────────────────────────── */
    contact: "Contact",
    archive: "Archive",
    archivedToast: "Counterparty archived.",
    create: "Create",
    pickerTitle: "Counterparty",
    pickerSearchPlaceholder: "Search people and companies",
    pickerRecent: "Recent",
    pickerNew: "+ New",
    pickerNoMatches: "No one matches.",
    /** The six writes' refusal `messageKey`s (`create-phone-ledger.ts`) — `architecture/12`. */
    nameCollision: "A counterparty with this name already exists.",
    staleVersion: "This counterparty changed elsewhere — reload and try again.",
    openBalance: "Archiving is for settled relationships — this still has an open balance.",
    mergeNoCounterparty: "One of these counterparties could not be found.",
    mergeArchived: "One of these counterparties is already archived.",
    mergeNotFound: "That merge could not be found, or was already undone.",
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
    /**
     * §14, P2's own trail — the caption under a category chip that filled
     * itself from a proposal at or above `PROPOSAL_DISPLAY_THRESHOLD`, so the
     * value reads as sourced rather than as a black box (S05 §8). Paired with
     * `states.undo` on the same row.
     */
    fromHistory: "From your history: {{payee}}",
    noMatchTitle: "No matching category",
    noMatchBody: 'Nothing here matches "{{query}}".',
    /** The create row's group chooser, shown when no group chip narrowed the sheet first. */
    chooseGroup: "Choose a group",
    /** S19's archived toggle. */
    showArchived: "Show archived",
    /** `Tag` variants over a leaf — usage count, archived, unused. */
    archived: "Archived",
    unused: "Unused",
    usageOne: "{{count}} transaction",
    usageMany: "{{count}} transactions",
    /** The trailing `IconButton`'s accessible name — never a bare "more". */
    actionsFor: "{{name}} actions",
    /** The actions sheet's five verbs (S19 §3). */
    rename: "Rename",
    move: "Move",
    convertToGroup: "Convert to group",
    convertToLeaf: "Convert to leaf",
    merge: "Merge",
    archive: "Archive",
    /** The move sheet's target picker. */
    moveTargetLabel: "Group",
    moveTargetPlaceholder: "Choose a group",
    /**
     * J12 §4 — `create-phone-ledger.ts`'s `moveCategory` refusal, once a
     * group of the other kind is chosen. One key per kind, not `{{kind}}`
     * interpolated into a shared sentence — `categories-screen.tsx` picks
     * the key by `parent.kind`, so no language has to graft a raw English
     * noun (or its translation) into a prepositional phrase whose grammar
     * it does not fit (Polish needs the genitive: "strony wydatków", not
     * "strony {{kind}}").
     */
    moveAcrossKindsExpense:
      "{{name}} belongs to the expense side — a category cannot move across kinds",
    moveAcrossKindsIncome:
      "{{name}} belongs to the income side — a category cannot move across kinds",
    /** The merge sheet's winner picker and preview. */
    mergeWinnerLabel: "Merge into",
    mergeWinnerPlaceholder: "Choose a category",
    mergeRowTransactions: "Transactions",
    mergeRowLines: "Lines",
    mergeRowRules: "Rules",
    /** §7 — stated before commit, not after. */
    mergeConfirmTitle: "This can't be undone in one step",
    mergeConfirmBody:
      "Every transaction, line and rule on “{{loser}}” moves to “{{winner}}”, and “{{loser}}” is archived. Correct a bad merge by running it again with the names swapped.",
    mergeConfirmAction: "Merge",
    /** §9.2 — the near-duplicate finder above the tree. */
    collisionsTitle: "Possibly the same category",
    collisionsReview: "Review",
  },
  /** `S01` — the desk dashboard, `DESK4`. */
  dashboard: {
    /** The desk's landing route — `DeskBand`'s nav says this, not "Today", at >=1024. */
    title: "Dashboard",
    balances: "Balances",
    debt: "Debt",
    spendByCategory: "Spend by category",
    incomeVsExpense: "Income vs expense",
    /** Figures a chart could not draw on one scale, listed unconverted beneath it. */
    otherCurrencies: "Other currencies",
    /** A bucket that has not finished — the current calendar month, part way through. */
    monthToDate: "{{month}} · to date",
    /** Balances, recent and debt answer as of a day rather than over a span. */
    asOf: "As of {{date}}",
    /** `S01`'s spend chart reads leaf categories directly, never a rollup (`computations.md` §6, R1). */
    byLeafCategory: "by leaf category",
    /** The chart's own top-N fold — the sixth-and-on category, summed (§7.2). */
    other: "Other",
    /** A line or transaction carrying no category — the null-`categoryId` row §6's split-lines fold can produce. */
    uncategorized: "Uncategorized",
    noBalances: "No accounts yet",
    noRecent: "Nothing recorded yet",
    noDebt: "Nobody owes, and you owe nobody",
    noSpend: "Nothing spent this period",
    /** M4 — a database with no active layout row at all, which the seed migration is supposed to make impossible. */
    noLayout: "No dashboard layout",
    noLayoutBody:
      "This database has no active layout to draw. Reinstalling restores the default one.",
    noActivity: "Nothing to show for this range",
    /**
     * The income-vs-expense chart's own header meta. `count` is the number of
     * **complete** months; the current one is charted beside them and named
     * separately, because a month-to-date bar under a header saying "last 6
     * months" reads as a collapse every time a month turns over.
     */
    flowRange: "{{count}} months + this month to date",
  },
  shell: {
    today: "Today",
    /**
     * The floating add button. A verb, because a `+` has no name a screen
     * reader can say.
     *
     * Also S04's own label on the empty ledger's `EmptyState(first-run)`: the
     * `+` floats over that state and reaches the same `/quick-add`, so naming
     * the button's own word there points at one destination twice rather than
     * inventing a second one. A different label would be a second name for the
     * same act.
     */
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
    /**
     * `DeskBand`'s hero, when the ledger holds nothing in §7.0's display
     * currency. The figure above it is a currency the ledger *does* hold, so
     * this names the one it does not — the alternative was rendering no hero
     * at all, which reads as an empty ledger rather than an empty currency.
     */
    noBalanceIn: "no balance in {{currency}}",
    accounts: "Accounts",
    recent: "Recent",
    ownCurrency: "Each balance is in its own account's currency — not a total.",
    morePages: "More transactions exist — paging is not built yet.",
    thisOrigin: "this origin",
    /**
     * `DeskBand`'s command-bar slot (`02-tokens` §2.10) — `tabs-shell.tsx`'s
     * own `DeskCommandBar` fallback while no capturable account exists to
     * type a capture against, matching `FloatingAdd`'s own
     * `disabled={!hasAccounts}` on the phone. `<CommandBar>`
     * (`transactions/command-bar.tsx`) fills the slot once one does.
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
    /**
     * S04 §3 draws one banner row; a second unsettled account folds into this
     * one's text (`count` is every account past the first) rather than
     * stacking a second alert — `Banner`'s own doc: "page-level, one tone,
     * one action."
     */
    unsettledMore: "{{amount}} {{currency}} unallocated · {{account}} · and {{count}} more",
    /**
     * §8's third field — `find_unsettled`'s own reason for existing — is
     * what lets this name the transaction rather than the account, once
     * `fifoOldestOpen` has one on hand (`read-unsettled-clearing.ts`).
     *
     * **`{{remainder}}` is the oldest entry's own unconsumed magnitude, not
     * the account's whole balance (H3)** — more than one entry can still be
     * open at once, and the account balance is their sum, not this one leg's
     * share of it. `unsettledNamedDiffers` adds the account balance back in,
     * for the one case where showing only the remainder would look like it
     * disagreed with the figure a tap on `Open` leads to.
     */
    unsettledNamed: "{{remainder}} {{currency}} unallocated · {{payee}}",
    unsettledNamedMore: "{{remainder}} {{currency}} unallocated · {{payee}} · and {{count}} more",
    unsettledNamedDiffers:
      "{{remainder}} {{currency}} unallocated · {{payee}} ({{amount}} {{currency}} account balance)",
    unsettledNamedDiffersMore:
      "{{remainder}} {{currency}} unallocated · {{payee}} ({{amount}} {{currency}} account balance) · and {{count}} more",
    /**
     * H2 — the oldest unconsumed entry is the account's own opening balance,
     * not a transaction (`oldestUnconsumedTransactionId` is `null`): there is
     * no payee to name, so this says so rather than falling back to a payee
     * that does not exist. `Open` still falls back to the account's own
     * filtered ledger, same as before this entry existed.
     */
    unsettledOpening: "{{remainder}} {{currency}} unallocated · opening balance",
    unsettledOpeningMore:
      "{{remainder}} {{currency}} unallocated · opening balance · and {{count}} more",
    unsettledOpen: "Open",
    /** S04 §6 — the balance query failed; the hero keeps its last known figure. */
    balanceQueryFailed: "Couldn't refresh",
    balanceQueryFailedBody: "Showing the numbers from the last successful load.",
    /**
     * `FloatingAdd`'s long-press sheet title (S05 §9.1) — the three choices
     * themselves reuse `transactions.expense`/`income`/`transfer` rather than
     * a second translation of the same three words.
     */
    addType: "Add",
    /** S16's row action — opens S31 with `from` already picked. */
    transferFromHere: "Transfer from here",
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
    accounts: "Accounts",
    editAccount: "Edit account",
    ledger: "Ledger",
    debt: "Debt",
    /** S09's nav title — no page heading repeats it (`TransactionHero` already states the amount). */
    transaction: "Transaction",
    settings: "Settings",
    categories: "Categories",
    /** S31's own nav title. */
    transfer: "Transfer",

    currencies: "Currencies",
    rates: "Exchange rates",

    /** S13's nav title — the person's own name is the page's own heading, drawn by `CounterpartyCard`. */
    counterparty: "Counterparty",
    newCounterparty: "New counterparty",
    editCounterparty: "Edit counterparty",
  },
  /**
   * `settle_debt`'s refusals (H9), resolved through `useT()` the same way
   * `transactions.needsRate` already is — the messageKey a screen's
   * `resolveFieldErrorMessage` looks up, named to match
   * `create-phone-ledger.ts`'s own `settleDebtRefusal` exactly.
   */
  settleDebt: {
    noCounterparty: "This counterparty no longer exists.",
    nothingToSettle: "There is nothing open in this currency to settle.",
    /**
     * #116 review, M3 — SPEC.md §6.5: a transaction's currency is its
     * account's. The controller used to silently rewrite a mismatched
     * `currency` to the account's own rather than say so; this is the
     * refusal that replaces the rewrite, named on the field a person could
     * actually fix.
     */
    currencyMismatch: "This account only holds {{accountCurrency}} — settle in that currency.",
    currencies: "Currencies",
    rates: "Exchange rates",

    /** S13's nav title — the person's own name is the page's own heading, drawn by `CounterpartyCard`. */
    counterparty: "Counterparty",
    newCounterparty: "New counterparty",
    editCounterparty: "Edit counterparty",
  },
  /** `packages/ui/src/fx/` and the two screens it feeds — S17, S18. */
  fx: {
    /** `CurrencyChip` — `04` §4.5's accessible name; the visible face is the codes themselves. */
    currencyChipLabel: "Display currency: {{currency}}. Tap to change.",
    /** `CoverageTag` — S17 §6/§8. */
    coveragePct: "{{pct}}%",
    coverageBelow: "{{pct}}% · last quote {{date}}",
    coverageTitle: "Coverage",
    /** 0% — nothing held yet, S17 §2's own words, not a bare "0%". */
    noRatesYet: "no rates yet · set one by hand",
    /**
     * L7 — the only rows held are future-dated (M4 excludes them from
     * `days`): rates are set, just none due yet.
     *
     * i18next's real `count`-driven suffixes, not the `resultsOne`/`resultsMany`
     * flat pair — English's two categories collapse onto one string here, but
     * Polish's four (`i18n.test.tsx`) each say something different, and only
     * `_one`/`_few`/`_many`/`_other` can hold four. `en.ts` still carries all
     * four keys: `Messages` is the mapped type over *this* file's keys, so a
     * language with more grammar than English needs the same key set here,
     * even where English has nothing new to say for it.
     */
    noRatesYetFuture_one: "no rates yet · {{count}} set for later",
    noRatesYetFuture_few: "no rates yet · {{count}} set for later",
    noRatesYetFuture_many: "no rates yet · {{count}} set for later",
    noRatesYetFuture_other: "no rates yet · {{count}} set for later",
    /** H2 — rows held, but none a real quote (every one `carried_forward`): no date exists to state. */
    noQuoteYet: "no quote yet",
    /** `RateField` — `03` §3.7. */
    rateFieldSynced: "Synced: {{rate}}",
    /** `parseRate`'s own refusal — 0, negative, or anything not a positive decimal. */
    ratePositive: "A rate must be a positive number.",
    /** `RateTable` — `04` §4.7. */
    rateTableGap: "No rate held",
    rateTableGapLabel: "{{date}} — no rate held",
    rateTableEmptyRange: "The range must not end before it starts.",
    /** The column header — states which way `rate` reads, same rule as `RateEditor`'s title. */
    rateTableDateHeader: "Date",
    rateTableRateHeader: "{{quote}} per {{base}}",
    rateTableSourceHeader: "Source",
    /** A `carried_forward` row's own tag — its age, never the raw enum. */
    rateTableCarried: "Carried · {{count}} d",
    /** C2 — the origin is unlocatable (`change_pivot` can drop it). Never `0 d`, which would read as exact. */
    rateTableCarriedUnknown: "Carried · age not known",
    /**
     * `RateEditor` — `04` §4.8. `{{quote}} per {{base}}` states which way the
     * figure reads (`SPEC.md` §4: `fx_rates.rate` is units of the quote per
     * one pivot) — never a `→` arrow, which reads as a conversion direction
     * and is exactly backwards for this figure.
     */
    rateEditorTitle: "Set {{quote}} per {{base}}, {{from}} … {{to}}",
    rateEditorRateLabel: "Rate · {{quote}} per {{base}}",
    rateEditorTotalDays: "{{count}} days",
    rateEditorAbsent: "{{count}} currently absent",
    rateEditorCarried: "{{count}} currently carried forward",
    rateEditorManual: "{{count}} currently manual",
    rateEditorConfirmOverwrite:
      "This sets {{rate}} {{quote}} per {{base}}, replacing {{count}} manual rate(s) set by hand.",
    rateEditorSubmit: "Set rate",
    rateEditorConfirmSubmit: "Overwrite and set",
    /** L11 — `setManualRateInput`'s own cap, restated where the range is picked. */
    rateEditorRangeTooLong: "A manual rate range cannot exceed {{max}} days.",
    /** S17. */
    addCurrency: "Add currency",
    currencyCode: "Code",
    currencySymbol: "Symbol",
    pinned: "Pinned",
    rateSource: "Rate source",
    rateSourceNone: "None",
    /** §7.7's four provider names — proper nouns, identical in every language. */
    sourceNbp: "NBP",
    sourceEcb: "ECB",
    sourceNbrb: "NBRB",
    sourceNbg: "NBG",
    sourceManual: "Manual",
    /** L8 — an unrecognised source, plainly, never the `manual` fallback it used to be. */
    sourceUnknown: "Unknown",
    archiveCurrency: "Archive",
    currencyArchiveRefused: "Couldn't archive this currency.",
    currencyWriteFailed: "That didn't save.",
    /** S17 §9.2 — a row's own symbol and decimals, and the sheet that edits them. */
    currencyDetail: "{{symbol}} · {{decimals}}dp",
    editCurrency: "Edit {{code}}",
    symbolPosition: "Symbol position",
    symbolBefore: "Before the figure",
    symbolAfter: "After the figure",
    decimals: "Decimal places",
    pivotLabel: "Pivot: {{code}}",
    changePivot: "Change pivot",
    pivotConfirmTitle: "Change the pivot currency?",
    pivotConfirmBody:
      "The pivot is the technical hub every rate is stored against. Refused once any transaction exists — a phone alone has no way to re-rate the history that would leave behind. Changing it is rare, audited, and never something moving abroad requires.",
    pivotConfirmSubmit: "Yes, change it",
    pivotChangeRefused: "The pivot can't change while a transaction exists.",
    /**
     * M2 — §7.0's *"dropped rather than left mis-quoted"*, said out loud. The
     * rewrite keeps only the dates that hold a real published rate against
     * the new pivot; the rest are dropped rather than re-based off a figure
     * nobody quoted.
     *
     * i18next's real `count`-driven suffixes, not a flat pair: English's two
     * categories collapse onto one string here, Polish's four each say
     * something different, and `en.ts` is the type — a language with more
     * grammar than English needs the same key set present here.
     */
    pivotChangeDroppedDates_one:
      "Pivot changed · {{count}} date had no rate to rebase and was dropped",
    pivotChangeDroppedDates_few:
      "Pivot changed · {{count}} dates had no rate to rebase and were dropped",
    pivotChangeDroppedDates_many:
      "Pivot changed · {{count}} dates had no rate to rebase and were dropped",
    pivotChangeDroppedDates_other:
      "Pivot changed · {{count}} dates had no rate to rebase and were dropped",
    /** C1 — the executor's other refusal: the chosen code is already the pivot. */
    pivotAlreadyPivot: "That currency is already the pivot.",
    /** C1 — the target `Select` in the pivot-change flow, ahead of the confirm dialog. */
    pivotTarget: "New pivot",
    pivotTargetPlaceholder: "Choose a currency",
    /** S18. */
    pairLabel: "Quote, against {{base}}",
    pairPlaceholder: "Choose a currency",
    noQuoteCurrency: "No currency to compare against the pivot yet.",
    range30d: "30 d",
    range90d: "90 d",
    rangeYear: "Year",
    rangeFrom: "From",
    rangeTo: "To",
    setRange: "Set a range",
    clearManual: "Clear manual",
    rateWriteFailed: "That didn't save.",
    rerateNotOffered: "Re-rate from the desk once a server exists.",
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
    /** §8.5 — the phase with no output yet. The stepping dot beside it is
     * the ellipsis; the label carries none of its own. */
    "thinking.thinking": "Thinking",
    /** §8.5 — after 20 s, explicit rather than a silent spinner. */
    "thinking.stillWorking": "Still working",
    threshold: "Confidence threshold",
    /** §8.6 row 13 — `RuleHealthTag`'s five states. */
    "rule.healthy": "Healthy",
    "rule.endingSoon": "Ending soon",
    "rule.amountDrifted": "Amount drifted",
    "rule.overdue": "Overdue",
    "rule.neverPosted": "Never posted",
  },
  startup: {
    /**
     * `apps/mobile/app/_layout.tsx` — the ledger session could not open at
     * all. No `action`: the retry is relaunching the app, which nothing in
     * this screen can trigger for someone.
     */
    ledgerFailedTitle: "The ledger could not open",
    /** The migrator's own sentence, shown verbatim — it is written for a person. */
    ledgerFailedBody: "{{message}}",
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
