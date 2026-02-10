// ============================================================
// Welcome.js — Welcome/setup screen
// Mode selector, timer presets, scenario selection, start button
// ============================================================

export class Welcome {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.onStart = options.onStart || null;
    this.scenarios = options.scenarios || [];

    this.mode = 'practice';
    this.timerPreset = 0; // 0 = untimed
    // All scenarios selected by default
    this.selectedIds = new Set(this.scenarios.map(s => s.id));

    this.render();
  }

  _countParts() {
    let total = 0;
    for (const s of this.scenarios) {
      if (this.selectedIds.has(s.id)) total += s.parts.length;
    }
    return total;
  }

  _difficultyLabel(d) {
    if (d === 'foundation') return 'Foundation';
    if (d === 'higher') return 'Higher';
    return 'Foundation–Higher';
  }

  render() {
    this.container.innerHTML = '';

    const totalParts = this._countParts();
    const selectedCount = this.selectedIds.size;

    const screen = document.createElement('div');
    screen.className = 'welcome-screen animate-fade-in';
    screen.innerHTML = `
      <div class="welcome-icon">📐</div>
      <h1 class="welcome-title">GCSE Physics — Motion &amp; Graphs</h1>
      <p class="welcome-subtitle">Edexcel · <span class="subtitle-counts">${selectedCount} Scenario${selectedCount !== 1 ? 's' : ''} · ${totalParts} Questions</span></p>

      <div class="welcome-options">
        <div class="welcome-option-group">
          <div class="welcome-option-group-title">
            Scenarios
            <button class="btn btn-ghost btn-sm select-toggle">Deselect All</button>
          </div>
          <div class="scenario-picker"></div>
        </div>

        <div class="welcome-option-group">
          <div class="welcome-option-group-title">Mode</div>
          <div class="mode-selector" role="radiogroup" aria-label="Test mode">
            <button class="mode-btn active" data-mode="practice" role="radio" aria-checked="true" data-tooltip="Get instant feedback after each question">Practice</button>
            <button class="mode-btn" data-mode="exam" role="radio" aria-checked="false" data-tooltip="No feedback until you submit — just like a real exam">Exam</button>
          </div>
        </div>

        <div class="welcome-option-group">
          <div class="welcome-option-group-title">Timer</div>
          <div class="timer-presets" role="radiogroup" aria-label="Timer preset">
            <button class="timer-preset active" data-time="0">
              <span class="timer-preset-label">Untimed</span>
              <span class="timer-preset-time">No limit</span>
            </button>
            <button class="timer-preset" data-time="900">
              <span class="timer-preset-label">Relaxed</span>
              <span class="timer-preset-time">15 min</span>
            </button>
            <button class="timer-preset" data-time="1380">
              <span class="timer-preset-label">Exam Pressure</span>
              <span class="timer-preset-time">23 min</span>
            </button>
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-lg welcome-start">Start Test</button>
    `;

    // Build scenario picker cards
    const picker = screen.querySelector('.scenario-picker');
    for (const scenario of this.scenarios) {
      const card = document.createElement('button');
      card.className = 'scenario-pick-card' + (this.selectedIds.has(scenario.id) ? ' selected' : '');
      card.dataset.id = scenario.id;
      card.innerHTML = `
        <span class="scenario-pick-icon">${scenario.icon}</span>
        <div class="scenario-pick-info">
          <span class="scenario-pick-title">${scenario.title}</span>
          <span class="scenario-pick-meta">${scenario.parts.length} Qs · ${this._difficultyLabel(scenario.difficulty)}</span>
        </div>
        <span class="scenario-pick-check">${this.selectedIds.has(scenario.id) ? '✓' : ''}</span>
      `;
      card.addEventListener('click', () => this._toggleScenario(scenario.id, card, screen));
      picker.appendChild(card);
    }

    // Select/Deselect All toggle
    const selectToggle = screen.querySelector('.select-toggle');
    selectToggle.addEventListener('click', () => {
      const allSelected = this.selectedIds.size === this.scenarios.length;
      if (allSelected) {
        this.selectedIds.clear();
        picker.querySelectorAll('.scenario-pick-card').forEach(c => {
          c.classList.remove('selected');
          c.querySelector('.scenario-pick-check').textContent = '';
        });
        selectToggle.textContent = 'Select All';
      } else {
        this.scenarios.forEach(s => this.selectedIds.add(s.id));
        picker.querySelectorAll('.scenario-pick-card').forEach(c => {
          c.classList.add('selected');
          c.querySelector('.scenario-pick-check').textContent = '✓';
        });
        selectToggle.textContent = 'Deselect All';
      }
      this._updateCounts(screen);
    });

    // Mode selector
    const modeButtons = screen.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modeButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
        this.mode = btn.dataset.mode;
      });
    });

    // Timer presets
    const timerButtons = screen.querySelectorAll('.timer-preset');
    timerButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        timerButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.timerPreset = parseInt(btn.dataset.time, 10);
      });
    });

    // Start button
    const startBtn = screen.querySelector('.welcome-start');
    this._updateStartBtn(startBtn);
    startBtn.addEventListener('click', () => {
      if (this.selectedIds.size === 0) return;
      if (this.onStart) {
        this.onStart({
          mode: this.mode,
          timerSeconds: this.timerPreset,
          selectedScenarioIds: [...this.selectedIds]
        });
      }
    });

    this.container.appendChild(screen);
  }

  _toggleScenario(id, card, screen) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      card.classList.remove('selected');
      card.querySelector('.scenario-pick-check').textContent = '';
    } else {
      this.selectedIds.add(id);
      card.classList.add('selected');
      card.querySelector('.scenario-pick-check').textContent = '✓';
    }
    this._updateCounts(screen);
  }

  _updateCounts(screen) {
    const totalParts = this._countParts();
    const selectedCount = this.selectedIds.size;
    screen.querySelector('.subtitle-counts').textContent =
      `${selectedCount} Scenario${selectedCount !== 1 ? 's' : ''} · ${totalParts} Questions`;

    const toggle = screen.querySelector('.select-toggle');
    if (toggle) {
      toggle.textContent = selectedCount === this.scenarios.length ? 'Deselect All' : 'Select All';
    }

    this._updateStartBtn(screen.querySelector('.welcome-start'));
  }

  _updateStartBtn(btn) {
    const n = this.selectedIds.size;
    btn.textContent = n === 0 ? 'Select a Scenario' : `Start Test (${this._countParts()} Questions)`;
    btn.disabled = n === 0;
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
