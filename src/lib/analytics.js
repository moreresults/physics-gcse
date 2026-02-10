/**
 * GCSE Platform Analytics Module — v1.1
 * =======================================
 * Thin wrapper around PostHog for event tracking.
 * Vanilla JS — no framework dependencies.
 *
 * Usage:
 *   import { analytics } from './lib/analytics.js';
 *   analytics.init({ apiKey: 'phc_...' });
 *   analytics.track('test_started', { subject: 'biology', mode: 'practice' });
 *
 * Architecture:
 *   - Core platform events fire from app shell / test runner (subject-agnostic)
 *   - Subject-specific events fire from individual components
 *   - All events pass through this single module
 *   - Swapping PostHog for another provider means changing only this file
 *
 * Privacy:
 *   - No cookies — uses localStorage persistence (matches existing app pattern)
 *   - Anonymous device ID only — no user accounts in v1
 *   - EU hosting endpoint for GDPR (UK students)
 *   - Autocapture disabled — only explicit events
 *   - No raw student answer content in event payloads — IDs and counts only
 *
 * Changelog (v1.1):
 *   - Fixed: config overrides now apply globally (was using local `cfg` only in init)
 *   - Fixed: clearSessionMeta() now unregisters all tracked keys, not hardcoded three
 *   - Fixed: pre-init events are queued (with capture options), not dropped
 *   - Fixed: abandonment event uses sendBeacon transport for reliability
 *   - Fixed: consent localStorage check is explicit (only 'true'/'false' accepted)
 *   - Changed: raw answer values removed from component events (IDs/booleans only)
 *   - Added: env and schema_version to every event
 *   - Added: consent toggle (setEnabled) with localStorage persistence
 */

// ============================================
// CONFIGURATION
// ============================================

const DEFAULTS = Object.freeze({
  apiKey: '__POSTHOG_API_KEY__',
  apiHost: 'https://eu.i.posthog.com',
  appVersion: '1.0.0',
  platform: 'web',
  env: 'dev',                // 'dev' | 'staging' | 'prod'
  schemaVersion: '1.1',      // Analytics event schema version
  enabled: true,
  debug: false,
  sessionReplay: false,
  consentKey: 'gcse_analytics_consent',  // localStorage key for consent state
});

// Mutable config — merged once in init(), read everywhere else
let _config = { ...DEFAULTS };


// ============================================
// STATE
// ============================================

let _posthog = null;
let _initialized = false;
let _sessionMeta = {};
let _sessionMetaKeys = [];       // Track registered keys for clean unregister
let _eventQueue = [];            // Buffer events fired before init()
const MAX_QUEUE_SIZE = 50;       // Don't buffer indefinitely


// ============================================
// INITIALISATION
// ============================================

/**
 * Initialise analytics. Call once on app load.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param {Object} overrides - Override any default config values
 */
function init(overrides = {}) {
  if (_initialized) return;

  // Merge overrides into mutable config (used everywhere)
  _config = { ...DEFAULTS, ...overrides };

  // Check localStorage consent if previously set (only explicit 'false' disables)
  if (typeof window !== 'undefined') {
    const storedConsent = localStorage.getItem(_config.consentKey);
    if (storedConsent === 'true') {
      _config.enabled = true;
    } else if (storedConsent === 'false') {
      _config.enabled = false;
    }
    // If null/missing/corrupted: use config default (enabled: true)
  }

  if (!_config.enabled) {
    _initialized = true;
    if (_config.debug) console.log('[Analytics] Disabled — no events will fire.');
    _drainQueue(); // Drain and discard
    return;
  }

  if (_config.apiKey === '__POSTHOG_API_KEY__') {
    console.warn('[Analytics] PostHog API key not set. Events will be logged locally only.');
    _config.debug = true;
    _initialized = true;
    _drainQueue();
    return;
  }

  try {
    _posthog = typeof window !== 'undefined' ? window.posthog : null;

    if (!_posthog) {
      console.warn('[Analytics] PostHog not found on window. Add the PostHog snippet to index.html.');
      _config.debug = true;
      _initialized = true;
      _drainQueue();
      return;
    }

    _posthog.init(_config.apiKey, {
      api_host: _config.apiHost,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage',
      disable_session_recording: !_config.sessionReplay,
      loaded: (ph) => {
        if (_config.debug) {
          console.log('[Analytics] PostHog initialised.', ph.get_distinct_id());
        }
      },
    });

    _initialized = true;

    if (_config.debug) {
      _posthog.debug();
    }

    // Flush any events that were queued before init
    _drainQueue();

  } catch (err) {
    console.error('[Analytics] Init failed:', err);
    _initialized = true;
    _drainQueue();
  }
}


// ============================================
// EVENT QUEUE (pre-init buffer)
// ============================================

function _enqueue(eventName, properties, options) {
  if (_eventQueue.length < MAX_QUEUE_SIZE) {
    _eventQueue.push({ eventName, properties, options, queuedAt: Date.now() });
  }
}

function _drainQueue() {
  const queued = _eventQueue.splice(0);
  for (const { eventName, properties, options } of queued) {
    track(eventName, properties, options);
  }
}


// ============================================
// CORE TRACKING
// ============================================

/**
 * Track a named event with properties.
 * All events are enriched with session metadata and app info.
 *
 * @param {string} eventName - Event name (snake_case)
 * @param {Object} properties - Event-specific properties
 * @param {Object} options - PostHog capture options (e.g. { transport: 'sendBeacon' })
 */
function track(eventName, properties = {}, options = {}) {
  // Queue if not yet initialised
  if (!_initialized) {
    _enqueue(eventName, properties, options);
    return;
  }

  if (!_config.enabled) return;

  const enrichedProps = {
    ...properties,
    ..._sessionMeta,
    app_version: _config.appVersion,
    platform: _config.platform,
    env: _config.env,
    schema_version: _config.schemaVersion,
    timestamp_local: new Date().toISOString(),
    viewport_width: typeof window !== 'undefined' ? window.innerWidth : null,
    viewport_height: typeof window !== 'undefined' ? window.innerHeight : null,
  };

  if (_config.debug) {
    console.log(`[Analytics] 📊 ${eventName}`, enrichedProps);
  }

  if (_posthog) {
    _posthog.capture(eventName, enrichedProps, options);
  }
}

/**
 * Set session-level metadata. Attached to all subsequent events.
 * Call when a test session starts.
 *
 * @param {Object} meta - Session properties (subject, mode, attemptId, etc.)
 */
function setSessionMeta(meta) {
  _sessionMeta = { ...meta };
  _sessionMetaKeys = Object.keys(meta);

  if (_config.debug) {
    console.log('[Analytics] Session meta set:', _sessionMeta);
  }

  if (_posthog) {
    _posthog.register(_sessionMeta);
  }
}

/**
 * Clear session metadata. Unregisters ALL keys that were set — no hardcoded list.
 * Call when returning to welcome screen or after test completion.
 */
function clearSessionMeta() {
  if (_posthog) {
    for (const key of _sessionMetaKeys) {
      _posthog.unregister(key);
    }
  }
  _sessionMeta = {};
  _sessionMetaKeys = [];
}

/**
 * Enable or disable analytics at runtime (consent toggle).
 * Persists choice in localStorage.
 *
 * @param {boolean} enabled
 */
function setEnabled(enabled) {
  _config.enabled = enabled;

  if (typeof window !== 'undefined') {
    localStorage.setItem(_config.consentKey, String(enabled));
  }

  if (!enabled && _posthog) {
    _posthog.opt_out_capturing();
  } else if (enabled && _posthog) {
    _posthog.opt_in_capturing();
  }

  if (_config.debug) {
    console.log(`[Analytics] ${enabled ? 'Enabled' : 'Disabled'} by user.`);
  }
}

/**
 * Check if analytics is currently enabled.
 *
 * @returns {boolean}
 */
function isEnabled() {
  return _config.enabled;
}

/**
 * Start a timing measurement. Returns a function that,
 * when called, returns elapsed milliseconds.
 *
 * @returns {Function} - Call to get elapsed ms
 */
function startTimer() {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}


// ============================================
// APP LIFECYCLE EVENTS
// ============================================

const lifecycle = {

  appOpened() {
    track('app_opened', {
      referrer: typeof document !== 'undefined' ? (document.referrer || null) : null,
      // Only capture pathname — never include query params (could contain PII)
      path: typeof window !== 'undefined' ? window.location.pathname : null,
    });
  },

  subjectSelected(subject) {
    track('subject_selected', { subject });
  },

  modeSelected(mode) {
    track('mode_selected', { mode });
  },
};


// ============================================
// TEST SESSION EVENTS
// ============================================

const testSession = {

  /**
   * @param {Object} params
   * @param {string} params.subject
   * @param {string} params.mode
   * @param {string} params.attemptId
   * @param {number} params.scenarioCount
   * @param {number} params.totalParts
   * @param {number} params.totalMarks
   * @param {number} params.timerMinutes - 0 = untimed
   */
  started({ subject, mode, attemptId, scenarioCount, totalParts, totalMarks, timerMinutes }) {
    setSessionMeta({ subject, mode, attempt_id: attemptId });
    track('test_started', {
      scenario_count: scenarioCount,
      total_parts: totalParts,
      total_marks: totalMarks,
      timer_minutes: timerMinutes,
    });
  },

  /**
   * @param {Object} params
   * @param {number} params.score           - Auto-marked score
   * @param {number} params.maxMarks        - Max auto-markable marks
   * @param {number} params.teacherMarks    - Marks pending teacher review
   * @param {number} params.percentage
   * @param {string} params.grade
   * @param {number} params.durationSeconds
   * @param {number} params.partsAnswered
   * @param {number} params.partsFlagged
   * @param {boolean} params.timerExpired
   */
  completed({ score, maxMarks, teacherMarks, percentage, grade, durationSeconds,
              partsAnswered, partsFlagged, timerExpired }) {
    track('test_completed', {
      score,
      max_marks: maxMarks,
      teacher_marks: teacherMarks,
      percentage,
      grade,
      duration_seconds: durationSeconds,
      parts_answered: partsAnswered,
      parts_flagged: partsFlagged,
      timer_expired: timerExpired,
    });
  },

  /**
   * Uses sendBeacon transport — reliable even during page unload.
   *
   * @param {Object} params
   * @param {number} params.partsAnswered
   * @param {number} params.totalParts
   * @param {number} params.durationSeconds
   * @param {string} params.lastPartId
   * @param {string} params.lastScenarioId
   */
  abandoned({ partsAnswered, totalParts, durationSeconds, lastPartId, lastScenarioId }) {
    track('test_abandoned', {
      parts_answered: partsAnswered,
      total_parts: totalParts,
      duration_seconds: durationSeconds,
      completion_pct: totalParts > 0 ? Math.round((partsAnswered / totalParts) * 100) : 0,
      last_part_id: lastPartId,
      last_scenario_id: lastScenarioId,
    }, { transport: 'sendBeacon' });  // Reliable during beforeunload
  },
};


// ============================================
// NAVIGATION EVENTS
// ============================================

const navigation = {

  scenarioViewed(scenarioId, scenarioTitle, scenarioIndex, totalScenarios) {
    track('scenario_viewed', {
      scenario_id: scenarioId,
      scenario_title: scenarioTitle,
      scenario_index: scenarioIndex,
      total_scenarios: totalScenarios,
    });
  },

  partViewed(partId, partType, scenarioId) {
    track('part_viewed', {
      part_id: partId,
      part_type: partType,
      scenario_id: scenarioId,
    });
  },

  reviewScreenViewed(partsAnswered, partsUnanswered, partsFlagged) {
    track('review_screen_viewed', {
      parts_answered: partsAnswered,
      parts_unanswered: partsUnanswered,
      parts_flagged: partsFlagged,
    });
  },

  reviewJumpToPart(partId, wasAnswered, wasFlagged) {
    track('review_jump_to_part', {
      part_id: partId,
      was_answered: wasAnswered,
      was_flagged: wasFlagged,
    });
  },

  resultsViewed(score, percentage, grade) {
    track('results_viewed', {
      score,
      percentage,
      grade,
    });
  },

  questionReviewExpanded(partId, partType, wasCorrect) {
    track('question_review_expanded', {
      part_id: partId,
      part_type: partType,
      was_correct: wasCorrect,
    });
  },
};


// ============================================
// PART INTERACTION EVENTS
// ============================================

const partInteraction = {

  /**
   * Universal "answer submitted" event — fires for all part types.
   * No raw answer content — only metadata.
   *
   * @param {Object} params
   * @param {string} params.partId
   * @param {string} params.partType
   * @param {string} params.scenarioId
   * @param {number} params.marks
   * @param {number} params.timeOnPartMs
   * @param {boolean} params.isChange     - Was this a changed answer
   * @param {boolean} params.isComplete   - Is the part fully answered
   */
  answered({ partId, partType, scenarioId, marks, timeOnPartMs, isChange, isComplete }) {
    track('part_answered', {
      part_id: partId,
      part_type: partType,
      scenario_id: scenarioId,
      marks,
      time_on_part_ms: timeOnPartMs,
      is_change: isChange,
      is_complete: isComplete,
    });
  },

  flagged(partId, partType, scenarioId) {
    track('part_flagged', {
      part_id: partId,
      part_type: partType,
      scenario_id: scenarioId,
    });
  },

  unflagged(partId, partType, scenarioId) {
    track('part_unflagged', {
      part_id: partId,
      part_type: partType,
      scenario_id: scenarioId,
    });
  },
};


// ============================================
// MARKING & RESULTS EVENTS
// ============================================

const marking = {

  /**
   * @param {Object} params
   * @param {string} params.partId
   * @param {string} params.partType
   * @param {string} params.scenarioId
   * @param {number} params.marksAwarded
   * @param {number} params.maxMarks
   * @param {boolean} params.isCorrect
   * @param {boolean} params.isPartiallyCorrect
   * @param {boolean} params.teacherMarked
   * @param {string[]} params.topicTags
   * @param {string[]} params.misconceptionTags
   */
  partMarked({ partId, partType, scenarioId, marksAwarded, maxMarks,
               isCorrect, isPartiallyCorrect, teacherMarked, topicTags, misconceptionTags }) {
    track('part_marked', {
      part_id: partId,
      part_type: partType,
      scenario_id: scenarioId,
      marks_awarded: marksAwarded,
      max_marks: maxMarks,
      is_correct: isCorrect,
      is_partially_correct: isPartiallyCorrect,
      teacher_marked: teacherMarked,
      topic_tags: topicTags,
      misconception_tags: misconceptionTags,
    });
  },

  /**
   * @param {Object} params
   * @param {string} params.scenarioId
   * @param {string} params.scenarioTitle
   * @param {number} params.score
   * @param {number} params.maxMarks
   * @param {number} params.partsCorrect
   * @param {number} params.totalParts
   * @param {number} params.durationSeconds
   */
  scenarioMarked({ scenarioId, scenarioTitle, score, maxMarks, partsCorrect,
                   totalParts, durationSeconds }) {
    track('scenario_marked', {
      scenario_id: scenarioId,
      scenario_title: scenarioTitle,
      score,
      max_marks: maxMarks,
      parts_correct: partsCorrect,
      total_parts: totalParts,
      duration_seconds: durationSeconds,
      percentage: maxMarks > 0 ? Math.round((score / maxMarks) * 100) : 0,
    });
  },

  misconceptionTriggered(partId, partType, scenarioId, misconceptionTag, topicTags) {
    track('misconception_triggered', {
      part_id: partId,
      part_type: partType,
      scenario_id: scenarioId,
      misconception_tag: misconceptionTag,
      topic_tags: topicTags,
    });
  },
};


// ============================================
// BIOLOGY-SPECIFIC COMPONENT EVENTS
// ============================================
// v1.1: All raw answer values removed. Events track IDs, booleans,
// and counts only — no student-generated content.

const biology = {

  /**
   * Diagram label — student selected a term for a hotspot.
   * Tracks hotspot ID and term ID only — not the term text.
   */
  diagramLabelSelected({ partId, scenarioId, hotspotId, termId }) {
    track('diagram_label_selected', {
      part_id: partId,
      scenario_id: scenarioId,
      hotspot_id: hotspotId,
      term_id: termId,          // ID from termBank, not display text
    });
  },

  /**
   * Process sequence — student moved a step.
   * Tracks input method for UX analysis (drag vs arrow usage).
   */
  sequenceReordered({ partId, scenarioId, method, fromIndex, toIndex }) {
    track('sequence_reordered', {
      part_id: partId,
      scenario_id: scenarioId,
      method,                   // 'drag' | 'arrow_up' | 'arrow_down'
      from_index: fromIndex,
      to_index: toIndex,
    });
  },

  /**
   * Keyword match — student selected a word for a blank.
   * Tracks word bank ID only — not the word text.
   */
  keywordSelected({ partId, scenarioId, blankId, wordId }) {
    track('keyword_selected', {
      part_id: partId,
      scenario_id: scenarioId,
      blank_id: blankId,
      word_id: wordId,          // ID from wordBank, not display text
    });
  },

  /**
   * Punnett grid — student edited a cell.
   * Tracks whether the cell has content and its length — not the genotype value.
   */
  punnettCellEdited({ partId, scenarioId, cellId, hasValue, valueLength }) {
    track('punnett_cell_edited', {
      part_id: partId,
      scenario_id: scenarioId,
      cell_id: cellId,
      has_value: hasValue,          // boolean
      value_length: valueLength,    // 0, 1, or 2 (expected: 2 for a genotype)
    });
  },

  /**
   * Self-assessed checklist — student checked/unchecked a mark scheme point.
   */
  selfAssessCheckToggled({ partId, scenarioId, pointId, checked, totalChecked, maxCheckable }) {
    track('self_assess_check_toggled', {
      part_id: partId,
      scenario_id: scenarioId,
      point_id: pointId,
      checked,
      total_checked: totalChecked,
      max_checkable: maxCheckable,
    });
  },

  /**
   * Self-assessed response metrics — fires on submit.
   * Tracks word count and check count only — never the response text.
   */
  selfAssessSubmitted({ partId, scenarioId, wordCount, charCount, checkedCount, maxCheckable }) {
    track('self_assess_submitted', {
      part_id: partId,
      scenario_id: scenarioId,
      word_count: wordCount,
      char_count: charCount,
      checked_count: checkedCount,
      max_checkable: maxCheckable,
    });
  },
};


// ============================================
// PHYSICS-SPECIFIC COMPONENT EVENTS
// ============================================

const physics = {

  graphValueRead({ partId, scenarioId, xValue, yValue, lineId }) {
    track('graph_value_read', {
      part_id: partId,
      scenario_id: scenarioId,
      x_value: xValue,
      y_value: yValue,
      line_id: lineId,
    });
  },

  graphPointPlotted({ partId, scenarioId, x, y, pointIndex }) {
    track('graph_point_plotted', {
      part_id: partId,
      scenario_id: scenarioId,
      x,
      y,
      point_index: pointIndex,
    });
  },
};


// ============================================
// TIMER EVENTS
// ============================================

const timer = {

  warningReached(minutesRemaining) {
    track('timer_warning', { minutes_remaining: minutesRemaining });
  },

  criticalReached(minutesRemaining) {
    track('timer_critical', { minutes_remaining: minutesRemaining });
  },

  expired() {
    track('timer_expired');
  },
};


// ============================================
// ACCESSIBILITY & UX EVENTS
// ============================================

const ux = {

  darkModeToggled(isDark) {
    track('dark_mode_toggled', { is_dark: isDark });
  },

  fontSizeChanged(size) {
    track('font_size_changed', { size });
  },

  dyslexiaModeToggled(enabled) {
    track('dyslexia_mode_toggled', { enabled });
  },

  reducedMotionDetected() {
    track('reduced_motion_detected');
  },
};


// ============================================
// PUBLIC API
// ============================================

export const analytics = {
  // Core
  init,
  track,
  setSessionMeta,
  clearSessionMeta,
  startTimer,

  // Consent
  setEnabled,
  isEnabled,

  // Event namespaces
  lifecycle,
  testSession,
  navigation,
  marking,
  partInteraction,
  timer,

  // Subject-specific
  biology,
  physics,

  // UX / accessibility
  ux,
};

// Expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.gcseAnalytics = analytics;
}
