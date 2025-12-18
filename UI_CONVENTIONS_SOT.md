# UI_CONVENTIONS_SOT.md

> **Scope:** This is a reusable, product-agnostic UI conventions Source of Truth for modern **mobile-first apps**, optimized for **trust**, **visual satisfaction**, and **predictable interaction**.  
> **Hard constraints:** Assumes frequent use inside **World App mini-app webview** and adopts World’s layout guardrails as **non-negotiable defaults**.

---

## 1) North Star UI Principles (Trust and Satisfaction)

These are **rules**, not aspirations. If you break one, do it intentionally and document why.

1. **One primary action per view.** If you need two, you haven’t decided.
2. **Meaning before metadata.** Users should understand “what” before “when/how/why.”
3. **Keep CTAs visible.** Primary action should never require hunting or scrolling gymnastics.
4. **One clear task per page.** Each view should have a single dominant user goal.
5. **Predictable rhythm beats novelty.** Consistent spacing + hierarchy increases perceived quality more than decoration.
6. **Fast feedback always.** Every action yields immediate UI feedback (<100ms perceived) even if work continues.
7. **No gesture-only affordances.** If an action exists, it must be discoverable without knowing secret swipes.
8. **Errors are recoveries, not dead ends.** Every error state offers a next step (Retry / Back / Contact / Learn).
9. **States are part of the UI, not an afterthought.** Empty/loading/offline must look intentional and aligned.
10. **Color is semantic, not decorative.** Use color to communicate meaning; never to “add flair.”
11. **Accessibility is default.** Keyboard, screen reader, contrast, and motion-reduction are not “nice to have.”
12. **Minimize unnecessary scrolling.** Reduce vertical fatigue: content density is allowed, clutter isn’t.

**Acceptance criteria**
- Every screen can be described in one sentence: “This screen is for ___.”
- Every screen has exactly **one** visually dominant CTA.
- Removing all color still leaves clear hierarchy and usable navigation.

---

## 2) Spacing and Layout System (Numbers only)

### Global padding (non-negotiable)
- **Page padding (left/right): `24px`** (default for all pages).
- **Small screens:** if viewport width ≤ `360px`, `16px` page padding is allowed (never below `16px`).
- **Top padding:** determined by header pattern; content spacing rules below.
- **Do not reduce page padding** to “fit more.” Instead, reduce content or use progressive disclosure.

**Rare exceptions (allowed)**
- Full-bleed media (hero image/video) may extend edge-to-edge, but **all text overlays** still respect `24px` inset.
- Maps/canvases may be full-bleed, but must provide **inset controls** with `24px` padding.

### Spacing scale (strict)
All spacing must come from this scale:

- `space-1`: 4  
- `space-2`: 8  
- `space-3`: 12  
- `space-4`: 16  
- `space-5`: 24  
- `space-6`: 32  
- `space-7`: 48  
- `space-8`: 64  

**Rules**
- **Never invent one-off spacing values.**
- Use **16px** for “within a section” rhythm.
- Use **32px** for “between sections” rhythm.
- Use **24px** as “buffer spacing” around navigation/search/safe areas.

### Vertical rhythm rules (hard, World-aligned)
**Main pages (typically tab roots)**
- Header → content: **16px**
- Element → element (within same section): **16px**
- Section → section: **32px**
- Search bar → content: **24px**
- Header → a section starting with a sub-headline: **24px**
- Sub-headline → its content: **16px**
- If a bottom bar is present, bottom padding below last scroll item: **32px**

**Secondary pages (drill-in pages)**
- Header → content: **24px**
- Header → secondary title: **32px**
- Secondary title → description: **12px**

**System UI / safe areas**
- Tab bar offset from OS bottom bar: **12px**
- Drawers/sheets offset from OS bottom bar: **12px**
- Primary button offset from iOS bottom bar (safe area): **24px**
- When keyboard is open, primary buttons sit **24px above keyboard**

**States**
- Empty/loading/transient states are **middle aligned** (vertical + horizontal) for consistency.

### Component insets (border → content)
Use these defaults unless the component spec overrides them:

- **Cards / surfaces:** padding **16px**
- **Sheets / drawers:** internal padding **24px**
- **List rows:** horizontal padding **24px** (matches page), vertical padding **12px**
- **Inputs:** horizontal padding **12px**, vertical padding **12px**
- **Icon + label spacing:** **8px**
- **Section header padding-bottom:** **12px**

### Safe-area formulas (implementation-ready)
- **Tab bar bottom:** `bottom = env(safe-area-inset-bottom) + 12px`
- **Primary bottom CTA bottom:** `bottom = env(safe-area-inset-bottom) + 24px`
- **Scrollable content bottom padding with bottom bar:** `padding-bottom = env(safe-area-inset-bottom) + 32px`

### Width constraints (explicit, so desktop doesn’t drift)
- **App content max width (desktop): `960px`** and centered.
- **Reading surfaces max width: `720px`** (docs, long chat transcripts, help text).

**Acceptance criteria**
- No spacing exists outside the scale.
- Main pages match the “main page rhythm” map; secondary pages match the “secondary rhythm” map.
- Bottom-pinned CTAs never overlap OS bars or the keyboard.

---

## 3) Typography System (Hard tokens, not vibes)

### Type tokens (mobile-first)
Only these tokens exist:

- `display`: **32px** / lh **40** / weight **700**
- `h1`: **24px** / lh **32** / weight **700**
- `h2`: **20px** / lh **28** / weight **600**
- `h3`: **16px** / lh **24** / weight **600**
- `body`: **16px** / lh **24** / weight **400**
- `body-sm`: **14px** / lh **20** / weight **400**
- `caption`: **12px** / lh **16** / weight **400**
- `overline`: **12px** / lh **16** / weight **600** / tracking **+0.04em** (rare)

### Allowed sizes (strict set)
Only use: **12, 14, 16, 20, 24, 32**.

### Allowed weights (max 3)
Only use: **400, 600, 700**.

### Hierarchy rules
- Each screen uses **max 3 text sizes** (excluding caption/helper).
- Heading must differ from body by **≥ +4px** (16→20, 20→24).
- Subheadlines are **never smaller than body**.
- Metadata uses `caption` or `body-sm`, never `body`.

### Button and control typography
- Primary/secondary buttons: **14–16px**, weight **600**
- Button text never larger than the screen title (`h1`).
- Input labels: `body-sm` weight **600**
- Helper/error text: `caption` weight **400**

### Text truncation rules (trust via stability)
- **List rows:** title is **1 line** (truncate), optional subline is **1 line**.
- **Cards:** titles may wrap **up to 2 lines**; if more, truncate.
- **Paragraphs:** avoid more than **3 lines** without a section break.

### Typography lint checklist
- [ ] No font sizes outside the allowed set.
- [ ] No more than 3 weights used in the product.
- [ ] Screen uses ≤ 3 sizes (excluding caption/helper).
- [ ] Lists do not wrap unpredictably; truncation rules applied.
- [ ] Buttons are 14–16px / 600 and never visually dominate headings.

**Acceptance criteria**
- 100% of typography maps to tokens (no raw sizes in components).
- Body text is always **16px** on mobile.
- Captions are never used for essential meaning.

---

## 4) Color System (Semantic tokens only)

### Semantic tokens (the only allowed API)
Base:
- `bg`
- `surface`
- `surface-2` (optional: elevated surfaces)
- `text`
- `muted`
- `border`

Actions:
- `primary`
- `primary-contrast`

Status:
- `danger`
- `warning`
- `success`

Interaction (recommended):
- `focus`
- `hover`
- `pressed`
- `disabled`

**Rules**
- No raw hex in components. Components use semantic tokens only.
- Color usage must remain consistent in light/dark (same semantics, different values).
- Don’t rely on color alone for meaning (pair with icon, label, or structure).

### Contrast baseline (non-negotiable)
- Normal text contrast: **≥ 4.5:1**
- Large text contrast: **≥ 3:1**
- UI component boundaries/icons: target **≥ 3:1** against adjacent colors (practical baseline; test in QA).

### Trust color rules (hard)
- `danger` is only for **destructive actions** and **irreversible states**.
- `warning` is only for **real risk** (expired, insecure, time-critical).
- `success` is only for **confirmed completion** (not “in progress”).
- `primary` is reserved for the single primary action and key selection state.

**Acceptance criteria**
- Screens pass AA contrast checks (text and key UI boundaries).
- No screen uses more than **1 accent color** simultaneously (primary OR warning OR danger).
- Disabled states are distinguishable without relying on opacity-only.

---

## 4.1) Shape + Elevation + Layering (Tokens)

### Radius tokens (only these)
- `radius-sm`: `8px`
- `radius-md`: `12px`
- `radius-lg`: `16px`
- `radius-xl`: `24px`
- `radius-full`: `9999px` (pills/circles)

**Rules**
- Use `radius-lg` for sheets/modals (mobile-first).
- Use `radius-md` for inputs/cards.
- Avoid mixing more than **2** radii on the same screen.

### Elevation (shadows)
Shadows should feel soft and wide (ambient), not like sharp “cards”.

Tokens (names only; values belong in CSS variables):
- `shadow-1`: subtle surface lift
- `shadow-2`: sheet/modal lift
- `shadow-3`: dialog/tooltip lift

**Rules**
- Prefer shadow over borders; if a border exists, it’s a hairline boundary (`border` token).
- Elevation communicates layering or interactivity, not decoration.

### Layering (z-index)
Define a small set of fixed layers so overlays never fight:
- `layer-backdrop`: `40`
- `layer-sheet`: `50`
- `layer-dialog`: `60`
- `layer-toast`: `70`
- `layer-tooltip`: `80`

**Acceptance criteria**
- Overlays use layer tokens (no ad-hoc `z-index`).
- Radius + shadow choices are consistent across the product.

---

## 5) Component Anatomy Rules (What exists in a great app)

> Rule: Components are **primitives with strict anatomy**. No “custom variants” unless they become first-class tokens.

### 5.1 App Shell
**Purpose:** unify safe areas, backgrounds, and global navigation.  
**Anatomy:** `TopBar` (optional) + `Content` + `TabBar` (optional)  
**Spacing:** page padding = 24px (16px on ≤360px screens); respects safe area insets.  
**States:** supports global banners/toasts.  
**Acceptance criteria**
- Background color is consistent across all pages.
- Tab transitions preserve scroll position.

---

### 5.2 TopBar (Header / Navigation bar)
**Purpose:** provide context + back + 1–2 secondary actions.  
**Anatomy (secondary page):** `Back` + `Title` + optional `More`  
**Spacing:**
- Title aligns to 24px page inset.
- Header→content spacing follows main/secondary rules.  
**Interaction:**
- Header is sticky on secondary pages; optional sticky on main pages.
- Avoid placing interactive controls near host controls in the **upper-right** (test for collisions).  
**Acceptance criteria**
- No header contains more than 2 icon buttons.
- Header actions have labels via tooltips/aria-labels.

---

### 5.3 Bottom Tab Bar
**Purpose:** primary navigation for mobile-first apps.  
**Rules:** prefer bottom tabs; avoid hamburger menus.  
**Anatomy:** 3–5 tabs max; **icons + labels** required.  
**Spacing:** positioned with **12px** space from OS bottom bar.  
**Acceptance criteria**
- Tabs are always visible on main pages.
- Active tab is not color-only (also shape/underline).

---

### 5.4 Drawer / Sheet
**Purpose:** temporary tasks (filters, quick edit, pickers).  
**Default:** bottom sheet (mobile) over side drawer.  
**Spacing:** **12px** from OS bottom bar.  
**Anatomy:** title (optional) + content + bottom actions (optional).  
**Acceptance criteria**
- Sheets never stack (no sheet over dialog over sheet).
- One primary action max.

---

### 5.5 List + Row (default content structure)
**Purpose:** fastest scanning pattern; highest trust via predictability.  
**Anatomy (row):** leading icon (optional) + primary text + secondary text (optional) + trailing chevron or control (optional).  
**Spacing:**
- Horizontal inset: 24px
- Vertical padding: 12px
- Between rows: **1px hairline divider** (default; no spacing variant)
**Interaction:**
- Entire row tappable except embedded controls.
- Row min tap target: 44×44 minimum.  
**States:** default / pressed / disabled / loading skeleton.  
**Acceptance criteria**
- Row title is 1 line; subline max 1 line.
- No swipe-only actions.

---

### 5.6 Card (allowed, but constrained)
**Purpose:** grouping small sets of content (not “pretty list rows”).  
**Allowed when:** ≤ 6 cards on a screen, or when grouping mixed content.  
**Banned when:** used as the primary container for long lists.  
**Anatomy:** title + content + (optional) 1 action row.  
**Spacing:** padding 16px; card-to-card spacing 16px.  
**Acceptance criteria**
- Cards don’t replace lists for scan-heavy screens.
- No card contains more than one primary-looking CTA.

---

### 5.7 Buttons
**Purpose:** actions with clear priority.  
**Variants (only these):**
- `primary`
- `secondary`
- `tertiary` (ghost/text)
- `destructive`

**Sizing**
- Min height: **48px** (recommended), **44px** absolute minimum.  
- Horizontal padding: 16px (or full-width).  
**Rules**
- Exactly **one** primary button per view.
- Disable is last resort; prefer “explain why” with helper text.

**Acceptance criteria**
- All buttons have 44×44 minimum hit targets.
- Disabled buttons remain readable (not opacity-only).

---

### 5.8 Forms (FormField + Inputs)
**Purpose:** capture data with minimal friction and maximal clarity.  
**Anatomy:** Label (above) → Control → Helper/Error (below).  
**Spacing:**
- Label→input: 8px
- Input→helper/error: 8px
- Field→field: 16px
**Validation timing (default)**
- Validate on submit.
- After first submit, validate on change (so errors clear quickly).
**Acceptance criteria**
- Labels are never placeholders.
- Error text explains what happened + how to fix.

---

### 5.9 Toast
**Purpose:** ephemeral confirmation, not decision-making.  
**Placement:** horizontally centered, directly below header.  
**Duration:** 2.5–3.5s default; 5s when “Undo” exists.  
**Acceptance criteria**
- Toast never covers bottom CTAs.
- Toast is screen-reader announced (polite).

---

### 5.10 Dialog (Confirm)
**Purpose:** irreversible/destructive confirmation.  
**Rules**
- Required for destructive actions.
- Default focus on Cancel.
- Copy includes consequence + final action verb.
**Acceptance criteria**
- Dialog never appears for non-destructive actions.

---

### 5.11 Empty State
**Purpose:** explain absence + guide next action.  
**Alignment:** middle-aligned for consistency.  
**Anatomy:** Title + 1 sentence + CTA.  
**Acceptance criteria**
- Empty state always includes a forward path.

---

### 5.12 Loading (Skeleton)
**Purpose:** maintain layout stability; reduce perceived wait.  
**Rule:** if load > 300ms, show skeleton; avoid spinners for content loads.  
**Acceptance criteria**
- Skeleton matches final layout to prevent layout shift.

---

### 5.13 Error State
**Purpose:** recover trust via clarity and control.  
**Anatomy:** short explanation + next step (Retry/Back/Contact).  
**Acceptance criteria**
- No error state is a dead end.
- Network errors do not erase user input.

---

### 5.14 Tables (only if unavoidable)
**Default:** convert to lists on mobile.  
**If required:** horizontal scroll allowed, but:
- Sticky first column
- Clear row separators
- Provide “View details” fallback
**Acceptance criteria**
- Table is usable without precision scrolling.

---

## 6) Interaction Rules (Consistency or death)

### Minimum tap targets
- **Absolute minimum:** 44×44 (iOS baseline)
- **Recommended cross-platform:** 48×48 (Android/Material guidance)
- Minimum spacing between distinct tap targets: **8px** (prevents mis-taps).

### Scroll + CTA visibility
- Primary action should be visible **without scrolling** on main tasks.
- If content scrolls, keep primary action pinned (sticky bottom bar or persistent FAB).
- If a bottom bar is present, preserve **32px** bottom padding in scroll content.

### Gestures
- Swipe-to-reveal actions: **banned by default** (discoverability + accessibility issues).
- If you add a gesture, you must provide a visible equivalent action.

### Back behavior
- Back always:
  1) closes transient UI (sheet/dialog), else
  2) navigates to prior screen, preserving state (scroll position, inputs).
- Never hijack back to show “Are you sure you want to leave?” unless unsaved data exists.

### Destructive confirmation
- Destructive action → always confirm via dialog.
- Non-destructive actions → no confirm; use undo toast instead.

### Optimistic UI
Allowed when:
- user action is reversible OR server failure is rare and recoverable.
Required when:
- action is a core loop step (mark done, save draft, add item).

### Motion
- Motion exists to clarify change, not decorate.
- Durations:
  - micro (press, toggle): **120–160ms**
  - standard (sheet/dialog in/out): **180–240ms**
  - complex (reorder, crossfade): **220–280ms**
- Easing (tokens):
  - `ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)` (entering)
  - `ease-in`: `cubic-bezier(0.7, 0, 0.84, 0)` (exiting)
  - `ease-in-out`: `cubic-bezier(0.65, 0, 0.35, 1)` (state changes)
- Always respect `prefers-reduced-motion` (reduce to fades or no motion).

### “Do not do this” kill list (interaction)
- Gesture-only delete/archive
- Long-press as the only path to key actions
- Multiple primary CTAs on one view
- Surprise navigation changes (tabs disappear randomly)
- Loading spinners that never resolve (“infinite loading”)

**Acceptance criteria**
- Every core action is possible with simple taps (no hidden gestures).
- Primary actions are reachable one-handed and remain visible when appropriate.

---

## 7) Information Density Rules (Anti-clutter)

Hard limits keep the UI calm and trustworthy.

- **Primary actions per view:** max **1**
- **Secondary actions in header:** max **2**
- **Icon-only controls per view:** max **3** (excluding tab bar)
- **List row lines:** max **2** (title + subline)
- **Sections per view:** max **3** (if more, use progressive disclosure or navigation)
- **Status messages:** max **1** at a time (don’t stack banners)

Progressive disclosure rules:
- Default view shows essentials only.
- Advanced options go behind:
  - “More options” (sheet) OR
  - expandable “Advanced” section
- Never hide primary actions inside an overflow menu.

**Acceptance criteria**
- A first-time user can identify the primary action within 1 second.
- No screen requires reading more than ~2 short paragraphs to proceed.

---

## 8) Microcopy Rules (Trust language)

### Tone rules
- Short, direct, blame-free.
- Prefer verbs (“Save”, “Continue”, “Try again”) over nouns (“Submission”, “Proceed”).
- Name things by outcomes, not internal jargon.

### Error message formula
- **What happened** + **why it matters** + **what to do next**.
- Never: “Something went wrong.” alone.

### Permission requests
- Explain value in one sentence.
- Offer an alternative path if possible.

### Canonical copy templates (use as starting defaults)
1. **Empty state**  
   - Title: “Nothing here yet”  
   - Body: “Add your first item to get started.”  
   - CTA: “Add item”
2. **Retry (network)**  
   - “Can’t connect right now. Check your connection and try again.”  
   - CTA: “Retry”
3. **Offline banner**  
   - “Offline — changes saved on this device.”
4. **Success toast**  
   - “Saved.” (optional: “Undo”)
5. **Undo toast**  
   - “Deleted.” [Undo]
6. **Destructive confirm**  
   - Title: “Delete this?”  
   - Body: “This can’t be undone.”  
   - Buttons: “Cancel” / “Delete”
7. **Validation error**  
   - “Add a title to continue.”
8. **System error**  
   - “We couldn’t load this. Try again.”  
   - CTA: “Try again”
9. **Permission ask**  
   - “Allow access to your camera to scan codes.”  
   - CTA: “Allow” / “Not now”
10. **Loading**  
   - “Loading…”

**Acceptance criteria**
- Every error includes a recovery action or alternative.
- No copy blames the user (“You did…”).

---

## 9) Accessibility Baseline (Non-negotiable)

### Focus + keyboard
- Every interactive element is reachable via keyboard.
- Visible focus ring for all focusable elements (do not remove it).
- Logical focus order: header → content → bottom CTA/tab bar.

### Screen reader labeling
- Icon-only buttons must have accessible labels.
- Inputs:
  - label is programmatically associated
  - helper/error is linked via `aria-describedby`
- Toasts should be announced politely.

### Contrast
- 4.5:1 text baseline; 3:1 for large text.

### Touch targets
- Minimum 44×44; recommended 48×48.

### Reduced motion
- Honor `prefers-reduced-motion`.
- Replace animated transitions with quick fades or none.

**Acceptance criteria checklist**
- [ ] Keyboard-only user can complete core flows.
- [ ] Screen reader announces control purpose and state.
- [ ] Contrast passes AA thresholds.
- [ ] No interactive element below minimum hit size.

---

## 10) Performance Baseline (Perceived speed = trust)

### Targets (mobile-first, webview-friendly)
- Initial meaningful load: **2–3s** target (over average mobile network)
- Subsequent interactions: **<1s** to completion for common actions
- Perceived feedback: **<100ms** response to taps (visual state change, pressed state, etc.)

### Perceived performance rules
- Use skeletons for content loads > 300ms.
- Optimistic UI for core actions; reconcile later.
- Avoid layout shift: reserve space for async content.

### Data + images
- Lazy load offscreen images.
- Prefer modern formats; compress aggressively.
- Don’t block UI on analytics.

### “No infinite loading” rule
- Any loading state longer than 8s must:
  - show what’s happening,
  - offer Cancel/Back, and
  - provide Retry if applicable.

**Acceptance criteria checklist**
- [ ] No user action leaves the UI “stuck” without feedback.
- [ ] Skeletons appear for slow loads and match final layout.
- [ ] Critical UI is interactive before non-critical assets load.

---

## 11) Implementation Mapping (Tailwind + shadcn/ui friendly)

### Token setup (CSS variables)
**Approach:** semantic tokens as CSS variables, mapped into Tailwind + shadcn.

Example structure (light/dark):
- `--bg`, `--surface`, `--text`, `--muted`, `--border`
- `--primary`, `--primary-contrast`
- `--danger`, `--warning`, `--success`
- `--focus`

### Tailwind mapping (recommendation)
- Use Tailwind’s `theme.extend.colors` to map:
  - `bg` → `var(--bg)`
  - `foreground` → `var(--text)`
  - `muted` → `var(--muted)`
  - `border` → `var(--border)`
  - `primary` → `var(--primary)`
  - `destructive` → `var(--danger)`

Spacing mapping:
- Use Tailwind spacing scale but **enforce only allowed tokens** (4/8/12/16/24/32/48/64) via design review or lint rules.

Typography mapping:
- Provide component-level `Text` + `Heading` primitives that encapsulate token classes (prevents raw sizes).

Radius + shadow mapping:
- Map radius tokens into Tailwind `theme.extend.borderRadius` (ban arbitrary `rounded-[...]`).
- Map shadow tokens into Tailwind `theme.extend.boxShadow` (ban ad-hoc shadows).

Layering mapping:
- Centralize overlay `z-index` in layer tokens (ban ad-hoc `z-index`).

### Folder structure (design system package)
- `ui/`
  - `tokens/` (css variables, tailwind preset)
  - `primitives/` (Button, Text, Heading, Surface)
  - `components/` (TopBar, TabBar, ListRow, Toast, Dialog, Sheet, EmptyState, Skeleton)
  - `patterns/` (FormField, ErrorState, LoadingState)
  - `docs/` (this file + QA checklists)

### Most likely to drift (warn your future self)
- “Just this once” spacing tweaks (break rhythm)
- Adding more than one accent color on a screen
- Icon-only actions multiplying in headers
- Cards replacing lists everywhere
- Swipe actions sneaking in without visible alternatives

---

## 12) Final: QA Checklist (Ship gate)

A reviewer should be able to run this in **5 minutes**.

### Spacing + layout
- [ ] Page padding is 24px by default (16px allowed on ≤360px screens), unless full-bleed media exception.
- [ ] Header→content spacing matches page type (main: 16, secondary: 24).
- [ ] Section→section spacing is 32px.
- [ ] Search bar→content spacing is 24px (if present).
- [ ] Bottom bars respect safe area offsets (tab/drawer 12px, primary CTA 24px).
- [ ] Keyboard does not cover primary buttons (24px above keyboard).
- [ ] Desktop respects max widths (app: 960px, reading surfaces: 720px).

### Typography
- [ ] Only approved type tokens exist.
- [ ] Max 3 text sizes per screen (excluding caption/helper).
- [ ] Body text is 16px on mobile.

### Color + contrast
- [ ] Semantic tokens only (no raw hex in components).
- [ ] Contrast meets baseline (4.5:1 normal text).
- [ ] Danger/warning/success used only for semantic meaning.

### Actions + navigation
- [ ] Exactly 1 primary action per view.
- [ ] No swipe-only actions.
- [ ] Back behavior is predictable and preserves state.

### States
- [ ] Empty/loading/error states exist and are middle aligned.
- [ ] Loading uses skeletons for slow content.
- [ ] Errors provide recovery.

### A11y + performance
- [ ] All controls meet minimum hit target size.
- [ ] Keyboard + screen reader can complete core flows.
- [ ] No infinite loading without escape hatch.

---

## Golden Defaults (Copy-paste tokens)

### Spacing scale tokens
```txt
space-1 = 4
space-2 = 8
space-3 = 12
space-4 = 16
space-5 = 24
space-6 = 32
space-7 = 48
space-8 = 64

page-padding = 24
page-padding-small = 16
content-max = 960
reading-max = 720
```

### Vertical rhythm map (World-aligned)
```txt
MAIN PAGES
header->content = 16
within-section element gap = 16
section->section = 32
search->content = 24
header->section-with-subheadline = 24
subheadline->content = 16
bottom-bar present: scroll bottom padding = 32

SECONDARY PAGES
header->content = 24
header->secondary title = 32
secondary title->description = 12

SAFE AREAS
tab bar / drawers bottom offset = 12
primary bottom CTA offset = 24
keyboard CTA offset = 24 above keyboard
```

### Type tokens
```txt
display: 32/40 700
h1:      24/32 700
h2:      20/28 600
h3:      16/24 600
body:    16/24 400
body-sm: 14/20 400
caption: 12/16 400
overline:12/16 600 (+0.04em)
```

### Semantic color token list
```txt
bg
surface
surface-2
text
muted
border

primary
primary-contrast

danger
warning
success

focus
hover
pressed
disabled
```

### Radius tokens
```txt
radius-sm = 8
radius-md = 12
radius-lg = 16
radius-xl = 24
radius-full = 9999
```

### Elevation tokens
```txt
shadow-1
shadow-2
shadow-3
```

### Layer (z-index) tokens
```txt
layer-backdrop = 40
layer-sheet = 50
layer-dialog = 60
layer-toast = 70
layer-tooltip = 80
```

### Motion easing tokens
```txt
ease-out = cubic-bezier(0.16, 1, 0.3, 1)
ease-in = cubic-bezier(0.7, 0, 0.84, 0)
ease-in-out = cubic-bezier(0.65, 0, 0.35, 1)
```

---

## UI Kill List (anti-patterns to avoid)
1. Two primary CTAs on one view.
2. Swipe-only delete/archive.
3. Icon-only navigation tabs (no labels).
4. Random spacing values (e.g., 18px “because it looks right”).
5. Cards used as list rows everywhere.
6. Placeholder-only labels in forms.
7. Error states with no recovery action.
8. Infinite spinners with no timeout or explanation.
9. Overusing red for anything not destructive.
10. “Success” for non-final states (“Uploading…” in green).
11. Multiple competing highlights (badges + gradients + outlines).
12. Dense screens with >3 sections of content.
13. Tiny tap targets or clustered controls.
14. Surprise navigation changes (tabs appear/disappear unpredictably).
15. Relying on color alone to convey status.

---

## Acceptance Criteria (20 testable checks)

1. Page padding is **24px** by default (**16px** allowed on ≤360px screens).  
2. No spacing values exist outside the approved scale.
3. Main pages: header→content spacing is **16px**.  
4. Secondary pages: header→content spacing is **24px**.  
5. Section spacing is **32px** consistently.  
6. Search→content spacing is **24px** when search exists.  
7. If a bottom bar exists, scroll content includes **32px** bottom padding.  
8. Tab bar/drawer is offset **12px** from OS bottom bar.  
9. Primary bottom CTA is offset **24px** from iOS bottom bar.  
10. When keyboard is open, primary CTAs sit **24px above keyboard**.  
11. Empty/loading/transient states are **middle aligned**.  
12. Every screen has **exactly one** primary action.
13. All interactive elements have hit targets ≥ **44×44** (48×48 recommended).  
14. No gesture-only core actions exist.
15. All text uses type tokens; no raw font sizes in components.
16. Body text is always **16px** on mobile.
17. Contrast for normal text is **≥ 4.5:1**.  
18. Toasts appear centered **below the header**.  
19. All error states provide a next step (Retry/Back/Alternative).
20. No loading state persists > 8s without explanation + escape hatch.
