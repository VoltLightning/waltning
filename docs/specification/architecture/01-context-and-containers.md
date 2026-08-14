# 1 · Context and containers

C4 levels 1 and 2. Level 3 is [`02-components.md`](02-components.md).

`SPEC.md` §4.1 draws this as ASCII and stops at the container boundary. What an
engineering team needs beyond that picture is which arrows are trust boundaries,
which are the only outbound paths, and what happens when each dependency is
unavailable — because the interesting failures are all on the edges.

---

## Level 1 · System context

```mermaid
graph TB
    V["<b>V</b><br/>single user, ~4 devices<br/>PL tax resident, ryczałt"]

    subgraph tailnet["Tailscale tailnet — the only ingress"]
        W["<b>Waltning</b><br/>self-hosted personal finance<br/>7 currencies · 5 yrs history"]
    end

    MM["Money Manager<br/><i>.mmbak</i> exports<br/><small>read-only, one direction</small>"]
    BANK["Banks<br/><i>.xls / .csv</i> statements<br/><small>manual download</small>"]
    FX["FX rate providers<br/>ECB · NBP · NBRB · NBG<br/><small>free, unauthenticated</small>"]
    LLM["Model providers<br/>OpenRouter · OpenAI<br/><small>per surface (§11.4)</small>"]
    B2["Backblaze B2<br/><small>age-encrypted backups</small>"]
    KSEF["KSeF<br/><small>PL e-invoicing — read-only ref</small>"]

    V -->|"iPhone, laptop"| W
    MM -.->|"one-off migration<br/>+ periodic sync"| W
    BANK -.->|"statement import"| W
    W -->|"outbound only"| FX
    W -->|"outbound only"| LLM
    W -->|"nightly"| B2
    W -.->|"invoice ref only"| KSEF

    classDef sys fill:#1f6f4a,stroke:#0d3a26,color:#fff
    classDef ext fill:#2b2b2b,stroke:#555,color:#ddd
    classDef person fill:#3b5bdb,stroke:#1c3aa9,color:#fff
    class W sys
    class MM,BANK,FX,LLM,B2,KSEF ext
    class V person
```

**Every external arrow is outbound or manual.** Nothing on the internet can
initiate a connection to Waltning; there is no public ingress, no webhook, no
inbound OAuth callback. That is the §5.1 access model expressed as a diagram,
and it is the single largest reason the security surface is small enough for one
person to reason about.

**Waltning is not the filing path** (§13.5). KSeF is a reference, not an
integration — the tax return is filed through the official channel, and Waltning
produces the workbook that informs it. Treat any story that makes Waltning
authoritative for filing as out of scope.

### What each dependency's absence costs

| Dependency | If unavailable | Degradation |
|---|---|---|
| FX providers | Rates go stale | Writes **still succeed** — `fx_rate` is required, so the last known rate is carried forward with `fx_rate_estimated = true` and a bounded carry window. Never blocks entry |
| Model providers | Classification and agent unavailable | Manual entry and all deterministic paths unaffected. The import review queue still works, unclassified |
| Backblaze B2 | Offsite copy stops | Local nightly dump continues. **Silent failure is the risk** — surfaced on S30 beside backup status |
| Tailscale | **Total loss of access** | Accepted (§5.1). Every device must run it; the alternative is a public login page |
| MinIO | Receipt images unreadable | Ledger fully functional; receipts degrade to their extracted `transaction_lines` |

---

## Level 2 · Containers

```mermaid
graph TB
    subgraph clients["Clients"]
        IOS["<b>mobile</b> — Expo/RN<br/>iOS + web from one codebase<br/><small>SQLite outbox · expo-secure-store</small>"]
        WEB["<b>web</b> — same Expo build<br/><small>dashboard · import review · reports</small>"]
    end

    subgraph pi["Raspberry Pi 4 · Docker Compose · boot from SSD"]
        CADDY["<b>caddy</b><br/><small>TLS from Tailscale certs</small>"]
        API["<b>api</b> — Hono + tRPC<br/><small>the only writer to Postgres</small>"]
        PG[("<b>postgres:16</b><br/><small>33 tables · triggers · views</small>")]
        MINIO[("<b>minio</b><br/><small>receipt images, age-encrypted</small>")]
    end

    EXPORT["<b>export role</b><br/>waltning_export<br/><small>SELECT on tax_ledger only</small>"]

    IOS -->|tRPC/HTTPS| CADDY
    WEB -->|tRPC/HTTPS| CADDY
    CADDY --> API
    API -->|"app role<br/><b>not</b> superuser"| PG
    API --> MINIO
    API -.->|"tax export path<br/>separate connection"| EXPORT
    EXPORT -->|"SELECT only"| PG

    classDef c fill:#1f6f4a,stroke:#0d3a26,color:#fff
    classDef d fill:#4a3f8f,stroke:#2a2260,color:#fff
    classDef role fill:#8f3f3f,stroke:#5c2020,color:#fff
    class IOS,WEB,CADDY,API c
    class PG,MINIO d
    class EXPORT role
```

### The two database identities, and why this is a container-level concern

This is the part of the diagram that carries a guarantee rather than a
description.

| Identity | Privileges | Used by |
|---|---|---|
| `waltning_app` | DML on all tables. **Not a superuser** | The API, for everything |
| `waltning_export` | `SELECT` on `tax_ledger` and nothing else; enumerated `REVOKE`s on the eight tables holding personal rows | The tax export path only |

`POSTGRES_USER` is the bootstrap **superuser**, and a superuser bypasses every
`GRANT` — so T1 is unenforceable until the API stops connecting as it. The
export path must take its connection **explicitly**: `createDb()`'s default
argument silently hands back the superuser, which converts *fails loudly* into
*succeeds quietly*.

Migration `0005` creates the role and the view; `verify_t1()` checks all three
ways it can break. See [`03-domain-model.md`](03-domain-model.md) § T1.

### Container responsibilities

| Container | Owns | Explicitly does not |
|---|---|---|
| `mobile` | Capture, offline outbox, optimistic UI, secure token storage | Hold any provider API key. **All model calls originate from `api`** (§5.3) |
| `api` | Every write to Postgres, the operation registry, the agent runtime, FX sync, import pipelines, export | Serve any port outside the tailnet |
| `postgres` | The ledger, and the invariants that cannot be expressed in application code (§6.5) | Anything reachable from outside the compose network |
| `minio` | Receipt blobs, S3-compatible so offsite is configuration | Store anything unencrypted |
| `caddy` | TLS termination using Tailscale-issued certs | Public certificate issuance — there is no public name |

**`api` is a single process, deliberately.** Four "modules" appear inside it in
§4.1 — ledger, import, receipts, agent, export — and they are namespaces, not
services. One Pi, one user: a message bus between them would add failure modes
and buy nothing. The seam that matters is the *operation registry*, not a
network boundary, and that seam is enforced by types.

---

## Trust boundaries

```mermaid
graph LR
    subgraph tb1["① Device"]
        D["Enrolled Tailscale device<br/>+ session cookie + TOTP"]
    end
    subgraph tb2["② Tailnet"]
        T["WireGuard, mutually authenticated<br/>ACLs scoped to one service, one port"]
    end
    subgraph tb3["③ Application"]
        A["Auth §5.2 · operation registry<br/>approval gates §11.2"]
    end
    subgraph tb4["④ Database"]
        DB["Triggers · CHECKs · role privileges<br/><small>the layer that holds when code is wrong</small>"]
    end

    D --> T --> A --> DB
```

**Four layers, and the design assumes each will individually fail.** ② is the
one §5.1 calls categorically strong; ③ is the one a bug lives in; ④ is the one
that has actually caught things — every C-class defect in `defects.md` that was
*enforced* rather than *asserted* was enforced at ④.

The ordering matters for the build sequence: `build-order.md`'s Phase 0.5 exists
because ② and ③ were scheduled at week 15 while real data landed in week 1.
