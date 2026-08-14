/**
 * Seed data — currencies and the category taxonomy from TAXONOMY.md.
 *
 * One refinement against that document: it drew `EARNINGS` and `UNEARNED` as
 * top-level groups, which would have made income three levels deep and broken
 * R2. That split is not hierarchy — it is the `is_earnings` flag. Expressing it
 * as a flag keeps the tree two levels everywhere and is the whole reason the
 * flag exists.
 *
 * Every entry carries a stable `seed:` key so re-running is idempotent.
 */

export type SeedCurrency = {
  code: string;
  name: string;
  symbol: string;
  symbolPosition: "P" | "S";
  decimals: number;
  isPivot?: boolean;
  pinned?: boolean;
  rateSource: "nbp" | "ecb" | "nbrb" | "nbg" | null;
};

/**
 * USD is the pivot: every rate source in use publishes against it, and it is
 * what Money Manager already stores, so migration needs no conversion (§7.0).
 * Pinned currencies appear in the header display toggle.
 */
export const currencies: SeedCurrency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "P", decimals: 2, isPivot: true, pinned: true, rateSource: null },
  { code: "PLN", name: "Polish Złoty", symbol: "zł", symbolPosition: "S", decimals: 2, pinned: true, rateSource: "nbp" },
  { code: "EUR", name: "Euro", symbol: "€", symbolPosition: "S", decimals: 2, pinned: true, rateSource: "ecb" },
  { code: "BYN", name: "Belarusian Ruble", symbol: "Br", symbolPosition: "S", decimals: 2, rateSource: "nbrb" },
  { code: "GEL", name: "Georgian Lari", symbol: "₾", symbolPosition: "S", decimals: 2, rateSource: "nbg" },
  { code: "GBP", name: "Pound Sterling", symbol: "£", symbolPosition: "P", decimals: 2, rateSource: "ecb" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", symbolPosition: "S", decimals: 2, rateSource: "ecb" },
];

export type SeedGroup = {
  key: string;
  name: string;
  kind: "income" | "expense";
  leaves: { key: string; name: string; isEarnings?: boolean; note?: string }[];
};

/** Income — earnings is a flag, not a level. */
export const incomeTree: SeedGroup[] = [
  {
    key: "business-revenue",
    name: "Business revenue",
    kind: "income",
    leaves: [
      { key: "services", name: "Services", isEarnings: true, note: "reportable under ryczałt; carries a rate" },
      { key: "other-revenue", name: "Other revenue", isEarnings: true },
    ],
  },
  {
    key: "employment",
    name: "Employment",
    kind: "income",
    leaves: [
      { key: "salary", name: "Salary", isEarnings: true },
      { key: "bonus-equity", name: "Bonus & equity", isEarnings: true },
    ],
  },
  {
    key: "returns",
    name: "Returns",
    kind: "income",
    leaves: [
      { key: "investment-returns", name: "Investment returns", isEarnings: true },
      { key: "interest", name: "Interest", isEarnings: true },
    ],
  },
  {
    key: "other-inflows",
    name: "Other inflows",
    kind: "income",
    leaves: [
      { key: "gift-received", name: "Gift received", note: "from anyone — family, friends, birthdays" },
      { key: "refund", name: "Refund" },
      { key: "borrowed", name: "Borrowed", note: "money you will give back — never earnings" },
      { key: "repayment-received", name: "Repayment received", note: "a debt coming back is not a gain" },
      { key: "other-inflow", name: "Other inflow" },
    ],
  },
];

export const expenseTree: SeedGroup[] = [
  {
    key: "home",
    name: "Home",
    kind: "expense",
    leaves: [
      { key: "property-purchase", name: "Property purchase", note: "one-off capital — flag is_capital" },
      { key: "rent", name: "Rent" },
      { key: "utilities", name: "Utilities" },
      { key: "furniture-appliances", name: "Furniture & appliances" },
      { key: "household-supplies", name: "Household supplies" },
      { key: "renovation", name: "Renovation & building" },
      { key: "plumbing", name: "Plumbing", note: "piping and plumbing merged" },
      { key: "electrical-network", name: "Electrical & network" },
      { key: "facade-exterior", name: "Facade & exterior" },
      { key: "garden", name: "Garden" },
    ],
  },
  {
    key: "food",
    name: "Food",
    kind: "expense",
    leaves: [
      { key: "groceries", name: "Groceries" },
      { key: "eating-out", name: "Eating out", note: "both old homes merged" },
      { key: "delivery", name: "Delivery" },
      { key: "alcohol", name: "Alcohol" },
    ],
  },
  {
    key: "transport",
    name: "Transport",
    kind: "expense",
    leaves: [
      { key: "car", name: "Car" },
      { key: "taxi", name: "Taxi" },
      { key: "public-transport", name: "Public transport", note: "bus + subway merged" },
      { key: "fuel-parking", name: "Fuel & parking" },
    ],
  },
  {
    key: "travel",
    name: "Travel",
    kind: "expense",
    leaves: [
      { key: "flights-tickets", name: "Flights & tickets" },
      { key: "accommodation", name: "Accommodation" },
      { key: "travel-food", name: "Travel food & activities" },
    ],
  },
  {
    key: "health",
    name: "Health",
    kind: "expense",
    leaves: [
      { key: "medical-dental", name: "Medical & dental" },
      { key: "pharmacy", name: "Pharmacy" },
      { key: "sport-fitness", name: "Sport & fitness" },
      { key: "beauty-grooming", name: "Beauty & grooming" },
    ],
  },
  {
    key: "personal",
    name: "Personal",
    kind: "expense",
    leaves: [
      { key: "clothing-shoes", name: "Clothing & shoes" },
      { key: "technology", name: "Technology" },
      { key: "hobbies", name: "Hobbies" },
      { key: "education", name: "Education" },
    ],
  },
  {
    key: "social",
    name: "Social",
    kind: "expense",
    leaves: [
      { key: "friends-going-out", name: "Friends & going out" },
      { key: "gifts-given", name: "Gifts given" },
      { key: "celebrations", name: "Celebrations" },
      { key: "entertainment", name: "Entertainment" },
    ],
  },
  {
    key: "subscriptions",
    name: "Subscriptions",
    kind: "expense",
    leaves: [
      { key: "software-tools", name: "Software & tools" },
      { key: "media-streaming", name: "Media & streaming" },
      { key: "mobile-internet", name: "Mobile & internet" },
    ],
  },
  {
    key: "financial",
    name: "Financial",
    kind: "expense",
    leaves: [
      { key: "tax", name: "Tax" },
      { key: "bank-fees", name: "Bank fees & commission" },
      { key: "legal-professional", name: "Legal & professional" },
      { key: "insurance", name: "Insurance" },
    ],
  },
  {
    key: "business",
    name: "Business",
    kind: "expense",
    leaves: [
      { key: "accountant", name: "Accountant" },
      { key: "business-services", name: "Business services" },
      { key: "zus-business-tax", name: "ZUS & business tax" },
      { key: "business-other", name: "Business other" },
    ],
  },
  {
    key: "debt-giving",
    name: "Debt & giving",
    kind: "expense",
    leaves: [
      // Receivables sit outside net worth (§6.6), so lending is a real
      // outgoing. Paired with `Borrowed` so "how much did I lend this year"
      // stays separable from "how much came back".
      { key: "lent-out", name: "Lent out", note: "money you expect back" },
      { key: "repayment-made", name: "Repayment made" },
      { key: "charity", name: "Charity" },
    ],
  },
];

/**
 * A queue, not a destination — it should visibly shrink. Naming it `Other`
 * made it feel like a valid answer, which is how 194 rows ended up there.
 */
export const topLevelLeaves = [
  { key: "uncategorized", name: "Uncategorized", kind: "expense" as const },
];
