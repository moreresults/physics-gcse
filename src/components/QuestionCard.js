// ============================================================
// QuestionCard.js — Renders individual question parts
// Handles: MCQ, numeric_with_unit, calculation, graph_reading,
//          graph_plot
// ============================================================

export class QuestionCard {
  constructor(container, part, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.part = part;
    this.mode = options.mode || 'practice';
    this.answer = options.existingAnswer || null;
    this.feedback = options.feedback || null;
    this.onAnswer = options.onAnswer || null;
    this.graphInstance = options.graphInstance || null;

    this.render();
  }

  render() {
    this.container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'question-card animate-slide-up';

    // Part header
    const header = document.createElement('div');
    header.className = 'part-header';
    header.innerHTML = `
      <span class="part-label badge-marks" data-tooltip="Sub-question label, as it appears on the exam paper">(${this.part.partLabel})</span>
      <span class="part-marks">${this.part.marks} mark${this.part.marks > 1 ? 's' : ''}</span>
    `;
    card.appendChild(header);

    // Question text
    const question = document.createElement('p');
    question.className = 'part-question type-body';
    question.textContent = this.part.question;
    card.appendChild(question);

    // Data table (for scenario_09)
    if (this.part.type === 'graph_plot' && this.part._dataTable) {
      card.appendChild(this._renderDataTable(this.part._dataTable));
    }

    // Answer input
    const inputArea = document.createElement('div');
    inputArea.className = 'answer-area';
    this._renderInput(inputArea);
    card.appendChild(inputArea);

    // Feedback panel (practice mode)
    if (this.feedback) {
      card.appendChild(this._renderFeedback());
    }

    this.container.appendChild(card);
  }

  _renderInput(container) {
    const type = this.part.type;
    const schema = this.part.answerSchema;

    if (type === 'mcq') {
      this._renderMCQ(container, schema);
    } else if (type === 'graph_plot') {
      this._renderGraphPlotInfo(container);
    } else {
      // numeric_with_unit, calculation, graph_reading
      this._renderNumericInput(container, schema);
    }
  }

  _renderMCQ(container, schema) {
    const group = document.createElement('div');
    group.className = 'radio-group';
    group.setAttribute('role', 'radiogroup');

    for (const option of this.part.options) {
      const btn = document.createElement('button');
      btn.className = 'radio-option';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.dataset.id = option.id;

      if (this.answer === option.id) {
        btn.classList.add('selected');
        btn.setAttribute('aria-checked', 'true');
      }

      // Show correct/incorrect in feedback mode
      if (this.feedback) {
        btn.classList.add('disabled');
        if (option.id === schema.correct) btn.classList.add('correct');
        if (this.answer === option.id && option.id !== schema.correct) btn.classList.add('incorrect');
      }

      btn.innerHTML = `
        <span class="radio-letter">${option.id}</span>
        <span class="radio-text">${option.text}</span>
      `;

      if (!this.feedback) {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.radio-option').forEach(b => {
            b.classList.remove('selected');
            b.setAttribute('aria-checked', 'false');
          });
          btn.classList.add('selected');
          btn.setAttribute('aria-checked', 'true');
          this.answer = option.id;
          if (this.onAnswer) this.onAnswer(this.answer);
        });
      }

      group.appendChild(btn);
    }

    container.appendChild(group);
  }

  _renderNumericInput(container, schema) {
    const row = document.createElement('div');
    row.className = 'numeric-answer';

    const valueInput = document.createElement('input');
    valueInput.type = 'number';
    valueInput.className = 'input';
    valueInput.placeholder = 'Your answer';
    valueInput.step = 'any';
    valueInput.setAttribute('aria-label', 'Numeric answer');

    if (this.answer && this.answer.value !== undefined) {
      valueInput.value = this.answer.value;
    }

    if (this.feedback) {
      valueInput.disabled = true;
    }

    const unitSelect = document.createElement('select');
    unitSelect.className = 'select';
    unitSelect.setAttribute('aria-label', 'Unit');

    unitSelect.innerHTML = '<option value="">Unit</option>';
    if (schema.unitOptions) {
      for (const unit of schema.unitOptions) {
        const opt = document.createElement('option');
        opt.value = unit;
        opt.textContent = unit;
        if (this.answer && this.answer.unit === unit) opt.selected = true;
        unitSelect.appendChild(opt);
      }
    }

    if (this.feedback) {
      unitSelect.disabled = true;
    }

    const updateAnswer = () => {
      this.answer = {
        value: valueInput.value,
        unit: unitSelect.value
      };
      if (this.onAnswer) this.onAnswer(this.answer);
    };

    valueInput.addEventListener('input', updateAnswer);
    unitSelect.addEventListener('change', updateAnswer);

    row.appendChild(valueInput);
    row.appendChild(unitSelect);
    container.appendChild(row);
  }

  _renderGraphPlotInfo(container) {
    const info = document.createElement('p');
    info.className = 'type-body label-hint';
    info.textContent = 'Click on the graph above to plot each data point. Click a point to remove it.';
    container.appendChild(info);

    const row = document.createElement('div');
    row.className = 'plot-info-row';

    const count = document.createElement('span');
    count.className = 'type-body';
    const placed = this.answer ? this.answer.length : 0;
    count.textContent = `Points plotted: ${placed}`;
    count.id = 'plot-point-count';
    row.appendChild(count);

    if (!this.feedback) {
      const undoBtn = document.createElement('button');
      undoBtn.className = 'btn btn-ghost btn-sm plot-undo-btn';
      undoBtn.textContent = 'Undo last';
      undoBtn.id = 'plot-undo-btn';
      undoBtn.disabled = placed === 0;
      row.appendChild(undoBtn);
    }

    container.appendChild(row);
  }

  _renderDataTable(dataTable) {
    const wrapper = document.createElement('div');
    wrapper.className = 'data-table-wrapper';

    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const h of dataTable.headers) {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of dataTable.rows) {
      const tr = document.createElement('tr');
      for (const cell of row) {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrapper.appendChild(table);
    return wrapper;
  }

  _renderFeedback() {
    const panel = document.createElement('div');
    let cls = 'feedback-panel';
    if (this.feedback.correct) cls += ' correct';
    else if (this.feedback.marks > 0) cls += ' partial';
    else cls += ' incorrect';
    panel.className = cls;

    // Result line
    const result = document.createElement('div');
    result.className = 'feedback-result';
    const badge = this.feedback.correct ? 'badge-correct' : this.feedback.marks > 0 ? 'badge-partial' : 'badge-incorrect';
    const label = this.feedback.correct ? 'Correct' : this.feedback.marks > 0 ? 'Partial' : 'Incorrect';
    result.innerHTML = `
      <span class="${badge}">${label}</span>
      <span class="feedback-marks">${this.feedback.marks} / ${this.feedback.maxMarks} marks</span>
    `;
    panel.appendChild(result);

    // Feedback text
    const text = document.createElement('p');
    text.className = 'feedback-text type-body';
    text.textContent = this.feedback.feedback;
    panel.appendChild(text);

    // Solution steps
    if (this.part.solutionSteps) {
      const steps = document.createElement('div');
      steps.className = 'solution-steps';
      const stepsTitle = document.createElement('p');
      stepsTitle.className = 'type-caption label';
      stepsTitle.textContent = 'Worked Solution';
      steps.appendChild(stepsTitle);

      for (const step of this.part.solutionSteps) {
        const stepEl = document.createElement('div');
        stepEl.className = step.formula ? 'solution-step solution-formula' : 'solution-step';
        stepEl.textContent = step.text;
        steps.appendChild(stepEl);
      }
      panel.appendChild(steps);
    }

    return panel;
  }

  getAnswer() {
    return this.answer;
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
