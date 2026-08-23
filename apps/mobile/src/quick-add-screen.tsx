import { Redirect } from "expo-router";

/** Web fallback for a native-only preview action. */
export default function QuickAddUnavailableOnWeb() {
  return <Redirect href="/" />;
}
