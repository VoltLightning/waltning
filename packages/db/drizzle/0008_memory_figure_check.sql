-- The memory guard rejected behaviour along with facts.
--
-- §11.6 says agent memory holds behaviour, never facts: the ledger is queryable
-- and a stored figure would drift from it — the same defect §6.6 removed by
-- deriving balances instead of storing them. `0004` enforced that with
-- `body !~ '[0-9]{2,}'`, which is the right instinct and the wrong predicate.
--
-- It rejects, correctly:
--     Rent is 4500 PLN                              ← a fact that will drift
--     My salary is 12000
--     Marek owes me 180 zł
--
-- And it also rejects, wrongly:
--     Split group dinners 50/50 with Marek           ← a ratio
--     Treat anything from Zabka after 22:00 …       ← a clock time
--     Round cash expenses to the nearest 10         ← a rounding unit
--
-- Every one of those is behaviour. None duplicates a ledger figure, none can
-- drift, and all three are exactly what this feature exists to learn. A guard
-- that blocks the feature's main use case with a constraint violation nobody
-- can read is worse than a slightly loose one — especially here, where the
-- write is the one documented exception to the approval gate and the failure
-- surfaces mid-conversation.
--
-- The thing actually worth refusing is a LEDGER FIGURE: a number carrying a
-- currency, a number long enough to be an amount or an account, or a
-- two-decimal quantity. Ratios, times and small counts are none of those.
ALTER TABLE "agent_memory" DROP CONSTRAINT "agent_memory_no_figures";--> statement-breakpoint

ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_no_figures" CHECK (
  "body" !~ '(?i)([0-9][0-9  ]*([.,][0-9]{2})?\s*(pln|usd|eur|byn|gel|rub|gbp|zł|zl|\$|€|₾|₽|£))|((pln|usd|eur|byn|gel|rub|gbp|zł|zl|\$|€|₾|₽|£)\s*[0-9])|([0-9]{4,})|([0-9]+[.,][0-9]{2}\M)'
);--> statement-breakpoint

-- Worth stating plainly: this is a guard, not a proof. A determined sentence
-- can still smuggle a fact past it ("rent went up by a third"). The CHECK stops
-- the mechanical failure — a number copied out of the ledger into a prompt
-- prefix, where it silently goes stale — and S32 is what covers the rest, by
-- keeping every memory listed, editable and deletable. Defence in depth, with
-- the cheap layer doing the mechanical part.
COMMENT ON CONSTRAINT "agent_memory_no_figures" ON "agent_memory" IS
  'Behaviour, never facts (SPEC.md §11.6). Refuses currency-adjacent numbers, '
  '4+ digit runs and 2dp quantities. Deliberately permits ratios (50/50), clock '
  'times (22:00) and small counts, which are behaviour and cannot drift.';
