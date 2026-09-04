export type RouteValue = string | string[] | undefined;

export type NewAccountRoute =
  | { valid: true; returnTo: "today"; amount: undefined; accountId: undefined }
  | { valid: true; returnTo: "accounts"; amount: undefined; accountId: undefined }
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
  // S16's empty register — `+ Create account`, with nothing to restore
  // afterward but the register itself.
  if (returnTo === "accounts" && noDraft) {
    return { valid: true, returnTo: "accounts", amount: undefined, accountId: undefined };
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

/** §9.1's third entry point — `FloatingAdd`'s long-press picker names `income` explicitly; anything else defaults on the screen. */
function quickAddType(value: RouteValue): "expense" | "income" | undefined {
  const v = one(value);
  return v === "expense" || v === "income" ? v : undefined;
}

export function parseQuickAddRoute(params: {
  amount?: RouteValue;
  accountId?: RouteValue;
  type?: RouteValue;
}): {
  amount: string;
  accountId: string | undefined;
  type: "expense" | "income" | undefined;
} {
  return {
    amount: one(params.amount) ?? "",
    accountId: one(params.accountId),
    type: quickAddType(params.type),
  };
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
