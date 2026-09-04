/**
 * Proves: screens/S15-counterparty-editor.md §6 ("Error" — an exact name
 * collision is "refused by the unique index on `lower(btrim(name))`, stated
 * on the field") and §9's first open question ("Decided: trigram
 * similarity… Normalized equality was rejected as close to decorative: the
 * unique index already refuses `anna` and `Nina `"). The brief cites
 * "SPEC.md §9" — SPEC.md's own §9 is "Statement ingestion", an unrelated
 * section; §6.6 "Counterparties and debt" names the entity but states no
 * fold rule of its own. The fold itself — `lower(trim(name))`, case- but
 * (on SQLite) not diacritic-insensitive — lives only in
 * `packages/schema/src/counterparties.sqlite.ts` and the executor it backs
 * (`create-counterparty.executor.ts`), not in a numbered spec heading.
 * Findings: R2 C1, R2 H1-r3 (NFD), R2 M3 (archived name is free), R2 M1-r4
 * (trim set).
 */
import type { Id } from "@waltning/core/id";
import { describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { openJourney, outboxEntries } from "./harness.ts";
import { ID } from "./seed.ts";

function setup() {
  return openJourney();
}

/** Every counterparty row on the replica — the table this whole file guards. */
function counterpartyRows(j: ReturnType<typeof openJourney>) {
  return j.raw().replica.db.select().from(ledgerSchema.counterparties).all();
}

/**
 * A refused create still commits its outbox entry — §14.1's "intent commits
 * first" runs before `apply` ever sees the collision. `write.ts` never marks
 * that entry `blocked`: only `recover.ts`'s replay does that, on a later
 * launch this journey never triggers (`openJourney` never relaunches here).
 * So the entry a refusal leaves behind reads `pending` with `blockedKind`
 * still `null` — the insert's own default, never overridden — not the
 * `blocked` a reader might guess from `capture-deferred.journey.test.ts`'s
 * unrelated (genuinely deferred) case.
 */
function assertRefused(
  j: ReturnType<typeof openJourney>,
  before: number,
  cpBId: Id<"counterparties">,
) {
  const rows = counterpartyRows(j);
  expect(rows.some((r) => r.id === cpBId)).toBe(false);

  const entries = outboxEntries(j);
  expect(entries).toHaveLength(before + 1);
  const last = entries.at(-1);
  expect(last?.state).toBe("pending");
  expect(last?.blockedKind).toBeNull();
}

describe("create_counterparty — S15 §6's folded-name guard", () => {
  it.fails("R2 C1 — SQLite's ASCII-only lower() lets a Polish diacritic case pair (Ł/ł) through the folded-name guard", () => {
    const j = setup();
    try {
      j.session.createCounterparty(
        {
          id: ID.cpA,
          name: "Łukasz Placeholder",
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );
      expect(() =>
        j.session.createCounterparty(
          {
            id: ID.cpB,
            name: "łukasz placeholder",
            kind: "person",
            settlementCurrency: null,
            contact: null,
            note: "",
          },
          j.capture,
        ),
      ).toThrow();
      assertRefused(j, 1, ID.cpB);
    } finally {
      j.close();
    }
  });

  it.fails("R2 H1-r3 — an NFD-normalised spelling of a name collides with its NFC form only in a person's head, not in lower(trim())", () => {
    const j = setup();
    try {
      const nfc = "Józef Placeholder";
      const nfd = nfc.normalize("NFD");
      expect(nfd).not.toBe(nfc); // the two literals really are different code points

      j.session.createCounterparty(
        {
          id: ID.cpA,
          name: nfc,
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );
      expect(() =>
        j.session.createCounterparty(
          {
            id: ID.cpB,
            name: nfd,
            kind: "person",
            settlementCurrency: null,
            contact: null,
            note: "",
          },
          j.capture,
        ),
      ).toThrow();
      assertRefused(j, 1, ID.cpB);
    } finally {
      j.close();
    }
  });

  it("refuses a plain ASCII case collision", () => {
    const j = setup();
    try {
      j.session.createCounterparty(
        {
          id: ID.cpA,
          name: "Anna Placeholder",
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );
      expect(() =>
        j.session.createCounterparty(
          {
            id: ID.cpB,
            name: "anna placeholder",
            kind: "person",
            settlementCurrency: null,
            contact: null,
            note: "",
          },
          j.capture,
        ),
      ).toThrow();
      assertRefused(j, 1, ID.cpB);
    } finally {
      j.close();
    }
  });

  it.fails("R2 M3 — archiving a counterparty does not free its name for reuse, though S15 §9's whole point of an archived (never deleted) loser is that it can safely be superseded", () => {
    const j = setup();
    try {
      const created = j.session.createCounterparty(
        {
          id: ID.cpA,
          name: "Anna Placeholder",
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );
      j.session.updateCounterparty(
        { id: ID.cpA, version: created.version, patch: { archived: true } },
        j.capture,
      );

      expect(() =>
        j.session.createCounterparty(
          {
            id: ID.cpB,
            name: "Anna Placeholder",
            kind: "person",
            settlementCurrency: null,
            contact: null,
            note: "",
          },
          j.capture,
        ),
      ).not.toThrow();

      const rows = counterpartyRows(j);
      expect(rows.find((r) => r.id === ID.cpB)?.name).toBe("Anna Placeholder");
    } finally {
      j.close();
    }
  });

  it("accepts two names that merely end in the same letter", () => {
    const j = setup();
    try {
      j.session.createCounterparty(
        {
          id: ID.cpA,
          name: "Ivanov",
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );
      expect(() =>
        j.session.createCounterparty(
          {
            id: ID.cpB,
            name: "Lev",
            kind: "person",
            settlementCurrency: null,
            contact: null,
            note: "",
          },
          j.capture,
        ),
      ).not.toThrow();

      const rows = counterpartyRows(j);
      expect(rows.map((r) => r.name).sort()).toEqual(["Ivanov", "Lev"]);
    } finally {
      j.close();
    }
  });

  it("refuses a name that differs only by the whitespace the executor already trims", () => {
    const j = setup();
    try {
      const created = j.session.createCounterparty(
        {
          id: ID.cpA,
          name: "Name\t",
          kind: "person",
          settlementCurrency: null,
          contact: null,
          note: "",
        },
        j.capture,
      );
      expect(created.name).toBe("Name"); // `createCounterpartyInput`'s `z.string().trim()` ran first

      expect(() =>
        j.session.createCounterparty(
          {
            id: ID.cpB,
            name: "Name",
            kind: "person",
            settlementCurrency: null,
            contact: null,
            note: "",
          },
          j.capture,
        ),
      ).toThrow();
      assertRefused(j, 1, ID.cpB);
    } finally {
      j.close();
    }
  });
});
