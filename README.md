# Symbol Shelter — by Konpo Studio

**Live:** https://konpo-symbol-index.vercel.app

## What this is

A logo takes hundreds of proposals. Only one gets picked. The rest — good work,
killed for reasons like "too circular" or "a CEO who hates circles" — usually
die in a folder called "old."

The Symbol Shelter is Konpo's answer to that. It's a public archive of 70
rejected logo marks, presented the way they deserved to be presented: drawn to
a strict coordinate contract, annotated with real construction geometry,
inspectable at every size, and — the point — **up for adoption**. Every mark
has a name, a category, a rejection reason, and an Adopt button that opens a
real application: who you are, what you're building, and why this mark should
live at your place. Adopted marks display their adopter, their case, and a
link to the new home.

## Where the marks come from

Every symbol here was drawn by Konpo Studio — branding professionals doing
identity work for real clients. These aren't sketches or filler: they're
finished proposals from real engagements that lost their pitch rounds for the
usual reasons (a merger, a new CMO, "too modern"). Client context has been
stripped; the craft hasn't. Portfolios only ever show the winners — this is
the other 95% of the job, which is bigger, and honestly more interesting.

The catalogue grows: alongside the original archive, new intakes get converted
into the house coordinate system and catalogued as they arrive.

## The page

One self-contained HTML file (`symbol-index.html`, copied to `index.html` for
root serving — **edit both or re-copy before deploying**). No build step, no
framework. The single runtime dependency is lottie-web from a CDN for the
animated marks; static marks are the fallback, so nothing breaks without it.
UI sounds are synthesized live in WebAudio — no audio files.

- rem base is 62.5% (1rem = 10px). Konpo tokens: bg #000, tile #141414,
  purple #9680ff (construction), purple-vivid #ad9cff (accent), green #4ade80
  (Adopted), red #f87171 (Rejected), fade #6c6c6c, line rgba(255,255,255,0.10).
  Sans: Neue Haas Display Pro stack, weight 400 only. Mono: ui-monospace
  stack, weight 300 for labels.
- All marks live inline as SVG strings in `const S = [...]` — the only data
  structure that matters.

## Data schema (per entry in S)

- id        "SYM-001"…"SYM-096" with gaps. Removed from the index: 003, 008,
  009, 025, 031, 032, 033, 034, 036, 037, 047, 051, 054, 057, 060, 063, 064,
  065, 066, 070, 071, 076, 087, 088, 091, 092. Ids keep their numbers — a
  retired number is never reused. Movers keep their ids: 026 sits in 003's old
  slot, 050 in 008/009's, 095 "Turbine" in 064's, 096 "Lantern" in 065's.
  089, 090, 093–096 are 2026 intakes.
- name      every mark is named; names are distinct across the set
- cat       Monogram / Geometric / Abstract / Pictorial
- spec      mono construction one-liner ("80 × 80u · 6 parts")
- mark      SVG inner markup (white fills via CSS; class="stroked" = stroke
  art, optionally with inline style="stroke-width:X" to keep a source weight)
- con       construction layer: class="guide" dashed, class="pt" points, plain
  `<line pathLength="1">` = solid dims (draw-on), `<text>` = corner notes
- blurb     drawer description — every mark has one, written to run ~3 lines
  at the drawer's 48ch measure
- year / status   every mark is "Rejected" except 015 + 022 "Adopted";
  year 2025 on 001–015, "—" elsewhere (industry still in data, not shown)
- reason    the rejection, in the two-word "Too ___" vocabulary (Too Circular,
  Too Clever, Too Timeless…); drawer shows "Unknown" when absent
- attachment  "High" | "Medium" | "Low" (drawer falls back to "—")
- adopter / adopterOrg / adopterUrl / adopterCase / adopterStatus /
  adopterReason / adopterDate   set on Adopted marks. The drawer shows an "Adopted by"
  section after the metadata (full-bleed divider): name (h2), their quoted
  introduction, adopter stats (Status "Rescued" in green, Reason, Date), then the
  org linked to the new home. The mark's own Status row shows "Rejected"
  struck through in the neutral color. Adopted marks show no Adopt CTA.
- explode   'auto' | [[dx,dy],…] | null — auto derives vectors from part
  bboxes around the mark center (100,100)
- spin      true on 001, 002, 004: parts rotate 360° while exploding

`sym-file-map.txt` maps marks to their source SVG filenames.
`keepers.json` holds cleaned glyphs + measured bboxes from the original batch.

## SVG contracts (do not break)

1. Every mark: `<g class="mark">` + `<g class="construction">`, viewBox
   -28 -28 256 256, mark fitted to ~80u max dimension on center (100,100).
2. NEVER combine vector-effect: non-scaling-stroke with dash-based animation.
   Chromium computes dashes in screen px under NSS. Solid dim lines therefore
   use vector-effect: none + stroke-width 0.55; dashed guides keep NSS but
   animate opacity + pattern slide, never a normalized draw.
3. Hidden-at-rest construction is opacity-gated, not dash-gated (leak-proof).
4. typeset() strips `<text>` out of con at runtime and renders them as an HTML
   .notes overlay (fixed 11px at every viewport, top-right 1.6rem/1.8rem —
   mirrors the .idx spec). Char delays: element-stagger + 35ms/char typing.

## Interaction map

- Intro: black screen, two lines typed in word-by-word (blur-in) — the count,
  then the shelter — with a 1.1s beat inside screen 1 and 1.1s of black
  between screens (~10s total). Click/Esc/Enter skips; reduced-motion
  bypasses. Then the staged reveal: fit-to-width h1 blurs in at 400ms, chrome
  at 2s, grid + footer at 3s.
- Tile hover: sibling tiles + header/footer blur (CSS :has), construction
  drafts in element-by-element, corner notes type in. On the three animated
  marks (001, 002, 004 — bespoke lottie loops generated from their own path
  data), hover plays the motion cycle first; annotations wait for it.
- Click tile → right drawer (fixed, 48rem). Stage controls: Notes (annotations), Turn
  (cumulative 90°), Explode (auto-vectors; suppressed for single-compound or
  centered-part marks), Play on the animated marks (waits for explode/turn
  transitions to settle before taking over). Scale ramp: 96/64/44/28/16px.
- Adopt flow: full-bleed "Adopt <name>" band at the drawer bottom pushes the
  drawer left and slides in an equal-width application panel — full-bleed
  hairline field sections (click anywhere to type; focus = raise + purple
  label): Name / Organization / Email / Make your case → Submit Application
  drafts a mailto to hey@konpo.studio ("Adopt SYM-0XX — Application"). Esc
  closes the form first, drawer second; the form clears on symbol change.
- Last grid card is the Konpo logomark in accent purple, playing the Konpo
  Notes four-dot dance on loop (anim/konpo.json — the fifth, center circle is
  tile-colored so it reads as cutting the dots). Links to konpo.studio.
- Right-click on any mark is blocked: "© Konpo — not up for grabs" toast at
  the cursor with a "Want it? Make your case." link into the adopt flow, plus
  the velvet state.error sound. Deterrent only — SVGs are inline in source.
- Sound: WebAudio engine ported from velvet-ui (24h.studio), velvet voice,
  synthesized live. drawer.open/close, toggle.on/off, action.send,
  state.error. Sound is a bonus layer — every play() is wrapped and never
  blocks.

## Known state / pending

- Rich per-mark construction geometry (orbits, radii, pitches) exists for
  001–015; later marks carry baseline auto-annotations (bbox frame, axes,
  center, dims, part count).
- Rejection reasons are set on the 13 originally-catalogued marks; the rest
  read "Unknown" pending their paperwork.
- Current adopters (Tessera, Swarm) are placeholder fiction pending real ones.
- Category filters were removed at 15 marks; at 70 with four real categories
  they likely earn their way back (chips CSS still exists, unused).
- "Sign up for updates" in the footer is not wired to anything yet.
- Fonts fall back to Helvetica Neue; the real Neue Haas webfont would tighten
  the header noticeably.
