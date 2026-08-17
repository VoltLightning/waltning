/**
 * The dashboard — accounts, their balances, and the recent ledger.
 *
 * A first usable slice of S01. It is not S01: the real one has the dual total,
 * the scope switch, per-widget freshness and a configurable layout (§14.7,
 * S24). What is here is the part that can be honest today — figures the server
 * computes, rendered without a second implementation of anything.
 *
 * **The connection block is a readout, not the `link` state machine.**
 * `architecture/09` specifies ten states, corroboration and a probe schedule.
 * Showing "reached / not reached" is honest; calling it `link` would not be, and
 * a half-built state machine is harder to replace than none.
 *
 * A route composes features and owns data fetching; it holds no components of
 * its own.
 */

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountList, useAccounts } from "../src/features/accounts/index.ts";
import { TransactionList, useTransactions } from "../src/features/transactions/index.ts";
import { API_BASE_URL, api, CaptiveResponseError, isStaleBundle } from "../src/shared/api/index.ts";

type Probe =
  | { status: "probing" }
  | { status: "reached"; build: string }
  | { status: "not-ours"; reason: string }
  | { status: "unreachable"; message: string };

function useProbe(): Probe {
  const [probe, setProbe] = useState<Probe>({ status: "probing" });

  useEffect(() => {
    let live = true;
    api.ping
      .query()
      .then((result) => live && setProbe({ status: "reached", build: result.build }))
      .catch((error: unknown) => {
        if (!live) return;
        // The distinction Rule 0 exists to make: something answered and it was
        // not us, versus nothing answered at all.
        setProbe(
          error instanceof CaptiveResponseError
            ? { status: "not-ours", reason: error.reason }
            : {
                status: "unreachable",
                message: error instanceof Error ? error.message : String(error),
              },
        );
      });
    return () => {
      live = false;
    };
  }, []);

  return probe;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function Dashboard() {
  const probe = useProbe();
  const accounts = useAccounts(api);
  const transactions = useTransactions(api, 20);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Waltning</Text>

      <Section label="Accounts">
        {accounts.status === "loading" ? <Text style={styles.detail}>Loading…</Text> : null}
        {accounts.status === "failed" ? (
          <Text style={styles.detail}>{accounts.error.message}</Text>
        ) : null}
        {accounts.status === "ready" ? (
          <>
            <AccountList accounts={accounts.accounts} />
            {/*
              Stated rather than shown as a total. §3's net worth converts every
              balance to a display currency first; adding these would put złoty
              and dollars into one number and call it net worth.
            */}
            <Text style={styles.note}>
              Each balance is in its own account's currency — not a total.
            </Text>
          </>
        ) : null}
      </Section>

      <Section label="Recent">
        {transactions.status === "loading" ? <Text style={styles.detail}>Loading…</Text> : null}
        {transactions.status === "failed" ? (
          <Text style={styles.detail}>{transactions.error.message}</Text>
        ) : null}
        {transactions.status === "ready" ? (
          <>
            <TransactionList transactions={transactions.transactions} />
            {transactions.hasMore ? (
              // Said plainly. A list that silently shows only the first page
              // reads as the whole ledger, and a short ledger is a wrong one.
              <Text style={styles.note}>More transactions exist — paging is not built yet.</Text>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section label="Connection">
        <Text style={styles.detail}>{API_BASE_URL || "this origin"}</Text>
        <Text style={styles.detail}>{describe(probe)}</Text>
      </Section>
    </ScrollView>
  );
}

function describe(probe: Probe): string {
  switch (probe.status) {
    case "probing":
      return "probing…";
    case "reached":
      return isStaleBundle(probe.build)
        ? `server is on build ${probe.build} — this page is stale, reload`
        : `reached · build ${probe.build}`;
    case "not-ours":
      // Deliberately not "offline". Something is answering; it is not the API.
      return `response was not ours (${probe.reason}) — status not consulted`;
    case "unreachable":
      return `no answer — ${probe.message}`;
  }
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 28, maxWidth: 640, width: "100%", alignSelf: "center" },
  title: { fontSize: 28, fontWeight: "600" },
  section: { gap: 8 },
  label: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.5 },
  detail: { fontSize: 13, opacity: 0.7 },
  note: { fontSize: 11, opacity: 0.5, fontStyle: "italic" },
});
