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
  purple #9680ff (construction; adopted marks annotate in green instead),
  purple-vivid #ad9cff (accent), green #4ade80 (Adopted), red #f87171 (Rejected), fade #6c6c6c, line rgba(255,255,255,0.10).
  Sans: Neue Haas Display Pro stack, weight 400 only. Mono: ui-monospace
  stack, weight 300 for labels.
- All marks live inline as SVG strings in `const S = [...]` — the only data
  structure that matters.

## Data schema (per entry in S)

- id        "SYM-001"…"SYM-096" with gaps. Removed from the index: 003, 008,
  009, 025, 031, 032, 033, 034, 036, 037, 047, 051, 054, 057, 060, 063, 064,
  065, 066, 070, 071, 076, 087, 088, 091, 092. Ids keep their numbers — a
  retired number is never reused. Array order is curated, not chronological: the twelve
  best marks lead (089, 050, 010, 012, 015, 026, 024, 022, 038, 048, 095,
  086 — they get the slow one-by-one reveal), the rest follow in catalogue
  order. Ids never change. 089, 090, 093–096 are 2026 intakes.
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
  introduction, adopter stats (Status "Rescued" in green, Reason,
  Date, Organization, and Home — the domain linked out). The mark's own Status row shows "Rejected"
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

## Share layer

- Permalinks: every mark answers at `/#SYM-0XX`, `?sym=SYM-0XX`, and at
  `/s/sym-0xx` — a static stub carrying that mark's OG/Twitter tags, which
  instantly redirects humans into the app. Opening a mark rewrites the
  address to the stub path, so whatever anyone copies unfurls correctly;
  filtered/searched states use the query-param form instead
  (`?cat=…&q=…&view=…`), with pushState + back/forward support.
- OG images: `og/sym-0xx.png` (1200×630 — black card, tile, white mark, mono
  label with status/reason) plus `og/root.png` for the homepage.
- Feeds: `/feed.xml` (RSS) and `/feed.json` (JSON Feed), one item per mark,
  dated from the `meta-dates.json` intake ledger — new intakes get stamped on
  first build and appear at the top.
- All of it is generated by `node scripts/build-meta.mjs` — **rerun it after
  any catalogue change**, then deploy. `vercel.json` sets `cleanUrls` so the
  extension-less stub paths resolve.

## Interaction map

The shell is the draggable-canvas redesign contributed in PR #1 (search,
filters, view toggle, expand cards) carrying the Shelter's catalogue.

- Intro: black screen, two lines typed in word-by-word (blur-in) — the count,
  then the shelter — ~10s total. It plays once per browser (localStorage);
  returning visitors, deep links, and reduced-motion all skip it. Click/Esc/
  Enter skips too. Then the staged reveal: top bar, then canvas + footer.
- The index is an infinite draggable canvas (pointer drag with momentum,
  trackpad pan; on touch, a 14px tap threshold keeps swipes from opening
  cards). The full set wallpapers endlessly; short result sets lay out once,
  centred, with panning clamped — except the zoomed-out view, which
  wallpapers whenever the set isn't tiny. Top bar: "Konpo Symbol Shelter"
  wordmark (→ konpo.studio), a view toggle cycling grid → zoomed-out grid
  (24rem tiles) → list whose icon shows the current view, search (`/`
  focuses; matches id / name / category / spec / reason / status), category
  filter whose label counts what's actually on screen. Arrival plays a
  centre-out reveal: the wave starts on the centre-most card and radiates
  ring by ring (filter/search changes replay it; Back/Forward don't).
- Tile hover: construction drafts in element-by-element, corner notes type
  in. On the fifteen animated marks (001, 002, 004 + the curated twelve),
  hover plays the motion cycle first; annotations wait for it. Each loop is
  generated from the mark's own path data by `scripts/build_lottie.py`, and
  each of the twelve has its own motion verb rooted in what the mark is: the
  Link tugs taut, the Pentad chases a notch around its dial, the Tessera
  tiles are pressed in corner to corner, the Swarm hovers on incoherent
  bearings, the Corolla spiral-closes, Bloom's moons orbit a true (seamless)
  quarter-revolution, the Clover spins a seamless quarter on its four-fold
  symmetry, a gust travels the Garland, the Dahlia blooms petal by petal,
  Latitude spins whole — the mark is two-fold, so its half turn lands exactly
  on itself — the Cradle's dome lifts and touches back down, and the
  Turbine's hemispheres shear past each other.
- Click a tile → the card grows to 2×2 in place, pushing neighbours aside
  hole-free. Controls: Turn (cumulative 90°), Explode (auto-vectors;
  suppressed for single-compound or centered-part marks), Notes (annotation
  replay), Play on the animated marks, and "Adopt <name>". A card collapses
  via its close button or by opening another card; drags and empty-space
  clicks leave it alone. The canvas still pans with a card open. Adopted
  marks show Status "Rejected" struck through, the adopter in the meta grid
  (name, date, organization, home link), their introduction quoted under the
  description, green annotations, and no Adopt CTA.
- Adopt flow: "Adopt <name>" flips the card 180° on Y to the application —
  Name / Organization / Email / Make your case → Submit Application drafts a
  mailto to hey@konpo.studio ("Adopt SYM-0XX — Application") and throws
  ribbons from both side edges. Back/Esc flips it back.
- List view: compact index table (glyph, id, name, category, spec, status);
  a row opens the right drawer — Notes/Turn/Explode/Play stage, scale ramp
  (96/64/44/28/16px), Status/Reason/Category/Intake/Attachment, the
  "Adopted by" section on adopted marks, and the adopt panel.
- The Konpo logomark card closes the untouched catalogue (accent purple,
  playing the Konpo Notes four-dot dance on loop — anim/konpo.json; the
  fifth, center circle is tile-colored so it reads as cutting the dots).
  Links to konpo.studio. Searches and filters set it aside.
- Bottom-right chip (styled like the search bar): "Get notified when we add
  more" opens an inline email field that drafts a mail (no backend by design).
- Card text (name, description, meta, controls, close) blurs in only after
  the card finishes growing (~580ms); until then the chrome is also
  non-interactive so a hasty second tap can't hit the invisible close button.

## Performance

Tuned for cheap phones: tiles carry `content-visibility: auto` (off-screen
copies skip style/layout/paint); hidden views are never built (list renders
lazily, boot renders the grid exactly once); the reveal only animates tiles
near the viewport; off-screen Konpo dance copies pause via
IntersectionObserver; the card's Play animation is destroyed on collapse;
height-only resizes (soft keyboard) don't rebuild the canvas; drawer blur
applies to the viewport-sized `.grid`, not the huge canvas layer; touch
devices drop backdrop-filter chips and use 16px inputs (no iOS focus zoom);
lottie-web is self-hosted at `/vendor/lottie.min.js` (no CDN dependency);
`/anim` + `/vendor` get day-long cache headers via `vercel.json`. Page is
~330KB raw / ~100KB brotli, no webfonts, sounds synthesized in WebAudio.
- Provenance: every rendered SVG embeds an ownership comment (© Konpo, the
  mark's id + name, and its adoption URL) plus a quiet per-mark class on the
  mark group (`k042`) that reads like styling but encodes the id — lifted
  copies stay traceable unless deliberately laundered.
- Right-click on any mark is blocked: "© Konpo — not up for grabs" toast at
  the cursor with a "Want it? Make your case." link into the adopt flow, plus
  the velvet state.error sound. Deterrent only — SVGs are inline in source.
- Sound: WebAudio engine ported from velvet-ui (24h.studio), velvet voice,
  synthesized live. drawer.open/close, toggle.on/off, action.send,
  state.error. Sound is a bonus layer — every play() is wrapped and never
  blocks.

## Known state / pending

- Rich per-mark construction geometry (orbits, radii, pitches) exists for
  001–015 and the curated twelve (022, 024, 026, 038, 048, 050, 086, 089, 095
  were derived from measured anatomy); other marks carry baseline
  auto-annotations (bbox frame, axes, center, dims, part count).
- Rejection reasons are set on the 13 originally-catalogued marks; the rest
  read "Unknown" pending their paperwork.
- Current adopters (Tessera, Swarm) are placeholder fiction pending real ones.
- Category filters were removed at 15 marks; at 70 with four real categories
  they likely earn their way back (chips CSS still exists, unused).
- "Sign up for updates" in the footer is not wired to anything yet (the RSS
  feed covers the subscribe case for now).
- Fonts fall back to Helvetica Neue; the real Neue Haas webfont would tighten
  the header noticeably.
