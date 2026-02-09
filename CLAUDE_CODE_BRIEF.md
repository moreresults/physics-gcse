# GCSE Physics Interactive Test — Claude Code Build Brief

## Overview

Build a production-quality, interactive GCSE Physics mock test as a single-page web application. The test covers motion graphs and kinematics for Edexcel GCSE Physics.

**Prototype scope:** 4 scenarios, 15 parts, 23 total marks.
**Full scope (later):** 10 scenarios, 36 parts, 61 total marks.

---

## Tech Stack

- **Vanilla JS** (ES modules) — no framework dependencies for the prototype
- **Custom SVG** for all graphs (NOT Recharts/Chart.js — we need pixel-level control for snapping, crosshair, area shading)
- **CSS** with Apple HIG design tokens (already written in `src/styles/main.css`)
- **Auto dark/light mode** via `prefers-color-scheme`
- Should work as a static site (open `public/index.html` in a browser, no build step required)

If you prefer, you MAY use a lightweight bundler (Vite) for dev convenience, but the output must work as static files.

---

## Project Structure

```
gcse-physics-test/
├── public/
│   └── index.html                  # Entry point
├── src/
│   ├── app.js                      # Main app shell, state machine, routing
│   ├── styles/
│   │   └── main.css                # ✅ ALREADY WRITTEN — Apple HIG design system
│   ├── data/
│   │   └── scenarios/
│   │       ├── scenario_01.json    # ✅ Runner in the Park (distance-time)
│   │       ├── scenario_03.json    # ✅ Car on Motorway (velocity-time, area)
│   │       ├── scenario_04.json    # ✅ Train Journey (negative velocity)
│   │       └── scenario_09.json    # ✅ Data Table → Graph (plot points)
│   ├── lib/
│   │   └── marking.js             # ✅ ALREADY WRITTEN — marking engine
│   └── components/
│       ├── Graph.js                # 🔨 BUILD — Custom SVG graph renderer
│       ├── Welcome.js              # 🔨 BUILD — Welcome/setup screen
│       ├── TestRunner.js           # 🔨 BUILD — Question flow, navigation
│       ├── QuestionCard.js         # 🔨 BUILD — Renders individual parts
│       ├── Timer.js                # 🔨 BUILD — Countdown timer
│       ├── Review.js               # 🔨 BUILD — Pre-submit review (exam mode)
│       └── Results.js              # 🔨 BUILD — Results dashboard + solutions
└── CLAUDE_CODE_BRIEF.md            # This file
```

Items marked ✅ are already written and should be used as-is (or improved if bugs are found).
Items marked 🔨 need to be built.

---

## Application States

The app is a state machine with these screens:

```
welcome → active → review (exam mode only) → results
                ↘ results (practice mode — after all questions)
```

### 1. Welcome Screen
- Title: "GCSE Physics — Motion & Graphs"
- Subtitle: "Edexcel · 4 Scenarios · 15 Questions"
- **Mode selector** (segmented control): Practice | Exam
  - Practice: instant feedback after each part, worked solutions, partial credit shown
  - Exam: no feedback, flag questions, review screen before submit, results at end
- **Timer presets**: Untimed (default) | Relaxed (15 min) | Exam pressure (23 min, ≈1 min/mark)
- **Start button**

### 2. Active (Test Runner)
- **Top bar** (sticky): progress text ("Part 3 of 15"), progress bar, timer (if enabled)
- **Content area**: scenario header (title, icon, context), then current part card
- **Bottom nav** (fixed): Previous | Flag | Next (or "Check Answer" in practice mode)
- Parts are shown one at a time within their scenario context
- The scenario graph is shown above the parts (persistent while within that scenario)

### 3. Review Screen (Exam mode only)
- Shows all scenarios with part indicators (answered / unanswered / flagged)
- Click a part to jump back to it
- "Submit Test" button with confirmation dialog

### 4. Results Dashboard
- **Score**: large number (e.g. "17 / 23"), percentage, grade badge
- **Topic breakdown**: bar chart or progress bars per topic (distance-time, velocity-time, acceleration, displacement)
- **Per-question review**: expandable list showing each part with:
  - The question
  - Student's answer vs correct answer
  - Marks awarded (with partial credit breakdown)
  - Worked solution steps
  - The graph (if applicable)
- "Retake Test" button

---

## Graph Component (Graph.js) — CRITICAL

This is the most complex component. Build it as a reusable class/module.

### Requirements

1. **Renders as inline SVG** in a container div
2. **Axes**: labelled with units, tick marks at `step` intervals, axis labels
3. **Gridlines**: light minor grid, slightly darker major grid
4. **Data lines**: drawn from the `points` array in the scenario's `graphSpec.lines`
5. **Zero line**: horizontal dashed line at y=0 when `zeroLine: true` (for negative velocity)
6. **Crosshair**: follows mouse, snaps to grid. Shows snapped (x, y) in a tooltip near cursor
7. **Click-to-read mode**: user clicks to read a value from the graph (for graph_reading questions)
8. **Click-to-plot mode**: user clicks to place points on an empty graph (for scenario_09, graph_plot questions). Points should be removable (click again or right-click to delete).
9. **Area shading**: fill the area between a line and the x-axis with a semi-transparent colour. Handle areas above and below the axis differently (positive = blue fill, negative = red fill).
10. **Responsive**: SVG viewBox-based, scales to container width

### Graph Spec Format (from scenario JSON)

```json
{
  "type": "velocity-time",
  "xAxis": { "label": "Time (s)", "min": 0, "max": 50, "step": 10, "snapStep": 5 },
  "yAxis": { "label": "Velocity (m/s)", "min": 0, "max": 30, "step": 5, "snapStep": 5 },
  "lines": [
    {
      "id": "car",
      "color": "line1",
      "points": [{ "x": 0, "y": 0 }, { "x": 10, "y": 25 }, ...]
    }
  ],
  "zeroLine": false,
  "interactiveMode": "plot-points"
}
```

The `color` field maps to CSS variables: `"line1"` → `var(--graph-line-1)`, `"line2"` → `var(--graph-line-2)`.

### Coordinate Conversion

```
toPixel(dataX, dataY) → { x: svgX, y: svgY }
toData(svgX, svgY) → { x: dataX, y: dataY }
snap(dataX, dataY) → snapped to nearest snapStep
```

Padding: `{ top: 24, right: 24, bottom: 56, left: 64 }` — enough room for axis labels.

---

## Question Types & Answer Input

### MCQ (`type: "mcq"`)
- Radio button group using `.radio-option` CSS class
- Student selects one option
- Answer stored as option ID string (e.g. "B")

### Numeric with Unit (`type: "numeric_with_unit"` or `type: "graph_reading"`)
- Number input + unit dropdown side by side (`.numeric-answer` CSS class)
- Unit options come from `answerSchema.unitOptions`
- Answer stored as `{ value: number, unit: string }`

### Calculation (`type: "calculation"`)
- Same as numeric_with_unit but with method marks available
- In practice mode, show partial credit in feedback

### Graph Plot (`type: "graph_plot"`)
- Empty graph with axes, student clicks to place points
- Points snap to grid
- Answer stored as array of `{ x, y }` objects
- Points can be removed by clicking on them

### Explain (`type: "explain"` — NOT in prototype, but plan for it)
- Textarea input
- Self-assessed in practice mode (show model answer, student rates themselves)

---

## Marking Engine (marking.js) — ALREADY WRITTEN

The marking engine is in `src/lib/marking.js`. It exports a `MarkingEngine` object with:

- `markAnswer(answer, schema, methodMarks)` → result
- `scoreScenario(answers, scenario)` → scenario result
- `scoreTest(answers, scenarios)` → full test result

Key features:
- Numeric tolerance (configurable per question)
- Unit marking (separate mark deducted for wrong unit)
- MCQ marking
- Graph point matching (with x/y tolerance)
- Partial credit via method marks

---

## Timer

- Countdown from selected preset (or disabled)
- Display format: `MM:SS` with clock icon
- States: normal → warning (≤5 min, amber) → critical (≤2 min, red, pulsing)
- In exam mode: auto-submits when timer hits 0
- In practice mode: pauses between questions (only counts while a question is active)

---

## Data Flow

```
User starts test
  → scenarios loaded from JSON
  → state = { mode, timer, currentScenarioIndex, currentPartIndex, answers: {}, flags: {} }

User answers a part
  → answers[partId] = answer
  → Practice mode: immediately run MarkingEngine.markAnswer(), show feedback panel
  → Exam mode: store answer silently, move to next

User finishes
  → Exam mode: show Review screen → Submit → run MarkingEngine.scoreTest()
  → Practice mode: after last part → run MarkingEngine.scoreTest()
  → Show Results dashboard
```

---

## Scenario Data (included in JSON files)

### Scenario 01 — Runner in the Park 🏃
- **Graph**: distance-time, 3 segments (run, stop, walk)
- **Parts**: 4 (graph reading, speed calc, MCQ interpretation, average speed)
- **Marks**: 6
- **Difficulty**: Foundation

### Scenario 03 — Car on the Motorway 🚗
- **Graph**: velocity-time, trapezium shape (accelerate, cruise, decelerate)
- **Parts**: 4 (acceleration calc, graph reading, area/displacement calc, MCQ deceleration)
- **Marks**: 7
- **Difficulty**: Foundation → Higher

### Scenario 04 — Train Journey 🚆
- **Graph**: velocity-time with negative velocity (line crosses zero axis)
- **Parts**: 4 (deceleration calc, MCQ negative velocity meaning, displacement with direction, distance vs displacement)
- **Marks**: 8
- **Difficulty**: Higher

### Scenario 09 — Remote-Controlled Car 📊
- **Graph**: velocity-time, EMPTY (student plots from data table)
- **Parts**: 3 (plot points from table, read value, estimate displacement)
- **Marks**: 5
- **Difficulty**: Foundation → Higher
- **Special**: includes `dataTable` in scenario JSON, graph is in `plot-points` mode

---

## CSS Design System — ALREADY WRITTEN

The CSS in `src/styles/main.css` follows Apple HIG standards:
- Full light/dark mode via `prefers-color-scheme`
- 8pt spacing grid
- All component styles (buttons, cards, inputs, radio groups, toggles, progress bars, badges)
- Graph-specific CSS variables
- Animation keyframes (fadeIn, slideUp, scaleIn)
- Responsive breakpoints
- Reduced motion support

**Use the existing CSS classes.** Don't reinvent them. Key classes:
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-sm`, `.btn-lg`, `.btn-full`
- `.card`, `.card-flat`
- `.input`, `.select`, `.label`, `.label-hint`, `.error-message`
- `.radio-group`, `.radio-option`, `.radio-option.selected`, `.radio-option.correct`, `.radio-option.incorrect`
- `.toggle-switch`, `.toggle-slider`
- `.progress-track`, `.progress-bar`
- `.badge-foundation`, `.badge-higher`, `.badge-marks`, `.badge-correct`, `.badge-incorrect`, `.badge-partial`
- `.graph-container`, `.graph-svg`, `.graph-title`, `.graph-tooltip`
- `.feedback-panel`, `.feedback-panel.correct`, `.feedback-panel.incorrect`, `.feedback-panel.partial`
- `.solution-steps`, `.solution-step`, `.solution-formula`
- `.welcome-screen`, `.welcome-icon`, `.welcome-title`, etc.
- `.test-layout`, `.test-topbar`, `.test-content`, `.test-nav`
- `.question-card`, `.part-card`, `.part-header`, `.part-question`
- `.review-screen`, `.review-scenario`, `.review-part`
- `.results-screen`, `.results-score`, `.results-grade`, `.breakdown-card`
- `.type-large-title`, `.type-title1`, `.type-title2`, `.type-body`, etc.
- `.animate-fade-in`, `.animate-slide-up`, `.animate-scale-in`

---

## Key Formulas Tested

- `speed = distance ÷ time`
- `acceleration = (v − u) ÷ t`
- `gradient of distance–time graph = speed`
- `gradient of velocity–time graph = acceleration`
- `area under velocity–time graph = displacement`
- Negative velocity = motion in opposite direction
- Distance = sum of absolute areas; Displacement = net area (with sign)

---

## Build Order (recommended)

1. **Graph.js** — get the SVG rendering working first (axes, grid, lines, crosshair). Test with scenario_01 data.
2. **app.js** — basic state machine (welcome → active → results). Load scenario JSON.
3. **Welcome.js** — render the welcome screen with mode/timer selection.
4. **QuestionCard.js** — render a single part (MCQ, numeric input, graph reading).
5. **TestRunner.js** — wire up navigation (prev/next), progress bar, scenario flow.
6. **Timer.js** — countdown with warning/critical states.
7. **Results.js** — score dashboard with topic breakdown and per-question review with solutions.
8. **Review.js** — exam mode review screen.
9. **Graph enhancements** — plot-points mode, area shading, zero line.
10. **Polish** — animations, transitions, edge cases, mobile responsive.

---

## Testing Checklist

- [ ] All 4 scenarios load and display correctly
- [ ] Distance-time graph renders with correct axes, gridlines, and line segments
- [ ] Velocity-time graph renders (including negative y-axis for scenario_04)
- [ ] Crosshair follows mouse and snaps to grid
- [ ] MCQ selection works and stores answer
- [ ] Numeric input + unit dropdown stores answer correctly
- [ ] Plot-points mode: click places snapped points, click again removes
- [ ] Practice mode: feedback panel appears after "Check Answer"
- [ ] Exam mode: no feedback, flag button works, review screen shows status
- [ ] Timer counts down, changes colour at thresholds, auto-submits
- [ ] Results screen shows correct score, percentage, grade
- [ ] Topic breakdown is accurate
- [ ] Per-question review shows correct/incorrect, worked solutions
- [ ] Dark mode looks correct (run the Midnight Test)
- [ ] Keyboard navigation works for all interactive elements
- [ ] Mobile responsive (test at 375px width)

---

## Future Expansion (not in prototype)

After the prototype works, expand to all 10 scenarios:
- Scenario 02: Cyclist Commute (displacement-time, negative gradient)
- Scenario 05: Lift in a Building (multi-representation, v-t → d-t)
- Scenario 06: Sprinter 100m (curved v-t, instantaneous vs average)
- Scenario 07: Braking Car (dual deceleration profiles, comparison)
- Scenario 08: Speed vs Velocity Concepts (conceptual MCQs)
- Scenario 10: Multi-Stage Bus Journey (compound trapezium, 5 segments)

Also planned:
- "Explain" question type with self-assessment
- Font size / dyslexia-friendly toggle
- Calculator allowed toggle
- Export results as PDF
