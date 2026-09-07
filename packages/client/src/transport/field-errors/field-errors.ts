/**
 * `mapFieldErrors` — the client half of the transport contract.
 *
 * The server's `fieldErrorsOf` (`apps/api/src/trpc/index.ts`) and the phone
 * controller's Zod refusals both produce `{path, message}[]`, dotted and
 * index-carrying (`lines.2.amount`). A form does not know every path a
 * response might name — a nested line item, a future field — so matching is
 * **the whole dotted path, never the last segment**: `amount` on the form and
 * `lines.2.amount` on the wire are different questions, and answering one
 * with the other would put someone else's error on your field.
 *
 * A path the form does not know about still has to land somewhere, or a
 * refusal a person cannot see is a refusal that never happened. It surfaces
 * at form level instead of vanishing.
 *
 * **An empty path is not an unknown one.** `""` is how a caller states a
 * refusal that names no field at all — S09's stale-version and lines-sum
 * refusals are exactly this, the whole row is stale or the whole set does
 * not sum, never one field of it — so it prints bare, the message alone.
 * A real unknown path (`lines.2.amount` when the form only knows `amount`)
 * still gets the `path: message` prefix, because *that* case is a form
 * genuinely missing context a reader benefits from seeing.
 */

import { ZodError } from "zod";

export type FieldError = {
  path: string;
  message: string;
  /**
   * A catalogue key, when one exists — set only by a caller that cannot call
   * `useT()` itself (the phone controller is `packages/client`, not a
   * component). A form resolves this first, falling back to `message` when it
   * is absent: today that is every Zod issue, whose text is an English
   * literal by construction (`architecture/12` — that is the spec's problem,
   * not this contract's).
   */
  messageKey?: string;
  /** Interpolation values for `messageKey`, when it takes any. */
  params?: Record<string, string>;
};

export type FieldErrorMap = {
  byField: Readonly<Record<string, readonly string[]>>;
  formLevel: readonly string[];
};

/**
 * `errors` onto `knownPaths` — matched whole, never by the last segment.
 *
 * Several messages on one field collect in arrival order, which is also the
 * order the server or the controller produced them in; nothing here
 * reorders or dedupes them.
 */
export function mapFieldErrors(
  errors: readonly FieldError[],
  knownPaths: readonly string[],
): FieldErrorMap {
  const known = new Set(knownPaths);
  const byField: Record<string, string[]> = {};
  const formLevel: string[] = [];

  for (const error of errors) {
    if (known.has(error.path)) {
      const messages = byField[error.path];
      if (messages) messages.push(error.message);
      else byField[error.path] = [error.message];
    } else {
      formLevel.push(error.path === "" ? error.message : `${error.path}: ${error.message}`);
    }
  }

  return { byField, formLevel };
}

/**
 * A `ZodError`'s issues, as dotted `FieldError`s — or `null` for anything
 * else, so a caller can tell "this was a validation refusal" from "this was
 * not" without inspecting the error itself.
 *
 * Indices survive the join: `lines.2.amount` is a real path here, matching
 * the server's `fieldErrorsOf`.
 */
export function fieldErrorsFromZod(error: unknown): readonly FieldError[] | null {
  if (!(error instanceof ZodError)) return null;
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return {
      path,
      message: issue.message,
      ...(isCalendarDateIssue(path, issue.code) ? { messageKey: "transactions.badDate" } : {}),
    };
  });
}

/**
 * L-b — `zAccountingDate`'s calendar refusal, and only that one, given a
 * catalogue key.
 *
 * Every other issue keeps Zod's English literal, which the `messageKey` doc
 * above records as the spec's problem rather than this contract's. This one
 * is different because of *where a date is typed*: the command bar's input is
 * free text, so `2026-02-31` is a line a person will actually send, and a
 * refusal in a language they do not read is a refusal they cannot act on.
 *
 * Matched on the issue's own `code`, never on its message text. `zod.ts`
 * builds `zAccountingDate` as a shape `regex` followed by a `refine`, so the
 * calendar half is the `custom`-coded issue and the shape half is not — a
 * distinction the string would only tell us about by being compared to a
 * literal copied out of another package.
 */
function isCalendarDateIssue(path: string, code: string): boolean {
  return path === "date" && code === "custom";
}
