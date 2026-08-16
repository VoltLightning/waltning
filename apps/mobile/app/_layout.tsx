/**
 * Root layout — one route tree for native and web (§14.6).
 *
 * `expo-router` maps this directory to routes on both platforms, which is what
 * makes "one codebase" a fact rather than an aspiration: a screen added here
 * exists on the phone and in the browser without a second registration.
 */

import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
