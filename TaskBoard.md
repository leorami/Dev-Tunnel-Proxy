# Task Board

Authoritative source for shared UI/UX conventions. Status page is the master for styling and behavior.

## Global Goals
- One header: identical on all pages (Status, Health, Reports, Dashboard)
- One theme system: honors `dtpTheme` (light/dark) across all pages
- One Calliope experience: header button opens/closes the drawer; drawer present everywhere; page-aware prompt; persistent chat history

## Work Plan (WIP)

### Header and Styling
- [x] Extract shared header CSS/JS (`status/common.css`, `status/common.js`)
- [x] Use common header on Status, Health, Reports, Dashboard
- [ ] Move all base tokens to `status/global.css` and consume on every page
- [ ] Remove page-local header overrides to prevent spacing drift
- [ ] Ensure Dashboard uses the exact same header layout and right-side actions

### Theme (light/dark)
- [x] Centralize tokens in `global.css` (master: Status)
- [x] Ensure Reports uses the same tokens as Status
- [ ] Ensure Dashboard fully honors `dtpTheme` (audit remaining hardcoded colors)

### Calliope
- [x] Header button opens page-aware Calliope (context prompt)
- [x] Attach Calliope drawer on all pages
- [x] Remove legacy Calliope side tab from Status
- [ ] Header icon toggles show/hide drawer (selected state when open)
- [ ] Persist chat history across navigations (localStorage) and add Clear with confirm

### Calliope UI/UX consistency (Status = master)
- [ ] Drawer toggle behavior
  - [ ] Header Calliope button toggles open/close on every page
  - [ ] Header icon reflects active state (aria-pressed + visual) when open
  - [ ] Legacy `.ai-tab` is fully removed/hidden across all pages (no DOM, not just hidden)
- [ ] Drawer pinning and alignment
  - [ ] Drawer top aligns with the top-most major section under the header
  - [ ] Drawer bottom stops at viewport bottom minus standard section gap
  - [ ] Drawer remains pinned; page content scroll does not move the drawer
  - [ ] Separators (header→conversation, conversation→textarea, textarea→actions) span full drawer width
- [ ] Drawer↔content gap and push behavior
  - [ ] Standard gap between drawer and main content is exactly 16px (`--aiGutter`)
  - [ ] When open, content width reduces by `drawerWidth + 16px` (no extra whitespace column)
  - [ ] The left gutter of the page equals the right drawer gap for symmetry
  - [ ] Wrap each page’s content in a single wrapper (`.content` or `.container`) so its sections keep a consistent total width and resize/move uniformly (with or without drawer)
- [ ] Chat area, bubbles, textarea
  - [ ] Chat bubbles match Status styling (bg `var(--codeBg)`, border `var(--codeBorder)`, radii, padding)
  - [ ] Textarea shows placeholder only (no prefill), clears on focus, restores on blur if empty
  - [ ] Textarea and chat area use Status tokens (bg/border/radius/spacing) on all pages and themes
- [ ] Action row (buttons)
  - [ ] Sticky actions at drawer bottom; right-aligned; consistent spacing
  - [ ] Button order: Copy, Clear, Ask, Self-Check
  - [ ] Clear requires confirmation; on confirm, chat history is erased and UI clears
- [ ] Status chips in drawer header
  - [ ] Show "Healing History" chip and current status chip (e.g., Happy/Healing) with icons
  - [ ] Chips match Status look (size, colors, radius, font)
- [ ] Persistence
  - [ ] Chat history persists across pages and reloads via `localStorage`
  - [ ] Opening drawer on any page shows prior conversation (unless cleared)
- [ ] Dashboard and Status content integrity while drawer open
  - [ ] Status page "Configured Apps" section maintains correct column layout; no oversized whitespace channel
  - [ ] Dashboard cards/inputs/code blocks remain aligned; no re-centering glitches

### Dashboard polish
- [x] Use shared header
- [x] Share theme
- [ ] Match button styles/hover exactly to Status
- [ ] Add right-side action icons (theme, reload if applicable, calliope) via shared header only

### Reports polish
- [x] Adopt shared tokens
- [ ] Align table header/body typography to Status card styles
- [ ] Add small toolbar spacing tweaks to match Status’s chips

### Test suites (Playwright) — compute and assert styles/behavior
- [ ] calliope-toggle.spec: header icon toggles open/close, aria-pressed, and drawer visibility across Status/Health/Reports/Dashboard
- [ ] calliope-layout.spec: assert content push equals `drawerWidth + 16px`, gap is 16px, drawer pinned (top/bottom offsets), full-width separators
- [ ] calliope-style-parity.spec: chat area, bubbles, textarea, and action row styles identical to Status (both themes)
- [ ] calliope-buttons.spec: button order, right alignment, sticky footer, clear confirmation flow
- [ ] calliope-persistence.spec: send message on one page, verify appears on others after navigation/reload
- [ ] calliope-chips.spec: presence and computed styles of status/healing-history chips
- [ ] dashboard-style.spec: header right-aligned actions, light-mode cards/inputs/code blocks match global tokens
- [ ] status-configured-apps-layout.spec: grid/card layout remains intact with drawer open/closed
- [ ] legacy-elements.spec: `.ai-tab` absent on all pages

## Acceptance Criteria
- Navigating between any pages: header does not shift, active tab highlighted, actions aligned right
- Theme toggle switches all pages and persists via `localStorage.dtpTheme`
- Calliope button toggles drawer open/closed and shows active state
- Calliope chat persists per browser session and page switching until cleared; “Clear” requires confirmation
- Drawer is pinned and aligned, with a consistent 16px gap to content on all pages
- Separators span the full drawer width; action row sticks to the bottom and is right-aligned
- Button order is Copy, Clear, Ask, Self-Check across all pages
- Chat bubbles, textarea, and chat area match Status styles (light/dark) on all pages
- Dashboard header actions align right; light-mode cards, inputs, and code blocks use shared tokens

## Notes
- Do not commit WIP without explicit approval
- Status is the source of truth for visual tokens and spacing
