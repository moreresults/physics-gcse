// ============================================================
// app.js — Main app shell, state machine, scenario loading
// States: welcome → active → review (exam) → results
// ============================================================

import { Welcome } from './components/Welcome.js';
import { TestRunner } from './components/TestRunner.js';
import { Review } from './components/Review.js';
import { Results } from './components/Results.js';
import { MarkingEngine } from './lib/marking.js';
import { analytics } from './lib/analytics.js';

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.state = 'welcome';
    this.scenarios = [];
    this.mode = 'practice';
    this.timerSeconds = 0;
    this.answers = {};
    this.flags = {};
    this.activeScenarios = [];
    this.testRunner = null;
    this._attemptId = null;
    this._testTimer = null;
    this._timerExpired = false;

    // Initialise analytics
    analytics.init({
      apiKey: 'phc_HXeh6UCsMolYvcEsYe2AJvBm258MeuFGsPPIexlTteM',
      debug: false,
      env: 'prod',
    });
    analytics.lifecycle.appOpened();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      analytics.ux.reducedMotionDetected();
    }

    // Abandonment handler
    window.addEventListener('beforeunload', () => {
      if (this.state === 'active' && this.testRunner) {
        const parts = this.testRunner.parts;
        const currentPart = parts[this.testRunner.currentIndex];
        const runnerAnswers = this.testRunner.answers || {};
        const answeredCount = Object.keys(runnerAnswers).filter(id =>
          this._hasAnswer(runnerAnswers[id])
        ).length;

        analytics.testSession.abandoned({
          partsAnswered: answeredCount,
          totalParts: parts.length,
          durationSeconds: this._testTimer ? Math.round(this._testTimer() / 1000) : 0,
          lastPartId: currentPart ? currentPart.id : null,
          lastScenarioId: currentPart ? currentPart._scenario.id : null,
        });
      }
    });

    this.init();
  }

  _hasAnswer(answer) {
    if (answer === null || answer === undefined) return false;
    if (typeof answer === 'string') return answer !== '';
    if (typeof answer === 'object' && !Array.isArray(answer)) {
      return answer.value !== '' && answer.value !== null && answer.value !== undefined;
    }
    if (Array.isArray(answer)) return answer.length > 0;
    return true;
  }

  async init() {
    await this.loadScenarios();
    this.renderState();
  }

  async loadScenarios() {
    const ids = ['scenario_01', 'scenario_03', 'scenario_04', 'scenario_09'];

    // Determine base path relative to root index.html
    const basePath = './src/data/scenarios';

    const promises = ids.map(async (id) => {
      try {
        const resp = await fetch(`${basePath}/${id}.json`);
        if (!resp.ok) throw new Error(`Failed to load ${id}`);
        return resp.json();
      } catch (e) {
        console.error(`Error loading ${id}:`, e);
        return null;
      }
    });

    const results = await Promise.all(promises);
    this.scenarios = results.filter(Boolean);

    if (this.scenarios.length === 0) {
      this.root.innerHTML = `
        <div class="welcome-screen">
          <h1 class="type-title1">Error Loading Scenarios</h1>
          <p class="type-body">Could not load any scenario data. Please check that the JSON files exist in src/data/scenarios/.</p>
        </div>
      `;
    }
  }

  renderState() {
    this.root.innerHTML = '';

    switch (this.state) {
      case 'welcome':
        this._renderWelcome();
        break;
      case 'active':
        this._renderActive();
        break;
      case 'review':
        this._renderReview();
        break;
      case 'results':
        this._renderResults();
        break;
    }
  }

  _renderWelcome() {
    new Welcome(this.root, {
      scenarios: this.scenarios,
      onStart: ({ mode, timerSeconds, selectedScenarioIds }) => {
        this.mode = mode;
        this.timerSeconds = timerSeconds;
        this.answers = {};
        this.flags = {};
        this._timerExpired = false;
        // Filter to only selected scenarios
        const selectedSet = new Set(selectedScenarioIds);
        this.activeScenarios = this.scenarios.filter(s => selectedSet.has(s.id));

        analytics.lifecycle.modeSelected(mode);

        // Calculate totals for analytics
        let totalParts = 0;
        let totalMarks = 0;
        for (const s of this.activeScenarios) {
          totalParts += s.parts.length;
          totalMarks += s.parts.reduce((sum, p) => sum + p.marks, 0);
        }

        this._attemptId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this._testTimer = analytics.startTimer();

        analytics.testSession.started({
          subject: 'physics',
          mode,
          attemptId: this._attemptId,
          scenarioCount: this.activeScenarios.length,
          totalParts,
          totalMarks,
          timerMinutes: Math.round(timerSeconds / 60),
        });

        this.state = 'active';
        this.renderState();
      }
    });
  }

  _renderActive(jumpToIndex) {
    this.testRunner = new TestRunner(this.root, this.activeScenarios, {
      mode: this.mode,
      timerSeconds: this.timerSeconds,
      existingAnswers: this.answers,
      existingFlags: this.flags,
      onFinish: (answers, timerExpired) => {
        this.answers = answers;
        if (timerExpired) this._timerExpired = true;
        this.state = 'results';
        this.renderState();
      },
      onReview: (answers, flags) => {
        this.answers = answers;
        this.flags = flags;
        this.state = 'review';
        this.renderState();
      },
      onExit: () => {
        analytics.clearSessionMeta();
        this.state = 'welcome';
        this.renderState();
      }
    });
    if (jumpToIndex !== undefined) {
      this.testRunner.goToPart(jumpToIndex);
    }
  }

  _renderReview() {
    new Review(this.root, this.activeScenarios, this.answers, this.flags, {
      onJump: (index) => {
        this.state = 'active';
        this.root.innerHTML = '';
        this._renderActive(index);
      },
      onSubmit: (answers) => {
        this.answers = answers;
        this.state = 'results';
        this.renderState();
      }
    });
  }

  _renderResults() {
    const testResult = MarkingEngine.scoreTest(this.answers, this.activeScenarios);

    // --- Analytics: test completed ---
    const answeredCount = Object.keys(this.answers).filter(id => this._hasAnswer(this.answers[id])).length;
    const flaggedCount = Object.values(this.flags).filter(Boolean).length;

    analytics.testSession.completed({
      score: testResult.totalMarks,
      maxMarks: testResult.maxMarks,
      teacherMarks: 0,
      percentage: testResult.percentage,
      grade: testResult.grade,
      durationSeconds: this._testTimer ? Math.round(this._testTimer() / 1000) : 0,
      partsAnswered: answeredCount,
      partsFlagged: flaggedCount,
      timerExpired: this._timerExpired,
    });

    // --- Analytics: per-part and per-scenario marking ---
    for (const scenario of this.activeScenarios) {
      const scenResult = testResult.scenarioResults[scenario.id];
      if (!scenResult) continue;

      for (const part of scenario.parts) {
        const partResult = scenResult.partResults[part.id];
        if (!partResult) continue;

        analytics.marking.partMarked({
          partId: part.id,
          partType: part.type,
          scenarioId: scenario.id,
          marksAwarded: partResult.marks,
          maxMarks: partResult.maxMarks,
          isCorrect: partResult.correct,
          isPartiallyCorrect: !partResult.correct && partResult.marks > 0,
          teacherMarked: false,
          topicTags: part.topicTags || [],
          misconceptionTags: part.misconceptionTags || [],
        });

        if (!partResult.correct && part.misconceptionTags) {
          for (const tag of part.misconceptionTags) {
            analytics.marking.misconceptionTriggered(
              part.id, part.type, scenario.id, tag, part.topicTags || []
            );
          }
        }
      }

      analytics.marking.scenarioMarked({
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        score: scenResult.totalMarks,
        maxMarks: scenResult.maxMarks,
        partsCorrect: Object.values(scenResult.partResults).filter(r => r.correct).length,
        totalParts: scenario.parts.length,
        durationSeconds: this._testTimer ? Math.round(this._testTimer() / 1000) : 0,
      });
    }

    analytics.navigation.resultsViewed(testResult.totalMarks, testResult.percentage, testResult.grade);
    analytics.clearSessionMeta();

    new Results(this.root, testResult, this.activeScenarios, this.answers, {
      onRetake: () => {
        this.state = 'welcome';
        this.renderState();
      }
    });
  }
}

// Boot the app
new App();
