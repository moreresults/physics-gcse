// ============================================================
// Review.js — Exam mode pre-submit review screen
// Shows all scenarios/parts with answered/unanswered/flagged status
// ============================================================

export class Review {
  constructor(container, scenarios, answers, flags, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.scenarios = scenarios;
    this.answers = answers;
    this.flags = flags;
    this.onJump = options.onJump || null;
    this.onSubmit = options.onSubmit || null;

    this.render();
  }

  render() {
    this.container.innerHTML = '';

    const screen = document.createElement('div');
    screen.className = 'review-screen animate-fade-in';

    // Header
    const header = document.createElement('div');
    header.className = 'review-header';
    header.innerHTML = `
      <h1 class="type-title1">Review Your Answers</h1>
      <p class="type-body">Check your answers before submitting. Click any part to go back and edit it.</p>
    `;
    screen.appendChild(header);

    // Stats
    let totalParts = 0;
    let answeredParts = 0;
    let flaggedParts = 0;
    let partIndex = 0;

    // Scenario list
    const list = document.createElement('div');
    list.className = 'review-list';

    for (const scenario of this.scenarios) {
      const scenarioCard = document.createElement('div');
      scenarioCard.className = 'review-scenario card';

      const scenarioTitle = document.createElement('div');
      scenarioTitle.className = 'review-scenario-title';
      scenarioTitle.innerHTML = `
        <span class="scenario-icon">${scenario.icon}</span>
        <span class="type-title3">${scenario.title}</span>
      `;
      scenarioCard.appendChild(scenarioTitle);

      const partsGrid = document.createElement('div');
      partsGrid.className = 'review-parts';

      for (const part of scenario.parts) {
        totalParts++;
        const hasAnswer = this._hasAnswer(part.id);
        const isFlagged = this.flags[part.id];

        if (hasAnswer) answeredParts++;
        if (isFlagged) flaggedParts++;

        const partBtn = document.createElement('button');
        let cls = 'review-part';
        if (hasAnswer) cls += ' answered';
        if (isFlagged) cls += ' flagged';
        if (!hasAnswer) cls += ' unanswered';
        partBtn.className = cls;

        const thisIndex = partIndex;
        partBtn.innerHTML = `
          <span class="review-part-label">${part.partLabel}</span>
          <span class="review-part-status">${isFlagged ? '🚩' : hasAnswer ? '✓' : '—'}</span>
        `;

        partBtn.addEventListener('click', () => {
          if (this.onJump) this.onJump(thisIndex);
        });

        partsGrid.appendChild(partBtn);
        partIndex++;
      }

      scenarioCard.appendChild(partsGrid);
      list.appendChild(scenarioCard);
    }

    screen.appendChild(list);

    // Summary
    const summary = document.createElement('div');
    summary.className = 'review-summary';
    summary.innerHTML = `
      <div class="review-stats">
        <span class="type-body"><strong>${answeredParts}</strong> of ${totalParts} answered</span>
        ${flaggedParts > 0 ? `<span class="type-body">· <strong>${flaggedParts}</strong> flagged</span>` : ''}
      </div>
    `;
    screen.appendChild(summary);

    // Submit button
    const actions = document.createElement('div');
    actions.className = 'review-actions';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary btn-lg btn-full';
    submitBtn.textContent = 'Submit Test';
    submitBtn.addEventListener('click', () => this._confirmSubmit());
    actions.appendChild(submitBtn);

    screen.appendChild(actions);

    this.container.appendChild(screen);
  }

  _hasAnswer(partId) {
    const answer = this.answers[partId];
    if (answer === null || answer === undefined) return false;
    if (typeof answer === 'string') return answer !== '';
    if (typeof answer === 'object' && !Array.isArray(answer)) {
      return answer.value !== '' && answer.value !== null && answer.value !== undefined;
    }
    if (Array.isArray(answer)) return answer.length > 0;
    return true;
  }

  _confirmSubmit() {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-overlay';
    dialog.innerHTML = `
      <div class="confirm-dialog card animate-scale-in">
        <h3 class="type-title3">Submit Test?</h3>
        <p class="type-body">Once submitted, you cannot change your answers.</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary confirm-cancel">Go Back</button>
          <button class="btn btn-primary confirm-submit">Submit</button>
        </div>
      </div>
    `;

    dialog.querySelector('.confirm-cancel').addEventListener('click', () => dialog.remove());
    dialog.querySelector('.confirm-submit').addEventListener('click', () => {
      dialog.remove();
      if (this.onSubmit) this.onSubmit(this.answers);
    });

    this.container.appendChild(dialog);
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
