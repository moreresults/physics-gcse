// ============================================================
// Marking Engine — GCSE Physics Test
// Handles: MCQ, numeric, numeric+unit, graph points, partial credit
// ============================================================

export const MarkingEngine = {

  /**
   * Mark a single answer against its schema.
   * Returns { marks, maxMarks, correct, feedback, methodMarksAwarded }
   */
  markAnswer(answer, schema, methodMarks = []) {
    switch (schema.type) {
      case 'mcq':
        return this.markMCQ(answer, schema);
      case 'numeric_with_unit':
        return this.markNumericWithUnit(answer, schema, methodMarks);
      case 'numeric':
        return this.markNumeric(answer, schema, methodMarks);
      case 'graph_points':
        return this.markGraphPoints(answer, schema);
      default:
        return { marks: 0, maxMarks: 0, correct: false, feedback: 'Unknown answer type.' };
    }
  },

  /** Mark a multiple-choice answer */
  markMCQ(answer, schema) {
    const correct = answer === schema.correct;
    return {
      marks: correct ? 1 : 0,
      maxMarks: 1,
      correct,
      feedback: correct ? 'Correct!' : `The correct answer is ${schema.correct}.`
    };
  },

  /** Mark a numeric answer with unit */
  markNumericWithUnit(answer, schema, methodMarks = []) {
    // answer = { value: number|string, unit: string }
    if (!answer || answer.value === '' || answer.value === null || answer.value === undefined) {
      return { marks: 0, maxMarks: this._totalMarks(schema, methodMarks), correct: false, feedback: 'No answer given.', methodMarksAwarded: [] };
    }

    const numVal = parseFloat(answer.value);
    if (isNaN(numVal)) {
      return { marks: 0, maxMarks: this._totalMarks(schema, methodMarks), correct: false, feedback: 'Your answer must be a number.', methodMarksAwarded: [] };
    }

    const valueCorrect = this._withinTolerance(numVal, schema.correct, schema.tolerance);
    const unitCorrect = answer.unit === schema.correctUnit;

    let marks = 0;
    let awarded = [];
    let feedback = '';

    // Full marks for correct value + unit
    if (valueCorrect && unitCorrect) {
      const maxMarks = this._totalMarks(schema, methodMarks);
      return { marks: maxMarks, maxMarks, correct: true, feedback: 'Correct!', methodMarksAwarded: methodMarks.map(m => m.id) };
    }

    // Value correct but wrong unit
    if (valueCorrect && !unitCorrect) {
      // Award all marks except 1 for unit
      const maxMarks = this._totalMarks(schema, methodMarks);
      marks = Math.max(0, maxMarks - 1);
      feedback = `Your value is correct (${schema.correct}), but the unit should be ${schema.correctUnit}.`;
      awarded = methodMarks.map(m => m.id);
      return { marks, maxMarks, correct: false, feedback, methodMarksAwarded: awarded };
    }

    // Value wrong — check for method marks (partial credit)
    if (!valueCorrect && methodMarks.length > 0) {
      // In a full system, we'd parse working. For now, no method marks without correct value.
      marks = 0;
      feedback = `The correct answer is ${schema.correct} ${schema.correctUnit}.`;
      return { marks, maxMarks: this._totalMarks(schema, methodMarks), correct: false, feedback, methodMarksAwarded: [] };
    }

    // Completely wrong
    feedback = `The correct answer is ${schema.correct} ${schema.correctUnit}.`;
    return { marks: 0, maxMarks: this._totalMarks(schema, methodMarks), correct: false, feedback, methodMarksAwarded: [] };
  },

  /** Mark a numeric answer without unit */
  markNumeric(answer, schema, methodMarks = []) {
    if (!answer || answer.value === '' || answer.value === null || answer.value === undefined) {
      return { marks: 0, maxMarks: this._totalMarks(schema, methodMarks), correct: false, feedback: 'No answer given.', methodMarksAwarded: [] };
    }

    const numVal = parseFloat(typeof answer === 'object' ? answer.value : answer);
    if (isNaN(numVal)) {
      return { marks: 0, maxMarks: this._totalMarks(schema, methodMarks), correct: false, feedback: 'Your answer must be a number.', methodMarksAwarded: [] };
    }

    const correct = this._withinTolerance(numVal, schema.correct, schema.tolerance);
    const maxMarks = this._totalMarks(schema, methodMarks);

    return {
      marks: correct ? maxMarks : 0,
      maxMarks,
      correct,
      feedback: correct ? 'Correct!' : `The correct answer is ${schema.correct}.`,
      methodMarksAwarded: correct ? methodMarks.map(m => m.id) : []
    };
  },

  /** Mark graph points (plot-from-data) */
  markGraphPoints(placedPoints, schema) {
    if (!placedPoints || placedPoints.length === 0) {
      return { marks: 0, maxMarks: 2, correct: false, feedback: 'No points were plotted.' };
    }

    const expected = schema.expectedPoints;
    let matched = 0;

    for (const exp of expected) {
      const found = placedPoints.some(p =>
        Math.abs(p.x - exp.x) <= (exp.toleranceX || 0.5) &&
        Math.abs(p.y - exp.y) <= (exp.toleranceY || 0.5)
      );
      if (found) matched++;
    }

    let marks = 0;
    if (matched >= expected.length) marks = 2;
    else if (matched >= 4) marks = 1;

    return {
      marks,
      maxMarks: 2,
      correct: marks === 2,
      feedback: marks === 2
        ? 'All points correctly plotted!'
        : marks === 1
        ? `${matched} of ${expected.length} points correctly plotted.`
        : `Only ${matched} of ${expected.length} points are correct. Check your axis readings.`,
      matched,
      total: expected.length
    };
  },

  /** Check if value is within tolerance of correct answer */
  _withinTolerance(value, correct, tolerance = 0) {
    if (tolerance === 0) {
      // For zero tolerance, check exact match but allow float precision
      return Math.abs(value - correct) < 0.001;
    }
    return Math.abs(value - correct) <= tolerance;
  },

  /** Calculate total available marks */
  _totalMarks(schema, methodMarks = []) {
    // The total marks for the part (including answer mark)
    // methodMarks are sub-marks within the total
    // For simplicity: if there's 1 method mark worth 1, and total part is 2, then answer mark = 1
    return 1 + methodMarks.reduce((sum, m) => sum + (m.marks || 1), 0) || 1;
  },

  /**
   * Score an entire scenario.
   * answers = { [partId]: answer }
   * scenario = parsed scenario JSON
   * Returns { totalMarks, maxMarks, partResults: { [partId]: result } }
   */
  scoreScenario(answers, scenario) {
    let totalMarks = 0;
    let maxMarks = 0;
    const partResults = {};

    for (const part of scenario.parts) {
      const answer = answers[part.id];
      const result = this.markAnswer(answer, part.answerSchema, part.methodMarks || []);

      // Override maxMarks with the part's defined marks
      result.maxMarks = part.marks;

      // Clamp awarded marks to part max
      result.marks = Math.min(result.marks, part.marks);

      totalMarks += result.marks;
      maxMarks += part.marks;
      partResults[part.id] = result;
    }

    return { totalMarks, maxMarks, partResults };
  },

  /**
   * Score the entire test.
   * answers = { [partId]: answer }
   * scenarios = array of scenario objects
   */
  scoreTest(answers, scenarios) {
    let totalMarks = 0;
    let maxMarks = 0;
    const scenarioResults = {};

    for (const scenario of scenarios) {
      const result = this.scoreScenario(answers, scenario);
      totalMarks += result.totalMarks;
      maxMarks += result.maxMarks;
      scenarioResults[scenario.id] = result;
    }

    const percentage = maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 100) : 0;

    let grade = 'low';
    if (percentage >= 70) grade = 'high';
    else if (percentage >= 40) grade = 'medium';

    return { totalMarks, maxMarks, percentage, grade, scenarioResults };
  }
};
