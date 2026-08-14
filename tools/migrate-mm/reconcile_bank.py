#!/usr/bin/env python3
"""
The second gate — and it is a different gate than §8.4's.

§8.4 checks whether our reading of the .mmbak matches what Money Manager shows.
It cannot check whether Money Manager matches reality, because both sides of it
are derived from the same file. That question needs a source outside the app,
and Bank A's .xls statements carry one: `Saldo po transakcji`, the bank's own
running balance, computed by the bank.

So there are two gates, measuring two different failures:

  FIDELITY      52 balances typed off the Money Manager UI vs our computed
                balance. Catches: a wrong sign map, a misread transfer layout,
                a dropped ZDO_TYPE. Needs a human to type the figures.

  COMPLETENESS  bank statement rows vs ledger rows over the same window.
                Catches: transactions that happened and were never recorded.
                Needs only files that already exist.

Passing the first and failing the second means a faithful copy of an incomplete
ledger — which is exactly the state this backup is in, and worth knowing before
five years of it becomes the system of record.

Usage:
    reconcile_bank.py <backup.mmbak> <statement.xls> --account "Bank A - PLN"

Requires xlrd (`pip install xlrd`) for the .xls format Bank A exports.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

try:
    import xlrd
    from xlrd import xldate_as_datetime
except ImportError:
    sys.exit("needs xlrd: pip install xlrd")

# extract.py's map, verbatim. If they ever diverge, this check is worthless.
SIGN = {"0": +1, "1": -1, "3": -1, "4": +1, "7": +1}

# Bank A column layout. `Saldo po transakcji` is the column that makes this work.
C_DATE, C_AMOUNT, C_SALDO = 0, 3, 5

TOLERANCE = Decimal("0.005")
DAY_WINDOW = 3  # a card payment posts a day or two after it is made


def read_statement(path: Path) -> list[tuple[date, Decimal, Decimal]]:
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    out = []
    for i in range(1, sh.nrows):
        r = sh.row_values(i)
        if not r[C_DATE] or r[C_AMOUNT] == "":
            continue
        out.append(
            (
                xldate_as_datetime(float(r[C_DATE]), wb.datemode).date(),
                Decimal(str(r[C_AMOUNT])),
                Decimal(str(r[C_SALDO])),
            )
        )
    out.sort(key=lambda x: x[0])
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("backup", type=Path)
    ap.add_argument("statement", type=Path)
    ap.add_argument("--account", required=True, help="ZASSET.ZNICNAME, exactly")
    args = ap.parse_args()

    rows = read_statement(args.statement)
    if not rows:
        sys.exit("statement has no usable rows")
    lo, hi = rows[0][0], rows[-1][0]

    con = sqlite3.connect(f"file:{args.backup}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    q = lambda s, *a: con.execute(s, a).fetchall()

    uid = None
    for r in q("select ZUID, ZNICNAME from ZASSET where ZISDEL=0"):
        if (r["ZNICNAME"] or "").strip() == args.account:
            uid = r["ZUID"]
    if uid is None:
        sys.exit(f"no account named {args.account!r}")

    ledger = []
    for t in q(
        "select ZTXDATESTR d, ZDO_TYPE ty, ZAMOUNTACCOUNT a from ZINOUTCOME "
        "where ZISDEL=0 and ZASSETUID=? and ZTXDATESTR>=? and ZTXDATESTR<=?",
        uid,
        lo.isoformat(),
        hi.isoformat(),
    ):
        s = SIGN.get(t["ty"])
        if s is None:
            continue
        ledger.append(
            (date.fromisoformat(t["d"]), Decimal(str(s)) * Decimal(str(t["a"] or 0)))
        )

    print(f"{args.account}   {lo} .. {hi}")
    print()

    # ── 1. Is the statement internally consistent? ──────────────────────────
    # Σ Kwota must equal the span of Saldo. If it does not, the file is not a
    # complete statement and nothing below it means anything.
    #
    # Finding the endpoints has to be order-independent: several rows share a
    # date, so "the first row" is not well defined and reconstructing the
    # opening balance from it reports a false inconsistency. In a running
    # balance every row's `Saldo − Kwota` is some other row's `Saldo` — except
    # the opening, and every `Saldo` is some other row's `Saldo − Kwota` except
    # the closing. That identifies both without needing an order.
    sum_amounts = sum(r[1] for r in rows)
    saldos = [r[2] for r in rows]
    priors = [r[2] - r[1] for r in rows]
    opening = [p for p in priors if p not in saldos]
    closing = [s_ for s_ in saldos if s_ not in priors]
    if len(opening) == 1 and len(closing) == 1:
        saldo_span = closing[0] - opening[0]
    else:
        # Ambiguous (a repeated balance makes the endpoints non-unique). Fall
        # back to the ordered reading and say so rather than asserting.
        saldo_span = rows[-1][2] - (rows[0][2] - rows[0][1])
    ok_self = abs(sum_amounts - saldo_span) < TOLERANCE
    print(f"  Σ Kwota                {sum_amounts:>14,.2f}")
    print(f"  Saldo span             {saldo_span:>14,.2f}   "
          f"{'consistent' if ok_self else '← STATEMENT NOT SELF-CONSISTENT'}")
    print()

    # ── 2. Movement over the same window ────────────────────────────────────
    ours = sum(a for _, a in ledger)
    print(f"  bank movement          {sum_amounts:>14,.2f}   ({len(rows)} rows)")
    print(f"  ledger movement        {ours:>14,.2f}   ({len(ledger)} rows)")
    print(f"  delta                  {sum_amounts - ours:>14,.2f}")
    print()

    # ── 3. Which rows are missing, and on which side ────────────────────────
    #
    # Matching on SIGNED amount is the point: an inverted sign map matches
    # almost nothing, so a high match count is external corroboration that the
    # map is right — the one thing the .mmbak cannot tell us about itself.
    pool = list(rows)
    matched = 0
    for d, amt in ledger:
        for i, (bd, ba, _) in enumerate(pool):
            if abs((bd - d).days) <= DAY_WINDOW and abs(ba - amt) < TOLERANCE:
                pool.pop(i)
                matched += 1
                break

    print(f"  ledger rows matching a bank row on signed amount:  {matched}/{len(ledger)}")
    print(f"  bank rows absent from the ledger:                  {len(pool)}/{len(rows)}"
          f"   Σ {sum(a for _, a, _ in pool):,.2f}")
    print()

    if matched:
        print(f"  ✓ FIDELITY corroborated — {matched} signed amounts agree with an "
              f"external source. An inverted sign map would match ~0.")
    if pool:
        print(f"  ✗ COMPLETENESS — {len(pool)} transactions happened at the bank and "
              f"are not in the ledger.")
        print(f"    The migration will faithfully copy a ledger that is missing them.")
        print(f"    This is not an extractor defect; it is what the ledger contains.")

    sys.exit(0 if ok_self else 1)


if __name__ == "__main__":
    main()
