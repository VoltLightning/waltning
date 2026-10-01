/**
 * `design-system/14-copy-and-localization.md`, enforced on the catalogues.
 *
 * The guide says three things a test can check without a native speaker:
 * every language addresses the reader formally, no catalogue speaks the
 * engineers' vocabulary, and each concept has one agreed word per language.
 * Everything else in the guide (native word order, plain sentences) is a
 * reviewer's job — a pattern cannot tell a literal translation from a good one.
 *
 * **The known violations are listed by key, per locale, and the list may only
 * shrink.** A new violation fails; so does a listed key that no longer
 * violates, so a rewrite cannot leave its entry behind and let the same key
 * regress later. Each locale's rewrite empties its own list. English has no
 * list: it is the source the others translate from, and it is clean.
 */

import { afterAll, describe, expect, it } from "vitest";
import type { Messages } from "./en.ts";
import { catalogues, LOCALES, type Locale } from "./locales.ts";

/** A pattern that matches whole words only — `\b` is ASCII-only and blind to Cyrillic. */
function words(alternatives: string, flags = "iu"): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, flags);
}

interface Rule {
  /** `register`, `jargon`, or `glossary:<concept>` — the prefix of an allowlist entry. */
  readonly id: string;
  readonly pattern: RegExp;
  /** A value the rule must catch, so a broken pattern fails here rather than passing everything. */
  readonly catches: string;
  /** A value it must leave alone — the false positive the pattern was written around. */
  readonly spares?: string;
}

/** Engineer vocabulary that means nothing to a reader, in any language. */
const LATIN_JARGON: Rule = {
  id: "jargon",
  // An identifier with an underscore (`settle_debt`, `change_pivot`) is code, never copy.
  pattern: new RegExp(
    `${words("pivot\\p{L}*|outbox|executor\\p{L}*|replica\\p{L}*|snapshot\\p{L}*|messageKey").source}|[A-Za-z]+_[A-Za-z_]+`,
    "iu",
  ),
  catches: "Refused by settle_debt",
  spares: "Settle the debt",
};

const RULES: Record<Locale, readonly Rule[]> = {
  en: [
    LATIN_JARGON,
    {
      id: "jargon",
      pattern: words(
        "nodes?|operations?|captur\\p{L}*|leaf|rebas\\p{L}*|re-rat\\p{L}*|quotes?|technical|engine",
      ),
      catches: "The technical hub every rate is stored against",
      spares: "Recorded on this phone",
    },
    {
      id: "glossary:counterparty",
      pattern: words("counterpart(?:y|ies)"),
      catches: "Couldn't load your counterparties",
      spares: "Person or company",
    },
    {
      id: "glossary:existing-debt",
      pattern: words("opening debts?"),
      catches: "Add an opening debt",
      spares: "Add an existing debt",
    },
  ],
  de: [
    LATIN_JARGON,
    {
      id: "register",
      // Informal pronouns, and the second-person singular verb forms a reader
      // meets in a sentence (`kannst`, `hast`) — an imperative cannot be told
      // from an infinitive by pattern, so that half is left to review.
      pattern: words(
        "du|dich|dir|dein\\p{L}*|euch|euer|eure\\p{L}*|kannst|willst|musst|hast|bist|wirst|möchtest|solltest|darfst|siehst",
      ),
      catches: "Was du hast",
      spares: "Was Sie haben",
    },
    {
      id: "jargon",
      pattern: words("Knoten|Operation(?:en)?|Replikat\\p{L}*"),
      catches: "Ein technischer Knoten",
      spares: "Konten",
    },
    {
      id: "glossary:entry",
      pattern: words("Transaktion\\p{L}*|Eintr[aä]g\\p{L}*"),
      catches: "Noch keine Transaktionen",
      spares: "Noch keine Buchungen",
    },
    {
      id: "glossary:income",
      // Not `Erträge`: that is what investments return, and the taxonomy says so.
      pattern: words("Einkommen\\p{L}*"),
      catches: "Einkommen",
      spares: "Einnahmen",
    },
    {
      id: "glossary:transfer",
      pattern: words("Überweisung\\p{L}*"),
      catches: "Überweisung",
      spares: "Umbuchung",
    },
    {
      id: "glossary:counterparty",
      pattern: words("Gegenpartei\\p{L}*|Kontrahent\\p{L}*|Geschäftspartner\\p{L}*"),
      catches: "Gegenpartei",
      spares: "Kontakt",
    },
    {
      id: "glossary:anchor-currency",
      pattern: words("Ankerwährung\\p{L}*|Leitwährung\\p{L}*"),
      catches: "Ankerwährung",
      spares: "Bezugswährung",
    },
    {
      id: "glossary:balance",
      pattern: words("Bilanz\\p{L}*"),
      catches: "Bilanz",
      spares: "Kontostand",
    },
    {
      id: "glossary:net-worth",
      pattern: words("Nettowert\\p{L}*|Reinvermögen"),
      catches: "Nettowert",
      spares: "Vermögen",
    },
    {
      id: "glossary:repayment",
      pattern: words("Tilgung\\p{L}*"),
      catches: "Tilgung",
      spares: "Rückzahlung",
    },
  ],
  ru: [
    LATIN_JARGON,
    {
      id: "register",
      // `лишь` is the one common word ending in `-ишь` that is not a verb.
      pattern: words(
        "ты|тебя|тебе|тобой|тобою|тво(?:й|я|ё|е|и|его|ей|ему|им|ими|их|ю)|(?!лишь)\\p{L}+(?:ешь|ёшь|ишь)",
      ),
      catches: "Что у тебя есть",
      spares: "Это лишь начало",
    },
    {
      id: "register",
      // Polite `вы` is lowercase in running text; capitalised mid-sentence it
      // reads as a letter to one addressee, which an interface is not.
      pattern: /(?<=[\p{L}\p{N},;:)»—–]\s+)(?:Вы|Вас|Вам|Вами|Ваш\p{L}*)(?!\p{L})/u,
      catches: "Здесь Вы видите итог",
      spares: "Вы должны",
    },
    {
      id: "jargon",
      pattern: words("узел|узла|узлы|узлов|реплик\\p{L}*"),
      catches: "технический узел",
      spares: "узнать",
    },
    {
      id: "glossary:entry",
      pattern: words("транзакци\\p{L}*|запись|записи|записей|записям|записями|записях"),
      catches: "Одна запись",
      spares: "Одна операция",
    },
    {
      id: "glossary:expense",
      pattern: words("трат[аыеуой]?|тратой|тратам|тратами|тратах"),
      catches: "Траты",
      spares: "Расходы",
    },
    {
      id: "glossary:income",
      pattern: words("приход|прихода|приходы|приходов"),
      catches: "Приход",
      spares: "приходит",
    },
    {
      id: "glossary:counterparty",
      pattern: words("контрагент\\p{L}*"),
      catches: "Контрагенты",
      spares: "Контакты",
    },
    {
      id: "glossary:anchor-currency",
      pattern: words("якорн\\p{L}*|пивот\\p{L}*"),
      catches: "Якорная валюта",
      spares: "Опорная валюта",
    },
    {
      id: "glossary:overdrawn",
      pattern: words("овердрафт\\p{L}*"),
      catches: "овердрафт",
      spares: "в минусе",
    },
    {
      id: "glossary:existing-debt",
      pattern: words("существующ\\p{L}*\\s+долг\\p{L}*"),
      catches: "Существующий долг",
      spares: "Прежний долг",
    },
    {
      id: "glossary:net-worth",
      pattern: words("чист(?:ая|ой|ую)\\s+стоимост\\p{L}*"),
      catches: "Чистая стоимость",
      spares: "Капитал",
    },
  ],
  pl: [
    LATIN_JARGON,
    {
      id: "register",
      // Pronouns, the commonest second-person verbs, and the past tense's
      // `-łeś`/`-łaś`. A bare imperative is the standard Polish button, so
      // that half is left to review.
      pattern: words(
        "ty|ciebie|cię|tobie|tobą|twój|twoja|twoje|twojego|twojej|twojemu|twoim|twoich|twoimi|twoją|masz|możesz|chcesz|jesteś|musisz|wiesz|widzisz|\\p{L}+(?:łeś|łaś)",
      ),
      catches: "Należne Tobie",
      spares: "Należne",
    },
    {
      id: "jargon",
      pattern: words("węzeł|węzła|węzły|replik\\p{L}*"),
      catches: "węzeł techniczny",
      spares: "wiązka",
    },
    {
      id: "glossary:entry",
      pattern: words("operacj\\p{L}*|wpis|wpisy|wpisu|wpisów|wpisem|wpisie|wpisach|wpisami"),
      catches: "Jeden wpis",
      spares: "Jedna transakcja",
    },
    {
      id: "glossary:income",
      pattern: words("dochód|dochod\\p{L}*"),
      catches: "Dochód",
      spares: "Przychód",
    },
    {
      id: "glossary:counterparty",
      pattern: words("kontrahen\\p{L}*"),
      catches: "Kontrahenci",
      spares: "Kontakty",
    },
    {
      id: "glossary:anchor-currency",
      pattern: words("kotwic\\p{L}*"),
      catches: "waluta kotwiczna",
      spares: "waluta odniesienia",
    },
    {
      id: "glossary:existing-debt",
      pattern: words("istniejąc\\p{L}*\\s+dług\\p{L}*"),
      catches: "Istniejący dług",
      spares: "Wcześniejszy dług",
    },
    {
      id: "glossary:balance",
      pattern: words("bilans\\p{L}*"),
      catches: "bilans",
      spares: "saldo",
    },
    {
      id: "glossary:net-worth",
      pattern: words("wartoś(?:ć|ci)\\s+netto"),
      catches: "Wartość netto",
      spares: "Majątek",
    },
  ],
  be: [
    LATIN_JARGON,
    {
      id: "register",
      pattern: words("ты|цябе|табе|табой|твой|твая|тваё|твае|твайго|тваёй|тваім|тваіх|тваімі|тваю"),
      catches: "Што ў цябе ёсць",
      spares: "Што ў вас ёсць",
    },
    {
      id: "register",
      pattern: /(?<=[\p{L}\p{N},;:)»—–]\s+)(?:Вы|Вас|Вам|Вамі|Ваш\p{L}*)(?!\p{L})/u,
      catches: "Тут Вы бачыце вынік",
      spares: "Вы вінны",
    },
    {
      id: "jargon",
      pattern: words("вузел|вузла|вузлы|вузлоў|рэплік\\p{L}*"),
      catches: "тэхнічны вузел",
      spares: "вузкі",
    },
    {
      id: "glossary:account",
      // The Russian word, where Belarusian says `рахунак`.
      pattern: words("сч[её]т\\p{L}*"),
      catches: "Счёт",
      spares: "Рахунак",
    },
    {
      id: "glossary:entry",
      pattern: words("транзакцы\\p{L}*|запіс|запісы|запісаў|запісу|запісам|запісамі|запісах"),
      catches: "Адзін запіс",
      spares: "Адна аперацыя",
    },
    {
      id: "glossary:expense",
      pattern: words("трат[аыеуой]?|тратамі|тратах"),
      catches: "Траты",
      spares: "Выдаткі",
    },
    {
      id: "glossary:income",
      pattern: words("прыбыт\\p{L}*"),
      catches: "Прыбытак",
      spares: "Даход",
    },
    {
      id: "glossary:counterparty",
      pattern: words("[кК][оа]нтрагент\\p{L}*"),
      catches: "Кантрагенты",
      spares: "Кантакты",
    },
    {
      id: "glossary:anchor-currency",
      pattern: words("якарн\\p{L}*|якорн\\p{L}*"),
      catches: "Якарная валюта",
      spares: "Апорная валюта",
    },
    {
      id: "glossary:overdrawn",
      pattern: words("авердрафт\\p{L}*"),
      catches: "авердрафт",
      spares: "у мінусе",
    },
    {
      id: "glossary:existing-debt",
      pattern: words("існуюч\\p{L}*\\s+до[ўв]г\\p{L}*"),
      catches: "Існуючы доўг",
      spares: "Ранейшы доўг",
    },
  ],
};

/**
 * Settings · Developer exists in a development build only — `en.ts` says none
 * of it is copy a person keeping a ledger reads, so the guide does not bind it.
 */
const NOT_USER_FACING = new Set<keyof Messages>(["developer"]);

/** Every user-facing value as `section.key`, placeholders stripped — `{{quote}}` is a variable, not a word. */
function entries(locale: Locale): [string, string][] {
  const catalogue = catalogues[locale];
  return (Object.keys(catalogue) as (keyof Messages)[])
    .filter((section) => !NOT_USER_FACING.has(section))
    .flatMap((section) =>
      Object.entries(catalogue[section] as Record<string, string>).map(
        ([key, value]): [string, string] => [`${section}.${key}`, value.replace(/{{\w+}}/g, " ")],
      ),
    );
}

function violations(locale: Locale): string[] {
  const found = new Set<string>();
  for (const [key, value] of entries(locale)) {
    for (const rule of RULES[locale]) {
      if (rule.pattern.test(value)) found.add(`${rule.id} ${key}`);
    }
  }
  return [...found].sort();
}

/*
 * ── Known violations ───────────────────────────────────────────────────────
 * `<rule> <section>.<key>`, one locale per block. Each locale's rewrite empties
 * its own block; nothing is ever added to one.
 */

const KNOWN_DE: readonly string[] = [
  "glossary:anchor-currency fx.anchorBlocked",
  "glossary:anchor-currency fx.changePivot",
  "glossary:anchor-currency fx.changePivotStart",
  "glossary:anchor-currency fx.noQuoteCurrency",
  "glossary:anchor-currency fx.pivotAlreadyPivot",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_few",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_many",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_one",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_other",
  "glossary:anchor-currency fx.pivotChangeRefused",
  "glossary:anchor-currency fx.pivotConfirmBody",
  "glossary:anchor-currency fx.pivotConfirmTitle",
  "glossary:anchor-currency fx.pivotKicker",
  "glossary:anchor-currency fx.pivotLabel",
  "glossary:anchor-currency fx.pivotTarget",
  "glossary:counterparty transactions.counterparty",
  "glossary:counterparty transactions.noCounterparty",
  "glossary:entry backup.entriesValue_few",
  "glossary:entry backup.entriesValue_many",
  "glossary:entry backup.entriesValue_one",
  "glossary:entry backup.entriesValue_other",
  "glossary:entry categories.archivedWhat",
  "glossary:entry counterparties.mergedInto",
  "glossary:entry counterparties.unmergeToast",
  "glossary:entry restore.entriesValue_few",
  "glossary:entry restore.entriesValue_many",
  "glossary:entry restore.entriesValue_one",
  "glossary:entry restore.entriesValue_other",
  "glossary:entry shell.yearsMore",
  "glossary:entry transactions.calendarNearestDay",
  "glossary:entry transactions.calendarRangeBody_few",
  "glossary:entry transactions.calendarRangeBody_many",
  "glossary:entry transactions.calendarRangeBody_one",
  "glossary:entry transactions.calendarRangeBody_other",
  "glossary:entry transactions.chargedNoRateShort",
  "glossary:entry transactions.paidNotForRepaymentDetail",
  "glossary:entry transactions.ribbonDayMany",
  "glossary:entry transactions.ribbonDayOne",
  "glossary:entry transactions.transferLinkedNote",
  "register accounts.holdingsTitle",
  "register accounts.observed",
  "register accounts.whatCounts",
  "register transactions.betweenOwnAccounts",
  "register transactions.calendarDrawsNothing",
  "register transactions.contextLinkBody",
  "register transactions.costsYou",
  "register transactions.emptyFirstRunBody",
  "register transactions.lastCapture",
  "register transactions.notePlaceholder",
  "register transactions.savedOnPhone",
  "register transactions.savesYou",
  "register transactions.timeHint",
];

/* ── ru ── */

const KNOWN_RU: readonly string[] = [
  "glossary:anchor-currency fx.anchorBlocked",
  "glossary:anchor-currency fx.changePivot",
  "glossary:anchor-currency fx.changePivotStart",
  "glossary:anchor-currency fx.noQuoteCurrency",
  "glossary:anchor-currency fx.pivotAlreadyPivot",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_few",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_many",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_one",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_other",
  "glossary:anchor-currency fx.pivotChangeRefused",
  "glossary:anchor-currency fx.pivotConfirmBody",
  "glossary:anchor-currency fx.pivotConfirmTitle",
  "glossary:anchor-currency fx.pivotKicker",
  "glossary:anchor-currency fx.pivotLabel",
  "glossary:anchor-currency fx.pivotName",
  "glossary:anchor-currency fx.pivotTarget",
  "glossary:counterparty counterparties.archivedToast",
  "glossary:counterparty counterparties.loadFailedTitle",
  "glossary:counterparty counterparties.loadingEditor",
  "glossary:counterparty counterparties.loadingLedger",
  "glossary:counterparty counterparties.mergeArchived",
  "glossary:counterparty counterparties.mergeNoCounterparty",
  "glossary:counterparty counterparties.nameCollision",
  "glossary:counterparty counterparties.pickerTitle",
  "glossary:counterparty counterparties.staleVersion",
  "glossary:counterparty routes.counterparties",
  "glossary:counterparty routes.counterparty",
  "glossary:counterparty routes.editCounterparty",
  "glossary:counterparty routes.newCounterparty",
  "glossary:counterparty settleDebt.counterparty",
  "glossary:counterparty settleDebt.editCounterparty",
  "glossary:counterparty settleDebt.newCounterparty",
  "glossary:counterparty settleDebt.noCounterparty",
  "glossary:counterparty transactions.counterparty",
  "glossary:counterparty transactions.noCounterparty",
  "glossary:entry accounts.deleteConfirmBody",
  "glossary:entry accounts.deleteHasEntries",
  "glossary:entry accounts.noneBody",
  "glossary:entry backup.entriesValue_few",
  "glossary:entry backup.entriesValue_many",
  "glossary:entry backup.entriesValue_one",
  "glossary:entry backup.entriesValue_other",
  "glossary:entry backup.unsentValue_few",
  "glossary:entry backup.unsentValue_many",
  "glossary:entry backup.unsentValue_one",
  "glossary:entry backup.unsentValue_other",
  "glossary:entry categories.archivedWhat",
  "glossary:entry categories.emptyBody",
  "glossary:entry counterparties.existingDebtHint",
  "glossary:entry counterparties.historySettledBody",
  "glossary:entry counterparties.notFound",
  "glossary:entry counterparties.unmergeToast",
  "glossary:entry fx.displayExplained",
  "glossary:entry pages.transaction",
  "glossary:entry restore.entriesValue_few",
  "glossary:entry restore.entriesValue_many",
  "glossary:entry restore.entriesValue_one",
  "glossary:entry restore.entriesValue_other",
  "glossary:entry shell.ledgerSubtitle",
  "glossary:entry transactions.calendarNearestDay",
  "glossary:entry transactions.calendarRangeBody_few",
  "glossary:entry transactions.calendarRangeBody_many",
  "glossary:entry transactions.calendarRangeBody_one",
  "glossary:entry transactions.calendarRangeBody_other",
  "glossary:entry transactions.lastCapture",
  "glossary:entry transactions.paidNotForRepaymentDetail",
  "glossary:entry transactions.ribbonDayMany",
  "glossary:entry transactions.ribbonDayOne",
  "glossary:entry transactions.transferLinkedNote",
  "glossary:existing-debt counterparties.existingDebtAdd",
  "glossary:existing-debt counterparties.existingDebtDateFuture",
  "glossary:existing-debt counterparties.existingDebtDeleteBody",
  "glossary:existing-debt counterparties.existingDebtDeleteTitle",
  "glossary:existing-debt counterparties.existingDebtDeleted",
  "glossary:existing-debt counterparties.existingDebtGone",
  "glossary:existing-debt counterparties.existingDebtReplaces",
  "glossary:existing-debt counterparties.existingDebtRow",
  "glossary:existing-debt counterparties.existingDebtSaved",
  "glossary:existing-debt counterparties.existingDebtTitle",
  "glossary:existing-debt transactions.openingLinkShape",
  "glossary:existing-debt transactions.splitPayment",
  "glossary:overdrawn accounts.overdrawn",
];

/* ── pl ── */

const KNOWN_PL: readonly string[] = [
  "glossary:counterparty counterparties.archivedToast",
  "glossary:counterparty counterparties.loadFailedTitle",
  "glossary:counterparty counterparties.loadingEditor",
  "glossary:counterparty counterparties.mergeArchived",
  "glossary:counterparty counterparties.mergeNoCounterparty",
  "glossary:counterparty counterparties.nameCollision",
  "glossary:counterparty counterparties.pickerTitle",
  "glossary:counterparty counterparties.staleVersion",
  "glossary:counterparty routes.counterparties",
  "glossary:counterparty routes.counterparty",
  "glossary:counterparty routes.editCounterparty",
  "glossary:counterparty routes.newCounterparty",
  "glossary:counterparty settleDebt.counterparty",
  "glossary:counterparty settleDebt.editCounterparty",
  "glossary:counterparty settleDebt.newCounterparty",
  "glossary:counterparty settleDebt.noCounterparty",
  "glossary:counterparty transactions.counterparty",
  "glossary:counterparty transactions.noCounterparty",
  "glossary:entry accounts.deleteConfirmBody",
  "glossary:entry accounts.deleteHasEntries",
  "glossary:entry backup.entriesValue_few",
  "glossary:entry backup.entriesValue_many",
  "glossary:entry backup.entriesValue_one",
  "glossary:entry backup.entriesValue_other",
  "glossary:entry categories.archivedWhat",
  "glossary:entry pages.transaction",
  "glossary:entry restore.entriesValue_few",
  "glossary:entry restore.entriesValue_many",
  "glossary:entry restore.entriesValue_one",
  "glossary:entry restore.entriesValue_other",
  "glossary:entry shell.ledgerSubtitle",
  "glossary:entry transactions.calendarNearestDay",
  "glossary:entry transactions.calendarRangeBody_few",
  "glossary:entry transactions.calendarRangeBody_many",
  "glossary:entry transactions.calendarRangeBody_one",
  "glossary:entry transactions.calendarRangeBody_other",
  "glossary:entry transactions.paidNotForRepaymentDetail",
  "glossary:entry transactions.ribbonDayMany",
  "glossary:entry transactions.ribbonDayOne",
  "glossary:entry transactions.transferLinkedNote",
  "glossary:existing-debt counterparties.existingDebtAdd",
  "glossary:existing-debt counterparties.existingDebtDateFuture",
  "glossary:existing-debt counterparties.existingDebtDeleteBody",
  "glossary:existing-debt counterparties.existingDebtDeleteTitle",
  "glossary:existing-debt counterparties.existingDebtDeleted",
  "glossary:existing-debt counterparties.existingDebtGone",
  "glossary:existing-debt counterparties.existingDebtReplaces",
  "glossary:existing-debt counterparties.existingDebtRow",
  "glossary:existing-debt counterparties.existingDebtSaved",
  "glossary:existing-debt counterparties.existingDebtTitle",
  "glossary:existing-debt transactions.openingLinkShape",
  "glossary:existing-debt transactions.splitPayment",
  "register accounts.holdingsTitle",
  "register accounts.kindLoanReceivable",
  "register accounts.whatCounts",
  "register allocate.emptyBody",
  "register allocate.you",
  "register backup.yourKey",
  "register categories.becauseAt",
  "register categories.fromHistory",
  "register counterparties.comesBack",
  "register counterparties.emptyFirstRunBody",
  "register counterparties.owedNet",
  "register counterparties.owesYou",
  "register counterparties.theyOweTotal",
  "register counterparties.youLent",
  "register counterparties.youOwe",
  "register counterparties.youOweLabel",
  "register counterparties.youOweThem",
  "register counterparties.youOweTotal",
  "register restore.keyLabel",
  "register shell.counterpartiesSubtitle",
  "register startup.renderFailedBody",
  "register transactions.calendarDrawsNothing",
  "register transactions.costsYou",
  "register transactions.notePlaceholder",
  "register transactions.timeHint",
];

/* ── be ── */

const KNOWN_BE: readonly string[] = [
  "glossary:anchor-currency fx.anchorBlocked",
  "glossary:anchor-currency fx.changePivot",
  "glossary:anchor-currency fx.changePivotStart",
  "glossary:anchor-currency fx.noQuoteCurrency",
  "glossary:anchor-currency fx.pivotAlreadyPivot",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_few",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_many",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_one",
  "glossary:anchor-currency fx.pivotChangeDroppedDates_other",
  "glossary:anchor-currency fx.pivotChangeRefused",
  "glossary:anchor-currency fx.pivotConfirmBody",
  "glossary:anchor-currency fx.pivotConfirmTitle",
  "glossary:anchor-currency fx.pivotKicker",
  "glossary:anchor-currency fx.pivotLabel",
  "glossary:anchor-currency fx.pivotName",
  "glossary:anchor-currency fx.pivotTarget",
  "glossary:counterparty counterparties.archivedToast",
  "glossary:counterparty counterparties.loadFailedTitle",
  "glossary:counterparty counterparties.loadingEditor",
  "glossary:counterparty counterparties.loadingLedger",
  "glossary:counterparty counterparties.mergeArchived",
  "glossary:counterparty counterparties.mergeNoCounterparty",
  "glossary:counterparty counterparties.nameCollision",
  "glossary:counterparty counterparties.pickerTitle",
  "glossary:counterparty counterparties.staleVersion",
  "glossary:counterparty routes.counterparties",
  "glossary:counterparty routes.counterparty",
  "glossary:counterparty routes.editCounterparty",
  "glossary:counterparty routes.newCounterparty",
  "glossary:counterparty settleDebt.counterparty",
  "glossary:counterparty settleDebt.editCounterparty",
  "glossary:counterparty settleDebt.newCounterparty",
  "glossary:counterparty settleDebt.noCounterparty",
  "glossary:counterparty transactions.counterparty",
  "glossary:counterparty transactions.noCounterparty",
  "glossary:entry accounts.deleteConfirmBody",
  "glossary:entry accounts.deleteHasEntries",
  "glossary:entry accounts.noneBody",
  "glossary:entry backup.entriesValue_few",
  "glossary:entry backup.entriesValue_many",
  "glossary:entry backup.entriesValue_one",
  "glossary:entry backup.entriesValue_other",
  "glossary:entry backup.unsentValue_few",
  "glossary:entry backup.unsentValue_many",
  "glossary:entry backup.unsentValue_one",
  "glossary:entry backup.unsentValue_other",
  "glossary:entry categories.archivedWhat",
  "glossary:entry categories.emptyBody",
  "glossary:entry counterparties.existingDebtHint",
  "glossary:entry counterparties.historySettledBody",
  "glossary:entry counterparties.mergedInto",
  "glossary:entry counterparties.notFound",
  "glossary:entry counterparties.unmergeToast",
  "glossary:entry fx.displayExplained",
  "glossary:entry pages.transaction",
  "glossary:entry restore.entriesValue_few",
  "glossary:entry restore.entriesValue_many",
  "glossary:entry restore.entriesValue_one",
  "glossary:entry restore.entriesValue_other",
  "glossary:entry shell.ledgerSubtitle",
  "glossary:entry transactions.calendarNearestDay",
  "glossary:entry transactions.calendarRangeBody_few",
  "glossary:entry transactions.calendarRangeBody_many",
  "glossary:entry transactions.calendarRangeBody_one",
  "glossary:entry transactions.calendarRangeBody_other",
  "glossary:entry transactions.lastCapture",
  "glossary:entry transactions.ribbonDayMany",
  "glossary:entry transactions.ribbonDayOne",
  "glossary:existing-debt counterparties.existingDebtAdd",
  "glossary:existing-debt counterparties.existingDebtDateFuture",
  "glossary:existing-debt counterparties.existingDebtDeleteBody",
  "glossary:existing-debt counterparties.existingDebtDeleteTitle",
  "glossary:existing-debt counterparties.existingDebtDeleted",
  "glossary:existing-debt counterparties.existingDebtGone",
  "glossary:existing-debt counterparties.existingDebtReplaces",
  "glossary:existing-debt counterparties.existingDebtRow",
  "glossary:existing-debt counterparties.existingDebtSaved",
  "glossary:existing-debt counterparties.existingDebtTitle",
  "glossary:existing-debt transactions.openingLinkShape",
  "glossary:existing-debt transactions.splitPayment",
  "glossary:overdrawn accounts.overdrawn",
];

/* ── all ── */

const KNOWN_VIOLATIONS: Record<Locale, readonly string[]> = {
  en: [],
  de: KNOWN_DE,
  ru: KNOWN_RU,
  pl: KNOWN_PL,
  be: KNOWN_BE,
};

const counts: string[] = [];

afterAll(() => {
  console.info(`copy guide — known violations per locale: ${counts.join(" · ")}`);
});

describe("the rules themselves", () => {
  const all = LOCALES.flatMap((locale) => RULES[locale].map((rule) => [locale, rule] as const));

  it.each(all)("%s rule catches its own example", (_locale, rule) => {
    expect(rule.pattern.test(rule.catches), `${rule.id}: ${rule.catches}`).toBe(true);
    if (rule.spares !== undefined) {
      expect(rule.pattern.test(rule.spares), `${rule.id}: ${rule.spares}`).toBe(false);
    }
  });
});

describe.each(LOCALES)("the %s catalogue", (locale) => {
  const found = violations(locale);
  const known = KNOWN_VIOLATIONS[locale];
  counts.push(`${locale} ${found.length}`);

  it("has no violation beyond its known list", () => {
    expect(found.filter((entry) => !known.includes(entry))).toEqual([]);
  });

  it("lists no key that has already been fixed", () => {
    expect(known.filter((entry) => !found.includes(entry))).toEqual([]);
  });
});
