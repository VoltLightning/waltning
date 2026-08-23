import { Redirect } from "expo-router";

/** Web fallback for a native-only preview action. */
export default function AccountCreationUnavailableOnWeb() {
  return <Redirect href="/" />;
}
