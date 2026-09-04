/**
 * Polish.
 *
 * **The second language is Polish and that is not arbitrary.** It is the
 * language of ~96% of the imported statement text (`architecture/07`), the
 * currency most of this ledger is denominated in, and — the part that matters
 * for the machinery — a language with **four plural categories** where English
 * has two. A second language that shared English's grammar would prove the
 * wiring and none of the hard parts; `i18n.test.ts` uses Polish to prove the
 * plural resolver is real.
 *
 * It is also why the decimal mark is a language property here: a Polish reader
 * reads `12 480,20`, and `12 480.20` is a figure written in someone else's
 * convention. `locales.ts` holds that mapping; the group separator does **not**
 * follow it, and `design-system/04` §4.1 says why.
 *
 * Typed `Messages`, not inferred — a missing key and an invented one are both
 * compile errors, which is the whole reason the catalogues are TypeScript.
 */

import type { Messages } from "./en.ts";

export const pl: Messages = {
  common: {
    cancel: "Anuluj",
    save: "Zapisz",
    close: "Zamknij",
    name: "Nazwa",
    loading: "Wczytywanie…",
    search: "Szukaj…",
    noMatches: "Brak wyników.",
    remove: "Usuń {{value}}",
    appName: "Waltning",
    autoFilled: " ·auto",
    autoFilledLabel: "{{field}}: {{value}}, wypełnione automatycznie",
    fieldValue: "{{field}}: {{value}}",
    couldNotSave: "Nie udało się zapisać",
    note: "Notatka",
    memo: "Notatka",
    clear: "Wyczyść",
    delete: "Usuń",
    yesterday: "Wczoraj",
    resultsOne: "{{count}} wynik",
    resultsMany: "{{count}} wyników",
    later: "Później",
  },
  accounts: {
    currency: "Waluta",
    create: "Utwórz konto…",
    moreDetails: "Więcej szczegółów",
    fewerDetails: "Mniej szczegółów",
    kind: "Rodzaj",
    kindCash: "Gotówka",
    kindBank: "Bank",
    kindCard: "Karta",
    kindLoanReceivable: "Pożyczka (należność)",
    kindLoanPayable: "Pożyczka (zobowiązanie)",
    kindClearing: "Rozliczeniowe",
    kindInvestment: "Inwestycyjne",
    kindDeposit: "Depozyt",
    kindOther: "Inne",
    ownership: "Własność",
    ownershipOwn: "Własne",
    ownershipShared: "Wspólne",
    business: "Firmowe",
    openingBalance: "Saldo początkowe",
    openingDate: "Data początkowa",
    openingDateHint: "Na ten dzień — zwykle dzień otwarcia konta.",
    openingDateInvalid: "Podaj datę w formacie RRRR-MM-DD.",
    group: "Grupa",
    noGroup: "Brak grupy",
  },
  transactions: {
    amount: "Kwota",
    account: "Konto",
    needsRate: "Waluta {{currency}} wymaga kursu wymiany, zanim zapiszesz w niej transakcję.",
    expense: "Wydatek",
    income: "Przychód",
    category: "Kategoria",
    noCategory: "Brak kategorii",
    more: "Więcej",
    date: "Data",
    invalidDate: "Nieprawidłowa data (RRRR-MM-DD).",
    business: "Firmowe",
    counterparty: "Kontrahent",
    noCounterparty: "Brak kontrahenta",
    role: "Rola",
    "role.debt": "Dług — do zwrotu",
    "role.contribution": "Wkład na konto wspólne",
    "role.reference": "Tylko udział — bez zobowiązania",
  },
  categories: {
    search: "Szukaj wśród {{count}} kategorii",
    new: "Nowa",
    create: "Utwórz „{{query}}”",
    use: "Użyj „{{name}}”",
    suggested: "Sugerowana",
    lowConfidence: "Niska pewność — sprawdź przed użyciem.",
    noMatchTitle: "Brak pasującej kategorii",
    noMatchBody: "Nic nie pasuje do „{{query}}”.",
    chooseGroup: "Wybierz grupę",
  },
  shell: {
    today: "Dziś",
    add: "Dodaj",
    showAdd: "Pokaż przycisk dodawania",
    mine: "moje",
    ours: "nasze",
    noAccounts: "Brak kont",
    noAccountsBody: "Utwórz jedno konto, aby rozpocząć swoją księgę.",
    heldSeparately: "Trzymane osobno — to nie jest suma.",
    accounts: "Konta",
    recent: "Ostatnie",
    ownCurrency: "Każde saldo jest w walucie swojego konta — to nie jest suma.",
    morePages: "Istnieje więcej transakcji — stronicowanie nie jest jeszcze gotowe.",
    thisOrigin: "bieżący adres",
    deskAddPlaceholder: "Dodaj — naciśnij N",
    scopeAll: "Wszystkie",
    scopeMine: "Moje",
    scopeShared: "Wspólne",
    scopeBusiness: "Firmowe",
  },
  preview: {
    appearance: "Wygląd",
    system: "Systemowy",
    light: "Jasny",
    dark: "Ciemny",
    appearanceFailed: "Nie udało się zapisać wyglądu.",
    resetTitle: "Usuń dane podglądu",
    resetPrompt: "Usunąć wszystkie konta i transakcje z tego telefonu?",
    resetAction: "Zresetuj dane podglądu",
  },
  routes: {
    expense: "Wydatek",
    createAccount: "Utwórz konto",
    ledger: "Księga",
    calendar: "Kalendarz",
    debt: "Długi",
  },
  states: {
    filteredHidden: "Ukryte przez filtry: {{count}}",
    "error.recoverable": "Tymczasowe",
    "error.terminal": "Nie ponawiaj",
    "error.partial": "Częściowo gotowe",
    undo: "Cofnij",
    "toast.repeatCount": "×{{count}}",
    "toast.dismiss": "Zamknij",
    "matchWarning.same": "To ta sama osoba",
    "matchWarning.different": "To różne osoby",
    "matchWarning.transactionCount": "Transakcje: {{count}}",
    "thinking.thinking": "Myślę…",
    "thinking.stillWorking": "Wciąż pracuję",
    threshold: "Próg pewności",
    "rule.healthy": "Sprawna",
    "rule.endingSoon": "Kończy się wkrótce",
    "rule.amountDrifted": "Kwota odbiega",
    "rule.overdue": "Zaległa",
    "rule.neverPosted": "Nigdy nie zaksięgowana",
    "stub.body": "Ten ekran nie jest jeszcze gotowy.",
    "stub.goToToday": "Przejdź do Dziś",
  },
};
