# Symbol Shelter

**A shelter for the logos that didn't make it.** By Konpo Studio.
Live at https://symbols.konpo.co

> A logo takes hundreds of proposals. Only one gets picked.
> This is the shelter for those who didn't make it.
> They deserve better than a folder called old.

---

## What it is

Every identity project leaves a trail of good marks behind. They lose the pitch round for the usual reasons: a new CMO, a merger, a committee that found them "too modern." Then they sit in a folder called `old` and nobody sees them again. A portfolio only shows the winners.

Symbol Shelter is where those marks go instead. It's a public, living archive of rejected logomarks, currently 69 of them. Each one comes with its construction geometry and a record, and each one is up for adoption.

## The philosophy

**Treat rejected work like a rescue, not a graveyard.** The whole site borrows the language of an animal shelter. Marks arrive at intake, carry a record, have a temperament, and wait for the right home. Visitors don't download a logo. They apply to adopt one.

**The work is real. The paperwork is playful.** Every mark was drawn by Konpo as real identity work for real clients, with client details removed. The records around them are written as playful fiction, told from both sides: a client who didn't buy the proposal, and a designer who still thinks about it. Reasons are vague, faintly contradictory verdicts ("Too Startupy", "Too Enterprise", "Too Happy"). Attachment admits how hard it was to let go.

**Show the thinking, not just the result.** A logo is a set of decisions. Every mark is filed with how it was built: radii, orbits, pitch, part counts. The construction layer draws itself in on hover, so the craft is visible, not implied.

**Adoption, not a free-for-all.** The marks are offered to people and companies with projects worth backing, and they have to make a case. The site is generous to look at and deliberate about letting go: right-click is met with "Not up for grabs," and every mark carries quiet provenance.

**Motion is part of the craft.** Every interaction is meant to feel made: cards grow in place, views zoom rather than cut, icons morph, menus ease in and fold away. Motion gets measured, not eyeballed. If it doesn't hold a smooth frame rate on a slow phone, it gets reworked.

**Small and self-contained.** One HTML file, no framework, no backend, no web fonts, no audio files. It loads fast, gives crawlers a real page for every mark, and can't break because a service went away.

---

## The catalogue

69 marks in four families, sorted by what you see first: what is the mark made of?

| Family | What's in it | Marks |
|---|---|---|
| **Letters** | Built from a letter, or reads as one first | 10 |
| **Blooms** | Petals, arms or rings repeated around a center | 20 |
| **Orbs** | One circle, sliced, lined, ringed or wound | 22 |
| **Modules** | Discrete units: dots, tiles, bonds and pairs | 17 |

Every mark has an id (`SYM-001` to `SYM-096`; retired numbers are never reused), a name and a short description. Its record holds:

| Field | Meaning | Values |
|---|---|---|
| **Status** | Where it stands | Rejected |
| **Reason** | The client's verdict | "Too ___", one per mark, all different |
| **Category** | Its family | Letters, Blooms, Orbs, Modules |
| **Intake** | When it arrived | Feb 2024 to Dec 2025; marks from one rejected proposal share a month |
| **Attachment** | How hard the designer took it | Low, Medium, High, Still Hurts |
| **Spec** | How it's built | Geometry, e.g. `5 × R 14.4 · orbit 25.6u · 72° pitch` |

---

## Features

### Browsing the shelter
- **An endless field.** The marks tile an infinite canvas you drag around, with momentum and a smooth glide. The field wraps, so there's no edge to hit.
- **Three zoom levels.** Grid, zoomed out and far. Switching actually zooms around the center of the screen. The toggle icon morphs between three glyph layouts, and repeated presses wait their turn.
- **Far view as an overview.** Labels and hover effects step aside. Tapping a mark zooms in to the middle level and opens it.
- **An arrival wave.** On load the cards reveal from the center outward, and the animated marks start playing as the last visible card lands.
- **Hover drafts the construction.** Guides, points and dimensions draw in element by element, the corner notes type in, and the name and category labels arrive in sequence. Marks also turn in 3D on hover.
- **An intro.** Two lines type in word by word before the shelter appears.

### The card
- **Opens in place.** A tile grows into a card and pushes its neighbours aside. The canvas can still pan while it's open.
- **What it shows:** the mark, its description and its full record.
- **Turn:** rotates the mark as a solid 3D object (Three.js, cumulative 90° turns).
- **Explode:** pulls the mark apart into its parts.
- **Notes:** replays the construction layer with the spec written as corner notes.
- **Play:** runs the mark's own motion cycle on the fifteen animated marks. Each loop comes from the mark's path data and has its own verb: the Link tugs taut, the Dahlia blooms petal by petal, the Turbine's hemispheres shear past each other.
- **Adopt:** the card flips over to an application (name, organization, email, "make your case"), which drafts an email to Konpo.

### Color
- **One-hue schemes.** The color button opens a hue ramp on a random color. The whole site recolors from a single hue: a pastel mark on a deep ground of the same family, the 3D marks included.
- **Select** locks the hue in, and **Original** returns the shelter to black. Every visit starts on black.
- **The icon waxes** from a half circle to a full disc while a scheme is on.

### Finding and sharing
- **Search** by id, name, category, spec, reason or status. Press `/` to jump to it.
- **Filter** by family from the All menu.
- **Every state is a link:** the category, search and zoom level live in the address, with Back and Forward support.
- **A page per mark.** `/s/sym-0xx` opens the full shelter with that card open, with its own title, description and share image. Closing the card returns home.
- **Share images** show the symbol alone on the tile color, with no text.
- **Feeds and SEO:** RSS and JSON feeds, a sitemap and robots.txt, all generated at build.
- **A 404 page** that plays the Konpo mark and walks you back to the shelter.

### Adoption and protection
- The **Adopt** flow asks for a case, not just an email.
- **Right-click on a mark** shows "© Konpo. Not up for grabs." with a link into the adoption flow.
- **Provenance:** every rendered mark carries an ownership comment and a quiet per-mark class that encodes its id, so lifted copies stay traceable.
- **"Notify me"** in the corner offers updates as new marks arrive. On desktop it reads "New marks soon. Notify me"; on phones just "Notify me."

### The shell
- **Liquid glass controls** on desktop: frosted buttons with a light lens that refracts the marks sliding underneath (Chromium), and a plain frost elsewhere.
- **The Symbol Shelter menu** holds what this is, a line about Konpo, and links to Instagram, X, Substack and konpo.studio.
- **The Konpo card** sits at the end of the catalogue, plays the studio's four-dot dance, inverts to purple on hover and links to konpo.studio.
- **Sound design:** soft UI sounds synthesized live in the browser, with no audio files. Sound is a bonus layer and never blocks anything.

### On phones
- Cards fit the screen: the mark sits smaller, the record and the Adopt button anchor to the bottom, and there are no scrollbars.
- A compact top bar with one button height and even gaps; the search field grows while the wordmark steps aside.
- Taps never leave buttons stuck in a hover state. The heavy glass is swapped for a light frost so menus open smoothly.
- No text selection or tap highlights while browsing.

### Accessibility and performance
- **Keyboard:** one tab stop per mark, Enter or Space opens it, Esc closes cards and menus, and arrow keys move the color ramp.
- **Contrast:** small labels clear WCAG AA.
- **Reduced motion** is respected by every animation.
- **Built for cheap phones:** off-screen tiles skip rendering, views build only when needed, and motion is profiled on a throttled CPU with a real GPU.

---

## How it's built

- **One file:** `index.html` holds the page, the styles, the logic and all 69 marks as inline SVG. `symbol-index.html` is a mirror of it.
- **`solid.js`:** the Three.js module behind the 3D turns.
- **`scripts/build-meta.mjs`:** generates the per-mark pages, share images, feeds, sitemap and robots.txt from the catalogue.
- **Hosting:** static on Vercel at symbols.konpo.co. Deploy with `npm run deploy`, which rebuilds everything and then publishes, so no mark page ever serves an old copy.

---

## Open threads

- The intro currently plays on every visit; a proper first-visit rule is still to come.
- Analytics aren't set up yet.
- A pass on a real iPhone in Safari.
- On phones, cards could zoom out of their tile as a layer on top for a smoother open and close.
- The adoption and notify forms draft emails for now; a real contact form is coming.
- The data already supports Adopted marks (owner and date on the card, no Adopt button). None are adopted yet.
