# A Second Round — Konpo Symbol Index

Single self-contained page: `symbol-index.html`. No build step, no dependencies.
Open it in a browser or drop it into any static host. Everything below is context
for working on it.

## Structure

- One HTML file. All CSS in `<style>`, all JS inline, all 70 marks inline as SVG
  strings in `const S = [...]` (the only data structure that matters).
- rem base is 62.5% (1rem = 10px). Konpo tokens: bg #000, tile #141414,
  purple #9680ff (construction), green #4ade80 (status: Revived),
  fade #6c6c6c, line rgba(255,255,255,0.10). Sans: Neue Haas Display Pro
  stack, weight 400 only. Mono: ui-monospace stack, weight 300 for labels.

## Data schema (per entry in S)

- id        "SYM-001"..."SYM-094" with gaps (089, 090, 093, 094, 095 are 2026 intakes) — removed from the index: 003,
  008, 009, 025, 031, 032, 033, 034, 036, 037, 047, 051, 054, 057, 060, 063, 066,
  064, 070, 071, 076, 087, 088, 091, 092 (ids keep their numbers; 70 marks
  remain). SYM-095 sits in 064's old slot.. SYM-026 sits in
  003's old grid position and SYM-050 in 008/009's (array order, not renumbered).
- name      every mark is named (distinct across the set)
- cat       category: Monogram / Geometric / Abstract / Pictorial
- spec      mono construction one-liner
- mark      SVG inner markup (white fills via CSS; class="stroked" = stroke art,
  optionally with inline style="stroke-width:X" to keep a source's weight)
- con       construction layer: class="guide" dashed, class="pt" points,
            plain <line pathLength="1"> = solid dims (draw-on), <text> = corner notes
- blurb     description shown in drawer — every mark has one, written to run
  ~3 lines at the drawer's 48ch measure
- year / status   001–015: 2025; 001–014 "Rejected", 015 + 022 "Adopted";
  the rest "—". (industry still in data but no longer shown in the drawer)
- reason    why it was rejected — quirky two-word "Too ___" vocabulary
  (Too Circular, Too Clever, Too Timeless…), set on the 13 catalogued marks,
  matched to each mark's character; drawer shows "Unknown" when absent.
  Drawer field order: Status, Reason, Category, Year, Attachment.
- attachment  "High" | "Medium" | "Low"; 001–015 "High", optional elsewhere
  (drawer falls back to "—"). Status colors: Adopted (or legacy Revived) =
  green #4ade80 + green dot on the tile .idx and drawer meta; Rejected = red #f87171.
- explode   'auto' | [[dx,dy],...] | null. auto derives vectors from part bboxes
- spin      true on SYM-001, 002, 004 (003 removed): parts rotate 360° while exploding

`sym-file-map.txt` maps SYM-016+ to source SVG filenames.
`keepers.json` has the cleaned glyphs + measured bboxes for those 73.

## SVG contracts (do not break)

1. Every mark: `<g class="mark">` + `<g class="construction">`, viewBox -28 -28 256 256.
2. NEVER combine vector-effect: non-scaling-stroke with dash-based animation.
   Chromium computes dashes in screen px under NSS. Solid dim lines therefore
   use vector-effect: none + stroke-width 0.55; dashed guides keep NSS but
   animate opacity + pattern slide, never a normalized draw.
3. Hidden-at-rest construction is opacity-gated, not dash-gated (leak-proof).
4. typeset() strips <text> out of con at runtime and renders them as an HTML
   .notes overlay (fixed 11px at every viewport, top-right 1.6rem/1.8rem —
   mirrors the .idx spec). Char delays: element-stagger + 35ms/char typing.

## Interaction map

- Intro: black screen, three lines typed in word-by-word (blur-in), then the page
  h1 slides in from the left, then chrome, then grid. Click/Esc/Enter skips.
  prefers-reduced-motion bypasses. Consider making it first-visit-only
  (sessionStorage) before shipping.
- Tile hover: sibling tiles + header/footer blur (CSS :has), construction
  drafts in element-by-element (nth-child stagger to 16), corner notes type in.
- Click tile -> right drawer (fixed, 48rem). Page blurs harder, scroll locks,
  scrim/Esc/Close dismiss. Stage controls: Annotations (off by default, active
  state when on, replays the drafting on every re-enable, auto-assembles if
  exploded), Turn (cumulative 90°, rotates stage + scale ramp), Explode
  (auto-vectors, forces annotations off, 1.4s, spin group rotates 360°).
  Explode button suppressed when a mark is a single compound path (e.g. G Mark).
- Scale ramp: 96/64/44/28/16px, bottom-aligned, under the stage.
- Last grid card is the Konpo logomark in accent purple (KONPO / Konpo Studio /
  konpo.studio), opens https://konpo.studio in a new tab. It plays the Konpo Notes
  widget's four-dot dance on a continuous loop (anim/konpo.json, extracted
  from konpo-comments/konpo-lottie.json: white disc dropped, dots recolored to
  the accent purple, precomp-wrapped so the resting cluster sits in the 80u
  mark box); static purple mark is the reduced-motion/CDN fallback.
- Adopt request: "Adopt <name>" full-bleed band at the drawer bottom (id
  fallback for Untitled marks). Clicking pushes the drawer left and slides in a
  second equal-width panel (#adopt) whose fields and button are full-bleed
  hairline sections (click anywhere in a section to type; focus = raised bg +
  purple label): Name / Organization / Email / Make your case + Submit Application -> mailto to hey@konpo.studio, subject
  "Adopt SYM-0XX — Application". Esc closes the form first, drawer second;
  form clears when the symbol changes.
- Right-click on any mark (tiles, drawer stage, scale ramp) is blocked: shows a
  "© Konpo — not up for grabs" toast at the cursor + state.error sound.
  Deterrent only — the SVGs are still inline in the page source.
- Sound: WebAudio engine ported from velvet-ui (24h.studio), velvet voice only,
  synthesized live (no audio files). drawer.open/close on the modal,
  toggle.on/off on the revive panel, action.send on submit. Sound is a bonus
  layer — every play() is wrapped in try/catch and never blocks.

## Known state / pending

- SYM-016..088: baseline auto-annotations only (bbox frame, axes, center,
  W×H dim, part count). Rich per-mark construction like 001–015 requires
  deriving each mark's real geometry (orbits, radii, pitches) from path data.
- Status system: green dot on .idx + green Status value keys off
  status === 'Revived'. Keep the color vocabulary tight: purple = construction,
  green = revived. Resist per-status colors.
- Category filters were removed at 15 marks; at 88 they likely earn their way
  back (chips CSS still exists, unused).
- Fonts fall back to Helvetica Neue; real Neue Haas webfont on konpo.studio
  will tighten the header noticeably.
