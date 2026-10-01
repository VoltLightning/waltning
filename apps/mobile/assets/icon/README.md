# App icon

`icon.svg` is the source. `app.json` points at the other three, and Expo cuts
every iOS and Android size from them at build time — no per-density files are
kept here.

| File | Size | What it is |
|---|---|---|
| `icon.png` | 1024 | The whole icon, background included. **Opaque**: App Store Connect refuses an app icon with an alpha channel. |
| `adaptive-foreground.png` | 1024 | Android's foreground layer: the art alone on transparency, scaled to 81% about the centre so it stays inside the 66/108 safe zone whatever mask the launcher applies. The background is `#F4EBDD`, set in `app.json`. |
| `favicon.png` | 48 | The web build's tab icon. |

To regenerate after editing the SVG: render it at 1024 for `icon.png`; drop the
`background` path and wrap the rest in
`<g transform="translate(512 512) scale(0.81) translate(-512 -512)">` for the
foreground, rendered on transparency; shrink `icon.png` to 48 for the favicon
(`sips -z 48 48`).
