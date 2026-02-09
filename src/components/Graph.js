// ============================================================
// Graph.js — Custom SVG graph renderer for GCSE Physics Test
// Handles: axes, gridlines, data lines, crosshair, snapping,
//          click-to-read, plot-points, area shading, zero line
// ============================================================

export class Graph {
  constructor(container, graphSpec, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.spec = graphSpec;
    this.options = options;

    // SVG dimensions and padding
    this.width = 600;
    this.height = 400;
    this.padding = { top: 24, right: 24, bottom: 56, left: 64 };

    // Plot area
    this.plotWidth = this.width - this.padding.left - this.padding.right;
    this.plotHeight = this.height - this.padding.top - this.padding.bottom;

    // Interactive state
    this.placedPoints = [];
    this.selectedPoint = null;
    this.crosshairPos = null;
    this.onPointsChange = options.onPointsChange || null;
    this.onValueRead = options.onValueRead || null;

    // Mode: 'view' | 'read' | 'plot-points'
    this.mode = graphSpec.interactiveMode || options.mode || 'view';

    this.svg = null;
    this.tooltip = null;

    this.render();
  }

  // --- Coordinate conversion ---

  toPixel(dataX, dataY) {
    const { xAxis, yAxis } = this.spec;
    const x = this.padding.left + ((dataX - xAxis.min) / (xAxis.max - xAxis.min)) * this.plotWidth;
    const y = this.padding.top + ((yAxis.max - dataY) / (yAxis.max - yAxis.min)) * this.plotHeight;
    return { x, y };
  }

  toData(svgX, svgY) {
    const { xAxis, yAxis } = this.spec;
    const dataX = xAxis.min + ((svgX - this.padding.left) / this.plotWidth) * (xAxis.max - xAxis.min);
    const dataY = yAxis.max - ((svgY - this.padding.top) / this.plotHeight) * (yAxis.max - yAxis.min);
    return { x: dataX, y: dataY };
  }

  snap(dataX, dataY) {
    const { xAxis, yAxis } = this.spec;
    const snapX = xAxis.snapStep || xAxis.step;
    const snapY = yAxis.snapStep || yAxis.step;
    return {
      x: Math.round(dataX / snapX) * snapX,
      y: Math.round(dataY / snapY) * snapY
    };
  }

  // --- SVG helpers ---

  _svgEl(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }

  _colorVar(colorKey) {
    const map = { line1: 'var(--graph-line-1)', line2: 'var(--graph-line-2)' };
    return map[colorKey] || colorKey;
  }

  // --- Main render ---

  render() {
    this.container.innerHTML = '';

    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'graph-container';

    // SVG
    this.svg = this._svgEl('svg', {
      viewBox: `0 0 ${this.width} ${this.height}`,
      class: 'graph-svg',
      'aria-label': `${this.spec.type} graph`
    });
    this.svg.style.width = '100%';
    this.svg.style.height = 'auto';

    // Background
    this.svg.appendChild(this._svgEl('rect', {
      x: 0, y: 0, width: this.width, height: this.height,
      fill: 'var(--graph-bg)', rx: 8
    }));

    // Render layers
    this._renderGridlines();
    if (this.spec.zeroLine) this._renderZeroLine();
    this._renderAxes();
    this._renderAreaShading();
    this._renderDataLines();
    this._renderInteractiveLayer();  // overlay + crosshair below points
    this._renderPlacedPoints();      // points on top so they're clickable

    wrapper.appendChild(this.svg);

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'graph-tooltip';
    this.tooltip.style.display = 'none';
    wrapper.appendChild(this.tooltip);

    this.container.appendChild(wrapper);
  }

  // --- Gridlines ---

  _renderGridlines() {
    const { xAxis, yAxis } = this.spec;
    const g = this._svgEl('g', { class: 'graph-gridlines' });

    // Minor grid (snap steps)
    const snapX = xAxis.snapStep || xAxis.step;
    const snapY = yAxis.snapStep || yAxis.step;

    for (let x = xAxis.min; x <= xAxis.max; x += snapX) {
      const px = this.toPixel(x, 0).x;
      const isMain = (x - xAxis.min) % xAxis.step === 0;
      g.appendChild(this._svgEl('line', {
        x1: px, y1: this.padding.top, x2: px, y2: this.padding.top + this.plotHeight,
        stroke: isMain ? 'var(--graph-grid-major)' : 'var(--graph-grid)',
        'stroke-width': isMain ? 1 : 0.5
      }));
    }

    for (let y = yAxis.min; y <= yAxis.max; y += snapY) {
      const py = this.toPixel(0, y).y;
      const isMain = (y - yAxis.min) % yAxis.step === 0;
      g.appendChild(this._svgEl('line', {
        x1: this.padding.left, y1: py, x2: this.padding.left + this.plotWidth, y2: py,
        stroke: isMain ? 'var(--graph-grid-major)' : 'var(--graph-grid)',
        'stroke-width': isMain ? 1 : 0.5
      }));
    }

    this.svg.appendChild(g);
  }

  // --- Zero line ---

  _renderZeroLine() {
    const { yAxis } = this.spec;
    if (yAxis.min < 0 && yAxis.max > 0) {
      const py = this.toPixel(0, 0).y;
      this.svg.appendChild(this._svgEl('line', {
        x1: this.padding.left, y1: py,
        x2: this.padding.left + this.plotWidth, y2: py,
        stroke: 'var(--graph-axis)', 'stroke-width': 1.5,
        'stroke-dasharray': '6,4', opacity: 0.6
      }));
    }
  }

  // --- Axes ---

  _renderAxes() {
    const { xAxis, yAxis } = this.spec;
    const g = this._svgEl('g', { class: 'graph-axes' });

    // X axis line
    const xAxisY = yAxis.min >= 0 ? this.padding.top + this.plotHeight : this.toPixel(0, 0).y;
    g.appendChild(this._svgEl('line', {
      x1: this.padding.left, y1: xAxisY,
      x2: this.padding.left + this.plotWidth, y2: xAxisY,
      stroke: 'var(--graph-axis)', 'stroke-width': 2
    }));

    // Y axis line
    g.appendChild(this._svgEl('line', {
      x1: this.padding.left, y1: this.padding.top,
      x2: this.padding.left, y2: this.padding.top + this.plotHeight,
      stroke: 'var(--graph-axis)', 'stroke-width': 2
    }));

    // X ticks and labels
    for (let x = xAxis.min; x <= xAxis.max; x += xAxis.step) {
      const px = this.toPixel(x, 0).x;
      g.appendChild(this._svgEl('line', {
        x1: px, y1: this.padding.top + this.plotHeight,
        x2: px, y2: this.padding.top + this.plotHeight + 6,
        stroke: 'var(--graph-axis)', 'stroke-width': 1.5
      }));
      const label = this._svgEl('text', {
        x: px, y: this.padding.top + this.plotHeight + 20,
        'text-anchor': 'middle', fill: 'var(--color-label-secondary)',
        'font-size': '12', 'font-family': '-apple-system, sans-serif'
      });
      label.textContent = x;
      g.appendChild(label);
    }

    // Y ticks and labels
    for (let y = yAxis.min; y <= yAxis.max; y += yAxis.step) {
      const py = this.toPixel(0, y).y;
      g.appendChild(this._svgEl('line', {
        x1: this.padding.left - 6, y1: py,
        x2: this.padding.left, y2: py,
        stroke: 'var(--graph-axis)', 'stroke-width': 1.5
      }));
      const label = this._svgEl('text', {
        x: this.padding.left - 10, y: py + 4,
        'text-anchor': 'end', fill: 'var(--color-label-secondary)',
        'font-size': '12', 'font-family': '-apple-system, sans-serif'
      });
      label.textContent = y;
      g.appendChild(label);
    }

    // Axis labels
    const xLabel = this._svgEl('text', {
      x: this.padding.left + this.plotWidth / 2,
      y: this.height - 8,
      'text-anchor': 'middle', fill: 'var(--color-label-primary)',
      'font-size': '13', 'font-weight': '600',
      'font-family': '-apple-system, sans-serif'
    });
    xLabel.textContent = xAxis.label;
    g.appendChild(xLabel);

    const yLabel = this._svgEl('text', {
      x: 16, y: this.padding.top + this.plotHeight / 2,
      'text-anchor': 'middle', fill: 'var(--color-label-primary)',
      'font-size': '13', 'font-weight': '600',
      'font-family': '-apple-system, sans-serif',
      transform: `rotate(-90, 16, ${this.padding.top + this.plotHeight / 2})`
    });
    yLabel.textContent = yAxis.label;
    g.appendChild(yLabel);

    this.svg.appendChild(g);
  }

  // --- Area shading ---

  _renderAreaShading() {
    if (!this.spec.areaShading || !this.spec.lines.length) return;

    const g = this._svgEl('g', { class: 'graph-area' });

    for (const shade of this.spec.areaShading) {
      const line = this.spec.lines[0]; // Primary line
      const points = line.points;

      // Get points within the shading range
      const relevantPoints = this._getPointsInRange(points, shade.fromX, shade.toX);
      if (relevantPoints.length < 2) continue;

      // Find zero Y pixel
      const zeroY = this.spec.yAxis.min >= 0
        ? this.padding.top + this.plotHeight
        : this.toPixel(0, 0).y;

      // Split into positive and negative segments
      const segments = this._splitByZero(relevantPoints);

      for (const seg of segments) {
        const isPositive = seg[0].y >= 0;
        const pathPoints = seg.map(p => this.toPixel(p.x, p.y));

        let d = `M ${pathPoints[0].x},${zeroY}`;
        for (const p of pathPoints) {
          d += ` L ${p.x},${p.y}`;
        }
        d += ` L ${pathPoints[pathPoints.length - 1].x},${zeroY} Z`;

        g.appendChild(this._svgEl('path', {
          d,
          fill: isPositive ? 'rgba(0, 122, 255, 0.12)' : 'rgba(255, 59, 48, 0.12)',
          stroke: 'none'
        }));
      }
    }

    this.svg.appendChild(g);
  }

  _getPointsInRange(points, fromX, toX) {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x >= fromX && p.x <= toX) {
        result.push(p);
      }
      // Interpolate at boundaries
      if (i > 0) {
        const prev = points[i - 1];
        if (prev.x < fromX && p.x > fromX) {
          const t = (fromX - prev.x) / (p.x - prev.x);
          result.unshift({ x: fromX, y: prev.y + t * (p.y - prev.y) });
        }
        if (prev.x < toX && p.x > toX) {
          const t = (toX - prev.x) / (p.x - prev.x);
          result.push({ x: toX, y: prev.y + t * (p.y - prev.y) });
        }
      }
    }
    return result.sort((a, b) => a.x - b.x);
  }

  _splitByZero(points) {
    if (points.length < 2) return [points];
    const segments = [];
    let current = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      // Check if line crosses zero
      if ((prev.y >= 0 && curr.y < 0) || (prev.y < 0 && curr.y >= 0)) {
        // Find crossing point
        const t = prev.y / (prev.y - curr.y);
        const crossX = prev.x + t * (curr.x - prev.x);
        const crossPoint = { x: crossX, y: 0 };

        current.push(crossPoint);
        segments.push(current);
        current = [crossPoint, curr];
      } else {
        current.push(curr);
      }
    }
    if (current.length > 0) segments.push(current);
    return segments;
  }

  // --- Data lines ---

  _renderDataLines() {
    if (!this.spec.lines || this.spec.lines.length === 0) return;

    const g = this._svgEl('g', { class: 'graph-lines' });

    for (const line of this.spec.lines) {
      if (line.points.length < 2) continue;

      const pathPoints = line.points.map(p => this.toPixel(p.x, p.y));
      let d = `M ${pathPoints[0].x},${pathPoints[0].y}`;
      for (let i = 1; i < pathPoints.length; i++) {
        d += ` L ${pathPoints[i].x},${pathPoints[i].y}`;
      }

      g.appendChild(this._svgEl('path', {
        d,
        stroke: this._colorVar(line.color),
        'stroke-width': 2.5,
        fill: 'none',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }));

      // Draw points at vertices
      for (const p of line.points) {
        const px = this.toPixel(p.x, p.y);
        g.appendChild(this._svgEl('circle', {
          cx: px.x, cy: px.y, r: 4,
          fill: this._colorVar(line.color),
          stroke: 'var(--graph-point-stroke)', 'stroke-width': 2
        }));
      }
    }

    this.svg.appendChild(g);
  }

  // --- Placed points (plot-points mode) ---

  _renderPlacedPoints() {
    const g = this._svgEl('g', { class: 'graph-placed-points' });
    this._placedPointsGroup = g;

    for (const pt of this.placedPoints) {
      this._addPointElement(g, pt);
    }

    this.svg.appendChild(g);
  }

  _addPointElement(group, pt) {
    const px = this.toPixel(pt.x, pt.y);

    // Cross marker for plotted points
    const size = 6;
    const cross = this._svgEl('g', {
      class: 'plotted-point',
      'data-x': pt.x, 'data-y': pt.y,
      style: 'cursor: pointer'
    });

    cross.appendChild(this._svgEl('line', {
      x1: px.x - size, y1: px.y - size,
      x2: px.x + size, y2: px.y + size,
      stroke: 'var(--graph-point)', 'stroke-width': 2.5,
      'stroke-linecap': 'round'
    }));
    cross.appendChild(this._svgEl('line', {
      x1: px.x + size, y1: px.y - size,
      x2: px.x - size, y2: px.y + size,
      stroke: 'var(--graph-point)', 'stroke-width': 2.5,
      'stroke-linecap': 'round'
    }));

    // Invisible hit area
    cross.appendChild(this._svgEl('circle', {
      cx: px.x, cy: px.y, r: 12,
      fill: 'transparent', stroke: 'none'
    }));

    // Click to remove
    cross.addEventListener('click', (e) => {
      e.stopPropagation();
      this._removePoint(pt);
    });

    group.appendChild(cross);
  }

  _removePoint(pt) {
    this.placedPoints = this.placedPoints.filter(
      p => !(Math.abs(p.x - pt.x) < 0.01 && Math.abs(p.y - pt.y) < 0.01)
    );
    this._refreshPlacedPoints();
    if (this.onPointsChange) this.onPointsChange(this.placedPoints);
  }

  _refreshPlacedPoints() {
    if (!this._placedPointsGroup) return;
    this._placedPointsGroup.innerHTML = '';
    for (const pt of this.placedPoints) {
      this._addPointElement(this._placedPointsGroup, pt);
    }
    // Also redraw connecting line
    this._refreshPlacedLine();
  }

  _refreshPlacedLine() {
    // Remove old connecting line
    const old = this.svg.querySelector('.graph-placed-line');
    if (old) old.remove();

    if (this.placedPoints.length < 2) return;

    const sorted = [...this.placedPoints].sort((a, b) => a.x - b.x);
    const pathPoints = sorted.map(p => this.toPixel(p.x, p.y));
    let d = `M ${pathPoints[0].x},${pathPoints[0].y}`;
    for (let i = 1; i < pathPoints.length; i++) {
      d += ` L ${pathPoints[i].x},${pathPoints[i].y}`;
    }

    const line = this._svgEl('path', {
      d,
      class: 'graph-placed-line',
      stroke: 'var(--graph-line-1)',
      'stroke-width': 2,
      fill: 'none',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': '4,3',
      opacity: '0.6'
    });

    // Insert before placed points group so points render on top
    this.svg.insertBefore(line, this._placedPointsGroup);
  }

  // --- Interactive layer (crosshair, clicks) ---

  _renderInteractiveLayer() {
    if (this.mode === 'view') return;

    // Invisible overlay for mouse events — extended 12px beyond plot edges
    // so points at axis boundaries (e.g. 0,0) are easy to click
    const hitPad = 12;
    const overlay = this._svgEl('rect', {
      x: this.padding.left - hitPad, y: this.padding.top - hitPad,
      width: this.plotWidth + hitPad * 2, height: this.plotHeight + hitPad * 2,
      fill: 'transparent', style: 'cursor: crosshair'
    });

    // Crosshair lines
    const crossH = this._svgEl('line', {
      stroke: 'var(--graph-crosshair)', 'stroke-width': 1,
      'stroke-dasharray': '4,4', 'pointer-events': 'none',
      visibility: 'hidden'
    });
    const crossV = this._svgEl('line', {
      stroke: 'var(--graph-crosshair)', 'stroke-width': 1,
      'stroke-dasharray': '4,4', 'pointer-events': 'none',
      visibility: 'hidden'
    });

    this.svg.appendChild(crossH);
    this.svg.appendChild(crossV);
    this.svg.appendChild(overlay);

    const showCrosshair = (svgX, svgY) => {
      const data = this.toData(svgX, svgY);
      const snapped = this.snap(data.x, data.y);

      // Clamp to axis range
      const { xAxis, yAxis } = this.spec;
      snapped.x = Math.max(xAxis.min, Math.min(xAxis.max, snapped.x));
      snapped.y = Math.max(yAxis.min, Math.min(yAxis.max, snapped.y));

      const px = this.toPixel(snapped.x, snapped.y);

      crossH.setAttribute('x1', this.padding.left);
      crossH.setAttribute('y1', px.y);
      crossH.setAttribute('x2', this.padding.left + this.plotWidth);
      crossH.setAttribute('y2', px.y);
      crossH.setAttribute('visibility', 'visible');

      crossV.setAttribute('x1', px.x);
      crossV.setAttribute('y1', this.padding.top);
      crossV.setAttribute('x2', px.x);
      crossV.setAttribute('y2', this.padding.top + this.plotHeight);
      crossV.setAttribute('visibility', 'visible');

      // Update tooltip
      this.tooltip.textContent = `(${snapped.x}, ${snapped.y})`;
      this.tooltip.style.display = 'block';

      this.crosshairPos = snapped;
    };

    const hideCrosshair = () => {
      crossH.setAttribute('visibility', 'hidden');
      crossV.setAttribute('visibility', 'hidden');
      this.tooltip.style.display = 'none';
      this.crosshairPos = null;
    };

    const getSVGPoint = (e) => {
      // Use SVG's built-in coordinate transform for accurate mapping
      // This correctly handles viewBox scaling, max-height, and aspect ratio
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = this.svg.getScreenCTM();
      if (ctm) {
        const svgPt = pt.matrixTransform(ctm.inverse());
        return { x: svgPt.x, y: svgPt.y };
      }
      // Fallback
      const rect = this.svg.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    overlay.addEventListener('mousemove', (e) => {
      const pt = getSVGPoint(e);
      showCrosshair(pt.x, pt.y);

      // Position tooltip near cursor
      const rect = this.svg.getBoundingClientRect();
      const pageX = e.clientX - rect.left + 16;
      const pageY = e.clientY - rect.top - 8;
      this.tooltip.style.left = pageX + 'px';
      this.tooltip.style.top = pageY + 'px';
    });

    overlay.addEventListener('mouseleave', hideCrosshair);

    overlay.addEventListener('click', (e) => {
      if (!this.crosshairPos) return;

      if (this.mode === 'plot-points') {
        // Check for existing point at this location
        const existing = this.placedPoints.find(
          p => p.x === this.crosshairPos.x && p.y === this.crosshairPos.y
        );
        if (existing) {
          this._removePoint(existing);
        } else {
          this.placedPoints.push({ ...this.crosshairPos });
          this._refreshPlacedPoints();
          if (this.onPointsChange) this.onPointsChange(this.placedPoints);
        }
      } else if (this.mode === 'read') {
        if (this.onValueRead) this.onValueRead(this.crosshairPos);
      }
    });

    // Touch support
    overlay.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const pt = getSVGPoint(touch);
      showCrosshair(pt.x, pt.y);
    });

    overlay.addEventListener('touchend', (e) => {
      if (this.crosshairPos) {
        if (this.mode === 'plot-points') {
          const existing = this.placedPoints.find(
            p => p.x === this.crosshairPos.x && p.y === this.crosshairPos.y
          );
          if (!existing) {
            this.placedPoints.push({ ...this.crosshairPos });
            this._refreshPlacedPoints();
            if (this.onPointsChange) this.onPointsChange(this.placedPoints);
          }
        } else if (this.mode === 'read') {
          if (this.onValueRead) this.onValueRead(this.crosshairPos);
        }
      }
      hideCrosshair();
    });
  }

  // --- Public API ---

  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  getPlacedPoints() {
    return [...this.placedPoints];
  }

  setPlacedPoints(points) {
    this.placedPoints = [...points];
    this._refreshPlacedPoints();
  }

  clearPlacedPoints() {
    this.placedPoints = [];
    this._refreshPlacedPoints();
    if (this.onPointsChange) this.onPointsChange(this.placedPoints);
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
