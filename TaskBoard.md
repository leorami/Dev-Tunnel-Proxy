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

### Dashboard polish
- [x] Use shared header
- [x] Share theme
- [ ] Match button styles/hover exactly to Status
- [ ] Add right-side action icons (theme, reload if applicable, calliope) via shared header only

### Reports polish
- [x] Adopt shared tokens
- [ ] Align table header/body typography to Status card styles
- [ ] Add small toolbar spacing tweaks to match Status’s chips

## Acceptance Criteria
- Navigating between any pages: header does not shift, active tab highlighted, actions aligned right
- Theme toggle switches all pages and persists via `localStorage.dtpTheme`
- Calliope button toggles drawer open/closed and shows active state
- Calliope chat persists per browser session until cleared; “Clear” requires confirmation

## Notes
- Do not commit WIP without explicit approval
- Status is the source of truth for visual tokens and spacing
