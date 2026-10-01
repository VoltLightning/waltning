# Copy and localization

Every word on a screen comes from `packages/ui/src/i18n/{en,de,ru,pl,be}.ts`.
English is the source: its keys are the type every other catalogue must match,
and its sentences are what the other four are translated *from*. This section
says how all five are written.

**A translation is written as a native speaker would say it, never word for
word from English.** A sentence that is grammatical and still reads as English
in disguise is a defect, the same as a wrong number: a native Russian speaker
reading the German interface could not tell what the anchor-currency dialog was
asking in either language, and that dialog was correct, word by word.

## 14.1 Voice

- **Plain, short, calm.** One idea per sentence. No exclamation marks.
- **Money-precise.** A sentence about money says which money: whose, in which
  currency, on which day. *Saved* is not *recorded and valued*.
- **Say what happened, then what to do next.** A refusal names the reason in the
  reader's terms and the way out: *This account now has transactions and can
  only be archived*, never *Constraint violated*.
- **No engineering vocabulary.** The words below name how the app is built, not
  anything a reader can see, and never appear in a catalogue — in any language,
  in any translation of them:

  | Never | Say instead |
  |---|---|
  | pivot | anchor currency (§14.3) |
  | node, leaf | category, group, subcategory |
  | operation (a write the app performs), executor | what it did: *saved*, *deleted*, *settled* |
  | replica, outbox, snapshot | *on this phone*, *not sent yet* |
  | capture | transaction, *record* (the verb) |
  | quote | rate |
  | rebase, re-rate | *recalculate the rates* |
  | counterparty | person or company (§14.3) |
  | clearing (account) | in transit — *money waiting to be split* (§14.3) |
  | anything with an underscore (`settle_debt`) | the action in words |

- **The ban is on the engineering sense, not the word.** Russian *операция* and
  Belarusian *аперацыя* are §14.3's word for a transaction — what every bank in
  those languages calls one — and stay; *operation* meaning a write the app
  performs never reaches a screen in any language.
- **Developer-only screens are exempt.** Settings · Developer exists in a
  development build only; nobody keeping a ledger reads it.

## 14.2 Register

**The reader is addressed formally, in every language, on every screen.** A
catalogue that mixes registers reads as if two people wrote it, and one did.

| Language | Register | In practice |
|---|---|---|
| German | *Sie* | *Sie*, *Ihr*, *Ihnen*; imperatives with *Sie* or an infinitive on buttons |
| Russian | *вы*, lowercase | *вы*, *ваш*; *Вы* is capitalised only at the start of a sentence |
| Belarusian | *вы*, lowercase | *вы*, *ваш*; never *ты*, *цябе*, *твой* |
| Polish | impersonal or formal | infinitive and impersonal forms (*Należy wybrać*, *Wybrano*), *Proszę …* for a request; avoid *Pan/Pani*, never *ty*, *twój* |
| English | — | *you*, plain |

**German**

| Don't | Do |
|---|---|
| Was du hast | Ihr Bestand |
| Eine Notiz, wenn du willst | Notiz (optional) |
| Erfasse deine erste Ausgabe oder Einnahme | Erfassen Sie Ihre erste Ausgabe oder Einnahme |

**Russian**

| Don't | Do |
|---|---|
| Что у тебя есть | Ваши средства |
| Здесь Вы видите итог | Здесь вы видите итог |
| Выбери счёт | Выберите счёт |

**Polish**

| Don't | Do |
|---|---|
| Należne Tobie | Należności |
| Co masz | Środki |
| Wybierz konto, z którego płacisz | Proszę wybrać konto płatności |

**Belarusian**

| Don't | Do |
|---|---|
| Што ў цябе ёсць | Вашы сродкі |
| Тут Вы бачыце вынік | Тут вы бачыце вынік |
| Выберы рахунак | Выберыце рахунак |

## 14.3 Glossary

**One word per concept per language.** A reader who meets *Buchung* on one
screen and *Transaktion* on the next assumes two different things. The words are
the ones banks and finance apps in each language already use, so a reader
recognises them rather than learning them. Where a cell names two forms, the
first is the noun and the second the short label or verb.

| Concept | English | German | Russian | Polish | Belarusian |
|---|---|---|---|---|---|
| Account | account | Konto | счёт | konto | рахунак |
| Transaction (one entry in the ledger) | transaction | Buchung | операция | transakcja | аперацыя |
| Expense | expense | Ausgabe | расход | wydatek | выдатак |
| Income | income | Einnahme | доход | przychód | даход |
| Transfer (between own accounts) | transfer | Umbuchung | перевод между своими счетами · перевод | przelew własny | перавод паміж сваімі рахункамі · перавод |
| Category | category | Kategorie | категория | kategoria | катэгорыя |
| Person or company | person or company · *Contacts* (the page) · *People* / *Companies* (its groups) · *With whom* (a transaction's field) | Person oder Firma · *Kontakte* · *Personen* / *Firmen* · *Mit wem* | человек или компания · *Контакты* · *Люди* / *Компании* · *С кем* | osoba lub firma · *Kontakty* · *Osoby* / *Firmy* · *Z kim* | чалавек або кампанія · *Кантакты* · *Людзі* / *Кампаніі* · *З кім* |
| Shop / payee (the name the receipt or statement prints) | shop / payee | Geschäft / Empfänger | магазин / получатель | sklep / odbiorca | крама / атрымальнік |
| Contact details (the field on a person's page — never the page's own word) | contact details | Kontaktdaten | контактные данные | dane kontaktowe | кантактныя даныя |
| Debt | debt | Schuld | долг | dług | доўг |
| Repayment | repayment | Rückzahlung | возврат долга | spłata | вяртанне доўгу |
| Existing debt (from before the ledger) | existing debt | bestehende Schuld | долг до начала учёта | dług sprzed rozpoczęcia ewidencji | доўг да пачатку ўліку |
| Anchor currency | anchor currency | Bezugswährung | опорная валюта | waluta odniesienia | апорная валюта |
| In-transit account (an account kind: money waiting to be split) | in transit | Zwischenkonto | транзитный счёт | konto przejściowe | транзітны рахунак |
| Display currency | *Show figures in* | *Beträge anzeigen in* | *Показывать суммы в* | *Pokazuj kwoty w* | *Паказваць сумы ў* |
| Exchange rate | exchange rate · rate | Wechselkurs · Kurs | курс | kurs | курс |
| Charged (to the account) | charged | abgebucht | списано | pobrano | спісана |
| Paid (in another currency) | paid | bezahlt | оплачено | zapłacono | аплачана |
| Split | split | aufteilen | разделить | podzielić | падзяліць |
| Archive | archive | archivieren | в архив · архивировать | archiwizuj · zarchiwizować | у архіў · архіваваць |
| Delete | delete | löschen | удалить | usuń · usunąć | выдаліць |
| Overdrawn | overdrawn | überzogen | в минусе | na debecie · debet | у мінусе |
| Owed — on a card or loan account | owed | geschuldet | задолженность | do spłaty | запазычанасць |
| Owed — between people | owed | geschuldet | долг | do spłaty | доўг |
| Balance | balance | Kontostand · Saldo | баланс | saldo | баланс |
| Net worth | net worth | Vermögen | капитал | majątek | капітал |
| Backup | backup · back up | Sicherung · sichern | резервная копия | kopia zapasowa | рэзервовая копія |
| Restore | restore | wiederherstellen | восстановить | przywróć · przywrócić | аднавіць |
| Lock | app lock · lock | App-Sperre · sperren | блокировка · заблокировать | blokada · zablokować | блакаванне · заблакаваць |

**A transfer between one's own accounts is said as one** where the short word
would read as paying someone: Polish *przelew* and Russian or Belarusian
*перевод* alone are what a bank calls a payment out. The short form is for a
tag or a column where the two accounts stand beside it.

**The page and its parts never share a word.** *Contacts* is the page; *People*
and *Companies* are its groups; the field on one person's page is *Contact
details*, never *Contact*. On a transaction, *With whom* names the person or
company and *Shop / payee* the name the receipt prints — two rows that can
name different parties (S09). It is never *Paid to*: the *Paid* row, on the same screen,
is the amount paid in another currency, and the two would read as one.

**Words the glossary rules out**, because each is the literal or the jargon
choice a reader stumbles on:

| Concept | Not this |
|---|---|
| Transaction | de *Transaktion*, *Eintrag* · ru *транзакция*, *запись* · pl *operacja*, *wpis* · be *транзакцыя*, *запіс* |
| Expense | ru *трата* · be *трата* |
| Income | de *Einkommen* (a salary) · ru *приход* · pl *dochód* (a tax term: income after costs) · be *прыбытак* |
| Transfer | de *Überweisung* (a payment to someone else) |
| Person or company | en, de, ru, pl, be *counterparty* and its translations (*Gegenpartei*, *контрагент*, *kontrahent*, *кантрагент*) |
| Anchor currency | de *Ankerwährung*, *Leitwährung* · ru *якорная* · pl *kotwiczna* · be *якарная* — in economics these mean a currency peg, which this is not |
| Existing debt | en *opening debt* · ru *существующий долг* · pl *istniejący dług* · be *існуючы доўг* (word for word from English) |
| Overdrawn | ru *овердрафт* · be *авердрафт* (a credit product, not a state) |
| Balance | de *Bilanz* · pl *bilans* (a balance sheet) |
| Net worth | de *Nettowert* · ru *чистая стоимость* · pl *wartość netto* |
| Repayment | de *Tilgung* (a bank loan's instalment) |
| Account | be *счёт* (Russian) |
| In transit | en *clearing* · de *Verrechnungskonto*, *Clearing* · ru *клиринговый* · pl *rozliczeniowe* · be *клірынгавы* (a bank's back office, not a person's account) |

**The anchor currency keeps its English name** because `SPEC.md` §7.0 names it
so in the app; the other languages use their *reference currency* word, which
says what it is — the currency rates are quoted against — without suggesting a
peg. It is never described as the currency figures are shown or totalled in:
that is the display currency, and the anchor *decides nothing a reader sees*.

## 14.4 Rules

- **A figure is never concatenated by hand.** It renders through
  `<Amount>`/`<FxAmount>`, or reaches a message as a pre-formatted
  `{{amount}}` with its currency joined by a no-break space (` `) inside
  the template — never `amount + " " + currency` in code.
- **Counts decline through i18next's plural keys** — `_one`, `_few`, `_many`,
  `_other`. Polish, Russian and Belarusian use all four; English and German
  repeat `_other`. A caller choosing between two keys can only ever reach two
  forms, and the fourth is the one a reader with *5 rows* sees.
- **No sentence is glued together in code.** A message is one key with
  placeholders; word order belongs to the language. Two keys joined by a space
  put the English order on every language.
- **Names are interpolated where no declension is needed** — after a colon, as
  a heading, or as the subject: *Existing debt: Nina*, not *Existing debt with
  {{name}}*, which Russian, Polish and Belarusian would need in the instrumental
  and the catalogue cannot decline. The same goes for a possessive (*{{name}}'s
  share* → *Share: {{name}}*).
- **Dates come from `Intl`**, through `locales.ts`. A date is never spelled in a
  catalogue, and a month name is never a translation.
- **Keys never change for a wording change.** Only values move; a key renamed
  is every caller changed.

## 14.5 Enforcement

`packages/ui/src/i18n/copy-guide.test.ts` holds §14.1's banned vocabulary,
§14.2's register (pronouns, second-person verbs, informal imperatives, a
capitalised *Вы* mid-sentence) and §14.3's ruled-out words as patterns, run
over every user-facing value of every catalogue with placeholders removed;
§14.4's name rule runs on the value with its placeholders, looking for a
preposition (or an English possessive) against `{{name}}`. A pattern may
exempt a key where the word is used in another sense, and says why — the
person's *record* in a merge is not a transaction. Each pattern
carries an example it must catch and one it must spare, so a pattern that has
stopped matching anything fails rather than passing everything.

**Each language carries a list of its known violations, by key, and the list
only shrinks.** A violation not on the list fails; so does a listed key that no
longer violates, so a fixed key cannot quietly regress. English has no list.
What a pattern cannot judge — word order, a literal phrase, an imperative
without a pronoun — is a reviewer's, and a native speaker's.
