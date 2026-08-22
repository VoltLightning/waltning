# 13 · Identity and access

**Authentication belongs to the server. The network is only how you reach it.**

§5.1 used to make the network the perimeter: Tailscale was the only way in, and
authentication was described as defence in depth behind it. That inverted the
responsibilities. A VPN is a fine thing to have and a poor thing to *depend* on
— it decides who can open a socket, which is not the same question as who you
are, and it made a VPN client a prerequisite for anyone else running this at
all.

This document settles the other half: **who you are, how you prove it, and how
each client finds the server.** Once those are right, the transport becomes a
deployment choice — Tailscale, a home LAN, or a public URL — and none of them
changes your identity.

---

## 13.0 What this document is not about

**Everything here is Brick 2 and later.** It was written before
[`14-local-first.md`](14-local-first.md) and assumes throughout that a server
exists to authenticate to. On **Brick 1 — the phone alone — none of it
applies**: no session, no passkey, no TOTP, no server to discover. There is
nobody to prove yourself to.

What the phone-alone app has instead is **device custody**, which is a
different mechanism answering a different question. A session token decides
whether the phone may talk to the Pi. The device's own gate — Face ID, or
Android's `BiometricPrompt`, or the PIN behind either — decides whether the
person holding the phone may read what it already has: every account by name,
every counterparty with balances, the whole ledger. A stolen unlocked phone is a
total disclosure that never touches the network, so the perimeter this document
describes does nothing about it. `SPEC.md` §5.7 owns that, and it is a
prerequisite for Brick 1 while everything below is a prerequisite for Brick 2.

Stating the boundary because the absence of it is load-bearing: read
straight through, this document implies you must log in to use the product.
You must not.

## 13.1 The constraint that shapes everything

**A native iOS app cannot use passkeys against a domain it did not know at
build time.** Not "with difficulty" — at all.

Apple is unambiguous: *"You need to have an associated domain with the
`webcredentials` service type when making a registration or assertion request;
otherwise, the request returns an error."* Three facts close every escape route:

- The entitlement lives **inside the code signature**, transferred from the
  provisioning profile. Changing the domain list means re-signing, which means a
  new App Store build.
- Wildcards cover **subdomains only** — `*.example.com` works, a bare
  `webcredentials:*` does not exist.
- The `apple-app-site-association` file is fetched by **Apple's CDN**, not the
  device, so the domain must be publicly reachable over HTTPS with a valid
  certificate and no redirects. The `?mode=developer` bypass requires a
  development profile; `?mode=managed` requires MDM. Neither ships.

This was checked against shipped binaries rather than documentation. Of Home
Assistant, Immich, Nextcloud, Swiftfin and Bitwarden, **only Bitwarden declares
`webcredentials`, and only for domains Bitwarden owns.** Home Assistant's issue
#4661 states the consequence in one line — *"passkeys are not surfaced because
the app has no Associated Domain for the user's self-hosted instance"* — and a
maintainer closed it.

WebAuthn's Related Origin Requests do not help; that is a web mechanism, and
Apple platforms use associated domains instead.

**So the design cannot put a passkey ceremony inside the app.** Everything below
follows from routing around that.

---

## 13.2 Logging in

### The web dashboard — a passkey, directly

A browser derives the RP ID from the page's own origin. No entitlement, no
association file, no Apple involvement. Any installation with a domain and a
valid certificate has passkeys on the dashboard for free.

### The iOS app — a passkey, through a browser it does not own

`ASWebAuthenticationSession` opens **the user's own server's** login page in a
system browser. The passkey works there for the same reason it works on the
dashboard: it is a web origin. The server returns a per-device credential, which
the app stores in the Keychain.

**The app implements no authentication.** It has no password field, no TOTP
entry, no WebAuthn call. That is the point, and it is what makes the rest
possible: passkeys, TOTP, SSO or anything else become the server's business, and
adding one later changes nothing in the client.

This is not novel. Nextcloud shipped exactly this route in February 2026,
closing four long-standing passkey issues, after finding that a `WKWebView`
login *"does not handle deep links or Passkeys."* The pairing protocol worth
copying is its **Login Flow v2**: the app opens a browser, polls a single-use
token, and receives a per-device credential once. The password never touches
the app.

**Consume the callback with `ASWebAuthenticationSession(callbackURLScheme:)`
rather than claiming the scheme in `Info.plist`.** Nextcloud's client
deliberately does not register `nc://` globally: an unclaimed scheme cannot be
hijacked by another app, and an ephemeral session leaks no cookies.

### The ceremony parameters, and why each one is a decision

```
userVerification:  "required"      → this is what makes it multi-factor
residentKey:       "required"      → discoverable, so login needs no username
authenticatorAttachment: unset     → platform *and* roaming authenticators
attestation:       "none"          → a personal system does not vet models
```

**`userVerification: "required"` is the MFA.** A passkey is two factors in one
gesture: possession of the authenticator, and the biometric or PIN that unlocks
it. Without UV required, the server accepts a credential that was never
unlocked, and the passkey degrades to a single factor. This is the line that
makes the difference, and it is one word.

**Leaving `authenticatorAttachment` unset is what makes 1Password work.** A
third-party credential manager registers as an AutoFill credential provider on
Apple platforms and as an extension in browsers; to the server it is ordinary
WebAuthn. Restricting to `platform` would silently exclude every one of them and
every hardware key, and the failure would look like "1Password doesn't offer to
save it" rather than like a server setting.

**Register several.** A phone, a laptop, and ideally one roaming authenticator.
Note that two synced passkeys across two Apple devices are **one iCloud
account**, not two factors; a hardware key in a drawer genuinely is a second.

---

## 13.3 A second factor, and the difference that matters

**TOTP may be an *additional* factor. It may never be an *alternative* one.**

That distinction is the whole of it. An account's strength is
`min(login, recovery)`, so a second path that reaches a full session is a
weaker path, not a spare one — and attackers pick paths, users do not.
Adversary-in-the-middle kits already exploit this directly: they rewrite the
login page to **hide the passkey option** and offer something phishable
instead. The Tycoon 2FA kit ships JavaScript that detects a passkey prompt and
redirects to a weaker flow.

So TOTP has exactly two legitimate places here:

**As step-up on operations that deserve it.** A passkey assertion says you are
you; it does not say you meant to do this *now*. §11.2 already gates
tax-sensitive writes behind an approval card, and the same set is where a fresh
second factor earns its keep — closing a period, changing the access mode,
enrolling another device. This is where a second factor adds something that a
longer session cannot.

**As the only factor where passkeys are impossible.** WebAuthn refuses bare IPs
and non-secure contexts, so an installation without a domain cannot have
passkeys by any route. That deployment gets TOTP enrolment through the CLI
below, and **is told plainly that its authentication is weaker** — rather than
everyone being offered a fallback that quietly lowers the ceiling.

What TOTP is never: a *"having trouble with your passkey?"* link on the login
page. That link is the attack.

---

## 13.4 Recovery

**The recovery channel must be harder to compromise than the login, or it *is*
the login.** That is the whole test, and it is the one a printed code fails: an
attacker who can talk you out of a code has skipped every factor above.

**The self-hosted answer is one no hosted product has: you own the machine.**

```
$ ssh pi
$ waltning enrol
  enrolment token: 7c2f-… (valid 10 minutes, single use)
```

Recovery is a short-TTL enrolment token minted by a CLI on the box itself. There
is no endpoint to phish, no code to socially-engineer, and nothing to find by
scanning. It passes the test above by a wide margin, which is what makes it safe
to have no phishable path at all.

Consequences, stated so they are chosen rather than discovered:

- **No recovery codes.** Nothing to print, nothing to lose, nothing to be talked
  out of.
- **No password anywhere in the system.** `@node-rs/argon2` leaves the
  dependency list, and with it: tuning a hash on a Pi, making unknown-user and
  wrong-password take the same time, and credential stuffing as a threat.
- **Losing every passkey costs you shell access, not your ledger** — the right
  price for a system whose whole argument is physical custody.
- **The CLI is also the server's first run.** The same command enrols the first
  passkey on a fresh install, so there is no bootstrap password and no default
  credential to forget to change. Not to be confused with the *app's* first run,
  which involves no server at all (§13.6) — this one happens on the Pi, when a
  Pi is added.

**If you would rather have a remote recovery path**, the shape to copy is
1Password's rather than GitHub's: a recovery secret that is **reusable rather
than single-use**, whose redemption is gated on a second channel *and* on a time
delay — *"if you attempt a recovery after a recent sign in, the recovery attempt
will be blocked and your code will be unusable for 24 hours."* The delay is what
defeats a phisher operating on a live session, and it is why that design does
not fail the test at the top of this section. It is not specified here because
the CLI makes it unnecessary, and an unnecessary credential is one more thing
that can leak.

## 13.5 Sessions

**Opaque, database-backed. Not JWT.** OWASP's own JWT guidance opens with a
section titled *"Not using JWTs"*, and there is a concrete 2026 failure behind
it: JWT malleability means one logical token has many valid byte forms, so
hashing it as a revocation key does not reliably revoke. **An opaque token is
its own canonical representation**, which makes the denylist trivially correct.

**Shape: `id.secret`.** The id identifies the row; the secret authenticates it,
compared in constant time. This matters here more than usual — the id can appear
in an audit row, a log line and a *your devices* screen without any of them
containing a usable credential, and this system audits every write by
construction.

- **≥128 bits of CSPRNG entropy**, stored as SHA-256. A slow KDF buys nothing
  against a secret with no brute-force surface.
- **Never bind a session to an IP.** Mobile addresses change constantly.
- **Refresh rotation with reuse detection**, revoking the entire family on
  replay. Not DPoP: `expo-crypto` has no asymmetric key generation, and the
  React Native libraries that do are at v0.0.2 or were last published in 2022.

**Bearer on native is a constraint, not a preference.** React Native's
`NSURLSession` is built with a process-wide shared cookie store,
`credentials: "omit"` does not work, and `Set-Cookie` on a 302 is broken. The
upstream issue has been open since 2017 and was closed as stale. So: an
`Authorization` header on native, and an httpOnly `Secure` `SameSite=Strict`
cookie on web — `expo-secure-store` has no web implementation at all, and a
token in `localStorage` is not an option.

**The 30-day sliding window needs its argument written down.** NIST AAL2 is 24
hours absolute and 1 hour inactivity; ASVS permits deviating *provided the
justification is documented*. The justification is the offline design: a phone
is expected to go days or weeks without reaching the Pi, and a session expiring
mid-trip stalls the drain for the rest of the trip.

**"Strands the outbox" was too strong, and the reframe is why.** Under
`14-local-first.md` the phone is *complete*: an expired session costs you the
**drain**, not the app. Reading, searching, balances and capture all continue
against the local ledger, and the queue resumes when you next authenticate.
That weakens the argument for a long window rather than strengthening it — the
window is a convenience, and it should be defended as one.

**So "logged out" means the session is gone and nothing else.** §14.4 is
explicit: a phone that has met a backend keeps a complete copy, and logout
drops **nothing but the session** — not the replica, not the outbox. The
90-day TTL and drop-on-logout were priced against a *cache*; against a record
they are a deletion of the record. A logout screen that offers to "clear local
data" is offering to destroy unsent writes.

---

## 13.6 How a client finds its server

**The account is keyed on a server-issued UUID. The address is mutable
configuration.**

Of six self-hosted products surveyed, the three that key on a server identity —
Immich, Swiftfin, Home Assistant — support changing the address and moving
between networks. The four that key on the URL tell users to delete the account
and re-add it, losing local state. Nextcloud's own code comments defend the
choice on security grounds, and it already returns an `instanceid` it does not
use for this.

So:

```
GET /healthz  →  { ok, instanceId, serverName, … }
```

The client stores `instanceId`, re-validates it on every reconnect, and refuses
a server that answers with a different one — *"this connection does not point to
the current server."* That is what makes a changed address safe rather than a
redirect-hijack.

**`EXPO_PUBLIC_API_URL` must stop being the answer.** It is inlined at build
time, so today the app can only ever talk to the server it was compiled for —
which makes self-hosting by anyone else impossible, and makes moving the Pi a
rebuild. The address becomes a **setting**, editable at any time.

**Not a first-run field, and that is the reframe's doing.** Brick 1 has no
server, so first run must complete with the address unset and the app fully
usable — a launch that demands a URL before it will show you anything is a
launch that cannot happen on the brick most people start from. Adding a backend
is a later, deliberate act: enter an address, validate it, seed from the phone
(§14.1). The field belongs beside that act, not in front of the product.

Two rules taken from products that learned them the hard way:

- **Never silently downgrade `https` to `http`.** If a fallback exists at all it
  must be gated on the *kind* of failure — a refused TCP connection, never a
  TLS error. An ungated retry turns a real certificate problem into plaintext.
- **Validate with one unauthenticated GET whose body proves product identity**,
  which `/healthz` already is. Rule 0 is exactly this check and already exists.

**Rule 0 turns out to be the mechanism that makes a movable address safe.** It
was built to detect captive portals; it is the same question — *is the thing
that answered actually my server?* — asked of a different failure.

---

## 13.7 Reaching the backend

| Client | Credential | Origin-bound? | Therefore |
|---|---|---|---|
| Web dashboard | Cookie | **Yes** — cookies and passkeys both | Needs one stable name |
| iOS app | Bearer token | No | Any address, any path |

That asymmetry is the whole reason the transport question gets easy. The phone
does not care whether it reaches the Pi over the LAN, the tailnet, or a public
URL, because a bearer token is not scoped to an origin and Rule 0 proves the
server's identity independently. Only the browser needs a fixed hostname.

**Transport is now a deployment choice, not an identity decision:**

- **Tailscale** — and it is the LAN path too. Peers connect directly
  peer-to-peer, so at home that is the same wire with no relay. There is no
  separate LAN mode to configure and no split-horizon DNS to maintain.
- **A public name via an outbound tunnel** — for browsers on machines that
  cannot join the tailnet.
- **A LAN address** — usable by the app, which does not need a stable origin;
  not usable for passkeys, which need a domain.

None of these forwards a port, and none of them is the perimeter.

---

## 13.8 Traps

Each of these is silent, and each was found by reading source rather than
documentation.

- **`requireAuthentication: true` in `expo-secure-store` destroys the token when
  a fingerprint is added.** It maps to `.biometryCurrentSet`, which invalidates
  on enrolment change rather than prompting. Gate the UI with
  `expo-local-authentication` instead; the Keychain item itself must not carry
  that flag, or changing a fingerprint silently logs you out and forces a
  re-enrolment against a server you may not be able to reach.
  **On Android the same flag is worse**, and fails earlier: it demands
  `BIOMETRIC_STRONG` with no device-credential path, so on a PIN-only device the
  store throws rather than degrading and the token cannot be written at all. Same
  remedy, and now for two reasons.
- **Set `keychainAccessible` explicitly.** The documented default and the source
  default disagree. Under plain `WHEN_UNLOCKED` the token restores onto a
  *different* device from an encrypted backup — §5.7 already requires
  `AFTER_FIRST_UNLOCK` **`ThisDeviceOnly`**, and inheriting a default is not the
  same as setting it.
- **Android has no such setting, and gets the property for free — twice.**
  `expo-secure-store` there is `SharedPreferences` holding AES-256-GCM blobs
  under a non-exportable Keystore key, so ciphertext restored onto another handset
  cannot be decrypted; and Expo's own backup rules exclude `SecureStore.xml` from
  cloud backup *and* device transfer. Stronger than the iOS flag, by different
  means — but the second half is a property of a dependency's packaging rather
  than a decision, and `SPEC.md` §5.7 records how it reverses: writing our own
  backup rules makes Expo's plugin stand down, and the job of excluding that file
  becomes ours.
- **The launch gate must test the device credential, not the biometric.**
  `getEnrolledLevelAsync() >= SecurityLevel.SECRET`, never `isEnrolledAsync()`,
  which is biometric-only and returns false on a perfectly well protected
  PIN-locked device — locking a correct user out of a ledger they own. Pass
  `biometricsSecurityLevel: 'strong'`, whose default is `'weak'` and admits
  Android's Class 2 face unlock, and never compare against
  `SecurityLevel.BIOMETRIC`: it is deprecated and asymmetric, meaning WEAK on
  Android and STRONG on iOS, so one expression is two different tests.
- **Neither `expo-secure-store` nor `react-native-keychain` uses the Secure
  Enclave.** Both put bytes in the data-protection keychain. The Enclave is the
  root of the wrapping hierarchy, not where the token lives; any claim otherwise
  is wrong and would overstate what is protected. The Android side is the mirror
  image and is worth stating so nobody claims it either: the Keystore key is
  hardware-backed and **the token is not in it** — the key wraps bytes that live
  in `SharedPreferences`.
- **A rate limiter keyed on an IPv6 address is decorative.** A /64 rotation
  defeats it. Key on the account, and keep the transport-level limit in the
  reverse proxy where it belongs.

---

## 13.9 What this forecloses, and what it does not

**It does not foreclose a hosted option.** A vendor domain *can* ship compiled
`webcredentials:`, so hosted users would additionally get native passkeys in the
app. Self-hosters lose nothing they had, and the server code is the same.

**Two pieces of vendor infrastructure become permanent** if this is ever
distributed:

- **A push relay.** The APNs key belongs to whoever owns the bundle ID, never
  the server operator, so a self-hosted backend cannot push to an App Store app
  without one. Home Assistant runs exactly this. Immich ships no push at all,
  which is defensible for a ledger — but **`SPEC.md` §14.3 currently depends on
  push** for node-key-expiry warnings and S30's alarms, and that dependency has
  to be resolved rather than inherited. (Qualified because
  `14-local-first.md` now has a §14.3 of its own — durability — and the two are
  unrelated.)
- **A public demo instance.** App Store review requires working credentials, and
  a self-hosted-only app has been rejected under Guideline 2.1 for having none.

Neither is needed now. Both are cheaper to plan for than to retrofit.
