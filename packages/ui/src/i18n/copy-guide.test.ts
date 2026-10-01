/**
 * `design-system/14-copy-and-localization.md`, enforced on the catalogues.
 *
 * The guide says four things a test can check without a native speaker: every
 * language addresses the reader formally, no catalogue speaks the engineers'
 * vocabulary, each concept has one agreed word per language, and a person's
 * name never sits where the language would have to decline it. Everything
 * else in the guide (native word order, plain sentences) is a reviewer's job —
 * a pattern cannot tell a literal translation from a good one.
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

/** §14.4: a preposition straight before `{{name}}` asks the translation to decline a name it cannot. */
function prepositionBeforeName(prepositions: string): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${prepositions})\\s+\\{\\{name\\}\\}`, "iu");
}

interface Rule {
  /** Unique per pattern — `register:…`, `jargon:…`, `glossary:<concept>`, `name:…` — and the prefix of an allowlist entry. */
  readonly id: string;
  readonly pattern: RegExp;
  /** A value the rule must catch, so a broken pattern fails here rather than passing everything. */
  readonly catches: string;
  /** A value it must leave alone — the false positive the pattern was written around. */
  readonly spares?: string;
  /** Match the value with its placeholders in place, for a rule about the placeholders themselves. */
  readonly raw?: boolean;
  /** `section.key` → why this key's match is the word in another sense, not the banned one. */
  readonly exempt?: Readonly<Record<string, string>>;
}

/** Engineer vocabulary that means nothing to a reader, in any language. */
const LATIN_JARGON: Rule = {
  id: "jargon:latin",
  // An identifier with an underscore (`settle_debt`, `change_pivot`) is code, never copy.
  pattern: new RegExp(
    `${words("pivot\\p{L}*|outbox|executor\\p{L}*|replica\\p{L}*|snapshot\\p{L}*|messageKey").source}|[A-Za-z]+_[A-Za-z_]+`,
    "iu",
  ),
  catches: "Refused by settle_debt",
  spares: "Settle the debt",
};

/** The person's own record in a merge — the word in its other sense, never a transaction. */
const MERGE_RECORD = {
  "counterparties.mergedInto": "the person's record that another was merged into",
  "counterparties.unmergeToast": "the person's record, restored by the unmerge",
  "counterparties.notFound": "the person's record, merged or removed",
} as const;

const RULES: Record<Locale, readonly Rule[]> = {
  en: [
    LATIN_JARGON,
    {
      id: "jargon:words",
      pattern: words(
        "nodes?|operations?|captur\\p{L}*|leaf|rebas\\p{L}*|re-rat\\p{L}*|quotes?|technical|engine|clearing",
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
    {
      id: "name:preposition",
      raw: true,
      pattern: prepositionBeforeName("with|to|from|for|of|by|at|between|towards"),
      catches: "Settling with {{name}}",
      spares: "Settle up: {{name}}",
    },
    {
      id: "name:possessive",
      raw: true,
      pattern: /\{\{name\}\}['’]s(?!\p{L})/u,
      catches: "{{name}}'s share",
      spares: "Share: {{name}}",
    },
  ],
  de: [
    LATIN_JARGON,
    {
      id: "register:pronoun",
      pattern: words("du|dich|dir|dein\\p{L}*|euch|euer|eure\\p{L}*"),
      catches: "Was du hast",
      spares: "Was Sie haben",
    },
    {
      id: "register:verb",
      // Second-person singular forms a reader meets in a sentence.
      pattern: words(
        "kannst|willst|musst|hast|bist|wirst|möchtest|solltest|darfst|siehst|weißt|findest|brauchst",
      ),
      catches: "Wenn du willst, kannst du",
      spares: "Wenn Sie wollen, können Sie",
    },
    {
      id: "register:imperative",
      // The informal imperative of the verbs an interface asks for. The formal
      // form is `Wählen Sie` in a sentence and the infinitive on a button.
      pattern: words(
        "gib|leg|lege|wähl|wähle|prüf|prüfe|tipp|tippe|erfasse|füge|trag|trage|öffne|speichere|nimm|sieh|schau|verknüpfe|warte|geh|gehe|benutze|nutze|ändere|lösche|entferne|wiederhole|kopiere|wechsle|schließe",
      ),
      catches: "Wähle ein Konto",
      spares: "Wählen Sie ein Konto",
    },
    {
      id: "jargon:words",
      pattern: words("Knoten|Operation(?:en)?|Replikat\\p{L}*"),
      catches: "Ein technischer Knoten",
      spares: "Konten",
    },
    {
      id: "glossary:entry",
      // The nouns only: `eintragen` is the verb, and right.
      pattern: words("Transaktion\\p{L}*|Eintrag(?:es|s)?|Einträge(?:n)?"),
      catches: "Noch keine Einträge",
      spares: "Betrag eintragen",
      exempt: MERGE_RECORD,
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
      id: "glossary:in-transit",
      pattern: words("Verrechnungskonto\\p{L}*|Clearing\\p{L}*"),
      catches: "Verrechnungskonto",
      spares: "Zwischenkonto",
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
    {
      id: "name:preposition",
      raw: true,
      pattern: prepositionBeforeName("mit|an|von|vom|für|bei|zu|zum|zur|gegenüber|zwischen"),
      catches: "Ausgleich mit {{name}}",
      spares: "Ausgleich: {{name}}",
    },
  ],
  ru: [
    LATIN_JARGON,
    {
      id: "register:pronoun",
      pattern: words("ты|тебя|тебе|тобой|тобою|тво(?:й|я|ё|е|и|его|ей|ему|им|ими|их|ю)"),
      catches: "Что у тебя есть",
      spares: "Что у вас есть",
    },
    {
      id: "register:verb",
      // `лишь` is the one common word ending in `-ишь` that is not a verb.
      pattern: words("(?!лишь)\\p{L}+(?:ешь|ёшь|ишь)"),
      catches: "Ты можешь",
      spares: "Это лишь начало",
    },
    {
      id: "register:imperative",
      // The informal imperative of the verbs an interface asks for; the formal
      // one ends in `-те`.
      pattern: words(
        "выбери|введи|укажи|нажми|добавь|сохрани|проверь|открой|закрой|создай|удали|попробуй|отмени|подожди|посмотри|перейди|заполни|используй|измени|сбрось|скопируй|верни|обнови|разблокируй",
      ),
      catches: "Выбери счёт",
      spares: "Выберите счёт",
    },
    {
      id: "register:capital-vy",
      // Polite `вы` is lowercase in running text; capitalised mid-sentence it
      // reads as a letter to one addressee, which an interface is not.
      pattern: /(?<=[\p{L}\p{N},;:)»—–]\s+)(?:Вы|Вас|Вам|Вами|Ваш\p{L}*)(?!\p{L})/u,
      catches: "Здесь Вы видите итог",
      spares: "Вы должны",
    },
    {
      id: "jargon:words",
      pattern: words("узел|узла|узлы|узлов|реплик\\p{L}*"),
      catches: "технический узел",
      spares: "узнать",
    },
    {
      id: "glossary:entry",
      pattern: words("транзакци\\p{L}*|запись|записи|записей|записям|записями|записях"),
      catches: "Одна запись",
      spares: "Одна операция",
      exempt: MERGE_RECORD,
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
      id: "glossary:in-transit",
      pattern: words("клиринг\\p{L}*"),
      catches: "Клиринговый счёт",
      spares: "Транзитный счёт",
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
      spares: "Долг до начала учёта",
    },
    {
      id: "glossary:net-worth",
      pattern: words("чист(?:ая|ой|ую)\\s+стоимост\\p{L}*"),
      catches: "Чистая стоимость",
      spares: "Капитал",
    },
    {
      id: "name:preposition",
      raw: true,
      pattern: prepositionBeforeName("с|со|к|ко|от|для|у|о|об|по|между|перед"),
      catches: "Расчёт с {{name}}",
      spares: "Расчёт: {{name}}",
    },
  ],
  pl: [
    LATIN_JARGON,
    {
      id: "register:pronoun",
      pattern: words(
        "ty|ciebie|cię|tobie|tobą|twój|twoja|twoje|twojego|twojej|twojemu|twoim|twoich|twoimi|twoją",
      ),
      catches: "Należne Tobie",
      spares: "Należne",
    },
    {
      id: "register:verb",
      // Present-tense `-sz` second person and the past tense's `-łeś`/`-łaś`.
      // `-pisz` is spared: `Zapisz` is the imperative, the standard Polish
      // button, which is left to review.
      pattern: words(
        "masz|wiesz|jesteś|(?!\\p{L}*pisz(?!\\p{L})|klawisz|mysz)\\p{L}+(?:esz|isz|ysz)|\\p{L}+(?:łeś|łaś)",
      ),
      catches: "Możesz to zmienić",
      spares: "Zapisz",
    },
    {
      id: "jargon:words",
      pattern: words("węzeł|węzła|węzły|replik\\p{L}*"),
      catches: "węzeł techniczny",
      spares: "wiązka",
    },
    {
      id: "glossary:entry",
      pattern: words("operacj\\p{L}*|wpis|wpisy|wpisu|wpisów|wpisem|wpisie|wpisach|wpisami"),
      catches: "Jeden wpis",
      spares: "Jedna transakcja",
      exempt: MERGE_RECORD,
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
      id: "glossary:in-transit",
      pattern: words("rozliczeniow\\p{L}*|clearing\\p{L}*"),
      catches: "Konto rozliczeniowe",
      spares: "Konto przejściowe",
    },
    {
      id: "glossary:existing-debt",
      pattern: words("istniejąc\\p{L}*\\s+dług\\p{L}*"),
      catches: "Istniejący dług",
      spares: "Dług sprzed rozpoczęcia ewidencji",
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
    {
      id: "name:preposition",
      raw: true,
      pattern: prepositionBeforeName("z|ze|do|od|dla|u|o|przez|między|wobec|na"),
      catches: "Rozliczenie z {{name}}",
      spares: "Rozliczenie: {{name}}",
    },
  ],
  be: [
    LATIN_JARGON,
    {
      id: "register:pronoun",
      pattern: words("ты|цябе|табе|табой|твой|твая|тваё|твае|твайго|тваёй|тваім|тваіх|тваімі|тваю"),
      catches: "Што ў цябе ёсць",
      spares: "Што ў вас ёсць",
    },
    {
      id: "register:verb",
      // Second-person singular verbs and the informal imperatives an
      // interface asks for; the formal imperative ends in `-це`.
      pattern: words(
        "можаш|хочаш|маеш|ведаеш|бачыш|выберы|увядзі|укажы|націсні|дадай|захавай|правер|адкрый|закрый|ствары|выдалі|паспрабуй|адмяні|пачакай|змяні|скапіруй|вярні|абнаві",
      ),
      catches: "Ты можаш",
      spares: "Вы можаце",
    },
    {
      id: "register:capital-vy",
      pattern: /(?<=[\p{L}\p{N},;:)»—–]\s+)(?:Вы|Вас|Вам|Вамі|Ваш\p{L}*)(?!\p{L})/u,
      catches: "Тут Вы бачыце вынік",
      spares: "Вы вінны",
    },
    {
      id: "jargon:words",
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
      exempt: MERGE_RECORD,
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
      id: "glossary:in-transit",
      pattern: words("клірынг\\p{L}*|клиринг\\p{L}*"),
      catches: "Клірынгавы рахунак",
      spares: "Транзітны рахунак",
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
      spares: "Доўг да пачатку ўліку",
    },
    {
      id: "name:preposition",
      raw: true,
      pattern: prepositionBeforeName("з|са|да|ад|для|у|ў|аб|па|між|перад"),
      catches: "Разлік з {{name}}",
      spares: "Разлік: {{name}}",
    },
  ],
};

/**
 * Settings · Developer exists in a development build only — `en.ts` says none
 * of it is copy a person keeping a ledger reads, so the guide does not bind it.
 */
const NOT_USER_FACING = new Set<keyof Messages>(["developer"]);

/** Every user-facing value as `[section.key, value]`. */
function entries(locale: Locale): [string, string][] {
  const catalogue = catalogues[locale];
  return (Object.keys(catalogue) as (keyof Messages)[])
    .filter((section) => !NOT_USER_FACING.has(section))
    .flatMap((section) =>
      Object.entries(catalogue[section] as Record<string, string>).map(
        ([key, value]): [string, string] => [`${section}.${key}`, value],
      ),
    );
}

/** Placeholders stripped — `{{quote}}` is a variable, not a word. */
function wordsOf(value: string): string {
  return value.replace(/{{\w+}}/g, " ");
}

function violations(locale: Locale): string[] {
  const found = new Set<string>();
  for (const [key, value] of entries(locale)) {
    for (const rule of RULES[locale]) {
      if (rule.exempt !== undefined && key in rule.exempt) continue;
      if (rule.pattern.test(rule.raw ? value : wordsOf(value))) found.add(`${rule.id} ${key}`);
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
  "glossary:entry transactions.paidNotForRepaymentDetail",
  "glossary:entry transactions.ribbonDayMany",
  "glossary:entry transactions.ribbonDayOne",
  "glossary:entry transactions.transferLinkedNote",
  "glossary:in-transit allocate.notClearing",
  "name:preposition allocate.editShare",
  "name:preposition allocate.fewerShares",
  "name:preposition allocate.moreShares",
  "name:preposition allocate.shareOf",
  "name:preposition categories.actionsFor",
  "name:preposition counterparties.existingDebtDeleteBody",
  "name:preposition counterparties.existingDebtTitle",
  "name:preposition counterparties.settlingWith",
  "name:preposition transactions.nothingToSettle",
  "name:preposition transactions.settlesOwe",
  "register:imperative accounts.noneBody",
  "register:imperative shell.goTo",
  "register:imperative transactions.contextLinkBody",
  "register:imperative transactions.emptyFirstRunBody",
  "register:imperative transactions.lineAmountMissing",
  "register:pronoun accounts.holdingsTitle",
  "register:pronoun accounts.observed",
  "register:pronoun accounts.whatCounts",
  "register:pronoun transactions.betweenOwnAccounts",
  "register:pronoun transactions.calendarDrawsNothing",
  "register:pronoun transactions.contextLinkBody",
  "register:pronoun transactions.costsYou",
  "register:pronoun transactions.emptyFirstRunBody",
  "register:pronoun transactions.lastCapture",
  "register:pronoun transactions.notePlaceholder",
  "register:pronoun transactions.savedOnPhone",
  "register:pronoun transactions.savesYou",
  "register:pronoun transactions.timeHint",
  "register:verb accounts.holdingsTitle",
  "register:verb accounts.whatCounts",
  "register:verb transactions.contextLinkBody",
  "register:verb transactions.notePlaceholder",
  "register:verb transactions.savedOnPhone",
];

/* ── ru ── */

const KNOWN_RU: readonly string[] = [];

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
  "glossary:in-transit accounts.kindClearing",
  "glossary:in-transit allocate.notClearing",
  "name:preposition categories.actionsFor",
  "name:preposition counterparties.settlingWith",
  "register:pronoun accounts.kindLoanReceivable",
  "register:pronoun allocate.you",
  "register:pronoun backup.yourKey",
  "register:pronoun categories.fromHistory",
  "register:pronoun counterparties.comesBack",
  "register:pronoun counterparties.emptyFirstRunBody",
  "register:pronoun counterparties.owesYou",
  "register:pronoun counterparties.theyOweTotal",
  "register:pronoun restore.keyLabel",
  "register:pronoun startup.renderFailedBody",
  "register:pronoun transactions.calendarDrawsNothing",
  "register:pronoun transactions.costsYou",
  "register:pronoun transactions.timeHint",
  "register:verb accounts.holdingsTitle",
  "register:verb accounts.whatCounts",
  "register:verb allocate.emptyBody",
  "register:verb categories.becauseAt",
  "register:verb categories.mergeConfirmBody",
  "register:verb counterparties.emptyFirstRunBody",
  "register:verb counterparties.owedNet",
  "register:verb counterparties.youLent",
  "register:verb counterparties.youOwe",
  "register:verb counterparties.youOweLabel",
  "register:verb counterparties.youOweThem",
  "register:verb counterparties.youOweTotal",
  "register:verb settings.onThisPhoneBody",
  "register:verb shell.counterpartiesSubtitle",
  "register:verb transactions.needsRate",
  "register:verb transactions.notePlaceholder",
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
  "glossary:in-transit allocate.notClearing",
  "glossary:overdrawn accounts.overdrawn",
  "name:preposition counterparties.settlingWith",
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
  it("exempts only keys that exist", () => {
    const keys = new Set(entries("en").map(([key]) => key));
    const exempted = LOCALES.flatMap((locale) =>
      RULES[locale].flatMap((rule) => Object.keys(rule.exempt ?? {})),
    );
    expect(exempted.filter((key) => !keys.has(key))).toEqual([]);
  });

  it("gives every pattern in a locale its own id", () => {
    for (const locale of LOCALES) {
      const ids = RULES[locale].map((rule) => rule.id);
      expect(ids, locale).toEqual([...new Set(ids)]);
    }
  });

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
