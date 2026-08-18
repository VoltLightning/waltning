# 12 · Forms and validation

**Every form validates twice, and only the second one counts.**

The client validates before it submits, because a round trip to say "that is not
a number" is a bad experience. The server validates again and returns field
errors, because the client is not the only thing that calls an operation — the
agent does (§11.0), the outbox does after an arbitrary delay
(`architecture/08`), and a future client will. Client-side validation is a
courtesy extended to the person typing. It is never a guarantee, and no
guarantee may rest on it.

This is a general convention. S33 is its first case; it is not about S33.

## 12.1 What exists today, and why it cannot do this

Three findings, from reading the code rather than the spec.

**The envelope can carry exactly one field error.** `ErrorDetails.field?: string`
is singular. A form with two bad fields can report one of them, and the person
fixes it, submits, and discovers the second. Forms need a map.

**Field errors are produced twice and read nowhere.**
`counterparties.service.ts` sets `field: "name"` on a duplicate name and
`idempotency.ts` sets `field: "entryId"` on a reused entry id — and **no reader
of `details.field` exists anywhere** in `apps/` or `packages/`. Two services
carefully name the field at fault and the information is thrown away at the
other end.

Zod fares worse: a schema failure inside a registry operation becomes a bare
`validation` with the ZodError discarded before it reaches the envelope, so the
one place that knows every bad field names none of them.

A write-only field is the same vacuous shape as a test that scans a deleted
directory. It is worse in one way — it reads as though the plumbing exists, so
the next person to want a field error assumes they are consuming something
rather than building it.

**A body that never parsed is reported as a permanent input error.**
`mapTrpcCode` maps `BAD_REQUEST` to `validation`, which `errors.ts` documents as
*"Input failed its Zod schema. Never retry unchanged."*

The label is not the one you would guess. A truncated body arrives as
**`BAD_REQUEST` carrying a `SyntaxError`**, not as `PARSE_ERROR` — nothing
reaches `PARSE_ERROR` on this path at all. A first attempt at this fix keyed on
`PARSE_ERROR`, typechecked, passed, and changed nothing; the probe against the
running app is what said so. **The code cannot discriminate here**, because one
code covers both meanings.

That last one is a data-loss bug waiting for its consumer. A write leaves the
phone, the connection drops mid-body, the server receives truncated JSON and
answers `PARSE_ERROR`. The client reads `validation`, concludes the input is
permanently wrong, and drops the write. Nothing about the input was wrong; the
bytes did not all arrive. It is not live — the outbox drain does not exist yet,
only files that mention it — so this is a trap set for whoever builds it, and
defusing it now costs one `case` label.

## 12.2 The contract

**Schema failures are 422. Malformed bodies are not schema failures — and the
cause is what tells them apart.**

```
BAD_REQUEST + ZodError cause   → validation  422    values failed the schema
BAD_REQUEST, any other cause   → internal    500    the body never parsed
PARSE_ERROR                    → internal    500    (unreached in practice)
```

A `ZodError` cause is the only *positive* evidence that the body parsed and the
values were wrong. Everything else is an absence of evidence, and absence of
evidence must not be classified as a permanent refusal — that is the direction
that loses writes.

422 then means exactly one thing: *your request was well-formed and your values
were not.* That is the only condition under which field errors can exist, since
there are no fields to name in a body that did not parse.

`internal` is the existing retryable bucket and needs no new vocabulary in the
drain's switch. It understates the case slightly — a truncated body means the
operation never ran, so a retry is safe whether or not the write is idempotent,
which is stronger than `internal` promises. A dedicated `malformed` code would
say that precisely, at the cost of a contract change every consumer must learn.
Open, and deliberately deferred until the drain exists to have an opinion.

**The cost of being wrong in this direction is bounded, and that is the
argument.** A genuinely malformed request — a client bug rather than a dropped
connection — now retries against its budget and ends `stalled`, which
`architecture/08` makes visible on S30. Visible and bounded beats silently
discarded; the reverse mistake has no such floor.

**Field errors are a list, not a map.**

```ts
/**
 * Field-level validation failures, for `validation` only.
 *
 * A list rather than `Record<string, string>` because two issues on one field
 * is ordinary — "required" and "must be a positive amount" — and a record
 * silently keeps the last one. `path` is dotted and may index: Zod's issue
 * paths are `(string | number)[]`, and `set_transaction_lines` really does
 * produce `lines.2.amount`.
 */
fieldErrors?: readonly { path: string; message: string }[];
```

**Named `fieldErrors`, not `fields`.** `ErrorDetails.fields` is taken — §11.2
uses it for the tax-sensitive fields an approval card must show. Two different
meanings under one key on one type is how a client renders an approval card's
field list as validation errors.

The singular `field` is removed rather than kept beside it. Nothing reads it, so
nothing breaks, and leaving both would leave the question of which one is
authoritative to whoever writes the next consumer.

**The server produces them from the schema it already has.** The registry
validates every operation's input with Zod (§11.0). On failure it maps
`ZodError.issues` to `fieldErrors` — same schema, same paths, no second
description of what a valid input is. A hand-written validator beside the schema
would be a second source of truth about the same shape, and the one nobody is
looking at is always the stale one.

**Service-level refusals use the same channel.** Not every rule is expressible
in Zod — "this provider has no key" is a fact about the environment, not about
the input. A service check that refuses raises `validation` with a
`fieldErrors` entry naming the field the person can actually act on. The form
does not care which layer decided.

## 12.3 What a form does with them

1. Validate locally. If it fails, do not submit — nothing has left the device.
2. Submit. On success, done.
3. On `validation`, translate `fieldErrors` by `path` onto the form's fields and
   render each message against its input. Anything with no matching field —
   because the server knows a rule the form does not — renders at form level
   rather than being dropped.
4. On any other code, it is not a form problem. `approval_required` renders an
   approval card (§11.2); a transport failure is `architecture/09`'s business.

**An unmatched path is displayed, never swallowed.** A server that refused for a
reason the form cannot place must still say so, or the person presses save,
nothing happens, and nothing explains why. That silence is the worst outcome
this document exists to prevent.

## 12.4 The unit of submission is the unit of validation

A form validates what it submits and nothing else. If a screen holds several
independently-saveable things — S33's five assists, each its own row — then each
is its own form, and saving one never fails because another is misconfigured.

This is not a preference. A screen-wide submit over independent rows means one
bad row freezes every good one, and the moment that matters is a key rotation,
when several rows go bad at once and you are forced to repair all of them before
any repair lands.

**Ambient state is not a validation error.** A form reports what happened when
you pressed save. What is merely *true* — a provider whose key was revoked last
week, a rate that is stale — is a banner, and it persists whether or not you are
editing anything. A screen that renders standing facts in the error style is
shouting on arrival; one that renders a refusal as a banner is not telling you
your save failed.

## 12.5 What this must not become

- **Not a validation framework.** Zod is the schema language; this document
  describes how its failures reach a field. Anything that starts generating
  forms from schemas is a different decision and needs its own argument.
- **Not client-authoritative.** The client's validation may be a strict subset,
  a superset, or absent. The server's answer is the one that decides, and a rule
  that exists only on the client is not a rule.
- **Not a reason to weaken Postgres.** "Routers dumb, services compute, Postgres
  enforces" is unchanged. A field error is a good message about a refusal; the
  constraint is what makes the refusal true when the code is wrong.
