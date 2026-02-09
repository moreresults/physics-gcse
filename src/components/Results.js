// ============================================================
// Results.js — Results dashboard
// Score, grade, topic breakdown, per-question review with solutions
// ============================================================

import { Graph } from './Graph.js';

export class Results {
  constructor(container, testResult, scenarios, answers, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.testResult = testResult;
    this.scenarios = scenarios;
    this.answers = answers;
    this.onRetake = options.onRetake || null;

    this.render();
  }

  render() {
    this.container.innerHTML = '';

    const screen = document.createElement('div');
    screen.className = 'results-screen animate-fade-in';

    // Score header
    screen.appendChild(this._renderScore());

    // Topic breakdown
    screen.appendChild(this._renderTopicBreakdown());

    // Per-question review
    screen.appendChild(this._renderQuestionReview());

    // Retake button
    const actions = document.createElement('div');
    actions.className = 'results-actions';
    const retakeBtn = document.createElement('button');
    retakeBtn.className = 'btn btn-primary btn-lg btn-full';
    retakeBtn.textContent = 'Retake Test';
    retakeBtn.addEventListener('click', () => {
      if (this.onRetake) this.onRetake();
    });
    actions.appendChild(retakeBtn);
    screen.appendChild(actions);

    this.container.appendChild(screen);
  }

  _renderScore() {
    const { totalMarks, maxMarks, percentage, grade } = this.testResult;

    const section = document.createElement('div');
    section.className = 'results-score';

    const gradeLabel = grade === 'high' ? 'Strong Pass' : grade === 'medium' ? 'Pass' : 'Below Pass';
    const gradeClass = grade === 'high' ? 'badge-correct' : grade === 'medium' ? 'badge-partial' : 'badge-incorrect';

    section.innerHTML = `
      <div class="score-circle">
        <span class="score-number type-large-title">${totalMarks}</span>
        <span class="score-divider">of ${maxMarks}</span>
      </div>
      <div class="score-details">
        <span class="score-percentage type-title2">${percentage}%</span>
        <span class="results-grade ${gradeClass}">${gradeLabel}</span>
      </div>
    `;

    return section;
  }

  _renderTopicBreakdown() {
    const section = document.createElement('div');
    section.className = 'breakdown-section';

    const title = document.createElement('h2');
    title.className = 'type-title2';
    title.textContent = 'Topic Breakdown';
    section.appendChild(title);

    // Collect marks by topic
    const topics = {};
    for (const scenario of this.scenarios) {
      const scenResult = this.testResult.scenarioResults[scenario.id];
      if (!scenResult) continue;

      for (const part of scenario.parts) {
        const partResult = scenResult.partResults[part.id];
        if (!partResult) continue;

        for (const tag of (part.topicTags || [])) {
          if (!topics[tag]) topics[tag] = { marks: 0, maxMarks: 0 };
          topics[tag].marks += partResult.marks;
          topics[tag].maxMarks += partResult.maxMarks;
        }
      }
    }

    const topicNames = {
      'distance-time': 'Distance–Time Graphs',
      'velocity-time': 'Velocity–Time Graphs',
      'acceleration': 'Acceleration',
      'deceleration': 'Deceleration',
      'displacement': 'Displacement & Area'
    };

    for (const [tag, data] of Object.entries(topics)) {
      const card = document.createElement('div');
      card.className = 'breakdown-card';

      const pct = data.maxMarks > 0 ? Math.round((data.marks / data.maxMarks) * 100) : 0;
      card.innerHTML = `
        <div class="breakdown-header">
          <span class="type-body">${topicNames[tag] || tag}</span>
          <span class="type-caption">${data.marks}/${data.maxMarks}</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar ${pct >= 70 ? 'progress-high' : pct >= 40 ? 'progress-medium' : 'progress-low'}" style="width: ${pct}%"></div>
        </div>
      `;
      section.appendChild(card);
    }

    return section;
  }

  _renderQuestionReview() {
    const section = document.createElement('div');
    section.className = 'question-review-section';

    const title = document.createElement('h2');
    title.className = 'type-title2';
    title.textContent = 'Question Review';
    section.appendChild(title);

    for (const scenario of this.scenarios) {
      const scenResult = this.testResult.scenarioResults[scenario.id];
      if (!scenResult) continue;

      const scenBlock = document.createElement('div');
      scenBlock.className = 'review-scenario-block';

      const scenHeader = document.createElement('div');
      scenHeader.className = 'review-scenario-header';
      scenHeader.innerHTML = `
        <span class="scenario-icon">${scenario.icon}</span>
        <span class="type-title3">${scenario.title}</span>
        <span class="type-caption">${scenResult.totalMarks}/${scenResult.maxMarks}</span>
      `;
      scenBlock.appendChild(scenHeader);

      // Small graph preview
      const graphPreview = document.createElement('div');
      graphPreview.className = 'review-graph-preview';
      if (scenario.graphSpec && scenario.graphSpec.lines && scenario.graphSpec.lines.length > 0) {
        new Graph(graphPreview, scenario.graphSpec, { mode: 'view' });
      }
      scenBlock.appendChild(graphPreview);

      for (const part of scenario.parts) {
        const partResult = scenResult.partResults[part.id];
        if (!partResult) continue;

        const partCard = document.createElement('details');
        partCard.className = 'review-part-card card';

        const summary = document.createElement('summary');
        summary.className = 'review-part-summary';

        const badge = partResult.correct ? 'badge-correct' :
                      partResult.marks > 0 ? 'badge-partial' : 'badge-incorrect';
        const icon = partResult.correct ? '✓' : partResult.marks > 0 ? '½' : '✗';

        summary.innerHTML = `
          <span class="${badge} review-icon">${icon}</span>
          <span class="type-body review-question-text">(${part.partLabel}) ${part.question}</span>
          <span class="type-caption review-marks">${partResult.marks}/${partResult.maxMarks}</span>
        `;
        partCard.appendChild(summary);

        const detail = document.createElement('div');
        detail.className = 'review-part-detail';

        // Student answer vs correct
        const answerComparison = document.createElement('div');
        answerComparison.className = 'answer-comparison';

        const studentAnswer = this._formatAnswer(this.answers[part.id], part);
        const correctAnswer = this._formatCorrectAnswer(part);

        answerComparison.innerHTML = `
          <div class="answer-row">
            <span class="type-caption label">Your answer:</span>
            <span class="type-body ${partResult.correct ? '' : 'incorrect-text'}">${studentAnswer}</span>
          </div>
          <div class="answer-row">
            <span class="type-caption label">Correct answer:</span>
            <span class="type-body correct-text">${correctAnswer}</span>
          </div>
        `;
        detail.appendChild(answerComparison);

        // Solution steps
        if (part.solutionSteps) {
          const steps = document.createElement('div');
          steps.className = 'solution-steps';
          for (const step of part.solutionSteps) {
            const stepEl = document.createElement('div');
            stepEl.className = step.formula ? 'solution-step solution-formula' : 'solution-step';
            stepEl.textContent = step.text;
            steps.appendChild(stepEl);
          }
          detail.appendChild(steps);
        }

        partCard.appendChild(detail);
        scenBlock.appendChild(partCard);
      }

      section.appendChild(scenBlock);
    }

    return section;
  }

  _formatAnswer(answer, part) {
    if (answer === null || answer === undefined) return '<em>No answer</em>';

    if (part.type === 'mcq') {
      const option = part.options.find(o => o.id === answer);
      return option ? `${answer}: ${option.text}` : answer;
    }

    if (part.type === 'graph_plot') {
      if (Array.isArray(answer)) return `${answer.length} point${answer.length !== 1 ? 's' : ''} plotted`;
      return '<em>No points plotted</em>';
    }

    if (typeof answer === 'object' && answer.value !== undefined) {
      return `${answer.value} ${answer.unit || ''}`.trim();
    }

    return String(answer);
  }

  _formatCorrectAnswer(part) {
    const schema = part.answerSchema;

    if (schema.type === 'mcq') {
      const option = part.options.find(o => o.id === schema.correct);
      return option ? `${schema.correct}: ${option.text}` : schema.correct;
    }

    if (schema.type === 'graph_points') {
      return `${schema.expectedPoints.length} points`;
    }

    if (schema.type === 'numeric_with_unit') {
      return `${schema.correct} ${schema.correctUnit || ''}`.trim();
    }

    return String(schema.correct);
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
