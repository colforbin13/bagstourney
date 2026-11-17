---
name: Bracketway
description: The event flyer taped to the bar door. One sheet of bright copy paper, one black ink.
colors:
  sheet: "#1FBF6B"
  sheet-deep: "#17A35A"
  toner: "#141414"
  toner-pressed: "#33383A"
  toner-dim: "#3C423D"
  highlight: "#FF7AA8"
  marker: "#0B7A43"
  danger: "#B3261E"
  white-stock: "#FFFFFF"
  recessed-stock: "#EDF0EB"
  ruled-line: "#868E86"
  muted: "#5F685F"
typography:
  display:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(2.7rem, min(7.6vw, 10.6vh), 6rem)"
    fontWeight: 900
    lineHeight: 0.93
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 106"
  headline:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.9rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 108"
  title:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 108"
  body:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0em"
rounded:
  none: "0px"
spacing:
  control-gap: "12px"
  gutter: "16px"
  card: "20px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.toner}"
    textColor: "{colors.white-stock}"
    rounded: "{rounded.none}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.toner-pressed}"
    textColor: "{colors.white-stock}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.toner}"
    rounded: "{rounded.none}"
    padding: "10px 20px"
  button-outline-hover:
    backgroundColor: "{colors.recessed-stock}"
    textColor: "{colors.toner}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.none}"
    padding: "10px 20px"
  button-danger-hover:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.white-stock}"
  button-small:
    rounded: "{rounded.none}"
    padding: "6px 12px"
  hero-action:
    backgroundColor: "{colors.toner}"
    textColor: "{colors.white-stock}"
    rounded: "{rounded.none}"
    padding: "0 28px"
    height: "56px"
  input:
    backgroundColor: "{colors.white-stock}"
    textColor: "{colors.toner}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.white-stock}"
    textColor: "{colors.toner}"
    rounded: "{rounded.none}"
    padding: "20px"
  badge-live:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.toner}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  badge-quiet:
    backgroundColor: "{colors.white-stock}"
    textColor: "{colors.toner-dim}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  nav:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.toner}"
    height: "52px"
  tear-off-tab:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.toner}"
    rounded: "{rounded.none}"
  tear-off-tab-hover:
    backgroundColor: "{colors.sheet-deep}"
  tear-off-tab-go:
    backgroundColor: "{colors.toner}"
    textColor: "{colors.sheet}"
  sheet-foot:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.toner}"
  sheet-foot-row-hover:
    backgroundColor: "{colors.sheet-deep}"
---

# Design System: Bracketway

## Overview

**Creative North Star: "The Door Flyer"**

Bracketway looks like the event flyer taped to the bar door: one sheet of bright copy paper and one black ink. Pages that persuade print on the green sheet edge to edge, navigation included, with heavy, slightly wide toner type set very large in sentence case. Anything a person writes on or reads work from is white stock: the sign-up sheet, inputs, cards, and every working screen, which sits on white under the same green header.

The system is spare on purpose. There is one typeface, one ink, square corners, ruled lines and dashed cut lines. A second ink, pink highlighter, appears only to say something is live right now. Depth is paper depth: a sheet lying on another sheet. Motion is paper motion: things slide and settle like a sheet being set down. Nothing glows, and nothing fades in on scroll.

It should feel as easy as a sign-up sheet to a first-time organizer standing at a venue with a phone in one hand. The wrong outcomes, named by the owner, are corporate software, childish or jokey, and dark and moody.

**Key Characteristics:**
- One sheet colour, one black ink, one highlighter with a single meaning
- One typeface (Archivo) doing every job through weight and width
- Square corners, toner rules, dashed cut lines where something tears off
- Sentence case everywhere, large and plain
- White stock for anything written on; the green sheet for anything announced
- Paper depth and paper motion only

## Colors

A two-colour print job: saturated green paper and black toner, with white stock for the work and a pink highlighter held back for one meaning.

### Primary
- **Sheet Green** (`sheet`, #1FBF6B): the copy-paper sheet. Fills Persuade surfaces edge to edge (the home hero and its tear-off tabs, and the sheet head and sheet foot of every other Persuade page) and the header of every screen. On working screens it appears nowhere else at size; its only other use is the small square bullet on the home feature list.
- **Sheet Green, Pressed** (`sheet-deep`, #17A35A): hover and open state for things printed on the sheet (tabs, sheet-foot rows, nav dropdown triggers).
- **Toner** (`toner`, #141414): the only ink. All type, primary actions, links, card rules, focus rings, progress fills and the bracket mark.
- **Toner, Pressed** (`toner-pressed`, #33383A): hover state of a toner-filled action.

### Secondary
- **Highlighter Pink** (`highlight`, #FF7AA8): "live right now". Shipped use: the Live status badge, with toner text on it.

### Tertiary
- **Marker Green** (`marker`, #0B7A43): won or confirmed. Winning team name and score, champion line, "Won by" text, success toasts, and the recommended plan's name and price on Pricing (the Pro card, whose frame is 3px toner). Also used as a faint tint behind a winning row (8% over white) and a 40% border on a completed match.
- **Correction Red** (`danger`, #B3261E): destructive actions and errors only. Outline that fills on hover.

### Neutral
- **White Stock** (`white-stock`, #FFFFFF): the page of every working screen, cards, inputs, the sign-up sheet, text on toner fills.
- **Recessed Stock** (`recessed-stock`, #EDF0EB): hover fill for outline buttons, list rows and menu items; toolbar groups; empty progress track.
- **Ruled Line** (`ruled-line`, #868E86): the thin ruled line. Input borders, match cards, row dividers, bracket connectors.
- **Toner, Dimmed** (`toner-dim`, #3C423D): secondary copy, footer links, quiet badges.
- **Muted** (`muted`, #5F685F): placeholders, metadata lines, "vs", losing scores.

### Named Rules
**The One Ink Rule.** Type, links and primary actions are toner. A link is marked by its underline (1.5px, thickening to 2.5px on hover), never by a colour. Marker green and correction red are the only other inks, and each has one job.

**The Highlighter Rule.** Pink means live right now and nothing else. It is never decoration, never a hover, never a brand accent. A made-up example tournament is never live, whatever its seeded state, so an example in progress gets an outlined "In progress" badge instead. That holds on the example's own bracket page and TV view as well as in lists. Text selection is toner turned inside out for the same reason.

**The Sheet and Stock Rule.** Persuade surfaces print on the green sheet. Working screens are white stock under the green header. The header is what makes a working page recognisably Bracketway without colouring the work.

## Typography

**Display Font:** Archivo, variable width and weight (with 'Helvetica Neue', Arial, sans-serif)
**Body Font:** Archivo (same family)
**Label/Mono Font:** none distinct. The `--mono` custom property survives as a name only and maps to Archivo.

**Character:** One heavy, slightly wide grotesque doing every job. Headings widen (106 to 112% width) and go to weight 800 or 900 with tight tracking; body copy is the same face at normal width. Numerals are tabular everywhere, which is what replaced the monospace.

Loaded from Google Fonts with the width axis 62 to 125 and weight axis 100 to 900.

### Hierarchy
- **Display** (900, width 106%, clamp(2.7rem, min(7.6vw, 10.6vh), 6rem), line-height 0.93, tracking -0.04em): the home headline only. The home page's step numerals, step titles and list title share its 106% width, so the display voice runs at one width; only the wordmark goes wider.
- **Headline** (800, width 108%, 1.9rem, line-height 1.05, tracking -0.025em, balanced wrap): page titles on working screens. Marketing page titles run larger (pricing: clamp(2rem, 7vw, 2.8rem)).
- **Title** (800, width 108%, 1.4 to 1.7rem): card and panel headings, pricing tier names, the sign-up sheet title (900).
- **Body** (400, 1rem, line-height 1.5): running copy. Ledes cap at about 62ch, step copy at 56ch. Emphasis within body is weight 600 to 800, not colour.
- **Label** (600, 0.78rem, tracking 0): board names, toolbar group labels, small metadata. Status badges are 700 at the same size with 0.02em tracking. Group headings in lists are 800 at 0.85rem over a 2px toner rule.
- **Wordmark** (900, width 112%, clamp(1.3rem, 1.9vw, 1.6rem), tracking -0.03em): "Bracketway" in the header.

### Named Rules
**The One Face Rule.** Archivo is the only typeface. Hierarchy comes from weight and width, never from a second family.

**The Sentence Case Rule.** Everything is sentence case. No uppercase, no tracked-out labels, no small label sitting above a heading.

## Layout

Working screens are a single centred column: 680px maximum with a 16px gutter and 24px top padding. The bracket itself breaks out to full width and scrolls horizontally. Marketing content aligns to 1100px, and the home hero and header align to 1320px with a fluid gutter of clamp(16px, 4vw, 56px).

The home hero is the whole first viewport as one green sheet: copy on the left, the white sign-up sheet in a 280 to 360px column on the right, and a strip of seven tear-off tabs along the bottom edge. Below it, each step gets one full-width ruled band on white (numeral, title, copy in three columns). Under the steps, the example brackets get the same ruled treatment: one row each, opened by a 3px toner rule, with what the example shows at weight 800 on the left and the made-up event's name and team count beside it. The list of real tournaments follows, and is left out when there are none to show.

The other Persuade pages (How it works, Pricing, Sports, Blind draw generator, Fundraiser guide, Scoreholio comparison) print the same flyer in three parts. The **sheet head** is the page title at display scale (weight 900, 106% width, up to 5rem) and the lede, on the green sheet edge to edge and closed by a dashed cut line. The **stock body** below sits on the header's `--page-gutter`, with running prose held to a 760px measure and each section opened by a 3px toner rule. The page ends on the **sheet foot**, where the green sheet returns edge to edge and is the page's only footer (see Navigation). The shared pieces are the global `.sheet-head`, `.sheet-body`, `.measure` and `.ruled` classes; the foot is drawn by `<app-footer>`, which picks it by route.

Rhythm is tight and list-like: 12px between controls, 20px inside cards, 24 to 32px between sections. Lists are ruled rows, not stacked cards.

Responsive behaviour, as built:
- **860px and below:** the hero stacks (copy, sheet, supporting lines) so the working draw stays on the first phone screen; step bands drop to two columns.
- **640px and below:** header links collapse behind a 44px menu button. The open menu is the same green sheet, separated from the header by a dashed cut line and closed by a solid toner rule. Menu items are at least 44px tall.
- **600px and below:** bracket rounds stack vertically and connectors are dropped. TV mode keeps the horizontal bracket at any width and scales it to fit.
- **520px and below:** the hero action goes full width.

Inputs use a 16px font size so phones do not zoom on focus.

## Elevation & Depth

Flat, with paper depth only. Surfaces are separated by rules and by the change from green sheet to white stock. A shadow appears only where one sheet physically lies on or lifts off another.

### Shadow Vocabulary
- **Sheet edge** (`box-shadow: 0 1px 0 rgba(0, 0, 0, .22), 0 14px 22px -16px rgba(0, 0, 0, .45)`): the white sign-up sheet resting on the green hero.
- **Menu edge** (`box-shadow: 0 10px 18px -8px rgba(0, 0, 0, .35)`): any dropdown menu or modal, a white sheet with a 1.5px toner rule.
- **Lifted** (`box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18)`): a row while it is being dragged.

### Named Rules
**The Sheet's Edge Rule.** Shadows belong to a sheet's edge. Cards, buttons, inputs and badges are flat at rest and flat on hover.

## Shapes

Square corners throughout (0px radius). Structure is drawn with lines:

- **Toner rule, 1.5px:** the edge of a card or sheet, dividers, the lines of the sign-up sheet. Heavier rules (2px, 3px) sit under headings and open a ruled section.
- **Ruled line, 1px grey:** cells inside a sheet: inputs, match cards, board tiles, list rows.
- **Cut line, 2.5px dashed toner:** where something tears off or separates: the tear-off tabs, the footer, the mobile menu.

Icons are drawn SVG in a 2px square-ended stroke in the current ink (arrows, carets, the disclosure chevron, check marks). Section labels and feature bullets carry a small filled square (7 to 8px).

The bracket mark is the one place round forms belong: two filled nodes joined by curved lines to a third. It appears in the header, footer and favicon (toner on the green sheet), and bracket connectors repeat its dots at junctions. The loading spinner is also round.

The sign-up sheet sits slightly crooked (rotated 1.2 degrees, 0.8 on phones), as if set down by hand. That tilt belongs to a sheet placed on the flyer, not to working UI.

## Components

### Buttons
Plain and flat, like a filled or outlined box on a form.
- **Shape:** square (0px), 1px toner border, 10px 20px padding, 0.875rem at weight 600. Small variant: 6px 12px, 0.78rem.
- **Primary:** toner fill, white text. Hover goes to pressed toner.
- **Outline (default):** transparent, toner text and border. Hover fills with recessed stock.
- **Danger:** red text and border; hover fills red with white text.
- **Disabled:** 45% opacity.
- **Hero action:** the large form on the green sheet. 56px tall, 1.2rem at weight 800, toner fill. Lifts 2px on hover and settles back on press.
- **Focus (all interactive elements):** 3px toner outline, 2px offset. On a toner-filled tab the outline switches to sheet green.

### Badges
- **Style:** square, 2px 8px, 0.78rem at weight 700.
- **Live:** highlighter fill, toner text.
- **Setup / Final:** white stock, dimmed toner text, 1px ruled-line border.

### Cards / Containers
- **Corner Style:** square.
- **Background:** white stock.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1.5px toner. A featured pricing tier steps up to 2px.
- **Internal Padding:** 20px.
- Cells inside a card (board tiles, match cards) use the 1px grey ruled line. A board tile adds a 3px toner top rule.

### Inputs / Fields
- **Style:** white stock, 1px ruled-line border, square, 10px 12px, 16px text. Placeholder in muted.
- **Focus:** border turns toner and gains a 1px inset toner line, so it reads as a 2px rule.
- **Error:** red text on a 10% red tint with a 35% red border.

### Navigation
- **Header:** 52px, sticky, sheet green on every screen. Wordmark left, links right at weight 600 with no underline at rest; hover and the current page take a 2px underline.
- **Dropdowns:** triggers are ruled left and right in 1.5px toner and press to the deeper sheet green. The menu is a white sheet with a 1.5px toner rule and the menu-edge shadow; items hover to recessed stock.
- **Mobile:** see Layout. Three 2px toner bars for the menu button.
- **Footer:** opens with a full-width dashed cut line. Centred: the "Run your own tournament for free" link at weight 800, "Powered by Bracketway" with the mark, then quiet links in dimmed toner. This is the footer of brackets, working screens, the legal pages and the home page.
- **Sheet foot:** the footer of every other Persuade page, and the only ending those pages have. Green sheet edge to edge, opened by a dashed cut line and aligned to the header's `--page-gutter`, all in toner (dimmed toner falls under 4.5:1 on the sheet). Left: one closing line in the display voice (900, 106% width, up to 3.75rem) over a hero action. Right: the other marketing pages as ruled rows, opened by a 3px toner rule and divided by 1.5px toner rules, each a label at weight 800, a few words on what the page is for, and a drawn arrow; the current page is left out. Hover presses a row to the deeper green and insets it 8px. Along the bottom, under a 1.5px toner rule: the mark and wordmark, then Terms, Refunds and Privacy. At 860px and below the index drops under the closing line with the action out at the right edge; at 520px and below the action goes full width and each row's note drops under its label.

### Tear-off Tabs
The strip along the bottom of the home flyer, and nowhere else: tabs hang off the bottom edge of the green sheet, so they only make sense where the sheet is the whole screen. (A strip at the foot of the other Persuade pages was tried and dropped on 2026-11-16: under white stock it read as a second footer.) Seven equal tabs divided by dashed cut lines, lettering turned on its side at weight 800. The first tab is inverted (toner fill, sheet-green lettering) and carries the primary action. Hover presses the tab to the deeper green and nudges the lettering 6px.

### Sign-up Sheet
White stock on the green hero, slightly rotated, with the sheet-edge shadow. A title over a 3px toner rule, numbered lines ruled in 1.5px toner, and a full-width 54px toner bar. Pressing the bar pairs the names into teams in place; each row slides and settles (0.5s, cubic-bezier(.16, 1, .3, 1), 70ms stagger) and stays readable throughout. Disabled under reduced motion.

### List Rows
Ruled rows, not cards: 14px vertical padding, 1px ruled-line divider, name at weight 700, a muted metadata line, a 5px toner progress bar for live brackets, and a drawn arrow. Hover fills with recessed stock and indents 8px.

### Bracket Match Card
White stock, 1px ruled-line border, two team rows split by a 1px line. The winner's row takes marker-green text at weight 600 over the faint green tint; the loser dims to muted. A game assigned to a board gains a toner border and a toner strip across the top naming the board. Matches not yet playable sit at 50% opacity. Connectors are 1.5px ruled lines with toner dots at the junctions.

### Disclosures
A drawn chevron in the 2px square stroke replaces the browser triangle and turns from right to down when open. Question lists are ruled top and bottom in 1.5px toner.

## Do's and Don'ts

### Do:
- **Do** print Persuade surfaces on the green sheet edge to edge, and keep working screens on white stock under the green header.
- **Do** use toner (#141414) for all type, links and primary actions, and mark links with an underline.
- **Do** keep the highlighter for "live right now" and marker green for "won or confirmed".
- **Do** set everything in Archivo, building hierarchy from weight (400 to 900) and width (100 to 112%).
- **Do** write in sentence case.
- **Do** keep corners square and draw structure with rules: 1.5px toner for a card's edge, 1px grey for cells inside it, 2.5px dashed for a cut line.
- **Do** draw icons as SVG in a 2px square stroke in the current ink.
- **Do** keep touch targets at 44px or more on phones, and inputs at 16px text.
- **Do** honour reduced motion: the settle animations switch off.

### Don't:
- **Don't** use the highlighter as decoration, a hover state or a brand accent.
- **Don't** colour a link or a primary action with anything but toner.
- **Don't** add a second typeface, including a monospace for numbers or labels; tabular numerals already do that job.
- **Don't** set labels in uppercase or tracked-out capitals, and don't put a small label above a heading.
- **Don't** round corners on cards, buttons, inputs or badges. The bracket mark's nodes and the spinner are the only round forms.
- **Don't** put a shadow on anything that isn't a sheet lying on, or lifting off, another sheet.
- **Don't** use a dashed line as a general divider; it means "cut here".
- **Don't** fill a working screen with the sheet colour.
- **Don't** make things glow, or fade content in on scroll. Things slide and settle.
- **Don't** drift toward the three named wrong outcomes: corporate software, childish or jokey, dark and moody.

## Open Items

Not yet decided or not yet brought into this system. These are gaps, not rules.

- The signed-in screens were reviewed in a browser on 2026-11-16 at desktop and phone width. Admin tables (users, audit log, traffic) use `.page-table`, which holds them to the header's `--page-gutter` instead of the window edge.
- The public bracket page stays a green header over white stock. A green band carrying the tournament name was considered and deferred on 2026-11-17 (`.scratch/flyer-across-pages/issues/03-bracket-page-band.md`).
- Other sheet colours (yellow or pink stock for other Persuade pages) are undecided. Only the green sheet is established.
