/**
 * `/settings/rates` — S18, with its two search params read here and handed in
 * as props. `?quote=<code>` preselects the pair, `?date=<YYYY-MM-DD>` opens
 * the editor on that single day: the link a capture gate offers when a
 * currency has no rate for the day being captured.
 *
 * Reading them here rather than in the screen is what keeps the screen a
 * function of its props — the journey harness and the screen's own tests
 * drive it by passing them, with no router to mock.
 */

import { useLocalSearchParams } from "expo-router";
import SettingsRatesScreen from "../../src/settings-rates-screen";

export default function SettingsRatesRoute() {
  const { quote, date } = useLocalSearchParams<{ quote?: string; date?: string }>();
  return <SettingsRatesScreen quote={quote} date={date} />;
}
