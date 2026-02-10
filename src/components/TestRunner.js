// ============================================================
// TestRunner.js — Question flow, navigation, progress
// Manages scenario/part progression and the active test UI
// ============================================================

import { Graph } from './Graph.js';
import { QuestionCard } from './QuestionCard.js';
import { Timer } from './Timer.js';
import { MarkingEngine } from '../lib/marking.js';
import { analytics } from '../lib/analytics.js';

export class TestRunner {
  constructor(container, scenarios, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.scenarios = scenarios;
    this.mode = options.mode || 'practice';
    this.timerSeconds = options.timerSeconds || 0;
    this.onFinish = options.onFinish || null;
    this.onReview = options.onReview || null;
    this.onExit = options.onExit || null;

    // Build flat list of parts with scenario references
    this.parts = [];
    for (const scenario of this.scenarios) {
      for (const part of scenario.parts) {
        this.parts.push({ ...part, _scenario: scenario, _dataTable: scenario.dataTable || null });
      }
    }

    this.currentIndex = 0;
    this.answers = options.existingAnswers || {};
    this.flags = options.existingFlags || {};
    this.feedback = {}; // partId → feedback result
    this.checkedParts = {}; // partId → true if already checked in practice mode

    this.graph = null;
    this.timer = null;
    this.questionCard = null;
    this._lastTrackedScenarioId = null;
    this._partTimer = null;

    this.render();
  }

  render() {
    this.container.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'test-layout';

    // Top bar
    const topbar = document.createElement('div');
    topbar.className = 'test-topbar';
    topbar.innerHTML = `
      <div class="progress-info">
        <button class="btn btn-ghost btn-sm nav-exit" aria-label="Exit test">✕ Exit</button>
        <span class="progress-text type-caption"></span>
        <div class="timer-container"></div>
      </div>
      <div class="progress-track">
        <div class="progress-bar"></div>
      </div>
    `;
    layout.appendChild(topbar);

    // Content area
    const content = document.createElement('div');
    content.className = 'test-content';

    // Scenario header area
    const scenarioHeader = document.createElement('div');
    scenarioHeader.className = 'scenario-header';
    content.appendChild(scenarioHeader);

    // Graph area
    const graphArea = document.createElement('div');
    graphArea.className = 'graph-area';
    content.appendChild(graphArea);

    // Question area
    const questionArea = document.createElement('div');
    questionArea.className = 'question-area';
    content.appendChild(questionArea);

    layout.appendChild(content);

    // Bottom nav
    const nav = document.createElement('div');
    nav.className = 'test-nav';
    nav.innerHTML = `
      <div class="test-nav-inner">
        <button class="btn btn-secondary nav-prev" aria-label="Previous question">← Previous</button>
        <button class="btn btn-ghost nav-flag" aria-label="Flag question">🚩 Flag</button>
        <div class="nav-buttons">
          <button class="btn btn-primary nav-next">Next →</button>
        </div>
      </div>
    `;
    layout.appendChild(nav);

    this.container.appendChild(layout);

    // Store refs
    this.els = {
      topbar,
      progressText: topbar.querySelector('.progress-text'),
      progressBar: topbar.querySelector('.progress-bar'),
      timerContainer: topbar.querySelector('.timer-container'),
      scenarioHeader,
      graphArea,
      questionArea,
      nav,
      prevBtn: nav.querySelector('.nav-prev'),
      flagBtn: nav.querySelector('.nav-flag'),
      nextBtn: nav.querySelector('.nav-next')
    };

    // Timer
    if (this.timerSeconds > 0) {
      this.timer = new Timer(this.els.timerContainer, this.timerSeconds, {
        onExpire: () => this._finishTest(true)
      });
      this.timer.start();
    }

    // Navigation events
    this.els.prevBtn.addEventListener('click', () => this._navigate(-1));
    this.els.nextBtn.addEventListener('click', () => this._handleNext());
    this.els.flagBtn.addEventListener('click', () => this._toggleFlag());
    topbar.querySelector('.nav-exit').addEventListener('click', () => this._confirmExit());

    // Render first question
    this._renderCurrentPart();
  }

  _renderCurrentPart() {
    const part = this.parts[this.currentIndex];
    const scenario = part._scenario;

    // Update progress
    this.els.progressText.textContent = `Part ${this.currentIndex + 1} of ${this.parts.length}`;
    const pct = ((this.currentIndex + 1) / this.parts.length) * 100;
    this.els.progressBar.style.width = pct + '%';

    // Analytics: track scenario and part viewed
    if (scenario.id !== this._lastTrackedScenarioId) {
      const scenIndex = this.scenarios.indexOf(scenario);
      analytics.navigation.scenarioViewed(
        scenario.id, scenario.title,
        scenIndex >= 0 ? scenIndex : 0,
        this.scenarios.length
      );
      this._lastTrackedScenarioId = scenario.id;
    }
    analytics.navigation.partViewed(part.id, part.type, scenario.id);
    this._partTimer = analytics.startTimer();

    // Scenario header
    this.els.scenarioHeader.innerHTML = `
      <div class="scenario-info">
        <span class="scenario-icon">${scenario.icon}</span>
        <div>
          <h2 class="type-title2">${scenario.title}</h2>
          <p class="type-caption scenario-context">${scenario.context}</p>
        </div>
      </div>
    `;

    // Graph — only re-render when scenario changes
    const needsGraph = this._currentScenarioId !== scenario.id;
    if (needsGraph) {
      this._currentScenarioId = scenario.id;
      this.els.graphArea.innerHTML = '';

      if (scenario.graphSpec) {
        const graphMode = part.type === 'graph_plot' ? 'plot-points' :
                          part.type === 'graph_reading' ? 'read' : 'view';

        this.graph = new Graph(this.els.graphArea, scenario.graphSpec, {
          mode: graphMode,
          onPointsChange: (points) => {
            this.answers[part.id] = points;
            const countEl = document.getElementById('plot-point-count');
            if (countEl) countEl.textContent = `Points plotted: ${points.length}`;
            const undoBtn = document.getElementById('plot-undo-btn');
            if (undoBtn) undoBtn.disabled = points.length === 0;

            // Analytics: track last plotted point
            if (points.length > 0) {
              const lastPt = points[points.length - 1];
              analytics.physics.graphPointPlotted({
                partId: part.id,
                scenarioId: scenario.id,
                x: lastPt.x,
                y: lastPt.y,
                pointIndex: points.length - 1,
              });
            }
          },
          onValueRead: (pos) => {
            // Analytics: track graph value read
            analytics.physics.graphValueRead({
              partId: part.id,
              scenarioId: scenario.id,
              xValue: pos.x,
              yValue: pos.y,
              lineId: scenario.graphSpec.lines?.[0]?.id || null,
            });

            // For graph reading, auto-fill the value
            const input = this.els.questionArea.querySelector('input[type="number"]');
            if (input) {
              input.value = pos.y;
              input.dispatchEvent(new Event('input'));
            }
          }
        });

        // Restore placed points if revisiting
        if (part.type === 'graph_plot' && this.answers[part.id]) {
          this.graph.setPlacedPoints(this.answers[part.id]);
        }
      }
    } else {
      // Same scenario but might need different graph mode
      if (this.graph) {
        const graphMode = part.type === 'graph_plot' ? 'plot-points' :
                          part.type === 'graph_reading' ? 'read' : 'view';
        if (this.graph.mode !== graphMode) {
          this.graph.setMode(graphMode);
        }
        // Update callbacks
        this.graph.onPointsChange = (points) => {
          this.answers[part.id] = points;
          const countEl = document.getElementById('plot-point-count');
          if (countEl) countEl.textContent = `Points plotted: ${points.length}`;
          const undoBtn = document.getElementById('plot-undo-btn');
          if (undoBtn) undoBtn.disabled = points.length === 0;

          if (points.length > 0) {
            const lastPt = points[points.length - 1];
            analytics.physics.graphPointPlotted({
              partId: part.id,
              scenarioId: scenario.id,
              x: lastPt.x,
              y: lastPt.y,
              pointIndex: points.length - 1,
            });
          }
        };
        this.graph.onValueRead = (pos) => {
          analytics.physics.graphValueRead({
            partId: part.id,
            scenarioId: scenario.id,
            xValue: pos.x,
            yValue: pos.y,
            lineId: scenario.graphSpec.lines?.[0]?.id || null,
          });

          const input = this.els.questionArea.querySelector('input[type="number"]');
          if (input) {
            input.value = pos.y;
            input.dispatchEvent(new Event('input'));
          }
        };
        // Restore placed points
        if (part.type === 'graph_plot' && this.answers[part.id]) {
          this.graph.setPlacedPoints(this.answers[part.id]);
        }
      }
    }

    // Question card
    this.questionCard = new QuestionCard(this.els.questionArea, part, {
      mode: this.mode,
      existingAnswer: this.answers[part.id] || null,
      feedback: this.feedback[part.id] || null,
      onAnswer: (answer) => {
        const isChange = this.answers[part.id] !== undefined;
        this.answers[part.id] = answer;

        analytics.partInteraction.answered({
          partId: part.id,
          partType: part.type,
          scenarioId: scenario.id,
          marks: part.marks,
          timeOnPartMs: this._partTimer ? this._partTimer() : 0,
          isChange,
          isComplete: this._isAnswerComplete(part.type, answer),
        });
      }
    });

    // Wire undo button for graph_plot questions
    if (part.type === 'graph_plot' && this.graph) {
      const undoBtn = document.getElementById('plot-undo-btn');
      if (undoBtn) {
        undoBtn.addEventListener('click', () => {
          if (this.graph.placedPoints.length > 0) {
            this.graph.placedPoints.pop();
            this.graph._refreshPlacedPoints();
            if (this.graph.onPointsChange) this.graph.onPointsChange(this.graph.placedPoints);
            const countEl = document.getElementById('plot-point-count');
            if (countEl) countEl.textContent = `Points plotted: ${this.graph.placedPoints.length}`;
            undoBtn.disabled = this.graph.placedPoints.length === 0;
          }
        });
      }
    }

    // Update nav buttons
    this.els.prevBtn.disabled = this.currentIndex === 0;
    this._updateFlagBtn();
    this._updateNextBtn();
  }

  _updateNextBtn() {
    const isLast = this.currentIndex === this.parts.length - 1;
    const part = this.parts[this.currentIndex];
    const isChecked = this.checkedParts[part.id];

    if (this.mode === 'practice' && !isChecked && !this.feedback[part.id]) {
      this.els.nextBtn.textContent = 'Check Answer';
      this.els.nextBtn.className = 'btn btn-primary nav-next';
    } else if (isLast) {
      if (this.mode === 'exam') {
        this.els.nextBtn.textContent = 'Review →';
      } else {
        this.els.nextBtn.textContent = 'Finish';
      }
      this.els.nextBtn.className = 'btn btn-primary nav-next';
    } else {
      this.els.nextBtn.textContent = 'Next →';
      this.els.nextBtn.className = 'btn btn-primary nav-next';
    }
  }

  _updateFlagBtn() {
    const part = this.parts[this.currentIndex];
    const flagged = this.flags[part.id];
    this.els.flagBtn.textContent = flagged ? '🚩 Flagged' : '🚩 Flag';
    this.els.flagBtn.classList.toggle('flagged', !!flagged);

    // Hide flag button in practice mode
    this.els.flagBtn.style.display = this.mode === 'exam' ? '' : 'none';
  }

  _handleNext() {
    const part = this.parts[this.currentIndex];
    const isLast = this.currentIndex === this.parts.length - 1;

    // Practice mode: check answer first
    if (this.mode === 'practice' && !this.checkedParts[part.id] && !this.feedback[part.id]) {
      this._checkAnswer(part);
      return;
    }

    if (isLast) {
      if (this.mode === 'exam' && this.onReview) {
        this.onReview(this.answers, this.flags);
      } else {
        this._finishTest();
      }
    } else {
      this._navigate(1);
    }
  }

  _checkAnswer(part) {
    const answer = this.answers[part.id];
    const result = MarkingEngine.markAnswer(answer, part.answerSchema, part.methodMarks || []);
    result.maxMarks = part.marks;
    result.marks = Math.min(result.marks, part.marks);

    this.feedback[part.id] = result;
    this.checkedParts[part.id] = true;

    // Pause timer between questions in practice mode
    if (this.timer) this.timer.pause();

    // Re-render with feedback
    this._renderCurrentPart();
  }

  _navigate(delta) {
    const newIndex = this.currentIndex + delta;
    if (newIndex < 0 || newIndex >= this.parts.length) return;

    // Resume timer when moving to next question in practice mode
    if (this.timer) this.timer.resume();

    this.currentIndex = newIndex;
    this._renderCurrentPart();
  }

  _toggleFlag() {
    const part = this.parts[this.currentIndex];
    this.flags[part.id] = !this.flags[part.id];

    if (this.flags[part.id]) {
      analytics.partInteraction.flagged(part.id, part.type, part._scenario.id);
    } else {
      analytics.partInteraction.unflagged(part.id, part.type, part._scenario.id);
    }

    this._updateFlagBtn();
  }

  _confirmExit() {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-overlay';
    dialog.innerHTML = `
      <div class="confirm-dialog card animate-scale-in">
        <h3 class="type-title3">Exit Test?</h3>
        <p class="type-body">Your progress will be lost.</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary confirm-cancel">Continue Test</button>
          <button class="btn btn-primary confirm-submit">Exit</button>
        </div>
      </div>
    `;

    dialog.querySelector('.confirm-cancel').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.confirm-submit').addEventListener('click', () => {
      dialog.remove();
      if (this.timer) this.timer.stop();
      if (this.onExit) this.onExit();
    });

    this.container.appendChild(dialog);
  }

  _finishTest(timerExpired = false) {
    if (this.timer) this.timer.stop();
    if (this.onFinish) this.onFinish(this.answers, timerExpired);
  }

  // Public: jump to specific part index (used by Review screen)
  goToPart(index) {
    if (index >= 0 && index < this.parts.length) {
      this.currentIndex = index;
      this._renderCurrentPart();
    }
  }

  _isAnswerComplete(partType, answer) {
    if (!answer) return false;
    switch (partType) {
      case 'mcq': return answer !== null;
      case 'graph_plot': return Array.isArray(answer) && answer.length > 0;
      case 'graph_reading':
      case 'numeric_with_unit':
        return typeof answer === 'object' && answer.value !== null && answer.value !== '';
      case 'calculation':
        return answer !== null && answer !== '';
      default: return true;
    }
  }

  destroy() {
    if (this.timer) this.timer.destroy();
    if (this.graph) this.graph.destroy();
    this.container.innerHTML = '';
  }
}
