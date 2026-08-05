#!/usr/bin/env python3
"""
Money Manager (.mmbak) → JSON.

Extracts only what SPEC.md §8.0 calls for: the taxonomy of accounts, computed
balances, income rows, and recurring rules. Expenses and transfers stay behind;
they can be imported later through the same idempotent path.

Balances are NOT stored by Money Manager — ZLEFTMONEY is zero on every account —
so they are computed by signing each transaction leg once. Transfers already
exist as two rows (type 3 out, type 4 in), each referencing its own account, so
summing by ZASSETUID with a per-type sign is complete. Adding ZTOASSETUID on top
double-counts, which is the mistake that produced implausible six-figure
balances on the first attempt.

Usage:  python3 extract.py <path-to.mmbak> [-o out.json]
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

# ZDO_TYPE → effect on the account the row references.
SIGN = {"0": +1, "1": -1, "3": -1, "4": +1, "7": +1}
INCOME, EXPENSE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT = "0", "1", "3", "4", "7"


def connect(path: Path) -> sqlite3.Connection:
    if not path.exists():
        sys.exit(f"no such backup: {path}")
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def account_kind(name: str, group: str) -> str:
    """
    ZTYPE is 0 on all 68 accounts, so the real taxonomy lives in the group name
    and the account-name convention (SPEC.md §6.3).
    """
    n, g = name.lower(), (group or "").lower()
    if "loan" in g or name.lower().startswith("loan"):
        if "(distributed)" in n:
            return "clearing"
        if "(my)" in n:
            return "loan_payable"
        return "loan_receivable"
    if "cash" in g:
        return "cash"
    if "card" in g:
        return "card"
    if "investment" in g:
        return "investment"
    if "deposit" in g:
        return "deposit"
    if "account" in g:
        return "bank"
    return "other"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("backup", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("mm-export.json"))
    args = ap.parse_args()

    con = connect(args.backup)
    q = lambda s, *a: con.execute(s, a).fetchall()

    # ---- currencies: MM keys accounts by a currency UID, not an ISO code ----
    ccy = {r["ZUID"]: r["ZISO"] for r in q("select ZUID, ZISO from ZCURRENCY")}

    # ---- groups ----
    groups = {
        r["ZUID"]: r["ZASSETGROUPNAME"]
        for r in q("select ZUID, ZASSETGROUPNAME from ZASSETGROUP where ZISDEL=0")
    }

    # ---- categories, resolved to a path so mapping can be by name ----
    cats = {
        r["ZUID"]: (r["ZNAME"], r["ZPUID"], r["ZDOTYPE"])
        for r in q("select ZUID, ZNAME, ZPUID, ZDOTYPE from ZCATEGORY")
    }

    def cat_path(uid: str) -> str:
        row = cats.get(uid)
        if not row:
            return ""
        name, parent, _ = row
        if parent and parent in cats:
            return f"{cats[parent][0].strip()} > {name.strip()}"
        return name.strip()

    # ---- balances: sign each leg once ----
    balances: dict[str, float] = defaultdict(float)
    for r in q(
        "select ZASSETUID, ZDO_TYPE, ZAMOUNTACCOUNT from ZINOUTCOME where ZISDEL=0"
    ):
        s = SIGN.get(r["ZDO_TYPE"])
        if s:
            balances[r["ZASSETUID"]] += s * (r["ZAMOUNTACCOUNT"] or 0.0)

    # ---- accounts ----
    accounts = []
    for r in q(
        "select ZUID, ZNICNAME, ZCURRENCYUID, ZGROUPUID, ZMEMO, ZORDER "
        "from ZASSET where ZISDEL=0 order by ZORDER"
    ):
        group = groups.get(r["ZGROUPUID"], "")
        name = (r["ZNICNAME"] or "").strip()
        accounts.append(
            {
                "external_id": r["ZUID"],
                "name": name,
                "currency": ccy.get(r["ZCURRENCYUID"]),
                "group": group,
                "kind": account_kind(name, group),
                # SPEC.md §6.7 — the shared pot. Everything else is own.
                "ownership": "shared" if name.lower() == "family budget" else "own",
                "memo": (r["ZMEMO"] or "").strip(),
                "sort": r["ZORDER"] or 0,
                "computed_balance": round(balances.get(r["ZUID"], 0.0), 8),
            }
        )

    # ---- income rows only ----
    income = []
    for r in q(
        "select ZUID, ZTXDATESTR, ZASSETUID, ZCATEGORYUID, ZAMOUNTACCOUNT, "
        "       ZAMOUNT, ZCONTENT, ZMEMO "
        "from ZINOUTCOME where ZDO_TYPE=? and ZISDEL=0 order by ZTXDATESTR",
        INCOME,
    ):
        income.append(
            {
                "external_id": r["ZUID"],
                "date": r["ZTXDATESTR"],
                "account": r["ZASSETUID"],
                "category_path": cat_path(r["ZCATEGORYUID"]),
                "amount": round(r["ZAMOUNTACCOUNT"] or 0.0, 8),
                "amount_usd": round(r["ZAMOUNT"] or 0.0, 8),
                "payee": (r["ZCONTENT"] or "").strip(),
                "note": (r["ZMEMO"] or "").strip(),
            }
        )

    # ---- recurring rules ----
    recurring = []
    for r in q(
        "select ZUID, ZDOTYPE, ZASSETUID, ZTOASSETUID, ZCATEGORYUID, ZAMOUNTSUB, "
        "       ZCURRENCYUID, ZREPEATTYPE, ZNEXTDATE, ZENDDATE, ZPAYEE, ZMEMO "
        "from ZREPEATTRANSACTION where ZISDEL=0"
    ):
        recurring.append(
            {
                "external_id": r["ZUID"],
                "do_type": r["ZDOTYPE"],
                "account": r["ZASSETUID"],
                "to_account": r["ZTOASSETUID"] or None,
                "category_path": cat_path(r["ZCATEGORYUID"]),
                "amount": r["ZAMOUNTSUB"],
                "currency": ccy.get(r["ZCURRENCYUID"]),
                "repeat_type": r["ZREPEATTYPE"],
                "next_date": r["ZNEXTDATE"],
                "end_date": r["ZENDDATE"],
                "payee": (r["ZPAYEE"] or "").strip(),
                "note": (r["ZMEMO"] or "").strip(),
            }
        )

    # ---- counterparty candidates: names live as free text in loan/clearing rows ----
    loan_uids = {
        a["external_id"]
        for a in accounts
        if a["kind"] in ("loan_receivable", "loan_payable", "clearing")
    }
    names: dict[str, int] = defaultdict(int)
    for r in q(
        "select ZASSETUID, ZCONTENT from ZINOUTCOME where ZISDEL=0 and ZCONTENT<>''"
    ):
        if r["ZASSETUID"] in loan_uids:
            names[r["ZCONTENT"].strip()] += 1

    out = {
        "source": str(args.backup),
        "accounts": accounts,
        "income": income,
        "recurring": recurring,
        # Proposals only — never written without review (SPEC.md §6.6).
        "counterparty_candidates": sorted(
            ({"text": k, "count": v} for k, v in names.items()),
            key=lambda x: -x["count"],
        )[:80],
        "stats": {
            "accounts": len(accounts),
            "accounts_nonzero": sum(
                1 for a in accounts if abs(a["computed_balance"]) > 0.005
            ),
            "income_rows": len(income),
            "recurring": len(recurring),
            "counterparty_candidates": len(names),
        },
    }

    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    s = out["stats"]
    print(f"wrote {args.out}")
    print(f"  accounts    {s['accounts']}  ({s['accounts_nonzero']} with a balance)")
    print(f"  income      {s['income_rows']}")
    print(f"  recurring   {s['recurring']}")
    print(f"  cp names    {s['counterparty_candidates']} distinct (proposals only)")


if __name__ == "__main__":
    main()
