/**
 * What the demo ledger's people, accounts, shops and notes are *called*, per
 * app language.
 *
 * **The plan is one list; only the words change.** `demo-plan.ts` holds the
 * structure — which account, which amount, which day, which person owes whom —
 * keyed by stable refs, and a test refuses a plan whose refs or amounts differ
 * by language. This file is the other half: for each language, the invented
 * name that stands in a slot. A German demo has German-sounding names, a
 * Russian one Russian, and nobody meets a Cyrillic contact inside the German
 * app.
 *
 * **Every name here is invented and generic** — a first name, a generic shop
 * ("Kiosk am Eck"), a descriptive account. Nothing is a real person or a real
 * brand: the shops and services are descriptions ("Streaming service"), not
 * names.
 *
 * **Keyed three ways, all stable.** Accounts and counterparties by their
 * `ref`; everything else (an entered name, a note) by the English text the
 * plan carries, which doubles as the key — a slot with no entry for a
 * language keeps the English text, so a missing translation is a visible
 * English word rather than a blank or a crash.
 */

/** The app's languages. Structurally `@waltning/ui`'s `Locale`, which this package cannot import. */
export type DemoLocale = "en" | "pl" | "de" | "ru" | "be";

export type DemoNames = {
  /** By `DemoAccount.ref`. */
  accounts: Readonly<Record<string, string>>;
  /** By `DemoCounterparty.ref`. */
  counterparties: Readonly<Record<string, string>>;
  /** By the English entered name or note the plan carries. */
  text: Readonly<Record<string, string>>;
};

/** English: the plan's own words, with the people named. */
const en: DemoNames = {
  accounts: {
    "bank-a": "Bank A",
    "bank-b": "Bank B",
    "card-a": "Card A",
    cash: "Cash",
    clearing: "Clearing",
    "loan-in": "Car loan",
    investment: "Brokerage",
    other: "Travel card",
    "bank-c": "Studio account",
    "card-b": "Card B",
  },
  counterparties: {
    owing: "Emma",
    owed: "Oliver",
    settled: "Studio B",
    "de-owing": "Daniel",
    "by-owed": "Alex",
    "us-owing": "Michael",
    lent: "Thomas",
  },
  text: {
    "Loan to Tomasz": "Loan to Thomas",
    "Tomasz · repayment": "Thomas · repayment",
  },
};

/** Polish: the shops the plan was written around stay; everything descriptive is Polish. */
const pl: DemoNames = {
  accounts: {
    "bank-a": "Bank A",
    "bank-b": "Bank B",
    "card-a": "Karta A",
    cash: "Gotówka",
    clearing: "Rozliczenia",
    "loan-in": "Kredyt samochodowy",
    investment: "Rachunek maklerski",
    other: "Karta podróżna",
    "bank-c": "Konto studia",
    "card-b": "Karta B",
  },
  counterparties: {
    owing: "Marta",
    owed: "Piotr",
    "de-owing": "Kasia",
    "by-owed": "Wojtek",
    "us-owing": "Jan",
    lent: "Tomasz",
  },
  text: {
    "Streaming service": "Serwis streamingowy",
    "Music service": "Serwis muzyczny",
    "Video service": "Serwis wideo",
    "AI assistant": "Asystent AI",
    Supermarket: "Supermarket Lipowy",
    "Corner shop": "Sklep na rogu",
    "Fuel station": "Stacja paliw",
    "Ride app": "Aplikacja do przejazdów",
    "Online shop": "Sklep internetowy Delta",
    "Furniture store": "Sklep meblowy",
    Employer: "Pracodawca",
    Landlord: "Wynajmujący",
    "Utility Co": "Dostawca mediów",
    "Corner Cafe": "Kawiarnia na rogu",
    Transit: "Komunikacja",
    Client: "Klient",
    "Software & tools": "Oprogramowanie i narzędzia",
    "Cash withdrawal": "Wypłata gotówki",
    "To savings": "Na oszczędności",
    "Card A": "Karta A",
    "Card B": "Karta B",
    "Car loan": "Kredyt samochodowy",
    "Owner draw": "Wypłata właściciela",
    "Top up": "Doładowanie",
    Restaurant: "Restauracja",
    Brokerage: "Rachunek maklerski",
    "Loan to Tomasz": "Pożyczka dla Tomasza",
    "Tomasz · repayment": "Tomasz · spłata",
    "Dinner · split": "Kolacja · na pół",
    "Train tickets": "Bilety na pociąg",
    "Deposit forwarded": "Kaucja przekazana dalej",
    "Concert · tickets": "Koncert · bilety",
    "Airport taxi · shared": "Taksówka z lotniska · na pół",
    "Cash · until Friday": "Gotówka · do piątku",
    "Studio B · invoice": "Studio B · faktura",
    "Studio B · lunch": "Studio B · obiad",
  },
};

const de: DemoNames = {
  accounts: {
    "bank-a": "Bank A",
    "bank-b": "Bank B",
    "card-a": "Karte A",
    cash: "Bargeld",
    clearing: "Verrechnung",
    "loan-in": "Autokredit",
    investment: "Depot",
    other: "Reisekarte",
    "bank-c": "Studiokonto",
    "card-b": "Karte B",
  },
  counterparties: {
    owing: "Anna",
    owed: "Lukas",
    "de-owing": "Jürgen",
    "by-owed": "Matthias",
    "us-owing": "Jonas",
    lent: "Stefan",
  },
  text: {
    "Streaming service": "Streamingdienst",
    "Music service": "Musikdienst",
    "Video service": "Videodienst",
    "AI assistant": "KI-Assistent",
    Supermarket: "Supermarkt Lindenhof",
    "Corner shop": "Kiosk am Eck",
    "Fuel station": "Tankstelle Nord",
    "Ride app": "Fahrdienst-App",
    "Online shop": "Onlineshop Delta",
    "Furniture store": "Möbelhaus",
    Employer: "Arbeitgeber",
    Landlord: "Vermieter",
    "Utility Co": "Energieversorger",
    "Corner Cafe": "Eckcafé",
    Transit: "Nahverkehr",
    Client: "Kunde",
    "Software & tools": "Software & Werkzeuge",
    "Cash withdrawal": "Bargeldabhebung",
    "To savings": "Aufs Sparkonto",
    "Card A": "Karte A",
    "Card B": "Karte B",
    "Car loan": "Autokredit",
    "Owner draw": "Privatentnahme",
    "Top up": "Aufladung",
    Restaurant: "Restaurant",
    Brokerage: "Depot",
    "Loan to Tomasz": "Darlehen an Stefan",
    "Tomasz · repayment": "Stefan · Rückzahlung",
    "Dinner · split": "Abendessen · geteilt",
    "Train tickets": "Bahntickets",
    "Deposit forwarded": "Kaution weitergeleitet",
    "Concert · tickets": "Konzert · Tickets",
    "Airport taxi · shared": "Flughafentaxi · geteilt",
    "Cash · until Friday": "Bargeld · bis Freitag",
    "Studio B · invoice": "Studio B · Rechnung",
    "Studio B · lunch": "Studio B · Mittagessen",
  },
};

const ru: DemoNames = {
  accounts: {
    "bank-a": "Банк А",
    "bank-b": "Банк Б",
    "card-a": "Карта А",
    cash: "Наличные",
    clearing: "Транзитный счёт",
    "loan-in": "Автокредит",
    investment: "Брокерский счёт",
    other: "Карта для поездок",
    "bank-c": "Счёт студии",
    "card-b": "Карта Б",
  },
  counterparties: {
    owing: "Марина",
    owed: "Павел",
    "de-owing": "Игорь",
    "by-owed": "Денис",
    "us-owing": "Антон",
    lent: "Сергей",
  },
  text: {
    "Streaming service": "Стриминговый сервис",
    "Music service": "Музыкальный сервис",
    "Video service": "Видеосервис",
    "AI assistant": "ИИ-ассистент",
    Supermarket: "Супермаркет Липа",
    "Corner shop": "Магазин у дома",
    "Fuel station": "АЗС Север",
    "Ride app": "Приложение для поездок",
    "Online shop": "Интернет-магазин Дельта",
    "Furniture store": "Мебельный магазин",
    Employer: "Работодатель",
    Landlord: "Арендодатель",
    "Utility Co": "Коммунальные услуги",
    "Corner Cafe": "Кафе на углу",
    Transit: "Транспорт",
    Client: "Клиент",
    "Software & tools": "Программы и инструменты",
    "Cash withdrawal": "Снятие наличных",
    "To savings": "На накопления",
    "Card A": "Карта А",
    "Card B": "Карта Б",
    "Car loan": "Автокредит",
    "Owner draw": "Вывод средств владельцем",
    "Top up": "Пополнение",
    Restaurant: "Ресторан",
    Brokerage: "Брокерский счёт",
    "Loan to Tomasz": "Заём Сергею",
    "Tomasz · repayment": "Сергей · возврат",
    "Dinner · split": "Ужин · пополам",
    "Train tickets": "Билеты на поезд",
    "Deposit forwarded": "Залог передан дальше",
    "Concert · tickets": "Концерт · билеты",
    "Airport taxi · shared": "Такси из аэропорта · вскладчину",
    "Cash · until Friday": "Наличные · до пятницы",
    "Studio B · invoice": "Studio B · счёт",
    "Studio B · lunch": "Studio B · обед",
  },
};

const be: DemoNames = {
  accounts: {
    "bank-a": "Банк А",
    "bank-b": "Банк Б",
    "card-a": "Картка А",
    cash: "Наяўныя",
    clearing: "Транзітны рахунак",
    "loan-in": "Аўтакрэдыт",
    investment: "Брокерскі рахунак",
    other: "Картка для паездак",
    "bank-c": "Рахунак студыі",
    "card-b": "Картка Б",
  },
  counterparties: {
    owing: "Ганна",
    owed: "Міхась",
    "de-owing": "Кастусь",
    "by-owed": "Янка",
    "us-owing": "Вадзім",
    lent: "Сяргей",
  },
  text: {
    "Streaming service": "Стрымінгавы сэрвіс",
    "Music service": "Музычны сэрвіс",
    "Video service": "Відэасэрвіс",
    "AI assistant": "ШІ-асістэнт",
    Supermarket: "Супермаркет Ліпа",
    "Corner shop": "Крама каля дому",
    "Fuel station": "АЗС Поўнач",
    "Ride app": "Праграма для паездак",
    "Online shop": "Інтэрнэт-крама Дэльта",
    "Furniture store": "Мэблевая крама",
    Employer: "Працадаўца",
    Landlord: "Арандадаўца",
    "Utility Co": "Камунальныя паслугі",
    "Corner Cafe": "Кафэ на рагу",
    Transit: "Транспарт",
    Client: "Кліент",
    "Software & tools": "Праграмы і інструменты",
    "Cash withdrawal": "Здыманне наяўных",
    "To savings": "На зберажэнні",
    "Card A": "Картка А",
    "Card B": "Картка Б",
    "Car loan": "Аўтакрэдыт",
    "Owner draw": "Вывад сродкаў уладальнікам",
    "Top up": "Папаўненне",
    Restaurant: "Рэстаран",
    Brokerage: "Брокерскі рахунак",
    "Loan to Tomasz": "Пазыка Сяргею",
    "Tomasz · repayment": "Сяргей · вяртанне",
    "Dinner · split": "Вячэра · напалову",
    "Train tickets": "Білеты на цягнік",
    "Deposit forwarded": "Заклад перададзены далей",
    "Concert · tickets": "Канцэрт · білеты",
    "Airport taxi · shared": "Таксі з аэрапорта · напалову",
    "Cash · until Friday": "Наяўныя · да пятніцы",
    "Studio B · invoice": "Studio B · рахунак",
    "Studio B · lunch": "Studio B · абед",
  },
};

export const DEMO_NAMES: Readonly<Record<DemoLocale, DemoNames>> = { en, pl, de, ru, be };

/** An account's name in `locale`; the plan's own where the table has none. */
export function demoAccountName(locale: DemoLocale, ref: string, fallback: string): string {
  return DEMO_NAMES[locale].accounts[ref] ?? fallback;
}

/** A counterparty's name in `locale`; the plan's own where the table has none. */
export function demoCounterpartyName(locale: DemoLocale, ref: string, fallback: string): string {
  return DEMO_NAMES[locale].counterparties[ref] ?? fallback;
}

/** An entered name or note in `locale`, keyed by the English text; that text where there is no entry. */
export function demoText(locale: DemoLocale, key: string): string {
  return DEMO_NAMES[locale].text[key] ?? key;
}
