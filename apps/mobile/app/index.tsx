/**
 * Home route — still S01's placeholder, now reading from the server.
 *
 * It renders three things, and each is a claim that was previously untested on
 * this side: that the client can reach the API from this surface, that a
 * response authenticates under Rule 0, and that an operation's declared output
 * type survives all the way to a component.
 *
 * **The connection block is a readout, not the `link` state machine.**
 * `architecture/09` specifies ten states, corroboration, and a probe schedule.
 * Showing "reached / not reached" here is honest; calling it `link` would not
 * be, and a half-built state machine is harder to replace than none.
 *
 * A route composes features and owns data fetching; it holds no components of
 * its own.
 */

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CurrencyList, useCurrencies } from "../src/features/currencies/index.ts";
import { NetPosition } from "../src/features/dashboard/index.ts";
import { API_BASE_URL, api, CaptiveResponseError } from "../src/shared/api/index.ts";

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
        // not us, versus nothing answered at all. Collapsing them here would
        // undo the check one layer above.
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

export default function Home() {
  const probe = useProbe();
  const currencies = useCurrencies(api);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Waltning</Text>

      {/*
        Still fed constants, and still worth rendering: it is `money.ts` —
        decimal.js, not floats — executing on this surface. §4.1's claim is
        that the phone and the server compute money with the same code, and
        this is the client half of it running.
      */}
      <NetPosition amounts={["1200.50000000", "-349.99000000", "0.49000000"]} />

      <View style={styles.block}>
        <Text style={styles.label}>API</Text>
        <Text style={styles.value}>{API_BASE_URL || "this origin"}</Text>
        <Text style={styles.detail}>{describe(probe)}</Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Currencies</Text>
        {currencies.status === "loading" ? <Text style={styles.detail}>Loading…</Text> : null}
        {currencies.status === "failed" ? (
          <Text style={styles.detail}>{currencies.error.message}</Text>
        ) : null}
        {currencies.status === "ready" ? <CurrencyList currencies={currencies.currencies} /> : null}
      </View>
    </ScrollView>
  );
}

function describe(probe: Probe): string {
  switch (probe.status) {
    case "probing":
      return "probing…";
    case "reached":
      return `reached · build ${probe.build}`;
    case "not-ours":
      // Deliberately not "offline". Something is answering; it is not the API.
      return `response was not ours (${probe.reason}) — status not consulted`;
    case "unreachable":
      return `no answer — ${probe.message}`;
  }
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 24, maxWidth: 520, width: "100%", alignSelf: "center" },
  title: { fontSize: 28, fontWeight: "600" },
  block: { gap: 4 },
  label: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.5 },
  value: { fontSize: 16 },
  detail: { fontSize: 13, opacity: 0.7 },
});
