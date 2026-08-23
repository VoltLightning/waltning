# Waltning mobile

The native route is a disposable, phone-alone ledger preview. It does not need
or read a backend URL: accounts, transactions, and the outbox stay in the two
app-owned SQLite files on the device. The web route remains the backend-backed
dashboard.

## Expo Go

Run from the repository root:

```bash
pnpm dev:all --clear
```

That starts one Expo Go server; use its `a`, `i`, and `w` shortcuts for Android,
iOS, and web. To start and open one target directly, use `pnpm dev:android`,
`pnpm dev:ios`, or `pnpm dev:web`. Development includes **Reset preview data**
automatically.

The separate `dev:client` script starts Metro for an installed development
client. The EAS `development` and `preview` profiles produce installable Android
artifacts but simulator-only iOS artifacts, because EAS device distribution
requires paid Apple credentials.

## Standalone preview

Android builds a release APK whose JavaScript bundle is embedded. Once
installed it launches without Metro, a cable, or a backend:

```bash
pnpm --filter @waltning/mobile preview:android
```

iOS uses local Xcode compilation with a free Personal Team because this project
does not currently have a paid Apple Developer account:

```bash
pnpm --filter @waltning/mobile preview:ios
```

Selecting the Personal Team under **Signing & Capabilities** is the one
human-only step. A Personal Team installation expires after seven days and
must then be rebuilt and installed again.

Set `EXPO_PUBLIC_ENABLE_PREVIEW_RESET=true` to include destructive reset in a
preview or development build. The production profile sets it to `false`, so the
action is absent.

Expo CNG may generate `apps/mobile/ios/` and `apps/mobile/android/`. They are
local build output, ignored by git, and must not be committed.

## Bundle checks

These commands compile without installing on a device:

```bash
pnpm bundle:web
pnpm bundle:android
pnpm bundle:ios
pnpm bundle:all
```
