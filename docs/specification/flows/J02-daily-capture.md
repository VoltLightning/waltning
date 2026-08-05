# J2 · Daily capture

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** several times a day. **The journey the product lives or dies on.**

Target: **under 10 seconds** (`SPEC.md` G3). Three input modes, one draft, one
Save.

```
S04 Today  ──tap +──→  S05 Quick add
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   [123] keypad      [◉] voice         [▣] photo
        │                 │                 │
   amount typed     transcript →       camera → extract
        │           fills fields            │
        │                 │                 │
        └────────→  chips: account · category · date · scope · note
                          │
                     S06 Category sheet  (if category tapped)
                          │
                     Save → S04 Today
```

**Branches**

| Branch | Goes to |
|---|---|
| Category needs creating | S06 → create in place, scoped to the selected parent |
| Account needs creating | S16 Account editor, returns to the draft |
| Voice heard two intents | S08 Voice multi-intent |
| Photo taken | J3 |
| Counterparty involved (lending) | J7 from step 3 |

**The trail is the honest part.** Any machine-filled field states what was heard
or read, in one line, with Undo (`DESIGN.md` P2). The draft is never a black box.

✅ **Designed** — `Gaps.dc.html` G3. All four states: speech not understood
(recording kept, keypad offered), offline extraction (queued, draft still
editable), low confidence (marked **per field**, not per receipt), and a
duplicate caught at save showing the row it matched.
