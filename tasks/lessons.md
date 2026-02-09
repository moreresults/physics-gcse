# Lessons Learned

Patterns, mistakes, and insights captured during development. Reviewed at session start.

---

## Project-Specific

### Architecture
- **Vanilla JS, no framework** — this is a static site. Don't reach for React/Next.js patterns.
- **Custom SVG graphs** — no charting libraries. Pixel-level control is required for snapping, crosshair, and area shading.
- **Existing CSS system** — always use the Apple HIG design tokens in `src/styles/main.css`. Don't reinvent classes.
- **Existing marking engine** — `src/lib/marking.js` is already written. Use it as-is unless bugs are found.

### Data & State
- Scenario data lives in JSON files under `src/data/scenarios/`. Load them, don't hardcode.
- App state machine: `welcome → active → review (exam only) → results`. Keep state transitions clean.
- Answer storage keyed by `partId`, not array index.

### Graph Component
- Coordinate conversion must be bidirectional: `toPixel()` and `toData()` with `snap()`.
- Padding: `{ top: 24, right: 24, bottom: 56, left: 64 }` — don't change without reason.
- Negative y-axis support needed (scenario_04 has negative velocity).
- Plot-points mode is distinct from read mode — handle both via `interactiveMode` in graphSpec.

---

## General Patterns

### CSS
- (none yet)

### Testing
- (none yet)

### Bugs Fixed
- (none yet)

### Things That Wasted Time
- (none yet)

---

*Update this file after every correction or significant learning.*
