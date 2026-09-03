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
  },
  accounts: {
    currency: "Waluta",
    create: "Utwórz konto…",
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
  },
};
