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

    # Reading A: each leg names its own account, so an IN leg's ZASSETUID is the
    #            destination and differs from its paired OUT leg's ZASSETUID.
    # Reading B: both legs are written on the source, so the IN leg's ZASSETUID
    #            EQUALS an OUT leg's ZASSETUID for the same amount and date.
    paired_same_account = q(
        """
        select count(*) c
        from ZINOUTCOME i
        where i.ZDO_TYPE = ? and i.ZISDEL = 0
          and exists (
            select 1 from ZINOUTCOME o
            where o.ZDO_TYPE = ? and o.ZISDEL = 0
              and o.ZASSETUID = i.ZASSETUID
              and o.ZTXDATESTR = i.ZTXDATESTR
              and abs(coalesce(o.ZAMOUNTACCOUNT,0) - coalesce(i.ZAMOUNTACCOUNT,0)) < 0.005
          )
        """,
        TRANSFER_IN,
        TRANSFER_OUT,
    )[0]["c"]
    pct = 100.0 * paired_same_account / in_n if in_n else 0.0
    print(f"    IN legs sharing ZASSETUID with a same-date same-amount OUT leg:")
    print(f"      {paired_same_account} of {in_n}  ({pct:.1f}%)")

    if pct > 50:
        fail.append(
            "READING B — both legs sit on the SOURCE account. Transfers net to "
            "zero on the source and NO destination is ever credited. Every "
            "destination balance from extract.py is wrong. Credit destinations "
            "via ZTOASSETUID on the OUT leg instead."
        )
        print("      ⇒ READING B. extract.py is wrong.")
    else:
        print("      ⇒ READING A. extract.py's assumption holds.")

    # Corroboration: a receive-only account computing to 0.00 proves B.
    print()
    print("    corroboration — accounts whose ONLY activity is transfer-in:")
    rows = q(
        """
        select a.ZNICNAME name,
               sum(case when t.ZDO_TYPE=? then 1 else 0 end) ins,
               count(*) total
        from ZASSET a join ZINOUTCOME t on t.ZASSETUID = a.ZUID
        where a.ZISDEL=0 and t.ZISDEL=0
        group by a.ZUID having ins = total and total > 0
        limit 5
        """,
        TRANSFER_IN,
    )
    if rows:
        for r in rows:
            print(f"      {(r['name'] or '').strip():<28} {r['total']} rows, all transfer-in")
        print("      (under reading B these accounts hold no rows at all)")
    else:
        print("      none found — inconclusive on its own")
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
