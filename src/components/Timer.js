// ============================================================
// Timer.js — Countdown timer for GCSE Physics Test
// States: normal → warning (≤5 min) → critical (≤2 min)
// ============================================================

export class Timer {
  constructor(container, totalSeconds, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.totalSeconds = totalSeconds;
    this.remaining = totalSeconds;
    this.onTick = options.onTick || null;
    this.onExpire = options.onExpire || null;
    this.running = false;
    this.intervalId = null;
    this.paused = false;

    this.render();
  }

  render() {
    this.container.innerHTML = '';
    if (this.totalSeconds <= 0) return; // Untimed mode

    const el = document.createElement('div');
    el.className = 'timer-display';
    el.innerHTML = `
      <span class="timer-icon">⏱</span>
      <span class="timer-time">${this._format(this.remaining)}</span>
    `;
    this.container.appendChild(el);
    this.el = el;
    this.timeEl = el.querySelector('.timer-time');

    this._updateState();
  }

  start() {
    if (this.totalSeconds <= 0 || this.running) return;
    this.running = true;
    this.paused = false;
    this.intervalId = setInterval(() => {
      if (this.paused) return;
      this.remaining--;
      this._update();

      if (this.remaining <= 0) {
        this.remaining = 0;
        this.stop();
        this._update();
        if (this.onExpire) this.onExpire();
      }

      if (this.onTick) this.onTick(this.remaining);
    }, 1000);
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  _update() {
    if (!this.timeEl) return;
    this.timeEl.textContent = this._format(this.remaining);
    this._updateState();
  }

  _updateState() {
    if (!this.el) return;
    this.el.classList.remove('warning', 'critical');
    if (this.remaining <= 120) {
      this.el.classList.add('critical');
    } else if (this.remaining <= 300) {
      this.el.classList.add('warning');
    }
  }

  _format(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  destroy() {
    this.stop();
    this.container.innerHTML = '';
  }
}
