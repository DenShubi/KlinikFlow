# KlinikFlow design system

Single source of truth for the UI. If CSS or components drift from this file, this file wins.

## Discovery

- **Artifact:** composite. Patient side (home, intake, live ticket) is a mobile-first consumer flow; staff side (doctor, reception) is a dense working dashboard.
- **Audience:** patients of a small Indonesian clinic, often on a phone, often unwell; receptionists and doctors on a desktop all day.
- **Primary actions:** patient → take a number, then know when to come. Doctor → call / start / finish the next patient. Receptionist → add a walk-in, mark a remote patient as arrived.
- **Adjectives:** calm, trustworthy, clear, warm, efficient.
- **Essence:** printed, calm, certain.
- **Copy rule:** say what the person should do, never how the system works. No latency, provider, model, confidence or "estimate source" text on user screens. Short sentences, Bahasa Indonesia by default; English through the language switch (flags, bottom left). Every user-facing string lives in both dictionaries in `src/lib/i18n/dictionaries`, never inline.

## Aesthetic and signature move

Clinical-calm: navy text on near-white, one indigo accent used sparingly for the single primary action and the "your turn" moment. Soft navy-tinted elevation, no borders on elevated surfaces.

**Signature move — the perforated ticket.** Notched sides, a dashed tear line and a stub. The patient's ticket is a real ticket; the stub turns indigo when they are called. The same shape is the logo glyph, the home-page visual, and the doctor's "current patient" card.

## Typography

- **Plus Jakarta Sans** (UI, display, numerals) — designed for Jakarta, humanist-geometric, friendly but precise.
- **IBM Plex Mono** (ticket meta only: dates, labels on the ticket, codes in tables) — thermal-print feel.
- Scale: base 16px, ratio 1.25 → 12.8 / 16 / 20 / 25 / 31 / 39; ticket number 72–88px, weight 800, tabular.
- Body line-height 1.5; headings 1.1–1.2, tracking −0.02 to −0.04em.

## Color (from the supplied medical palette)

| Token | Value | Role |
|---|---|---|
| `ink` | #122056 | text, navy surfaces ("now serving") |
| `accent` | #5B65DC | primary button, links, called state (white on it = 4.8:1) |
| `accent-strong` | #4750C9 | hover / pressed |
| `tint` | #EEEFFD | secondary buttons, list markers, selected rows |
| `canvas` | #FAFAFD | page background |
| `surface` | #FFFFFF | cards, ticket, header bar |
| `muted` | #59618A | secondary text (6:1 on white) |
| `faint` | #8C92B3 | placeholders, decoration only |
| `line` / `line-soft` | #DFE1F2 / #ECEDF8 | separators |
| `ok` / `ok-soft` | #12703A / #E5F5EB | done, arrived |
| `warn` / `warn-soft` / `warn-line` | #8A4B00 / #FFF4DD / #F2D6A2 | not arrived, missed, overtime |
| `danger` / `danger-soft` / `danger-line` | #B42318 / #FDECEA / #F5C2BC | cancel, errors |

Distribution ≈ 60 canvas/surface, 30 navy text, 10 indigo accent. Status is never color-only: every chip carries a word.

## Tokens

- Spacing base 4px; tight 8–12 inside groups, 24–40 between sections.
- Radius: **10px** (controls, chips) and **20px** (cards, ticket). Pills only for status chips.
- Shadow: one approach — soft navy elevation (`--shadow-card`, ticket uses `drop-shadow` so the notches stay transparent). Elevated surfaces have no border.
- Motion: `--ease-out` cubic-bezier(.2,.8,.2,1); 120 / 200 / 320ms. Only transform + opacity. Ticket enters with a 320ms rise. Under `prefers-reduced-motion` all movement is off; opacity cross-fades (class `fade-safe`, e.g. the home doctor carousel) stay, since nothing moves.

## Craft decisions

- **Layout:** patient pages are a single 440px column (phone-first) with the ticket as the hero; home splits copy/ticket on desktop. Staff pages use a full-width header bar and a 2-column working layout (current patient | queue; new-ticket form | queues).
- **Buttons:** ranked by importance — primary (indigo solid), secondary (tint), quiet (text), danger (outline). Min height 44px (32px only for dense table actions with 8px gaps). Full state matrix: hover, active (scale .98), focus-visible ring, disabled, pending label.
- **Forms:** visible labels, helper text under the field, errors inline with `role=alert`, values kept on error.
- **Tables:** text left, numbers right + tabular-nums, light row separators, status as worded chips.
- **Icons:** one inline set, 20px grid, 1.75 stroke, round caps (`src/components/icons.tsx`).
- **Imagery:** none; the product's own ticket is the visual.
- **Dark mode:** out of scope (clinic screens, light-only).
- **Accessibility:** WCAG 2.2 AA contrast, visible focus ring (2px accent, 2px offset), 44px targets, live regions for ticket status, reduced motion.

## Slop audit

- No Inter/Geist/system primary face ✔ · no gradients/gradient text ✔ · no glass ✔ · no border+shadow stacking ✔ · no icon-tile feature cards ✔ · no pulsing dots on non-live content ✔ · no developer copy on user screens ✔ · numbers tabular, right-aligned in tables ✔.
- Indigo is used because the brand palette demands it; kept to ~10% and to one meaning (act / your turn).

## Changelog

- 2026-11-20 — v1. Full redesign onto the supplied medical palette; perforated-ticket signature; removed system/dev copy from all user screens.
