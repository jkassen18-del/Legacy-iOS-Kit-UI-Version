# DESIGN.md — Legacy iOS Kit (desktop app)

## Subject
A desktop control panel for restoring, downgrading, and jailbreaking legacy
Apple devices. The audience is tinkerers and repair folk driving a real device
over USB. The app's one job: make the terminal tool's device-aware menus safe,
legible, and fast to operate. The reference points are **Apple Configurator**
and **macOS System Settings** — a utility that looks like it shipped from
Cupertino, not a marketing page.

## Palette (semantic, neutral — no coloured icons)
Monochrome by rule: every glyph is `currentColor` (ink or, when a row is
selected, the one action colour). No tinted icon tiles, no gradients.

Light
- `--bg`            #ffffff        (content)
- `--bg-sunken`     #f5f5f7        (window chrome / source list — Apple gray)
- `--group`         #ffffff        (inset grouped lists)
- `--ink`           #1d1d1f        (primary text / glyphs)
- `--ink-2`         #6e6e73        (secondary text)
- `--ink-3`         #8e8e93        (tertiary)
- `--hairline`      #d2d2d7        (separators, 1px)
- `--action`        #0066cc        (selection, primary button, focus — used sparingly)

Dark
- `--bg`            #1c1c1e
- `--bg-sunken`     #000000
- `--group`         #2c2c2e
- `--ink`           #f5f5f7
- `--ink-2`         #aeaeb2
- `--ink-3`         #8e8e93
- `--hairline`      #38383a
- `--action`        #0a84ff

Console (both themes): near-black #1a1a1c surface with high-contrast text, like
Terminal.app. Status uses ink weights, not colour, except a single green/red dot
for running/error — the only saturated colour in the chrome.

## Type
System font = **SF Pro** via `-apple-system, BlinkMacSystemFont, "SF Pro Text",
"SF Pro Display"`. This is the deliberate, briefed choice (an Apple product),
not a fallback to Inter. One family, a real scale:
- Display / titles: 28 / 20 / 17, weight 600, tight tracking (-0.02em)
- Body / rows: 15 / 13, weight 400–500
- Mono (console only): `ui-monospace, "SF Mono", Menlo`
Sentence case everywhere. **No all-caps labels, no tracked eyebrows.**

## Layout primitive
The **grouped inset list row** — the signature, repeated throughout:
`[ monochrome glyph ] [ title / subtitle ] ············· [ value · chevron ]`
Rows stack inside rounded "inset" groups with hairline separators, exactly like
System Settings. A **source list** sidebar (Finder/Configurator) switches
sections. No grid of identical icon cards; no coloured left borders.

```
┌ sidebar ─────┐ ┌ content ───────────────────────────────┐
│ ◉ iPhone 5s  │ │  Restore & downgrade                    │
│   Normal      │ │  ┌───────────────────────────────────┐ │
│              │ │  │ ⟳  Restore / downgrade        ›   │ │
│ Restore       │ │  ├───────────────────────────────────┤ │
│ SHSH          │ │  │ ⤓  Jailbreak device           ›   │ │
│ Boot & DFU    │ │  └───────────────────────────────────┘ │
│ Apps & data   │ │                                         │
│ Utilities     │ └─────────────────────────────────────────┘
└──────────────┘
```
Alignment: left throughout. Hierarchy from size/weight/whitespace, not rules.

## Motion
User-triggered only. A section switch cross-fades content (120ms). A row press
gives a brief highlight. The console streams. **No ambient fade-in-up, no hover
transforms on every element, `prefers-reduced-motion` respected.**

## Never
Inter as a stand-in, lavender/violet anything, gradients, coloured icons or
icon tiles, coloured left/top borders, icon-card grids, all-caps labels, stat
rows, numbered step chrome, emoji icons, middle-dot meta strings, `→` on
buttons, one-radius-everything, the same grey shadow under every card.
