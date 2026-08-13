---
target: app UI — colors, typography, components, buttons, alerts
total_score: 26
p0_count: 1
p1_count: 4
timestamp: 2026-08-13T11-13-59Z
slug: src-components-ui
---
⚠️ DEGRADED: single-context (session policy forbids spawning sub-agents unprompted; detector ran, browser inspection unavailable)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toasts + sidebar badges + new button spinners are solid; `Loading...` text instead of skeletons, no `aria-live` on toasts |
| 2 | Match System / Real World | 3 | Domain language is genuinely good (Briefs, Queue, Deliverables); "JSR" is unexplained jargon in the UI |
| 3 | User Control and Freedom | 3 | Cancel + ConfirmModal + smart back are there; Escape closes only some modals; no undo after a destructive delete |
| 4 | Consistency and Standards | 2 | 16 distinct font sizes; side-stripes on some cards not others; raw `<select>`/`<input>` alongside the `Select`/`Input` kit |
| 5 | Error Prevention | 3 | ConfirmModal on destructive paths, double-submit guard in Button; almost no field-level validation before submit |
| 6 | Recognition Rather Than Recall | 3 | Labelled nav, Cmd+K palette, category grouping; icon-only action buttons carry no accessible name |
| 7 | Flexibility and Efficiency | 3 | Cmd+K and `/` shortcuts; no bulk actions, no saved filters or views |
| 8 | Aesthetic and Minimalist Design | 3 | Coherent restrained palette; undermined by 8–9px text and card-in-card nesting |
| 9 | Error Recovery | 2 | Raw backend `err.message` surfaced in a toast that vanishes in 3.5s, with no retry and no record |
| 10 | Help and Documentation | 1 | No tooltips, no inline hints, no contextual help anywhere; STATUSES.txt is a file in the repo, not in the product |
| **Total** | | **26/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment.** This does not read as AI-generated slop. It reads as a real internal tool built quickly by one person with taste. There is a token layer, a shared component kit, consistent 150ms transitions, and restrained accent usage — the app is clearly *designed*, not assembled from a component library at random.

The honest caveat on identity: `#faf9f5` cream + `#d97757` terracotta + Inter is Anthropic's own brand palette, and the CSS says so in a comment. It's coherent and pleasant, but it's borrowed rather than owned. The Orchestrator currently looks like a Claude property, not like Ecultify's tool.

**Deterministic scan.** 11 findings across `src/components` and `src/app/(dashboard)`:
- **10 × side-stripe accent border** (the detector's single most recognizable AI tell): `dashboard/page.tsx` ×5, `briefs/page.tsx` ×2, `history/page.tsx`, `planner/page.tsx`, `teams/TeamsPanel.tsx`. The detector missed two more it can't pattern-match: `Toast.tsx` (`border-l-[3px]`) and `Card.tsx` (`borderLeft: 2px` via the `accent` prop). So the alert component itself is built on the banned pattern.
- **1 × bounce easing**: `comments/CommentThread.tsx:606` uses `animate-bounce`.

**Visual overlays.** Not available — no browser automation in this session, so no live overlay was injected. Everything below is from source reading plus computed contrast, not from a rendered page.

## Overall Impression

The bones are good and the discipline is real. What's holding it back isn't taste, it's **contrast and scale**: the interface is calibrated for a young designer on a good monitor, and it quietly excludes everyone else. Two token values and one button color are responsible for most of it.

Single biggest opportunity: fix the neutral ramp. `--text-muted` is used 880 times and fails WCAG AA by a factor of two. One token change lifts the readability of the entire app.

## What's Working

**The token layer and the `ui/` kit.** `Button`, `Input`, `Select`, `Textarea`, `Table`, `Badge`, `ConfirmModal`, `PageHeader`, `Toast` — one place each, consistently imported. Most internal tools this size have three competing button implementations. This has one, and the new auto-spinner proved the value: one edit, every action button in the app.

**Restrained color, correctly applied.** Terracotta appears on primary actions, active nav and selection — not as decoration. `StatusBadge` deliberately uses a neutral label with a colored dot instead of a filled pill, with a comment explaining why busy tables stay scannable. That is a real design decision, well reasoned.

**Defensive detail others skip.** The 2.5s double-submit window in `Button` (with a `ponytail:` comment naming its ceiling), `text-wrap`-aware truncation, print styles, `focus-visible` rings on all three form primitives. Someone was thinking about the 3am case.

## Priority Issues

### [P0] `--text-muted` fails contrast at 2.11:1, and is used 880 times

`--text-muted: #b0aea5` on `--bg-primary: #faf9f5` measures **2.11:1**. WCAG AA needs 4.5:1 for body text and 3:1 even for large text — it fails both. On `--bg-input` it drops to **1.97:1**. This colors timestamps, counts, table meta, sidebar category headers, secondary labels and every placeholder in the product.

Worse, `--text-disabled` is set to the *same hex*. Disabled and merely-secondary are visually identical, so users cannot tell an inert control from an active one.

**Why it matters:** anyone over 40, on a dim laptop, or near a window loses that entire layer of the interface. Timestamps and counts aren't decoration — they're the data.

**Fix:** `--text-muted: #7d7b73` (≈4.6:1) and split `--text-disabled: #a8a69d`, used only on genuinely inert controls. Two lines in `globals.css`, no component changes.
**Suggested command:** `/impeccable audit`

### [P1] Primary buttons and all three role badges fail contrast

White on `--accent-admin` (`#d97757`) is **3.12:1** — the primary button label across the whole app fails AA. The role badges are worse, because each pairs its accent with a 12% tint of itself at 11px: admin **2.82:1**, manager **~2.7:1**, employee **~3.4:1**.

**Why it matters:** the primary action is the one element that must never be hard to read, and the badges are how people identify who someone is.

**Fix:** darken the accent for text-bearing surfaces (`#c25f3c` gives ≈4.6:1 on white) while keeping `#d97757` for fills, dots and borders. For badges, use a darker text shade of each hue against the tint rather than the tint's own base color.
**Suggested command:** `/impeccable colorize`

### [P1] Sixteen font sizes, including 8px and 9px

`text-[8px]` (7 uses), `9px` (74), `10px` (356), `11px` (521), `12px` (638), `13px` (417), `14px`, `15px`, `16px`, `17px`, `18px`, `20px`, `22px`, `24px`, `28px`, `32px`. The product register calls for a fixed scale with a 1.125–1.2 ratio; this has sixteen steps clustered so tightly that 11px and 12px are doing the same job in different files.

The 9px and 8px text, in `--text-muted`, is effectively invisible: sub-legible size at 2:1 contrast.

**Why it matters:** hierarchy stops meaning anything when neighbouring steps are 1px apart, and it makes every new component a guess about which size to use.

**Fix:** collapse to six tokens — 11 / 12 / 13 / 15 / 18 / 24 — and delete 8px, 9px, 10px, 17px, 22px outright. Anything currently at 8–10px is either a label (→11px) or shouldn't be on screen.
**Suggested command:** `/impeccable typeset`

### [P1] Toasts are the only error channel, and they're inaccessible

`ToastProvider` has no `role="status"` / `aria-live`, so screen readers never announce a success or failure. It auto-dismisses at 3.5s with no pause-on-hover, and errors carry raw backend strings (`err.message` straight from Convex). A failed save is a grey box that appears and vanishes bottom-right while the user is looking at the form top-left.

**Why it matters:** an error the user misses is an error that becomes a support message to you.

**Fix:** wrap the stack in `role="status" aria-live="polite"`, give `type === "error"` `aria-live="assertive"` and no auto-dismiss, pause the timer on hover/focus, and map known backend errors to written sentences. Also drop the `border-l-[3px]` — it's the banned side-stripe; a tinted background or the icon alone carries the semantics.
**Suggested command:** `/impeccable harden`

### [P2] Side-stripe borders in 12 places, and zero reduced-motion support

The detector found 10 side-stripe accents; `Toast` and `Card`'s `accent` prop add two more. It's the most recognizable AI-UI tell and it's inconsistent — some cards have it, most don't.

Separately, `prefers-reduced-motion` appears **zero times** in the codebase while five keyframe animations ship, including `animate-subtle-pulse` (a 3× repeating glow on the chat bubble) and `animate-bounce` in the comment thread.

**Fix:** replace side-stripes with a full 1px border plus a tinted background, or with the leading icon that's usually already there. Add one `@media (prefers-reduced-motion: reduce)` block in `globals.css` setting `animation: none` / `transition-duration: 0.01ms`.
**Suggested command:** `/impeccable polish`

## Persona Red Flags

**Sam (Accessibility-Dependent).** Fails hardest, and it's not close. Every muted label is below 3:1 — timestamps, counts, table meta, all placeholders. Primary buttons fail at 3.12:1. Icon-only buttons (trash, download, close ×, sidebar collapse) have no `aria-label` — only two exist in the entire `ui/` folder, both in `DatePicker`. Toasts never announce. Five animations with no reduced-motion escape. Status is conveyed by a colored dot plus a label, which is the one thing done right here.

**Alex (Power User).** Reasonably served: Cmd+K palette, `/` to search, Escape to close, the 2.5s double-submit guard. Where it breaks down is batch work — the HR board, the deliverables queue and client requests are all one-at-a-time. Accepting fourteen requests is fourteen clicks with a toast after each. No saved filters or views either, so a daily triage habit restarts from "All" every time.

**Riley (Stress Tester).** Long subjects and requester names truncate cleanly, which is good. But `1000+` rows render unvirtualized in several lists, `deleteRequest` has no undo and destroys HR-issued documents with it, and refreshing mid-form loses everything typed — no drafts anywhere. Error toasts that expose raw backend strings are exactly what Riley screenshots.

## Minor Observations

- `--warning` is set to the same hex as `--accent-admin`, so a warning and a primary action are indistinguishable by color.
- 21 files render bare `Loading...` text. The product register asks for skeletons; you already have 10 files referencing skeletons, so the pattern exists but isn't standard.
- Z-index is hand-numbered (30 backdrop / 40 sidebar / 50 modal / 60 toast). The order is right, but it's four magic numbers rather than a named scale.
- `body { letter-spacing: 0.01em }` applies positive tracking globally, including to 24–32px headings where it should be slightly negative.
- Six modal implementations, only 12 files handle Escape — including the two I added this session, which don't. There's no shared `Modal` primitive, so each one re-decides overlay, focus and dismiss.
- `TableRow` sets two conflicting hover backgrounds when `onClick` is present; the second wins, so the non-clickable hover is dead code.

## Questions to Consider

- The palette is Anthropic's. What would *Ecultify's* look like — and is borrowed-but-coherent good enough for a tool your whole team lives in daily?
- Sakshi will triage requests in batches on Monday mornings. Why is every board in this app built for handling one item at a time?
- If `--text-muted` is unreadable, is the information in it actually needed — or is half of it deletable rather than fixable?
- What would this look like at 15px base instead of a 10–12px average? Is the density buying you anything, or is it a habit from building on one large monitor?
