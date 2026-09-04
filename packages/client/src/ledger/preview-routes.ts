export type RouteValue = string | string[] | undefined;

export type NewAccountRoute =
  | { valid: true; returnTo: "today"; amount: undefined; accountId: undefined }
  | { valid: true; returnTo: "quick-add"; amount: string; accountId: string | undefined }
  | { valid: false; message: string };

function one(value: RouteValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function decimalDraft(value: string): boolean {
  return value === "" || /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value);
}

export function parseNewAccountRoute(params: {
  returnTo?: RouteValue;
  amount?: RouteValue;
  accountId?: RouteValue;
}): NewAccountRoute {
  const returnTo = one(params.returnTo);
  const noDraft = params.amount === undefined && params.accountId === undefined;
  if ((params.returnTo === undefined || returnTo === "today") && noDraft) {
    return { valid: true, returnTo: "today", amount: undefined, accountId: undefined };
  }
  if (returnTo === "quick-add") {
    const amount = one(params.amount);
    const accountId = one(params.accountId);
    const accountIdValid = params.accountId === undefined || accountId !== undefined;
    if (amount !== undefined && decimalDraft(amount) && accountIdValid) {
      return { valid: true, returnTo, amount, accountId };
    }
  }
  return { valid: false, message: "Could not restore the expense draft." };
}

export function parseQuickAddRoute(params: { amount?: RouteValue; accountId?: RouteValue }): {
  amount: string;
  accountId: string | undefined;
} {
  return { amount: one(params.amount) ?? "", accountId: one(params.accountId) };
}

/**
 * `/transaction/[id]` (C5, S09) — a dynamic segment expo-router hands the
 * screen as `string | string[]`, same as every other param here. `undefined`
 * means the route mounted with nothing to show, which the screen treats the
 * same as a row it could not find.
 */
export function parseTransactionRoute(params: { id?: RouteValue }): string | undefined {
  return one(params.id);
}
