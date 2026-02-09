// ============================================================
// app.js — Main app shell, state machine, scenario loading
// States: welcome → active → review (exam) → results
// ============================================================

import { Welcome } from './components/Welcome.js';
import { TestRunner } from './components/TestRunner.js';
import { Review } from './components/Review.js';
import { Results } from './components/Results.js';
import { MarkingEngine } from './lib/marking.js';

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

    this.init();
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
        // Filter to only selected scenarios
        const selectedSet = new Set(selectedScenarioIds);
        this.activeScenarios = this.scenarios.filter(s => selectedSet.has(s.id));
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
      onFinish: (answers) => {
        this.answers = answers;
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
