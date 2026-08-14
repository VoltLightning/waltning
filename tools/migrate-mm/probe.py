#!/usr/bin/env python3
"""
Answer the questions the extractor currently assumes.

`extract.py` computes every account balance from a docstring assertion: that a
transfer is two rows, each referencing its OWN account via ZASSETUID. If that is
wrong — if both legs are written on the source with the destination in
ZTOASSETUID — then every transfer nets to zero on the source, no destination is
ever credited, and all 52 balances are wrong.

The evidence cited for the current reading does not distinguish the two. Worse,
the wrong reading fails *plausibly*: `Clearing · PLN` (636 transfers of 678 rows)
would compute to ~0.00, and SPEC.md §6.4 says a clearing account should trend to
zero. The bug would read as confirmation of the design.

This probe settles it, plus five smaller assumptions the extractor makes
silently. It reads the backup read-only and writes nothing.

Usage:  python3 probe.py <path-to.mmbak>
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from collections import Counter
from pathlib import Path

INCOME, EXPENSE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT = 0, 1, 3, 4, 7


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("backup", type=Path)
    args = ap.parse_args()
    if not args.backup.exists():
        sys.exit(f"no such backup: {args.backup}")

    con = sqlite3.connect(f"file:{args.backup}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    q = lambda s, *a: con.execute(s, a).fetchall()

    fail = []

    # ── 1. ZDO_TYPE affinity ────────────────────────────────────────────────
    # extract.py keys SIGN on strings ("0", "1", …). If Core Data stored an
    # INTEGER, SIGN.get(1) is None and EVERY balance silently computes to 0.00 —
    # while the income query still matches, because SQLite applies numeric
    # affinity to a bound literal against an INTEGER column.
    print("1 · ZDO_TYPE storage class")
    kinds = Counter(r[0] for r in q("select typeof(ZDO_TYPE) from ZINOUTCOME"))
    for k, n in kinds.items():
        print(f"    {k:<8} {n:>6}")
    if "integer" in kinds:
        fail.append(
            "ZDO_TYPE is INTEGER — extract.py's SIGN map is keyed on strings, "
            "so every computed_balance is 0.00. Use SIGN.get(str(...))."
        )
    print()

    # ── 2. Unmapped types ───────────────────────────────────────────────────
    # SIGN.get() returning None is silent by design. Any type the map does not
    # know is dropped from balances with no counter and no warning.
    print("2 · rows by ZDO_TYPE (ZISDEL=0)")
    known = {INCOME, EXPENSE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT}
    total = 0
    for r in q(
        "select ZDO_TYPE t, count(*) n from ZINOUTCOME where ZISDEL=0 group by 1 order by 1"
    ):
        t, n = int(r["t"]), r["n"]
        total += n
        mark = "" if t in known else "   ← UNMAPPED, dropped from balances"
        print(f"    type {t:<3} {n:>6}{mark}")
        if t not in known:
            fail.append(f"ZDO_TYPE {t} ({n} rows) is not in extract.py's SIGN map.")
    print(f"    {'total':<8} {total:>6}")
    print()

    # ── 3. THE ONE THAT MATTERS: transfer leg layout ─────────────────────────
    print("3 · transfer leg layout  ← decides whether every destination balance is right")
    out_n = q("select count(*) c from ZINOUTCOME where ZDO_TYPE=? and ZISDEL=0", TRANSFER_OUT)[0]["c"]
    in_n = q("select count(*) c from ZINOUTCOME where ZDO_TYPE=? and ZISDEL=0", TRANSFER_IN)[0]["c"]
    print(f"    OUT rows {out_n}   IN rows {in_n}   (delta {in_n - out_n})")

    # Reading A: each leg names its OWN account, so an OUT leg's ZTOASSETUID is
    #            the destination and equals the paired IN leg's ZASSETUID.
    # Reading B: both legs sit on the source, so no IN leg is ever written on
    #            the destination and the match rate is ~0%.
    #
    # This is the direct test. An earlier version of this probe asked a weaker
    # question — "do IN and OUT legs share a ZASSETUID?" — and expected ~0%
    # under A. It measured 17.4%, which is neither answer, because two other
    # things produce a shared ZASSETUID: pass-through accounts that receive and
    # send the same amount the same day, and the 173 same-account transfers
    # section 3b explains. A heuristic that three mechanisms can satisfy cannot
    # decide between two readings.
    matched = q(
        """
        select count(*) c
        from ZINOUTCOME o
        where o.ZDO_TYPE = ? and o.ZISDEL = 0
          and exists (
            select 1 from ZINOUTCOME i
            where i.ZDO_TYPE = ? and i.ZISDEL = 0
              and i.ZASSETUID  = o.ZTOASSETUID
              and i.ZTXDATESTR = o.ZTXDATESTR
          )
        """,
        TRANSFER_OUT,
        TRANSFER_IN,
    )[0]["c"]
    pct = 100.0 * matched / out_n if out_n else 0.0
    print("    OUT legs whose ZTOASSETUID is an IN leg's own account, same date:")
    print(f"      {matched} of {out_n}  ({pct:.1f}%)")

    if pct < 95:
        fail.append(
            f"Only {pct:.1f}% of OUT legs pair with an IN leg on the named "
            "destination. Under READING B both legs sit on the SOURCE: transfers "
            "net to zero there and NO destination is ever credited, so every "
            "destination balance from extract.py is wrong. Credit destinations "
            "via ZTOASSETUID on the OUT leg instead."
        )
        print("      ⇒ READING B, or something else. extract.py is NOT safe.")
    else:
        print("      ⇒ READING A confirmed. extract.py's assumption holds.")
    print()

    # ── 3b. Same-account transfers ──────────────────────────────────────────
    # A transfer whose source and destination are the SAME account nets to zero
    # and is invisible in every balance — which is why it survives unnoticed.
    # It is not noise: in this dataset all of them sit on Loan accounts, and
    # §6.6 collapses those into counterparties.
    print("3b · transfers where ZTOASSETUID = ZASSETUID (net-zero, invisible)")
    self_rows = q(
        """
        select coalesce(a.ZNICNAME, '?') n, count(*) c, sum(abs(t.ZAMOUNTACCOUNT)) amt
        from ZINOUTCOME t left join ZASSET a on a.ZUID = t.ZASSETUID
        where t.ZDO_TYPE = ? and t.ZISDEL = 0 and t.ZTOASSETUID = t.ZASSETUID
        group by 1 order by c desc
        """,
        TRANSFER_OUT,
    )
    n_self = sum(r["c"] for r in self_rows)
    if n_self:
        for r in self_rows:
            print(f"      {(r['n'] or '').strip():<28} {r['c']:>4} rows  {r['amt']:>12,.2f}")
        fail.append(
            f"{n_self} transfers have the same source and destination. They net "
            "to zero, so no balance check can see them, and in this backup every "
            "one is on a Loan account — where §6.6 collapses the account into "
            "counterparties and the person is named only in free text. Migrated "
            "as ordinary transfers they contribute 0 to every counterparty "
            "balance and the reassignment is lost. Needs an explicit decision."
        )
    else:
        print("      none")
    print()

    # ── 4. Shared account ───────────────────────────────────────────────────
    # extract.py hardcodes `name.lower() == "family budget"`. TAXONOMY.md §4.1
    # lists Family budget as a CATEGORY; §5 says the shared money is Household.
    print("4 · shared-account detection")
    names = [(r["ZNICNAME"] or "").strip() for r in q("select ZNICNAME from ZASSET where ZISDEL=0")]
    matches = [n for n in names if n.lower() == "family budget"]
    print(f"    accounts matching 'family budget': {len(matches)}")
    if not matches:
        cands = [n for n in names if any(k in n.lower() for k in ("household", "family", "joint"))]
        print(f"    candidates by keyword: {cands or 'none'}")
        fail.append(
            "No account matches 'family budget', so every account imports as "
            "ownership='own'. §6.7 migrates as a no-op and DualTotal prints the "
            "same figure twice. Take the shared set as an explicit input."
        )
    print()

    # ── 5. Currencies ───────────────────────────────────────────────────────
    print("5 · currencies referenced by active accounts")
    seeded = {"USD", "PLN", "EUR", "BYN", "GEL", "GBP", "RUB"}
    ccy = {r["ZUID"]: r["ZISO"] for r in q("select ZUID, ZISO from ZCURRENCY")}
    used = Counter(ccy.get(r["ZCURRENCYUID"]) for r in q("select ZCURRENCYUID from ZASSET where ZISDEL=0"))
    for code, n in sorted(used.items(), key=lambda x: -x[1]):
        norm = (code or "").strip().upper()
        mark = "" if norm in seeded else "   ← NOT SEEDED: account and all its income would be skipped"
        print(f"    {str(code):<8} {n:>3} accounts{mark}")
        if norm not in seeded:
            fail.append(f"Currency {code!r} is on {n} account(s) and is not in the seed.")
    print()

    # ── 6. Negative income ──────────────────────────────────────────────────
    # import.ts does .abs(), and the opening-balance plug absorbs the swing — so
    # the balance reconciles while earnings are wrong by twice the amount.
    print("6 · negative income rows")
    neg = q(
        "select count(*) c, coalesce(sum(ZAMOUNTACCOUNT),0) s from ZINOUTCOME "
        "where ZDO_TYPE=? and ZISDEL=0 and ZAMOUNTACCOUNT < 0",
        INCOME,
    )[0]
    print(f"    {neg['c']} rows, total {neg['s']:.2f}")
    if neg["c"]:
        fail.append(
            f"{neg['c']} income rows are negative. import.ts .abs()es them, so "
            "earnings are wrong by 2x each while the balance still reconciles."
        )
    print()

    # ── 7. Income categories vs INCOME_MAP ──────────────────────────────────
    print("7 · income category heads vs INCOME_MAP")
    mapped = {"Salary", "Bonus", "Gift", "Debt", "My debt", "Other", "Petty cash",
              "Base saving", "Allowance"}
    cats = {r["ZUID"]: (r["ZNAME"], r["ZPUID"]) for r in q("select ZUID, ZNAME, ZPUID from ZCATEGORY")}

    def head(uid):
        row = cats.get(uid)
        if not row:
            return ""
        name, parent = row
        return (cats[parent][0].strip() if parent and parent in cats else name.strip())

    heads = Counter(head(r["ZCATEGORYUID"]) for r in q(
        "select ZCATEGORYUID from ZINOUTCOME where ZDO_TYPE=? and ZISDEL=0", INCOME))
    for h, n in sorted(heads.items(), key=lambda x: -x[1]):
        mark = "" if h in mapped else "   ← UNMAPPED: rows skipped, absorbed into opening balance"
        print(f"    {h or '(none)':<20} {n:>4}{mark}")
        if h not in mapped:
            fail.append(f"Income head {h!r} ({n} rows) is not in INCOME_MAP.")
    print()

    # ── verdict ─────────────────────────────────────────────────────────────
    print("=" * 66)
    if fail:
        print(f"{len(fail)} BLOCKING finding(s) — do not migrate:\n")
        for i, f in enumerate(fail, 1):
            print(f"  {i}. {f}\n")
        sys.exit(1)
    print("All probed assumptions hold. extract.py may be trusted on this backup.")


if __name__ == "__main__":
    main()
