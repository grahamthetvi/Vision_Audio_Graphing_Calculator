/**
 * Talking Graphing Calculator - Core Application Logic
 * Strictly decoupled core logic (parsing, coordinates, rendering) for future ESP32 C++ translation.
 */

// ============================================================================
// 1. Speech Synthesis Wrapper (SpeechManager)
// ============================================================================
class SpeechManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voice = null;
    this.speechRate = 1.1; // Slightly accelerated for snappy feedback
    this.isMuted = false;
    this.initVoice();

    if (this.synth && typeof this.synth.addEventListener === 'function') {
      this.synth.addEventListener('voiceschanged', () => this.initVoice());
    }
  }

  initVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    // Prefer English voices, fallback to first available
    this.voice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                 voices.find(v => v.lang.startsWith('en')) ||
                 voices[0];
  }

  /**
   * Speak a text string, optionally interrupting current speech.
   * @param {string} textString - The text to speak.
   * @param {boolean} interrupt - If true, cancels ongoing speech immediately.
   */
  speak(textString, interrupt = true) {
    console.log(`[TTS Output]: "${textString}"`);
    
    if (this.isMuted) return;

    if (!this.synth) {
      this.updateStatus("Speech Engine: Offline (Unsupported)");
      return;
    }

    if (interrupt) {
      this.synth.cancel();
    }

    // Prepare text for speech (replace mathematical symbols with words)
    const cleanedText = this.prepareTextForSpeech(textString);

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    if (this.voice) {
      utterance.voice = this.voice;
    }
    utterance.rate = this.speechRate;
    
    this.synth.speak(utterance);
    this.updateStatus("Speech Engine: Speaking...");

    utterance.onend = () => {
      this.updateStatus("Speech Engine: Online");
    };
    utterance.onerror = (e) => {
      // Ignore errors caused by manual cancellation via cancel()
      if (e.error !== 'interrupted') {
        console.warn("Speech Synthesis error:", e);
        this.updateStatus("Speech Engine: Error");
      }
    };
  }

  /**
   * Translates formula/coordinate shorthand to fully readable speech sentences.
   */
  prepareTextForSpeech(text) {
    return text
      .replace(/-/g, ' negative ')
      .replace(/\by1\b/gi, 'Y 1')
      .replace(/\by2\b/gi, 'Y 2')
      .replace(/\by3\b/gi, 'Y 3')
      .replace(/\by4\b/gi, 'Y 4')
      .replace(/\bx1\b/gi, 'X 1')
      .replace(/\bx2\b/gi, 'X 2')
      .replace(/\bcos\b/gi, 'cosine')
      .replace(/\bsin\b/gi, 'sine')
      .replace(/\btan\b/gi, 'tangent')
      .replace(/\bsqrt\b/gi, 'square root')
      .replace(/\babs\b/gi, 'absolute value');
  }

  updateStatus(statusText) {
    const statusEl = document.getElementById('footer-status');
    if (statusEl) {
      statusEl.textContent = statusText;
    }
  }
}

// ============================================================================
// 2. Decoupled Mathematical Engine (GraphEngine)
// ============================================================================
class GraphEngine {
  constructor(xMin = -10, xMax = 10, yMin = -10, yMax = 10, xScl = 1, yScl = 1) {
    this.xMin = xMin;
    this.xMax = xMax;
    this.yMin = yMin;
    this.yMax = yMax;
    this.xScl = xScl;
    this.yScl = yScl;
  }

  // Maps real math coordinates (x, y) to canvas pixel coordinates (pixelX, pixelY)
  mathToPixel(x, y, width, height) {
    const pixelX = ((x - this.xMin) / (this.xMax - this.xMin)) * width;
    const pixelY = height - ((y - this.yMin) / (this.yMax - this.yMin)) * height;
    return { x: pixelX, y: pixelY };
  }

  // Maps canvas pixel coordinates (pixelX, pixelY) back to real math coordinates (x, y)
  pixelToMath(pixelX, pixelY, width, height) {
    const x = this.xMin + (pixelX / width) * (this.xMax - this.xMin);
    const y = this.yMin + ((height - pixelY) / height) * (this.yMax - this.yMin);
    return { x, y };
  }

  // Coerce any complex, fraction, or bigNumber to a real number
  coerceToNumber(val) {
    if (typeof val === 'number') {
      return val;
    }
    if (val && typeof val.toNumber === 'function') {
      return val.toNumber();
    }
    if (val && typeof val.im === 'number' && typeof val.re === 'number') {
      return val.im === 0 ? val.re : NaN;
    }
    return NaN;
  }

  /**
   * Generates a coordinate vector of pixel points for a given Y = f(x) equation.
   * Runs independently of the DOM.
   */
  generateYPoints(expression, width, height, angleMode = 'rad') {
    if (!expression || expression.trim() === '') {
      return { points: [], compiled: null, error: null };
    }

    try {
      const compiled = math.compile(expression);
      const points = [];

      for (let pixelX = 0; pixelX <= width; pixelX++) {
        const mathX = this.xMin + (pixelX / width) * (this.xMax - this.xMin);
        try {
          const rawY = CalcEngine.evaluateAt(compiled, mathX, angleMode);
          const mathY = this.coerceToNumber(rawY);
          
          if (typeof mathY === 'number' && !isNaN(mathY) && isFinite(mathY)) {
            const pixelY = height - ((mathY - this.yMin) / (this.yMax - this.yMin)) * height;
            points.push({ x: pixelX, y: pixelY, mathY: mathY });
          } else {
            points.push({ x: pixelX, y: NaN, mathY: NaN });
          }
        } catch (evalErr) {
          points.push({ x: pixelX, y: NaN, mathY: NaN });
        }
      }

      return { points, compiled, error: null };
    } catch (parseErr) {
      return { points: [], compiled: null, error: parseErr.message };
    }
  }

  /**
   * Generates the pixel X coordinate for a vertical line X = c.
   */
  generateXPoint(expression, width, angleMode = 'rad') {
    if (!expression || expression.trim() === '') {
      return { pixelX: null, mathX: null, error: null };
    }

    try {
      const compiled = math.compile(expression);
      const rawVal = CalcEngine.evaluateAt(compiled, 0, angleMode);
      const val = this.coerceToNumber(rawVal);
      if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
        throw new Error("Expression did not evaluate to a constant real number.");
      }

      const pixelX = ((val - this.xMin) / (this.xMax - this.xMin)) * width;
      return { pixelX, mathX: val, error: null };
    } catch (parseErr) {
      return { pixelX: null, mathX: null, error: parseErr.message };
    }
  }
}

// ============================================================================
// 2.5 Decoupled Calculation Engine (CalcEngine)
// ============================================================================
class CalcEngine {
  /**
   * Evaluates the equation at X, respecting Angle Mode (rad vs deg)
   * @param {Object} compiled - Compiled math.js expression
   * @param {number} xVal - The X coordinate
   * @param {string} angleMode - 'rad' or 'deg'
   * @returns {number}
   */
  static evaluateAt(compiled, xVal, angleMode) {
    if (!compiled) return NaN;
    const scope = { x: xVal };
    if (angleMode === 'deg') {
      scope.sin = (val) => Math.sin(val * Math.PI / 180);
      scope.cos = (val) => Math.cos(val * Math.PI / 180);
      scope.tan = (val) => Math.tan(val * Math.PI / 180);
      scope.asin = (val) => Math.asin(val) * 180 / Math.PI;
      scope.acos = (val) => Math.acos(val) * 180 / Math.PI;
      scope.atan = (val) => Math.atan(val) * 180 / Math.PI;
    }
    return compiled.evaluate(scope);
  }

  /**
   * Finds a root of f(x) in [xMin, xMax] using bisection/scanning.
   */
  static findRoot(compiled, xMin, xMax, angleMode, guessX = 0) {
    const steps = 200;
    const dx = (xMax - xMin) / steps;
    let closestRoot = null;
    let closestDist = Infinity;

    for (let i = 0; i < steps; i++) {
      const x1 = xMin + i * dx;
      const x2 = x1 + dx;
      
      let y1, y2;
      try {
        y1 = this.evaluateAt(compiled, x1, angleMode);
        y2 = this.evaluateAt(compiled, x2, angleMode);
      } catch {
        continue;
      }

      if (isNaN(y1) || isNaN(y2) || !isFinite(y1) || !isFinite(y2)) continue;

      if (Math.abs(y1) < 1e-12) {
        const dist = Math.abs(x1 - guessX);
        if (dist < closestDist) {
          closestRoot = x1;
          closestDist = dist;
        }
      }

      if (y1 * y2 < 0) {
        let a = x1;
        let b = x2;
        let root = null;
        for (let iter = 0; iter < 100; iter++) {
          const mid = (a + b) / 2;
          const yMid = this.evaluateAt(compiled, mid, angleMode);
          if (Math.abs(yMid) < 1e-12 || (b - a) / 2 < 1e-12) {
            root = mid;
            break;
          }
          const yA = this.evaluateAt(compiled, a, angleMode);
          if (yA * yMid < 0) {
            b = mid;
          } else {
            a = mid;
          }
        }
        if (root !== null) {
          const dist = Math.abs(root - guessX);
          if (dist < closestDist) {
            closestRoot = root;
            closestDist = dist;
          }
        }
      }
    }

    return closestRoot;
  }

  /**
   * Finds a local minimum or maximum in [xMin, xMax].
   * @param {string} type - 'min' or 'max'
   */
  static findExtremum(compiled, xMin, xMax, angleMode, type, guessX = 0) {
    const steps = 500;
    const dx = (xMax - xMin) / steps;
    const candidates = [];

    let prevY = null;
    let prevSlope = null;

    for (let i = 0; i <= steps; i++) {
      const x = xMin + i * dx;
      let y;
      try {
        y = this.evaluateAt(compiled, x, angleMode);
      } catch {
        continue;
      }
      if (isNaN(y) || !isFinite(y)) {
        prevY = null;
        prevSlope = null;
        continue;
      }

      if (prevY !== null) {
        const slope = (y - prevY) / dx;
        if (prevSlope !== null) {
          if (prevSlope > 0 && slope < 0) {
            if (type === 'max') {
              candidates.push({ x: x - dx / 2, y: prevY });
            }
          } else if (prevSlope < 0 && slope > 0) {
            if (type === 'min') {
              candidates.push({ x: x - dx / 2, y: prevY });
            }
          }
        }
        prevSlope = slope;
      }
      prevY = y;
    }

    if (candidates.length === 0) {
      return null;
    }

    let bestCandidate = null;
    let minDiff = Infinity;
    for (const cand of candidates) {
      const diff = Math.abs(cand.x - guessX);
      if (diff < minDiff) {
        minDiff = diff;
        bestCandidate = cand;
      }
    }

    let x = bestCandidate.x;
    let step = dx / 2;
    for (let iter = 0; iter < 30; iter++) {
      const y = this.evaluateAt(compiled, x, angleMode);
      const yLeft = this.evaluateAt(compiled, x - step, angleMode);
      const yRight = this.evaluateAt(compiled, x + step, angleMode);

      if (type === 'max') {
        if (yLeft > y && yLeft > yRight) {
          x = x - step;
        } else if (yRight > y && yRight > yLeft) {
          x = x + step;
        } else {
          step /= 2;
        }
      } else {
        if (yLeft < y && yLeft < yRight) {
          x = x - step;
        } else if (yRight < y && yRight > yLeft) {
          x = x + step;
        } else {
          step /= 2;
        }
      }
    }

    return { x, y: this.evaluateAt(compiled, x, angleMode) };
  }

  /**
   * Calculates dy/dx at xVal
   */
  static derivative(compiled, xVal, angleMode) {
    const h = 1e-5;
    try {
      const y1 = this.evaluateAt(compiled, xVal - h, angleMode);
      const y2 = this.evaluateAt(compiled, xVal + h, angleMode);
      if (isNaN(y1) || isNaN(y2)) return NaN;
      return (y2 - y1) / (2 * h);
    } catch {
      return NaN;
    }
  }

  /**
   * Definite integration from lower to upper bound using Trapezoidal Rule
   */
  static integrate(compiled, lower, upper, angleMode) {
    const N = 1000;
    const h = (upper - lower) / N;
    try {
      const yStart = this.evaluateAt(compiled, lower, angleMode);
      const yEnd = this.evaluateAt(compiled, upper, angleMode);
      
      if (isNaN(yStart) || isNaN(yEnd)) return NaN;
      
      let sum = 0.5 * (yStart + yEnd);
      for (let i = 1; i < N; i++) {
        const yVal = this.evaluateAt(compiled, lower + i * h, angleMode);
        if (isNaN(yVal)) return NaN;
        sum += yVal;
      }
      return sum * h;
    } catch {
      return NaN;
    }
  }

  /**
   * Calculates the second derivative f''(x) using a central second-order finite difference
   */
  static secondDerivative(compiled, xVal, angleMode) {
    const h = 1e-3;
    try {
      const yPlus = this.evaluateAt(compiled, xVal + h, angleMode);
      const yMinus = this.evaluateAt(compiled, xVal - h, angleMode);
      const yVal = this.evaluateAt(compiled, xVal, angleMode);
      if (isNaN(yPlus) || isNaN(yMinus) || isNaN(yVal) || !isFinite(yPlus) || !isFinite(yMinus) || !isFinite(yVal)) return NaN;
      return (yPlus - 2 * yVal + yMinus) / (h * h);
    } catch {
      return NaN;
    }
  }

  /**
   * Finds the exact inflection point in [x1, x2] using bisection on the second derivative
   */
  static findInflectionPoint(compiled, x1, x2, angleMode) {
    let a = x1;
    let b = x2;
    let lastMid = (a + b) / 2;
    for (let iter = 0; iter < 15; iter++) {
      const mid = (a + b) / 2;
      const fDoubleMid = this.secondDerivative(compiled, mid, angleMode);
      const fDoubleA = this.secondDerivative(compiled, a, angleMode);
      if (isNaN(fDoubleMid) || isNaN(fDoubleA) || !isFinite(fDoubleMid) || !isFinite(fDoubleA)) {
        return lastMid;
      }
      if (Math.abs(fDoubleMid) < 1e-8) {
        return mid;
      }
      if (fDoubleA * fDoubleMid < 0) {
        b = mid;
      } else {
        a = mid;
      }
      lastMid = mid;
    }
    return lastMid;
  }
}

// ============================================================================
// 3. Decoupled Graph Viewport Renderer
// ============================================================================
class GraphRenderer {
  static draw(ctx, width, height, graphEngine, state) {
    // 1. Clear Canvas (Deep Black background)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Grid Lines
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    
    const xScl = graphEngine.xScl || 1;
    const yScl = graphEngine.yScl || 1;

    // Vertical grid lines
    for (let x = Math.ceil(graphEngine.xMin / xScl) * xScl; x <= graphEngine.xMax; x += xScl) {
      if (Math.abs(x) < 1e-12) continue;
      const screenPt = graphEngine.mathToPixel(x, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(screenPt.x, 0);
      ctx.lineTo(screenPt.x, height);
      ctx.stroke();
    }
    // Horizontal grid lines
    for (let y = Math.ceil(graphEngine.yMin / yScl) * yScl; y <= graphEngine.yMax; y += yScl) {
      if (Math.abs(y) < 1e-12) continue;
      const screenPt = graphEngine.mathToPixel(0, y, width, height);
      ctx.beginPath();
      ctx.moveTo(0, screenPt.y);
      ctx.lineTo(width, screenPt.y);
      ctx.stroke();
    }

    // 2.5 Draw Definite Integration Shading
    if (state.integrationShading && state.integrationShading.active) {
      const eqKey = state.integrationShading.key;
      const points = state.equations[eqKey].points;
      if (points && points.length > 0) {
        const lowerX = state.integrationShading.lower;
        const upperX = state.integrationShading.upper;

        ctx.fillStyle = 'rgba(255, 69, 0, 0.3)'; // Semi-transparent neon orange-red
        ctx.beginPath();

        let started = false;
        let lastPt = null;

        const startPt = graphEngine.mathToPixel(lowerX, 0, width, height);
        ctx.moveTo(startPt.x, startPt.y);

        for (const pt of points) {
          const mathPt = graphEngine.pixelToMath(pt.x, pt.y, width, height);
          const mathX = mathPt.x;

          if (mathX >= lowerX && mathX <= upperX) {
            if (!isNaN(pt.y) && isFinite(pt.y)) {
              ctx.lineTo(pt.x, pt.y);
              started = true;
              lastPt = pt;
            }
          }
        }

        const endPt = graphEngine.mathToPixel(upperX, 0, width, height);
        if (started && lastPt) {
          ctx.lineTo(endPt.x, lastPt.y);
        }
        ctx.lineTo(endPt.x, endPt.y);
        ctx.lineTo(startPt.x, startPt.y);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#FF4500';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startPt.x, 0);
        ctx.lineTo(startPt.x, height);
        ctx.moveTo(endPt.x, 0);
        ctx.lineTo(endPt.x, height);
        ctx.stroke();
      }
    }

    // 3. Draw Primary Axes (X and Y)
    const origin = graphEngine.mathToPixel(0, 0, width, height);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;

    // X Axis
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.stroke();

    // Y Axis
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.stroke();

    // 4. Draw Axis Tick Marks and Numbers
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // X Ticks
    const totalXTicks = (graphEngine.xMax - graphEngine.xMin) / xScl;
    const xLabelInterval = totalXTicks > 20 ? Math.ceil(totalXTicks / 10) : 1;
    let xTickCount = 0;
    for (let x = Math.ceil(graphEngine.xMin / xScl) * xScl; x <= graphEngine.xMax; x += xScl) {
      if (Math.abs(x) < 1e-12) continue;
      const pt = graphEngine.mathToPixel(x, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - 8);
      ctx.lineTo(pt.x, pt.y + 8);
      ctx.stroke();
      
      if (xTickCount % xLabelInterval === 0) {
        ctx.fillText(parseFloat(x.toFixed(4)).toString(), pt.x, pt.y + 12);
      }
      xTickCount++;
    }

    // Y Ticks
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const totalYTicks = (graphEngine.yMax - graphEngine.yMin) / yScl;
    const yLabelInterval = totalYTicks > 20 ? Math.ceil(totalYTicks / 10) : 1;
    let yTickCount = 0;
    for (let y = Math.ceil(graphEngine.yMin / yScl) * yScl; y <= graphEngine.yMax; y += yScl) {
      if (Math.abs(y) < 1e-12) continue;
      const pt = graphEngine.mathToPixel(0, y, width, height);
      ctx.beginPath();
      ctx.moveTo(pt.x - 8, pt.y);
      ctx.lineTo(pt.x + 8, pt.y);
      ctx.stroke();
      
      if (yTickCount % yLabelInterval === 0) {
        ctx.fillText(parseFloat(y.toFixed(4)).toString(), pt.x - 14, pt.y);
      }
      yTickCount++;
    }

    // Label Origin
    ctx.fillText('0', origin.x - 10, origin.y + 10);

    // 5. Plot Equations (Y1 - Y4)
    const functionColors = {
      y1: '#FFFF00', // Neon Yellow
      y2: '#00FFFF', // Neon Cyan
      y3: '#FF00FF', // Neon Magenta
      y4: '#39FF14'  // Neon Green
    };

    for (const key of ['y1', 'y2', 'y3', 'y4']) {
      const points = state.equations[key].points;
      if (!points || points.length === 0) continue;

      ctx.strokeStyle = functionColors[key];
      ctx.lineWidth = 4;
      ctx.beginPath();

      let started = false;
      for (const pt of points) {
        if (!isNaN(pt.y) && isFinite(pt.y)) {
          // Clip drawing slightly out of bounds to avoid messy canvas edges
          if (pt.y >= -50 && pt.y <= height + 50) {
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            started = false;
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
    }

    // 6. Plot Vertical Lines (X1, X2)
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#FFFFFF';
    ctx.setLineDash([8, 8]); // Dashed line to differentiate from curve graphs
    for (const key of ['x1', 'x2']) {
      const pixelX = state.equations[key].pixelX;
      if (pixelX !== null && !isNaN(pixelX)) {
        ctx.beginPath();
        ctx.moveTo(pixelX, 0);
        ctx.lineTo(pixelX, height);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]); // Reset dashed lines

    // 6.5 Draw Tangent Line (Y_tangent) if active
    if (state.equations.y_tangent && state.equations.y_tangent.active && state.equations.y_tangent.points && state.equations.y_tangent.points.length > 0) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      let started = false;
      for (const pt of state.equations.y_tangent.points) {
        if (!isNaN(pt.y) && isFinite(pt.y)) {
          if (pt.y >= -50 && pt.y <= height + 50) {
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            started = false;
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6.7 Draw Scatter Plot Points (L1 and L2)
    if (state.L1 && state.L2) {
      ctx.fillStyle = '#FF007F'; // Neon Pink
      for (let i = 0; i < Math.min(state.L1.length, state.L2.length); i++) {
        const xVal = parseFloat(state.L1[i]);
        const yVal = parseFloat(state.L2[i]);
        if (!isNaN(xVal) && !isNaN(yVal)) {
          const pt = graphEngine.mathToPixel(xVal, yVal, width, height);
          if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#FF007F';
            ctx.fillRect(pt.x - 7, pt.y - 7, 14, 14); // 14x14 box
          }
        }
      }
      ctx.shadowBlur = 0; // Reset shadow blur
    }

    // 7. Draw Interactive Grid Cursor (Crosshair)
    const cursor = state.cursor;
    const cursorPt = graphEngine.mathToPixel(cursor.x, cursor.y, width, height);

    ctx.strokeStyle = '#FF4500'; // Neon Orange-Red
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    // Horizontal Cursor Line
    if (isFinite(cursor.y)) {
      ctx.beginPath();
      ctx.moveTo(0, cursorPt.y);
      ctx.lineTo(width, cursorPt.y);
      ctx.stroke();
    }

    // Vertical Cursor Line
    ctx.beginPath();
    ctx.moveTo(cursorPt.x, 0);
    ctx.lineTo(cursorPt.x, height);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Glowing Dot at Cursor Center
    if (isFinite(cursor.y)) {
      ctx.fillStyle = '#FF4500';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#FF4500';
      ctx.beginPath();
      ctx.arc(cursorPt.x, cursorPt.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0; // Reset shadow blur
      
      ctx.arc(cursorPt.x, cursorPt.y, 8, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
}

// ============================================================================
// Sonification Math (Isolated for future C++/ESP32 port)
// ============================================================================
class SonificationMath {
  static mapYToFrequency(y, yMin, yMax) {
    // Exponential mapping from [yMin, yMax] to [200, 1000] Hz
    const yNorm = Math.min(Math.max((y - yMin) / (yMax - yMin), 0.0), 1.0);
    // f(y) = 200 * (1000 / 200) ^ yNorm
    return 200.0 * Math.pow(5.0, yNorm);
  }

  static mapXToPan(x, xMin, xMax) {
    // Linear mapping from [xMin, xMax] to [-1.0, 1.0]
    const xNorm = Math.min(Math.max((x - xMin) / (xMax - xMin), 0.0), 1.0);
    return -1.0 + 2.0 * xNorm;
  }

  static checkCriticalPoint(x, compiled, graphEngine) {
    if (!compiled) return null;

    try {
      const y = graphEngine.coerceToNumber(compiled.evaluate({ x }));
      if (isNaN(y) || !isFinite(y)) return null;

      const eps = 0.005; // Small delta for derivative check
      const yPrev = graphEngine.coerceToNumber(compiled.evaluate({ x: x - eps }));
      const yNext = graphEngine.coerceToNumber(compiled.evaluate({ x: x + eps }));

      if (isNaN(yPrev) || isNaN(yNext) || !isFinite(yPrev) || !isFinite(yNext)) return null;

      // Local maximum
      if (y > yPrev && y > yNext) {
        return { type: 'maximum', y };
      }

      // Local minimum
      if (y < yPrev && y < yNext) {
        return { type: 'minimum', y };
      }

      // Zero crossing (root)
      if (Math.abs(y) < 1e-5) {
        return { type: 'root', y: 0 };
      }
    } catch {
      // Ignore evaluation errors
    }
    return null;
  }
}

// ============================================================================
// Audio Sonification and Trace Engine (Web Audio API)
// ============================================================================
class AudioTraceEngine {
  constructor() {
    this.ctx = null;
    this.primaryOsc = null;
    this.primaryGain = null;
    this.sawOsc = null;
    this.sawGain = null;
    this.masterGain = null;
    this.panNode = null;
    this.isPlaying = false;
    this.lfo = null;
    this.lfoGain = null;
    this.tangentOsc = null;
    this.tangentGain = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("Web Audio API is not supported in this browser.");
      return;
    }
    this.ctx = new AudioContextClass();

    this.primaryOsc = this.ctx.createOscillator();
    this.primaryOsc.type = 'sine';

    this.primaryGain = this.ctx.createGain();
    this.primaryGain.gain.value = 0.5;

    // Create LFO for vibrato on primary oscillator frequency
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 6; // 6 Hz

    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.0; // Clean tone by default (0 vibrato)

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.primaryOsc.frequency);
    this.lfo.start();

    // Create auxiliary oscillator for tangent line sonification
    this.tangentOsc = this.ctx.createOscillator();
    this.tangentOsc.type = 'triangle'; // Soft triangle wave profile

    this.tangentGain = this.ctx.createGain();
    this.tangentGain.gain.value = 0.0; // Start silent

    this.sawOsc = this.ctx.createOscillator();
    this.sawOsc.type = 'sawtooth';

    this.sawGain = this.ctx.createGain();
    this.sawGain.gain.value = 0.0;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0;

    if (this.ctx.createStereoPanner) {
      this.panNode = this.ctx.createStereoPanner();
      this.panNode.pan.value = 0.0;
    }

    this.primaryOsc.connect(this.primaryGain);
    this.sawOsc.connect(this.sawGain);
    this.tangentOsc.connect(this.tangentGain);

    this.primaryGain.connect(this.masterGain);
    this.sawGain.connect(this.masterGain);
    this.tangentGain.connect(this.masterGain);

    if (this.panNode) {
      this.masterGain.connect(this.panNode);
      this.panNode.connect(this.ctx.destination);
    } else {
      this.masterGain.connect(this.ctx.destination);
    }

    this.primaryOsc.start();
    this.sawOsc.start();
    this.tangentOsc.start();
  }

  ensureRunning() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  start() {
    this.ensureRunning();
    if (!this.ctx) return;

    if (!this.isPlaying) {
      this.isPlaying = true;
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(0.0, t);
      this.masterGain.gain.linearRampToValueAtTime(0.4, t + 0.05); // Smooth fade in
    }
  }

  stop() {
    if (!this.ctx || !this.isPlaying) return;

    this.isPlaying = false;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.0, t + 0.05); // Smooth fade out
    this.setVibrato(false); // Reset vibrato when stopping
  }

  setMuted(muted) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    const targetGain = muted ? 0.0 : 0.4;
    this.masterGain.gain.setTargetAtTime(targetGain, t, 0.015);
  }

  updateTracePoint(freq, pan, isNegative, tangentFreq = null) {
    this.ensureRunning();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    this.primaryOsc.frequency.setTargetAtTime(freq, t, 0.015);
    this.sawOsc.frequency.setTargetAtTime(freq / 2.0, t, 0.015);

    const targetSawGain = isNegative ? 0.15 : 0.0;
    this.sawGain.gain.setTargetAtTime(targetSawGain, t, 0.015);

    // Update tangent line tone
    if (this.tangentOsc && this.tangentGain) {
      if (tangentFreq !== null && !isNaN(tangentFreq) && isFinite(tangentFreq)) {
        this.tangentOsc.frequency.setTargetAtTime(tangentFreq, t, 0.015);
        this.tangentGain.gain.setTargetAtTime(0.12, t, 0.015);
      } else {
        this.tangentGain.gain.setTargetAtTime(0.0, t, 0.015);
      }
    }

    if (this.panNode) {
      this.panNode.pan.setTargetAtTime(pan, t, 0.015);
    }
  }

  setVibrato(active) {
    this.ensureRunning();
    if (!this.ctx || !this.lfoGain) return;
    const t = this.ctx.currentTime;
    const targetGain = active ? 10.0 : 0.0;
    this.lfoGain.gain.setTargetAtTime(targetGain, t, 0.015);
  }

  playClick() {
    this.ensureRunning();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();

    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1800, t);

    clickGain.gain.setValueAtTime(0.2, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);

    clickOsc.start(t);
    clickOsc.stop(t + 0.025);
  }

  playScatterPop() {
    this.ensureRunning();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // Create a short buffer of white noise
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;

    // Highpass filter for crispy static sound
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3000, t);

    const popGain = this.ctx.createGain();
    popGain.gain.setValueAtTime(0.25, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    noiseNode.connect(filter);
    filter.connect(popGain);
    popGain.connect(this.ctx.destination);

    noiseNode.start(t);
    noiseNode.stop(t + 0.05);
  }

  playCriticalPointChime() {
    this.ensureRunning();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, t);
    gain1.gain.setValueAtTime(0.12, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.13);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, t + 0.08);
    gain2.gain.setValueAtTime(0.12, t + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t + 0.08);
    osc2.stop(t + 0.23);
  }

  playInflectionPointChime() {
    this.ensureRunning();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2000, t);
    gain1.gain.setValueAtTime(0.12, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.13);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2500, t + 0.05);
    gain2.gain.setValueAtTime(0.12, t + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t + 0.05);
    osc2.stop(t + 0.21);
  }
}

// ============================================================================
// 4. Application Orchestrator / UI Layer
// ============================================================================
class App {
  constructor() {
    this.speechManager = new SpeechManager();
    this.graphEngine = new GraphEngine(-10, 10, -10, 10, 1, 1);
    this.audioTraceEngine = new AudioTraceEngine();
    this.errorSpeechTimers = {};
    this.traceInactivityTimer = null;
    this.lastCriticalPointType = null;
    this.traceFrozen = false;
    this.originalCursor = null;
    this.currentStatsSpeechSummary = null;
    this.lastComputedRegressionEquation = null;

    // Initialize list arrays
    const initL1 = [1, 2, 3, 4, 5];
    const initL2 = [2, 4, 5, 4, 5];
    const initL3 = [10, 20, 30, 40, 50];
    for (let i = 5; i < 30; i++) {
      initL1.push("");
      initL2.push("");
      initL3.push("");
    }
    
    this.state = {
      equations: {
        y1: { text: '', points: [], compiled: null, error: null },
        y2: { text: '', points: [], compiled: null, error: null },
        y3: { text: '', points: [], compiled: null, error: null },
        y4: { text: '', points: [], compiled: null, error: null },
        x1: { text: '', pixelX: null, mathX: null, error: null },
        x2: { text: '', pixelX: null, mathX: null, error: null },
        y_tangent: { text: '', points: [], compiled: null, error: null, active: false }
      },
      L1: initL1,
      L2: initL2,
      L3: initL3,
      activeView: 'graph', // 'graph', 'table', 'list-editor'
      cursor: { x: 0, y: 0 },
      activeEquationKey: 'y1',
      traceModeActive: false,
      sweepActive: false,
      angleMode: 'rad',
      precisionMode: 'float',
      tableModeActive: false,
      tableCurrentRowIndex: 0,
      activeSolver: null,
      integrationShading: { active: false, lower: 0, upper: 0, key: 'y1' }
    };

    this.canvas = document.getElementById('graphCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.overlay = document.getElementById('helpOverlay');
    this.solverOverlay = document.getElementById('solverOverlay');

    this.initElements();
    this.initEvents();
    this.resizeCanvas();
  }

  initElements() {
    // Pre-populate some equations for demonstration (Y1 = x, X1 = -2)
    document.getElementById('input-y1').value = 'x';
    document.getElementById('input-x1').value = '-2';
    
    this.updateEquationState('y1', 'x');
    this.updateEquationState('x1', '-2');
    
    // Sync window inputs with initial engine state
    document.getElementById('input-xmin').value = this.graphEngine.xMin;
    document.getElementById('input-xmax').value = this.graphEngine.xMax;
    document.getElementById('input-xscl').value = this.graphEngine.xScl;
    document.getElementById('input-ymin').value = this.graphEngine.yMin;
    document.getElementById('input-ymax').value = this.graphEngine.yMax;
    document.getElementById('input-yscl').value = this.graphEngine.yScl;

    this.updateActiveEquationUI();
  }

  initEvents() {
    // Resizing
    window.addEventListener('resize', () => this.resizeCanvas());

    // Equation Slot Inputs & Focus Announcements
    const eqSlots = [
      { id: 'input-y1', key: 'y1', label: 'Y 1' },
      { id: 'input-y2', key: 'y2', label: 'Y 2' },
      { id: 'input-y3', key: 'y3', label: 'Y 3' },
      { id: 'input-y4', key: 'y4', label: 'Y 4' },
      { id: 'input-x1', key: 'x1', label: 'X 1' },
      { id: 'input-x2', key: 'x2', label: 'X 2' }
    ];

    eqSlots.forEach(slot => {
      const input = document.getElementById(slot.id);
      
      // Accessibility announcements on focus
      input.addEventListener('focus', () => {
        const text = input.value.trim();
        const formulaSpeech = text ? `containing equation ${text}` : 'empty';
        this.speechManager.speak(`${slot.label} equation input, ${formulaSpeech}`);
        
        // Track active equation and highlight it
        this.state.activeEquationKey = slot.key;
        this.updateActiveEquationUI();
      });

      // Update equations on typing
      input.addEventListener('input', (e) => {
        this.updateEquationState(slot.key, e.target.value);
        if (this.state.tableModeActive) {
          this.renderTable();
        } else {
          this.draw();
        }
      });

      // Immediate error speaking on blur
      input.addEventListener('blur', () => {
        if (this.errorSpeechTimers[slot.key]) {
          clearTimeout(this.errorSpeechTimers[slot.key]);
          delete this.errorSpeechTimers[slot.key];
        }

        const eq = this.state.equations[slot.key];
        if (input.value.trim() !== '' && eq.error) {
          this.speechManager.speak(`Error in ${slot.label}: ${eq.error}`, true);
        }
      });

      // Enter key pushes compile and provides audio status
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (this.errorSpeechTimers[slot.key]) {
            clearTimeout(this.errorSpeechTimers[slot.key]);
            delete this.errorSpeechTimers[slot.key];
          }
          this.announceEquationsCompile();
          if (this.state.tableModeActive) {
            this.renderTable();
          } else {
            this.draw();
          }
        }
      });
    });

    // Window Settings change handler
    const windowInputs = ['input-xmin', 'input-xmax', 'input-xscl', 'input-ymin', 'input-ymax', 'input-yscl'];
    const onWindowInputChange = (id) => {
      const val = parseFloat(document.getElementById(id).value);
      if (isNaN(val)) return;
      
      let speakLabel = "";
      switch (id) {
        case 'input-xmin':
          if (val < this.graphEngine.xMax) {
            this.graphEngine.xMin = val;
            speakLabel = "X minimum";
          }
          break;
        case 'input-xmax':
          if (val > this.graphEngine.xMin) {
            this.graphEngine.xMax = val;
            speakLabel = "X maximum";
          }
          break;
        case 'input-xscl':
          if (val > 0) {
            this.graphEngine.xScl = val;
            speakLabel = "X scale";
          }
          break;
        case 'input-ymin':
          if (val < this.graphEngine.yMax) {
            this.graphEngine.yMin = val;
            speakLabel = "Y minimum";
          }
          break;
        case 'input-ymax':
          if (val > this.graphEngine.yMin) {
            this.graphEngine.yMax = val;
            speakLabel = "Y maximum";
          }
          break;
        case 'input-yscl':
          if (val > 0) {
            this.graphEngine.yScl = val;
            speakLabel = "Y scale";
          }
          break;
      }
      
      this.recalculateAllPoints();
      this.draw();
      
      if (speakLabel) {
        this.speechManager.speak(`${speakLabel} set to ${this.formatNumberSpeech(val)}`);
      }
    };

    windowInputs.forEach(id => {
      const input = document.getElementById(id);
      input.addEventListener('change', () => onWindowInputChange(id));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          onWindowInputChange(id);
          input.blur();
        }
      });
      input.addEventListener('focus', () => {
        const valStr = this.formatNumberSpeech(parseFloat(input.value) || 0);
        const name = input.previousElementSibling.textContent;
        this.speechManager.speak(`Window setting ${name}, value ${valStr}`);
      });
    });

    // Zoom Buttons
    document.getElementById('btn-zoom-std').addEventListener('click', () => this.zoomStandard());
    document.getElementById('btn-zoom-fit').addEventListener('click', () => this.zoomFit());

    // Angle Mode Toggle Buttons
    const btnRad = document.getElementById('btn-mode-rad');
    const btnDeg = document.getElementById('btn-mode-deg');
    
    const setAngleMode = (mode) => {
      this.state.angleMode = mode;
      if (mode === 'rad') {
        btnRad.classList.add('active');
        btnRad.setAttribute('aria-pressed', 'true');
        btnDeg.classList.remove('active');
        btnDeg.setAttribute('aria-pressed', 'false');
        this.speechManager.speak("Angle mode set to radians.");
      } else {
        btnDeg.classList.add('active');
        btnDeg.setAttribute('aria-pressed', 'true');
        btnRad.classList.remove('active');
        btnRad.setAttribute('aria-pressed', 'false');
        this.speechManager.speak("Angle mode set to degrees.");
      }
      this.recalculateAllPoints();
      this.draw();
      if (this.state.tableModeActive) {
        this.renderTable();
      }
    };
    
    btnRad.addEventListener('click', () => setAngleMode('rad'));
    btnDeg.addEventListener('click', () => setAngleMode('deg'));

    // Precision Selector
    const selectPrecision = document.getElementById('select-precision');
    selectPrecision.addEventListener('change', (e) => {
      this.state.precisionMode = e.target.value;
      const desc = e.target.value === 'float' ? 'Float precision' : `Fixed ${e.target.value.slice(3)} decimal places`;
      this.speechManager.speak(`Precision set to ${desc}`);
      this.draw();
      if (this.state.tableModeActive) {
        this.renderTable();
      }
    });
    selectPrecision.addEventListener('focus', () => {
      this.speechManager.speak("Decimal precision selector.");
    });

    // Table settings
    const tblStartInput = document.getElementById('input-tblstart');
    const dTblInput = document.getElementById('input-dtbl');
    
    const onTableConfigChange = () => {
      if (this.state.tableModeActive) {
        this.renderTable();
      }
    };

    [tblStartInput, dTblInput].forEach(input => {
      input.addEventListener('change', onTableConfigChange);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          onTableConfigChange();
          input.blur();
        }
      });
      input.addEventListener('focus', () => {
        const valStr = this.formatNumberSpeech(parseFloat(input.value) || 0);
        const name = input.previousElementSibling.textContent;
        this.speechManager.speak(`Table configuration ${name}, value ${valStr}`);
      });
    });

    // Toggle Table View
    document.getElementById('btn-toggle-table').addEventListener('click', () => this.toggleTableView());

    // Solver Buttons
    const solverKeys = ['val', 'root', 'min', 'max', 'deriv', 'int', 'tangent'];
    solverKeys.forEach(solver => {
      const btn = document.getElementById(`btn-solver-${solver}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.openSolver(solver);
        });
      }
    });

    // Solver Overlay Actions
    document.getElementById('btn-close-solver').addEventListener('click', () => this.closeSolverOverlay());
    document.getElementById('btn-solver-back').addEventListener('click', () => this.showSolverMenu());
    document.getElementById('btn-solver-execute').addEventListener('click', () => this.executeSolver());

    document.querySelectorAll('.solver-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const solver = item.getAttribute('data-solver');
        this.openSolver(solver);
      });
    });

    // Statistics & Distribution Buttons
    const btnStatEdit = document.getElementById('btn-stat-edit');
    if (btnStatEdit) {
      btnStatEdit.addEventListener('click', () => {
        this.switchView(this.state.activeView === 'list-editor' ? 'graph' : 'list-editor');
      });
    }

    const btnStat1var = document.getElementById('btn-stat-1var');
    if (btnStat1var) {
      btnStat1var.addEventListener('click', () => {
        this.openSolver('1var');
      });
    }

    const btnStat2var = document.getElementById('btn-stat-2var');
    if (btnStat2var) {
      btnStat2var.addEventListener('click', () => {
        this.openSolver('2var');
      });
    }

    const btnStatLinreg = document.getElementById('btn-stat-linreg');
    if (btnStatLinreg) {
      btnStatLinreg.addEventListener('click', () => {
        this.openSolver('linreg');
      });
    }

    const btnDistrNormalcdf = document.getElementById('btn-distr-normalcdf');
    if (btnDistrNormalcdf) {
      btnDistrNormalcdf.addEventListener('click', () => {
        this.openSolver('normalcdf');
      });
    }

    const btnDistrInvnorm = document.getElementById('btn-distr-invnorm');
    if (btnDistrInvnorm) {
      btnDistrInvnorm.addEventListener('click', () => {
        this.openSolver('invnorm');
      });
    }

    // List Editor Header Buttons
    const btnListClearAll = document.getElementById('btn-list-clear-all');
    if (btnListClearAll) {
      btnListClearAll.addEventListener('click', () => {
        this.state.L1 = Array(30).fill("");
        this.state.L2 = Array(30).fill("");
        this.state.L3 = Array(30).fill("");
        this.renderListEditor();
        this.speechManager.speak("All data lists cleared.");
        this.draw();
        this.focusListCell('L1', 0);
      });
    }

    const btnListBack = document.getElementById('btn-list-back');
    if (btnListBack) {
      btnListBack.addEventListener('click', () => {
        this.switchView('graph');
      });
    }

    // Graph Viewport Events
    this.canvas.addEventListener('focus', () => {
      if (this.state.traceModeActive) {
        const key = this.state.activeEquationKey;
        const text = this.state.equations[key].text;
        this.speechManager.speak(`Tracing ${key.toUpperCase()} equals ${text}. Use left and right arrow keys to trace, up and down arrows to switch equations.`);
        this.announceTraceCoordinates();
      } else {
        this.speechManager.speak('Graphing grid viewport. Use arrow keys to explore coordinates, or mouse click to snap cursor.');
        this.announceCoordinates();
      }
    });

    this.canvas.addEventListener('keydown', (e) => {
      if (this.traceFrozen) {
        e.preventDefault();
        return;
      }
      // Cancel sweep if user interacts
      if (this.state.sweepActive) {
        this.cancelAudioSweep();
      }

      if (this.state.traceModeActive) {
        let step = 0.2;
        if (e.shiftKey) {
          step = 1.0;
        }

        let moved = false;

        if (e.key === 'ArrowLeft') {
          this.state.cursor.x = Math.max(this.graphEngine.xMin, this.state.cursor.x - step);
          moved = true;
        } else if (e.key === 'ArrowRight') {
          this.state.cursor.x = Math.min(this.graphEngine.xMax, this.state.cursor.x + step);
          moved = true;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.cycleActiveEquation(-1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.cycleActiveEquation(1);
        }

        if (moved) {
          e.preventDefault();
          this.state.cursor.x = Math.round(this.state.cursor.x * 100) / 100;
          this.snapCursorToCurve(this.state.activeEquationKey);
          
          this.hideCanvasSolverResult();
          this.state.integrationShading.active = false;

          this.audioTraceEngine.start();
          this.updateTraceAudioForCurrentPoint();
          this.checkAndTriggerMilestoneEvents();
          
          this.draw();
          this.announceTraceCoordinates();
          this.resetTraceInactivityTimer();
        }
        return;
      }

      // Normal free-floating crosshair controls
      let step = 0.1;
      if (e.shiftKey) {
        step = 1.0; // Coarser stepping
      }

      let moved = false;

      switch (e.key) {
        case 'ArrowLeft':
          this.state.cursor.x = Math.max(this.graphEngine.xMin, this.state.cursor.x - step);
          moved = true;
          break;
        case 'ArrowRight':
          this.state.cursor.x = Math.min(this.graphEngine.xMax, this.state.cursor.x + step);
          moved = true;
          break;
        case 'ArrowUp':
          this.state.cursor.y = Math.min(this.graphEngine.yMax, this.state.cursor.y + step);
          moved = true;
          break;
        case 'ArrowDown':
          this.state.cursor.y = Math.max(this.graphEngine.yMin, this.state.cursor.y - step);
          moved = true;
          break;
      }

      if (moved) {
        e.preventDefault();
        // Constrain values to floating point precision
        this.state.cursor.x = Math.round(this.state.cursor.x * 100) / 100;
        this.state.cursor.y = Math.round(this.state.cursor.y * 100) / 100;

        // Snap Y to a graphed function if it's evaluated near the cursor
        this.snapCursorYToActiveFunction();

        this.hideCanvasSolverResult();
        this.state.integrationShading.active = false;

        this.draw();
        this.announceCoordinates();
      }
    });

    // Mouse Navigation on Canvas
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.traceFrozen) {
        e.preventDefault();
        return;
      }
      if (this.state.sweepActive) {
        this.cancelAudioSweep();
      }

      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const graphCoords = this.graphEngine.pixelToMath(clickX, clickY, this.canvas.width, this.canvas.height);
      
      this.state.cursor.x = Math.round(graphCoords.x * 10) / 10;
      
      if (this.state.traceModeActive) {
        this.snapCursorToCurve(this.state.activeEquationKey);
        this.canvas.focus();
        this.draw();

        this.audioTraceEngine.start();
        this.updateTraceAudioForCurrentPoint();
        this.checkAndTriggerMilestoneEvents();
        this.announceTraceCoordinates();
        this.resetTraceInactivityTimer();
      } else {
        this.state.cursor.y = Math.round(graphCoords.y * 10) / 10;
        this.snapCursorYToActiveFunction();
        this.canvas.focus();
        this.draw();
        this.announceCoordinates();
      }
    });

    // Keyboard Shortcuts (Global)
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && activeEl.tagName === 'INPUT';

      // Toggle Help with '?' (if not currently writing equations)
      if (!isInputFocused && e.key === '?') {
        e.preventDefault();
        this.toggleHelp(true);
      }

      // Hear Graph (automated sweep) with 'H'
      if (!isInputFocused && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        this.startAudioSweep();
      }

      // Toggle Trace Mode with 'Alt + T'
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        this.toggleTraceMode();
        this.canvas.focus();
      }

      // Draw Tangent Line with 'Alt + G'
      if (e.altKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        this.openSolver('tangent');
      }

      // Shift+S: Zoom Standard
      if (!isInputFocused && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.zoomStandard();
      }

      // Shift+F: Zoom Fit
      if (!isInputFocused && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        this.zoomFit();
      }

      // T: Toggle Table View
      if (!isInputFocused && e.key.toLowerCase() === 't') {
        e.preventDefault();
        this.toggleTableView();
      }

      // C: Toggle Solver Overlay
      if (!isInputFocused && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        this.openSolverMenuDirectly();
      }

      // Alt+M: Toggle Angle Mode
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const nextMode = this.state.angleMode === 'rad' ? 'deg' : 'rad';
        this.setAngleMode(nextMode);
      }

      // Alt+P: Cycle Decimal Precision
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const precisions = ['float', 'fix2', 'fix3', 'fix4'];
        const idx = precisions.indexOf(this.state.precisionMode);
        const nextIdx = (idx + 1) % precisions.length;
        const nextPrec = precisions[nextIdx];
        const selectPrecision = document.getElementById('select-precision');
        if (selectPrecision) {
          selectPrecision.value = nextPrec;
          selectPrecision.dispatchEvent(new Event('change'));
        }
      }

      // Alt+E: Toggle List Editor Spreadsheet
      if (e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        this.switchView(this.state.activeView === 'list-editor' ? 'graph' : 'list-editor');
      }

      // Alt+D: Open invNorm solver directly
      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.openSolver('invnorm');
      }

      // S: Speak Stats Summary when solver overlay is open and focused
      if (!isInputFocused && e.key.toLowerCase() === 's' && !this.solverOverlay.classList.contains('hidden') && this.currentStatsSpeechSummary) {
        e.preventDefault();
        this.speakSummaryLineByLine(this.currentStatsSpeechSummary);
      }

      // Close overlays with Escape
      if (e.key === 'Escape') {
        let closedOverlay = false;
        if (!this.overlay.classList.contains('hidden')) {
          e.preventDefault();
          this.toggleHelp(false);
          closedOverlay = true;
        }
        if (!this.solverOverlay.classList.contains('hidden')) {
          e.preventDefault();
          this.closeSolverOverlay();
          closedOverlay = true;
        }
        if (!closedOverlay && this.state.activeView === 'list-editor') {
          e.preventDefault();
          this.switchView('graph');
        }
      }
    });

    // Help UI Events
    document.getElementById('btn-help').addEventListener('click', () => this.toggleHelp(true));
    document.getElementById('btn-close-help').addEventListener('click', () => this.toggleHelp(false));
    
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.toggleHelp(false);
      }
    });

    // Data Table Navigation Key Listeners
    const tableEl = document.getElementById('dataTable');
    tableEl.addEventListener('keydown', (e) => {
      if (!this.state.tableModeActive) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.state.tableCurrentRowIndex > 0) {
          this.state.tableCurrentRowIndex--;
          this.renderTable();
          this.announceTableRow(this.state.tableCurrentRowIndex);
          const highlightedRow = document.getElementById(`table-row-${this.state.tableCurrentRowIndex}`);
          if (highlightedRow) {
            highlightedRow.scrollIntoView({ block: 'nearest' });
          }
        } else {
          this.speechManager.speak("Top of table.");
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const rowCount = 20;
        if (this.state.tableCurrentRowIndex < rowCount - 1) {
          this.state.tableCurrentRowIndex++;
          this.renderTable();
          this.announceTableRow(this.state.tableCurrentRowIndex);
          const highlightedRow = document.getElementById(`table-row-${this.state.tableCurrentRowIndex}`);
          if (highlightedRow) {
            highlightedRow.scrollIntoView({ block: 'nearest' });
          }
        } else {
          this.speechManager.speak("End of table.");
        }
      }
    });

    tableEl.addEventListener('focus', () => {
      this.announceTableRow(this.state.tableCurrentRowIndex);
    });
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.recalculateAllPoints();
    this.draw();
  }

  recalculateAllPoints() {
    for (const key of Object.keys(this.state.equations)) {
      this.calculateEquationPoints(key);
    }
  }

  calculateEquationPoints(key) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const rawValue = this.state.equations[key].text;

    if (key.startsWith('y')) {
      const res = this.graphEngine.generateYPoints(rawValue, width, height, this.state.angleMode);
      this.state.equations[key].points = res.points;
      this.state.equations[key].compiled = res.compiled;
      this.state.equations[key].error = res.error;

      const inputEl = document.getElementById(`input-${key}`);
      if (inputEl) {
        if (rawValue.trim() !== '' && res.error) {
          inputEl.style.borderColor = '#FF0000';
          inputEl.style.boxShadow = '0 0 10px #FF0000';
        } else {
          inputEl.style.borderColor = '';
          inputEl.style.boxShadow = '';
        }
      }
    } else if (key.startsWith('x')) {
      const res = this.graphEngine.generateXPoint(rawValue, width, this.state.angleMode);
      this.state.equations[key].pixelX = res.pixelX;
      this.state.equations[key].mathX = res.mathX;
      this.state.equations[key].error = res.error;

      const inputEl = document.getElementById(`input-${key}`);
      if (rawValue.trim() !== '' && res.error) {
        inputEl.style.borderColor = '#FF0000';
        inputEl.style.boxShadow = '0 0 10px #FF0000';
      } else {
        inputEl.style.borderColor = '';
        inputEl.style.boxShadow = '';
      }
    }
  }

  updateEquationState(key, rawValue) {
    if (key !== 'y_tangent' && this.state.equations.y_tangent && this.state.equations.y_tangent.active) {
      this.state.equations.y_tangent.active = false;
      this.state.equations.y_tangent.points = [];
      this.state.equations.y_tangent.compiled = null;
      this.state.equations.y_tangent.text = '';
    }
    this.state.equations[key].text = rawValue;
    this.calculateEquationPoints(key);

    // Cancel existing debounce timer for this key
    if (this.errorSpeechTimers[key]) {
      clearTimeout(this.errorSpeechTimers[key]);
      delete this.errorSpeechTimers[key];
    }

    const eq = this.state.equations[key];
    if (rawValue.trim() !== '' && eq.error) {
      // Debounce speaking the error for 1000ms
      this.errorSpeechTimers[key] = setTimeout(() => {
        this.speechManager.speak(`Error in ${key.toUpperCase()}: ${eq.error}`, true);
      }, 1000);
    }
  }

  snapCursorYToActiveFunction() {
    for (const key of ['y1', 'y2', 'y3', 'y4']) {
      const compiled = this.state.equations[key].compiled;
      if (compiled) {
        try {
          const yVal = compiled.evaluate({ x: this.state.cursor.x });
          const mathY = this.graphEngine.coerceToNumber(yVal);
          if (typeof mathY === 'number' && !isNaN(mathY) && isFinite(mathY)) {
            this.state.cursor.y = Math.round(mathY * 100) / 100;
            return;
          }
        } catch {
          // ignore evaluation error for cursor snap
        }
      }
    }
  }

  announceEquationsCompile() {
    let msg = "";
    let activeCurves = [];
    let errors = [];

    for (const key of ['y1', 'y2', 'y3', 'y4', 'x1', 'x2']) {
      const eq = this.state.equations[key];
      if (eq.text.trim() !== '') {
        if (eq.error) {
          errors.push(`${key.toUpperCase()}: ${eq.error}`);
        } else {
          activeCurves.push(key.toUpperCase());
        }
      }
    }

    if (errors.length > 0) {
      msg += "Compilation errors found. " + errors.join('. ') + ". ";
    }
    if (activeCurves.length > 0) {
      msg += "Successfully compiled: " + activeCurves.join(', ') + ".";
    } else if (errors.length === 0) {
      msg += "No active equations.";
    }

    this.speechManager.speak(msg, true);
  }

  formatNumberValue(val) {
    if (typeof val !== 'number' || isNaN(val)) return NaN;
    if (!isFinite(val)) return val;
    if (this.state.precisionMode === 'float') {
      return parseFloat(val.toFixed(6));
    }
    const prec = parseInt(this.state.precisionMode.slice(3));
    return parseFloat(val.toFixed(prec));
  }

  formatNumberSpeech(val) {
    if (typeof val !== 'number' || isNaN(val)) return "undefined";
    if (val === Infinity) return "infinity";
    if (val === -Infinity) return "negative infinity";
    
    let formattedVal;
    if (this.state.precisionMode === 'float') {
      formattedVal = parseFloat(val.toFixed(6));
    } else {
      const prec = parseInt(this.state.precisionMode.slice(3));
      formattedVal = val.toFixed(prec);
    }
    
    const valStr = formattedVal.toString();
    const parts = valStr.split('.');
    const integer = parseInt(parts[0]);
    const decimal = parts[1];

    let spoken = integer < 0 ? `negative ${Math.abs(integer)}` : `${integer}`;
    if (isNaN(integer)) {
      spoken = valStr.startsWith('-') ? "negative 0" : "0";
    }
    if (decimal) {
      spoken += " point ";
      for (let char of decimal) {
        spoken += char + " ";
      }
    }
    return spoken.trim();
  }

  announceCoordinates() {
    const x = this.state.cursor.x;
    const y = this.state.cursor.y;

    const formatFooterVal = (val) => {
      if (isNaN(val)) return 'undefined';
      if (!isFinite(val)) return val > 0 ? 'infinity' : 'negative infinity';
      if (this.state.precisionMode === 'float') {
        return parseFloat(val.toFixed(6)).toString();
      }
      const prec = parseInt(this.state.precisionMode.slice(3));
      return val.toFixed(prec);
    };

    // Direct UI output
    const coordEl = document.getElementById('footer-coordinates');
    if (coordEl) {
      coordEl.textContent = `Cursor: X = ${formatFooterVal(x)}, Y = ${formatFooterVal(y)}`;
    }

    const ySpeech = this.formatNumberSpeech(y);
    const speechText = `X equals ${this.formatNumberSpeech(x)}, Y equals ${ySpeech}`;
    
    // Announce to screen reader element (ARIA live assertive)
    const srAnnouncer = document.getElementById('graph-announcement');
    if (srAnnouncer) {
      srAnnouncer.textContent = speechText;
    }

    // Announce through synthetic voice manager
    this.speechManager.speak(speechText, true);
  }

  toggleHelp(show) {
    if (show) {
      this.overlay.classList.remove('hidden');
      document.getElementById('btn-close-help').focus();
      this.speechManager.speak("Keyboard commands dialog opened. Press tab to cycle options, press escape to close.");
    } else {
      this.overlay.classList.add('hidden');
      document.getElementById('btn-help').focus();
      this.speechManager.speak("Dialog closed.");
    }
  }

  updateActiveEquationUI() {
    const keys = ['y1', 'y2', 'y3', 'y4', 'x1', 'x2'];
    keys.forEach(key => {
      const input = document.getElementById(`input-${key}`);
      if (input) {
        const group = input.closest('.input-group');
        if (group) {
          if (key === this.state.activeEquationKey) {
            group.classList.add('active-eq');
          } else {
            group.classList.remove('active-eq');
          }
        }
      }
    });
  }

  startAudioSweep() {
    if (this.state.sweepActive) {
      this.cancelAudioSweep();
    }

    let key = this.state.activeEquationKey;
    let eq = null;
    let compiled = null;

    if (key && key.startsWith('y') && this.state.equations[key]) {
      eq = this.state.equations[key];
      compiled = eq.compiled;
    }

    if (!compiled) {
      const firstCompiled = ['y1', 'y2', 'y3', 'y4'].find(k => this.state.equations[k].compiled);
      if (firstCompiled) {
        key = firstCompiled;
        this.state.activeEquationKey = key;
        this.updateActiveEquationUI();
        eq = this.state.equations[key];
        compiled = eq.compiled;
      }
    }

    // If still no compiled equation and no list data, we can't sweep
    const hasListData = this.state.L1 && this.state.L2 && this.state.L1.some(v => v !== "") && this.state.L2.some(v => v !== "");
    if (!compiled && !hasListData) {
      this.speechManager.speak("No equation or data list available to hear.");
      return;
    }

    this.state.sweepActive = true;
    this.audioTraceEngine.start();

    this.originalCursor = { x: this.state.cursor.x, y: this.state.cursor.y };

    const sweepDuration = 2500; // 2.5 seconds
    const startTime = performance.now();

    const xMin = this.graphEngine.xMin;
    const xMax = this.graphEngine.xMax;
    const yMin = this.graphEngine.yMin;
    const yMax = this.graphEngine.yMax;

    let prevXVal = null;
    let prevYVal = null;
    let prevFDouble = null;

    // Track popped status for each list element
    const poppedPoints = new Array(this.state.L1.length).fill(false);

    const tick = (now) => {
      if (!this.state.sweepActive) return;

      const elapsed = now - startTime;
      if (elapsed >= sweepDuration) {
        this.audioTraceEngine.stop();
        this.state.sweepActive = false;

        // Reset to original position
        this.state.cursor.x = this.originalCursor.x;
        this.state.cursor.y = this.originalCursor.y;
        this.draw();
        this.announceCoordinates();
        return;
      }

      const tNorm = elapsed / sweepDuration;
      const x = xMin + tNorm * (xMax - xMin);

      // Check scatter plot crossings
      if (this.state.L1 && this.state.L2) {
        for (let i = 0; i < Math.min(this.state.L1.length, this.state.L2.length); i++) {
          const xData = parseFloat(this.state.L1[i]);
          const yData = parseFloat(this.state.L2[i]);
          if (!isNaN(xData) && !isNaN(yData) && !poppedPoints[i]) {
            if (x >= xData) {
              poppedPoints[i] = true;
              this.audioTraceEngine.playScatterPop();
            }
          }
        }
      }

      try {
        if (compiled) {
          const rawY = compiled.evaluate({ x });
          const y = this.graphEngine.coerceToNumber(rawY);

          if (typeof y === 'number' && !isNaN(y)) {
            let yToUse = y;
            if (y > yMax) yToUse = Infinity;
            else if (y < yMin) yToUse = -Infinity;

            this.state.cursor.x = Math.round(x * 100) / 100;
            this.state.cursor.y = isFinite(yToUse) ? Math.round(yToUse * 100) / 100 : yToUse;
            this.draw();

            if (isFinite(yToUse)) {
              this.audioTraceEngine.setMuted(false);
              const freq = SonificationMath.mapYToFrequency(yToUse, yMin, yMax);
              const pan = SonificationMath.mapXToPan(x, xMin, xMax);
              const isNegative = yToUse < 0;

              let tangentFreq = null;
              if (this.state.equations.y_tangent && this.state.equations.y_tangent.active && this.state.equations.y_tangent.compiled) {
                try {
                  const rawYTangent = this.state.equations.y_tangent.compiled.evaluate({ x });
                  const yTangent = this.graphEngine.coerceToNumber(rawYTangent);
                  if (typeof yTangent === 'number' && !isNaN(yTangent) && isFinite(yTangent)) {
                    tangentFreq = SonificationMath.mapYToFrequency(yTangent, yMin, yMax);
                  }
                } catch {}
              }

              const fDouble = CalcEngine.secondDerivative(compiled, x, this.state.angleMode);
              const isConcaveDown = !isNaN(fDouble) && fDouble < 0;
              this.audioTraceEngine.setVibrato(isConcaveDown);

              if (prevFDouble !== null && !isNaN(prevFDouble) && !isNaN(fDouble)) {
                if ((prevFDouble < 0 && fDouble > 0) || (prevFDouble > 0 && fDouble < 0)) {
                  this.audioTraceEngine.playInflectionPointChime();
                }
              }
              prevFDouble = fDouble;

              this.audioTraceEngine.updateTracePoint(freq, pan, isNegative, tangentFreq);

              // Click pop on axis crossings
              if (prevXVal !== null && prevYVal !== null && isFinite(prevYVal)) {
                if (prevXVal * x <= 0 && prevXVal !== 0) {
                  this.audioTraceEngine.playClick();
                } else if (prevYVal * yToUse <= 0 && prevYVal !== 0) {
                  this.audioTraceEngine.playClick();
                }
              }
            } else {
              this.audioTraceEngine.setMuted(true);
            }

            prevXVal = x;
            prevYVal = yToUse;
          } else {
            this.audioTraceEngine.setMuted(true);
            this.state.cursor.x = Math.round(x * 100) / 100;
            this.state.cursor.y = NaN;
            this.draw();
            prevXVal = x;
            prevYVal = NaN;
          }
        } else {
          // If no compiled equation, just update cursor X position for visualization
          this.state.cursor.x = Math.round(x * 100) / 100;
          this.state.cursor.y = 0;
          this.draw();
          this.audioTraceEngine.setMuted(true);
        }
      } catch (err) {
        this.audioTraceEngine.setMuted(true);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  cancelAudioSweep() {
    this.state.sweepActive = false;
    this.audioTraceEngine.stop();
  }

  toggleTraceMode() {
    if (this.state.traceModeActive) {
      this.state.traceModeActive = false;
      document.getElementById('footer-trace-mode').classList.add('hidden');
      this.audioTraceEngine.stop();
      this.speechManager.speak("Trace mode off.");
    } else {
      let key = this.state.activeEquationKey;
      if (!key.startsWith('y') || !this.state.equations[key].compiled) {
        const firstCompiled = ['y1', 'y2', 'y3', 'y4'].find(k => this.state.equations[k].compiled);
        if (firstCompiled) {
          key = firstCompiled;
          this.state.activeEquationKey = key;
          this.updateActiveEquationUI();
        } else {
          this.speechManager.speak("No equation available to trace.");
          return;
        }
      }

      this.state.traceModeActive = true;
      document.getElementById('footer-trace-mode').classList.remove('hidden');

      const eqText = this.state.equations[key].text;
      this.speechManager.speak(`Trace mode on. Tracing ${key.toUpperCase()} equals ${eqText}`);

      // Snap to curve
      this.snapCursorToCurve(key);
      this.draw();

      // Initialize previous Y value for root tracking
      this.previousTraceX = this.state.cursor.x;
      this.previousTraceY = this.state.cursor.y;

      this.audioTraceEngine.start();
      this.updateTraceAudioForCurrentPoint();
      this.announceTraceCoordinates();
      this.resetTraceInactivityTimer();
    }
  }

  snapCursorToCurve(key) {
    const eq = this.state.equations[key];
    if (eq && eq.compiled) {
      try {
        const yVal = eq.compiled.evaluate({ x: this.state.cursor.x });
        const mathY = this.graphEngine.coerceToNumber(yVal);
        if (typeof mathY === 'number' && !isNaN(mathY)) {
          if (mathY > this.graphEngine.yMax) {
            this.state.cursor.y = Infinity;
          } else if (mathY < this.graphEngine.yMin) {
            this.state.cursor.y = -Infinity;
          } else {
            this.state.cursor.y = Math.round(mathY * 100) / 100;
          }
        } else {
          this.state.cursor.y = mathY; // NaN, Infinity, -Infinity
        }
      } catch {
        this.state.cursor.y = NaN;
      }
    }
  }

  updateTraceAudioForCurrentPoint() {
    const x = this.state.cursor.x;
    const y = this.state.cursor.y;

    if (isNaN(y) || !isFinite(y)) {
      this.audioTraceEngine.setMuted(true);
      return;
    }

    this.audioTraceEngine.setMuted(false);

    const xMin = this.graphEngine.xMin;
    const xMax = this.graphEngine.xMax;
    const yMin = this.graphEngine.yMin;
    const yMax = this.graphEngine.yMax;

    const freq = SonificationMath.mapYToFrequency(y, yMin, yMax);
    const pan = SonificationMath.mapXToPan(x, xMin, xMax);
    const isNegative = y < 0;

    // Calc tangent freq if active
    let tangentFreq = null;
    if (this.state.equations.y_tangent && this.state.equations.y_tangent.active && this.state.equations.y_tangent.compiled) {
      try {
        const rawYTangent = this.state.equations.y_tangent.compiled.evaluate({ x });
        const yTangent = this.graphEngine.coerceToNumber(rawYTangent);
        if (typeof yTangent === 'number' && !isNaN(yTangent) && isFinite(yTangent)) {
          tangentFreq = SonificationMath.mapYToFrequency(yTangent, yMin, yMax);
        }
      } catch {}
    }

    // Concavity vibrato modulation
    const key = this.state.activeEquationKey;
    const eq = this.state.equations[key];
    if (eq && eq.compiled) {
      const fDouble = CalcEngine.secondDerivative(eq.compiled, x, this.state.angleMode);
      const isConcaveDown = !isNaN(fDouble) && fDouble < 0;
      this.audioTraceEngine.setVibrato(isConcaveDown);
    }

    this.audioTraceEngine.updateTracePoint(freq, pan, isNegative, tangentFreq);
  }

  resetTraceInactivityTimer() {
    if (this.traceInactivityTimer) {
      clearTimeout(this.traceInactivityTimer);
    }
    this.traceInactivityTimer = setTimeout(() => {
      if (this.state.traceModeActive && !this.state.sweepActive) {
        this.audioTraceEngine.stop();
      }
    }, 1200);
  }

  cycleActiveEquation(direction) {
    const keys = ['y1', 'y2', 'y3', 'y4'];
    const currentIndex = keys.indexOf(this.state.activeEquationKey);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    for (let i = 0; i < 4; i++) {
      nextIndex = (nextIndex + direction + 4) % 4;
      const key = keys[nextIndex];
      if (this.state.equations[key].compiled) {
        this.state.activeEquationKey = key;
        this.updateActiveEquationUI();

        const eqText = this.state.equations[key].text;
        this.speechManager.speak(`Tracing ${key.toUpperCase()} equals ${eqText}`);

        this.snapCursorToCurve(key);
        this.previousTraceX = this.state.cursor.x;
        this.previousTraceY = this.state.cursor.y;

        this.audioTraceEngine.start();
        this.updateTraceAudioForCurrentPoint();
        this.draw();
        this.announceTraceCoordinates();
        this.resetTraceInactivityTimer();
        return;
      }
    }

    this.speechManager.speak("No other equations to trace.");
  }

  checkAndTriggerMilestoneEvents() {
    const key = this.state.activeEquationKey;
    const eq = this.state.equations[key];
    if (!eq || !eq.compiled) return;

    const x = this.state.cursor.x;
    const y = this.state.cursor.y;

    if (isNaN(y) || !isFinite(y)) {
      this.previousTraceX = x;
      this.previousTraceY = null;
      this.lastCriticalPointType = null;
      return;
    }

    let milestoneTriggered = false;

    // 1. Zero crossing
    if (this.previousTraceY !== null && !isNaN(this.previousTraceY) && isFinite(this.previousTraceY) && this.previousTraceX !== undefined && this.previousTraceX !== null) {
      const signChange = (this.previousTraceY < 0 && y >= 0) || (this.previousTraceY > 0 && y <= 0);
      if (signChange || y === 0) {
        // Validate crossing using bisection to distinguish real root from asymptote
        let isAsymptote = false;
        let left = Math.min(this.previousTraceX, x);
        let right = Math.max(this.previousTraceX, x);

        for (let i = 0; i < 5; i++) {
          const mid = (left + right) / 2;
          try {
            const yMidRaw = eq.compiled.evaluate({ x: mid });
            const yMid = this.graphEngine.coerceToNumber(yMidRaw);

            if (isNaN(yMid) || !isFinite(yMid) || Math.abs(yMid) > 100) {
              isAsymptote = true;
              break;
            }

            if (yMid === 0) break;

            const yLeftRaw = eq.compiled.evaluate({ x: left });
            const yLeft = this.graphEngine.coerceToNumber(yLeftRaw);

            if ((yLeft < 0 && yMid < 0) || (yLeft > 0 && yMid > 0)) {
              left = mid;
            } else {
              right = mid;
            }
          } catch {
            isAsymptote = true;
            break;
          }
        }

        if (!isAsymptote) {
          this.audioTraceEngine.playCriticalPointChime();
          this.lastCriticalPointType = 'root';
          milestoneTriggered = true;
        }
      }
    }

    // 2. Inflection point tracking
    if (this.previousTraceX !== undefined && this.previousTraceX !== null && this.previousTraceY !== null && !isNaN(this.previousTraceY) && isFinite(this.previousTraceY)) {
      const prevX = this.previousTraceX;
      const currentX = x;
      if (prevX !== currentX) {
        const fDoublePrev = CalcEngine.secondDerivative(eq.compiled, prevX, this.state.angleMode);
        const fDoubleCurrent = CalcEngine.secondDerivative(eq.compiled, currentX, this.state.angleMode);
        if (!isNaN(fDoublePrev) && !isNaN(fDoubleCurrent) && isFinite(fDoublePrev) && isFinite(fDoubleCurrent)) {
          if ((fDoublePrev < 0 && fDoubleCurrent > 0) || (fDoublePrev > 0 && fDoubleCurrent < 0)) {
            // Find the exact inflection point using bisection
            const infX = CalcEngine.findInflectionPoint(eq.compiled, prevX, currentX, this.state.angleMode);
            const infY = this.graphEngine.coerceToNumber(CalcEngine.evaluateAt(eq.compiled, infX, this.state.angleMode));

            // Trigger Milestone double-chime
            this.audioTraceEngine.playInflectionPointChime();
            
            // Momentarily freeze cursor movement and announce
            this.traceFrozen = true;
            this.state.cursor.x = Math.round(infX * 100) / 100;
            this.state.cursor.y = Math.round(infY * 100) / 100;
            this.draw();

            // Set a timer to unfreeze cursor after 1.5s
            setTimeout(() => {
              this.traceFrozen = false;
            }, 1500);

            // Announce inflection point
            const infXSpeech = this.formatNumberSpeech(Math.round(infX * 100) / 100);
            const infYSpeech = this.formatNumberSpeech(Math.round(infY * 100) / 100);
            this.speechManager.speak(`Inflection point detected at X equals ${infXSpeech}, Y equals ${infYSpeech}. Cursor frozen for 1.5 seconds.`, true);
            
            this.previousTraceX = infX;
            this.previousTraceY = infY;
            this.lastCriticalPointType = 'inflection';
            return;
          }
        }
      }
    }

    this.previousTraceX = x;
    this.previousTraceY = y;

    if (milestoneTriggered) return;

    // 3. Extremum
    const critPoint = SonificationMath.checkCriticalPoint(x, eq.compiled, this.graphEngine);
    if (critPoint) {
      this.audioTraceEngine.playCriticalPointChime();
      this.lastCriticalPointType = critPoint.type;
    } else {
      this.lastCriticalPointType = null;
    }
  }

  announceTraceCoordinates() {
    const x = this.state.cursor.x;
    const y = this.state.cursor.y;

    const formatFooterVal = (val) => {
      if (isNaN(val)) return 'undefined';
      if (!isFinite(val)) return val > 0 ? 'infinity' : 'negative infinity';
      if (this.state.precisionMode === 'float') {
        return parseFloat(val.toFixed(6)).toString();
      }
      const prec = parseInt(this.state.precisionMode.slice(3));
      return val.toFixed(prec);
    };

    const coordEl = document.getElementById('footer-coordinates');
    if (coordEl) {
      coordEl.textContent = `Cursor: X = ${formatFooterVal(x)}, Y = ${formatFooterVal(y)}`;
    }

    let ySpeech = this.formatNumberSpeech(y);
    let prefix = "";
    if (this.lastCriticalPointType) {
      prefix = `${this.lastCriticalPointType}. `;
    }

    const speechText = `${prefix}X equals ${this.formatNumberSpeech(x)}, Y equals ${ySpeech}`;

    const srAnnouncer = document.getElementById('graph-announcement');
    if (srAnnouncer) {
      srAnnouncer.textContent = speechText;
    }

    this.speechManager.speak(speechText, true);
  }

  zoomStandard() {
    this.graphEngine.xMin = -10;
    this.graphEngine.xMax = 10;
    this.graphEngine.xScl = 1;
    this.graphEngine.yMin = -10;
    this.graphEngine.yMax = 10;
    this.graphEngine.yScl = 1;

    document.getElementById('input-xmin').value = -10;
    document.getElementById('input-xmax').value = 10;
    document.getElementById('input-xscl').value = 1;
    document.getElementById('input-ymin').value = -10;
    document.getElementById('input-ymax').value = 10;
    document.getElementById('input-yscl').value = 1;

    this.state.integrationShading.active = false;
    this.hideCanvasSolverResult();
    this.recalculateAllPoints();
    
    if (this.state.tableModeActive) {
      this.renderTable();
    } else {
      this.draw();
    }
    this.speechManager.speak("Zoom standard complete. Viewport reset to negative 10 to 10.");
  }

  zoomFit() {
    let minY = Infinity;
    let maxY = -Infinity;
    let found = false;

    for (const key of ['y1', 'y2', 'y3', 'y4']) {
      const eq = this.state.equations[key];
      if (eq.compiled && eq.points) {
        for (const pt of eq.points) {
          if (typeof pt.mathY === 'number' && !isNaN(pt.mathY) && isFinite(pt.mathY)) {
            if (pt.mathY < minY) minY = pt.mathY;
            if (pt.mathY > maxY) maxY = pt.mathY;
            found = true;
          }
        }
      }
    }

    if (!found) {
      this.speechManager.speak("No active equations with valid points to fit.");
      return;
    }

    const padding = (maxY - minY) * 0.1 || 1;
    this.graphEngine.yMin = minY - padding;
    this.graphEngine.yMax = maxY + padding;
    
    const yRange = this.graphEngine.yMax - this.graphEngine.yMin;
    this.graphEngine.yScl = Math.max(1, Math.round(yRange / 10));

    document.getElementById('input-ymin').value = parseFloat(this.graphEngine.yMin.toFixed(2));
    document.getElementById('input-ymax').value = parseFloat(this.graphEngine.yMax.toFixed(2));
    document.getElementById('input-yscl').value = parseFloat(this.graphEngine.yScl.toFixed(2));

    this.state.integrationShading.active = false;
    this.hideCanvasSolverResult();
    this.recalculateAllPoints();
    
    if (this.state.tableModeActive) {
      this.renderTable();
    } else {
      this.draw();
    }
    
    const yMinSp = this.formatNumberSpeech(this.graphEngine.yMin);
    const yMaxSp = this.formatNumberSpeech(this.graphEngine.yMax);
    this.speechManager.speak(`Zoom fit complete. Y minimum is now ${yMinSp}, Y maximum is now ${yMaxSp}.`);
  }

  setAngleMode(mode) {
    this.state.angleMode = mode;
    const btnRad = document.getElementById('btn-mode-rad');
    const btnDeg = document.getElementById('btn-mode-deg');
    if (mode === 'rad') {
      btnRad.classList.add('active');
      btnRad.setAttribute('aria-pressed', 'true');
      btnDeg.classList.remove('active');
      btnDeg.setAttribute('aria-pressed', 'false');
      this.speechManager.speak("Angle mode set to radians.");
    } else {
      btnDeg.classList.add('active');
      btnDeg.setAttribute('aria-pressed', 'true');
      btnRad.classList.remove('active');
      btnRad.setAttribute('aria-pressed', 'false');
      this.speechManager.speak("Angle mode set to degrees.");
    }
    this.recalculateAllPoints();
    if (this.state.tableModeActive) {
      this.renderTable();
    } else {
      this.draw();
    }
  }

  switchView(viewName) {
    const graphWrapper = document.getElementById('graph-view-wrapper');
    const tableWrapper = document.getElementById('table-view-wrapper');
    const listEditorWrapper = document.getElementById('list-editor-wrapper');
    const btnToggle = document.getElementById('btn-toggle-table');
    
    // Hide all
    if (graphWrapper) graphWrapper.classList.add('hidden');
    if (tableWrapper) tableWrapper.classList.add('hidden');
    if (listEditorWrapper) listEditorWrapper.classList.add('hidden');
    
    // Deactivate trace if active and leaving graph
    if (viewName !== 'graph' && this.state.traceModeActive) {
      this.toggleTraceMode();
    }
    
    this.state.activeView = viewName;

    if (viewName === 'graph') {
      this.state.tableModeActive = false;
      if (graphWrapper) graphWrapper.classList.remove('hidden');
      if (btnToggle) {
        btnToggle.textContent = "Table View (T)";
        btnToggle.setAttribute('aria-pressed', 'false');
      }
      this.canvas.focus();
      this.draw();
      this.speechManager.speak("Switched to graph view.");
    } else if (viewName === 'table') {
      this.state.tableModeActive = true;
      this.state.tableCurrentRowIndex = 0;
      if (tableWrapper) tableWrapper.classList.remove('hidden');
      if (btnToggle) {
        btnToggle.textContent = "Graph View (T)";
        btnToggle.setAttribute('aria-pressed', 'true');
      }
      this.renderTable();
      const dataTable = document.getElementById('dataTable');
      if (dataTable) dataTable.focus();
      this.speechManager.speak("Switched to table view. Use up and down arrow keys to navigate table rows.");
    } else if (viewName === 'list-editor') {
      this.state.tableModeActive = false;
      if (listEditorWrapper) listEditorWrapper.classList.remove('hidden');
      this.renderListEditor();
      this.speechManager.speak("Switched to list editor. Columns List 1, List 2, and List 3. Use arrow keys to navigate cells. Type numbers and press Enter to save.");
      this.focusListCell('L1', 0);
    }
  }

  toggleTableView() {
    if (this.state.activeView === 'table') {
      this.switchView('graph');
    } else {
      this.switchView('table');
    }
  }

  renderListEditor() {
    const listEditorBody = document.getElementById('list-editor-body');
    if (!listEditorBody) return;
    listEditorBody.innerHTML = '';

    const rowCount = this.state.L1.length;
    for (let r = 0; r < rowCount; r++) {
      const tr = document.createElement('tr');
      tr.id = `list-row-${r}`;

      // Columns L1, L2, L3
      for (const col of ['L1', 'L2', 'L3']) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'list-cell-input';
        input.setAttribute('data-col', col);
        input.setAttribute('data-row', r);
        input.value = this.state[col][r];
        
        const colLabel = col === 'L1' ? 'List 1' : col === 'L2' ? 'List 2' : 'List 3';
        input.setAttribute('aria-label', `${colLabel}, row ${r + 1}, value is ${this.state[col][r] || "empty"}`);
        
        td.appendChild(input);
        tr.appendChild(td);
      }
      listEditorBody.appendChild(tr);
    }

    // Attach listeners
    const inputs = listEditorBody.querySelectorAll('.list-cell-input');
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        const col = input.getAttribute('data-col');
        const row = parseInt(input.getAttribute('data-row'));
        const val = input.value.trim();
        const colName = col === 'L1' ? 'List 1' : col === 'L2' ? 'List 2' : 'List 3';
        const valSpeech = val !== "" ? `value is ${this.formatNumberSpeech(parseFloat(val))}` : "is empty";
        this.speechManager.speak(`${colName}, row ${row + 1}, ${valSpeech}`);
      });

      input.addEventListener('change', () => {
        const col = input.getAttribute('data-col');
        const row = parseInt(input.getAttribute('data-row'));
        const valStr = input.value.trim();
        if (valStr === "") {
          this.state[col][row] = "";
        } else {
          const valNum = parseFloat(valStr);
          if (!isNaN(valNum)) {
            this.state[col][row] = valNum;
          } else {
            // Revert
            input.value = this.state[col][row];
            this.speechManager.speak("Invalid number entered", true);
          }
        }
        this.draw();
      });

      input.addEventListener('keydown', (e) => {
        const col = input.getAttribute('data-col');
        const row = parseInt(input.getAttribute('data-row'));
        let targetCol = col;
        let targetRow = row;

        if (e.key === 'Enter') {
          e.preventDefault();
          const valStr = input.value.trim();
          if (valStr === "") {
            this.state[col][row] = "";
          } else {
            const valNum = parseFloat(valStr);
            if (!isNaN(valNum)) {
              this.state[col][row] = valNum;
            }
          }
          this.draw();

          targetRow = row + 1;
          if (targetRow >= this.state.L1.length) {
            this.state.L1.push("");
            this.state.L2.push("");
            this.state.L3.push("");
            this.renderListEditor();
          }
          this.focusListCell(targetCol, targetRow);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (row > 0) {
            targetRow = row - 1;
            this.focusListCell(targetCol, targetRow);
          } else {
            this.speechManager.speak("Top of list.");
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (row < this.state.L1.length - 1) {
            targetRow = row + 1;
            this.focusListCell(targetCol, targetRow);
          } else {
            this.speechManager.speak("Bottom of list.");
          }
        } else if (e.key === 'ArrowLeft') {
          const selectionStart = input.selectionStart;
          if (selectionStart === 0 || input.value.length === 0) {
            e.preventDefault();
            if (col === 'L2') targetCol = 'L1';
            else if (col === 'L3') targetCol = 'L2';
            else {
              this.speechManager.speak("First list column.");
              return;
            }
            this.focusListCell(targetCol, targetRow);
          }
        } else if (e.key === 'ArrowRight') {
          const selectionStart = input.selectionStart;
          if (selectionStart === input.value.length || input.value.length === 0) {
            e.preventDefault();
            if (col === 'L1') targetCol = 'L2';
            else if (col === 'L2') targetCol = 'L3';
            else {
              this.speechManager.speak("Last list column.");
              return;
            }
            this.focusListCell(targetCol, targetRow);
          }
        }
      });
    });
  }

  focusListCell(col, row) {
    const nextInput = document.querySelector(`.list-cell-input[data-col="${col}"][data-row="${row}"]`);
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
      nextInput.scrollIntoView({ block: 'nearest' });
    }
  }

  speakSummaryLineByLine(summaryArray) {
    if (!summaryArray || summaryArray.length === 0) return;
    this.speechManager.speak(summaryArray[0], true);
    for (let i = 1; i < summaryArray.length; i++) {
      this.speechManager.speak(summaryArray[i], false);
    }
  }

  copyRegressionLineToY4() {
    if (!this.lastComputedRegressionEquation) {
      this.speechManager.speak("No regression line available.");
      return;
    }
    const inputY4 = document.getElementById('input-y4');
    if (inputY4) {
      inputY4.value = this.lastComputedRegressionEquation;
      this.updateEquationState('y4', this.lastComputedRegressionEquation);
      this.speechManager.speak("Regression equation copied to slot Y4.");
      this.recalculateAllPoints();
      this.draw();
    }
  }

  renderTable() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const tblStart = parseFloat(document.getElementById('input-tblstart').value) || 0;
    const dTbl = parseFloat(document.getElementById('input-dtbl').value) || 1;

    const rowCount = 20;
    const precision = this.state.precisionMode;

    const formatVal = (val) => {
      if (isNaN(val)) return 'NaN';
      if (!isFinite(val)) return val > 0 ? 'Infinity' : '-Infinity';
      if (precision === 'float') return parseFloat(val.toFixed(6));
      const prec = parseInt(precision.slice(3));
      return val.toFixed(prec);
    };

    const compiledEqs = {};
    for (const key of ['y1', 'y2', 'y3', 'y4']) {
      const eq = this.state.equations[key];
      if (eq.text.trim() !== '' && !eq.error) {
        compiledEqs[key] = eq.compiled;
      } else if (eq.text.trim() !== '' && eq.error) {
        compiledEqs[key] = 'error';
      } else {
        compiledEqs[key] = 'empty';
      }
    }

    for (let i = 0; i < rowCount; i++) {
      const xVal = tblStart + i * dTbl;
      const tr = document.createElement('tr');
      tr.id = `table-row-${i}`;
      if (i === this.state.tableCurrentRowIndex) {
        tr.classList.add('highlighted-row');
      }

      const tdX = document.createElement('td');
      tdX.textContent = formatVal(xVal);
      tr.appendChild(tdX);

      for (const key of ['y1', 'y2', 'y3', 'y4']) {
        const td = document.createElement('td');
        const comp = compiledEqs[key];
        if (comp === 'empty') {
          td.textContent = '--';
        } else if (comp === 'error') {
          td.textContent = 'Err';
        } else if (comp) {
          try {
            const rawY = CalcEngine.evaluateAt(comp, xVal, this.state.angleMode);
            const val = this.graphEngine.coerceToNumber(rawY);
            td.textContent = isNaN(val) ? 'NaN' : formatVal(val);
          } catch {
            td.textContent = 'Err';
          }
        } else {
          td.textContent = '--';
        }
        tr.appendChild(td);
      }

      tableBody.appendChild(tr);
    }
  }

  announceTableRow(rowIndex) {
    const tblStart = parseFloat(document.getElementById('input-tblstart').value) || 0;
    const dTbl = parseFloat(document.getElementById('input-dtbl').value) || 1;
    const xVal = tblStart + rowIndex * dTbl;

    let announcement = `Row ${rowIndex + 1}, X equals ${this.formatNumberSpeech(xVal)}. `;

    for (const key of ['y1', 'y2', 'y3', 'y4']) {
      const eq = this.state.equations[key];
      const label = key.toUpperCase();
      if (eq.text.trim() === '') {
        continue;
      }
      if (eq.error) {
        announcement += `${label} has error. `;
        continue;
      }
      if (eq.compiled) {
        try {
          const rawY = CalcEngine.evaluateAt(eq.compiled, xVal, this.state.angleMode);
          const val = this.graphEngine.coerceToNumber(rawY);
          if (isNaN(val)) {
            announcement += `${label} is undefined. `;
          } else {
            announcement += `${label} equals ${this.formatNumberSpeech(val)}. `;
          }
        } catch {
          announcement += `${label} error. `;
        }
      }
    }

    this.speechManager.speak(announcement, true);
  }

  openSolverMenuDirectly() {
    this.solverOverlay.classList.remove('hidden');
    this.showSolverMenu();
    document.getElementById('btn-close-solver').focus();
    this.speechManager.speak("Numerical Solvers menu opened. Select solver 1 through 6 or press escape to close.");
  }

  showSolverMenu() {
    this.state.activeSolver = null;
    document.getElementById('solver-menu').classList.remove('hidden');
    document.getElementById('solver-form').classList.add('hidden');
    const existingResult = document.getElementById('solver-result-panel');
    if (existingResult) existingResult.remove();
  }

  closeSolverOverlay() {
    this.solverOverlay.classList.add('hidden');
    this.canvas.focus();
    this.speechManager.speak("Solver menu closed.");
  }

  openSolver(solverKey) {
    if (solverKey !== 'tangent' && this.state.equations.y_tangent) {
      this.state.equations.y_tangent.active = false;
      this.state.equations.y_tangent.points = [];
      this.state.equations.y_tangent.compiled = null;
      this.state.equations.y_tangent.text = '';
    }

    this.state.activeSolver = solverKey;
    this.solverOverlay.classList.remove('hidden');
    document.getElementById('solver-menu').classList.add('hidden');
    
    const form = document.getElementById('solver-form');
    form.classList.remove('hidden');

    const title = document.getElementById('solver-form-title');
    const fields = document.getElementById('solver-form-inputs');
    fields.innerHTML = '';

    const existingResult = document.getElementById('solver-result-panel');
    if (existingResult) existingResult.remove();

    let solverName = "";
    let speechPrompt = "";

    switch (solverKey) {
      case 'val':
        solverName = "Value Calculation (Calculate Y)";
        fields.innerHTML = `
          <div class="input-group">
            <label for="input-solver-val-x" class="input-label">Calculate at X =</label>
            <input type="text" id="input-solver-val-x" class="equation-input" value="0" autocomplete="off">
          </div>
        `;
        speechPrompt = "Value calculation. Enter target X value.";
        break;
      case 'root':
        solverName = "Zero / Root Finder";
        fields.innerHTML = `
          <div class="input-group">
            <label for="input-solver-guess-x" class="input-label">Starting Guess X =</label>
            <input type="text" id="input-solver-guess-x" class="equation-input" value="0" autocomplete="off">
          </div>
        `;
        speechPrompt = "Root finder. Enter starting guess X.";
        break;
      case 'min':
        solverName = "Local Minimum Finder";
        fields.innerHTML = `
          <div class="input-group">
            <label for="input-solver-guess-x" class="input-label">Starting Guess X =</label>
            <input type="text" id="input-solver-guess-x" class="equation-input" value="0" autocomplete="off">
          </div>
        `;
        speechPrompt = "Local minimum finder. Enter starting guess X.";
        break;
      case 'max':
        solverName = "Local Maximum Finder";
        fields.innerHTML = `
          <div class="input-group">
            <label for="input-solver-guess-x" class="input-label">Starting Guess X =</label>
            <input type="text" id="input-solver-guess-x" class="equation-input" value="0" autocomplete="off">
          </div>
        `;
        speechPrompt = "Local maximum finder. Enter starting guess X.";
        break;
      case 'deriv':
        solverName = "dy/dx Numerical Derivative";
        fields.innerHTML = `
          <div class="input-group">
            <label for="input-solver-deriv-x" class="input-label">Derivative at X =</label>
            <input type="text" id="input-solver-deriv-x" class="equation-input" value="0" autocomplete="off">
          </div>
        `;
        speechPrompt = "Numerical derivative. Enter X coordinate.";
        break;
      case 'int':
        solverName = "Definite Integration";
        fields.innerHTML = `
          <div class="input-group">
            <label for="input-solver-int-lower" class="input-label">Lower Limit (X) =</label>
            <input type="text" id="input-solver-int-lower" class="equation-input" value="${this.graphEngine.xMin}" autocomplete="off">
          </div>
          <div class="input-group">
            <label for="input-solver-int-upper" class="input-label">Upper Limit (X) =</label>
            <input type="text" id="input-solver-int-upper" class="equation-input" value="${this.graphEngine.xMax}" autocomplete="off">
          </div>
        `;
        speechPrompt = "Definite integration. Enter lower and upper bounds.";
        break;
      case 'tangent':
        solverName = "Draw Tangent Line";
        fields.innerHTML = `
          <div class="input-group">
            <label for="select-solver-tangent-curve" class="input-label">Select Curve:</label>
            <select id="select-solver-tangent-curve" class="settings-select" style="font-size: 26px; font-weight: 600; flex: 1;">
              <option value="y1">Y1</option>
              <option value="y2">Y2</option>
              <option value="y3">Y3</option>
              <option value="y4">Y4</option>
            </select>
          </div>
          <div class="input-group" style="margin-top: 15px;">
            <label for="input-solver-tangent-c" class="input-label">Point x = c:</label>
            <input type="text" id="input-solver-tangent-c" class="equation-input" value="${this.state.cursor.x}" autocomplete="off">
          </div>
        `;
        speechPrompt = "Draw tangent line. Select curve and enter target X coordinate.";
        break;
      case '1var':
        solverName = "1-Variable Statistics";
        fields.innerHTML = `
          <div class="input-group">
            <label for="select-stat-list" class="input-label">Select List:</label>
            <select id="select-stat-list" class="settings-select" style="font-size: 26px; font-weight: 600; flex: 1;">
              <option value="L1">L1 (List 1)</option>
              <option value="L2">L2 (List 2)</option>
              <option value="L3">L3 (List 3)</option>
            </select>
          </div>
        `;
        speechPrompt = "One variable statistics. Select list and press calculate.";
        break;
      case '2var':
        solverName = "2-Variable Statistics";
        fields.innerHTML = `
          <div class="input-group">
            <label for="select-stat-xlist" class="input-label">X List:</label>
            <select id="select-stat-xlist" class="settings-select" style="font-size: 26px; font-weight: 600; flex: 1;">
              <option value="L1">L1</option>
              <option value="L2">L2</option>
              <option value="L3">L3</option>
            </select>
          </div>
          <div class="input-group" style="margin-top: 15px;">
            <label for="select-stat-ylist" class="input-label">Y List:</label>
            <select id="select-stat-ylist" class="settings-select" style="font-size: 26px; font-weight: 600; flex: 1;">
              <option value="L2" selected>L2</option>
              <option value="L1">L1</option>
              <option value="L3">L3</option>
            </select>
          </div>
        `;
        speechPrompt = "Two variable statistics. Select X list and Y list.";
        break;
      case 'linreg':
        solverName = "Linear Regression (ax+b)";
        fields.innerHTML = `
          <div class="input-group">
            <label for="select-reg-xlist" class="input-label">X List:</label>
            <select id="select-reg-xlist" class="settings-select" style="font-size: 26px; font-weight: 600; flex: 1;">
              <option value="L1">L1</option>
              <option value="L2">L2</option>
              <option value="L3">L3</option>
            </select>
          </div>
          <div class="input-group" style="margin-top: 15px;">
            <label for="select-reg-ylist" class="input-label">Y List:</label>
            <select id="select-reg-ylist" class="settings-select" style="font-size: 26px; font-weight: 600; flex: 1;">
              <option value="L2" selected>L2</option>
              <option value="L1">L1</option>
              <option value="L3">L3</option>
            </select>
          </div>
        `;
        speechPrompt = "Linear regression. Select X list and Y list.";
        break;
      case 'normalcdf':
        solverName = "Normal CDF Solver";
        fields.innerHTML = `
          <div class="input-group">
            <label for="input-distr-lower" class="input-label">Lower Bound =</label>
            <input type="text" id="input-distr-lower" class="equation-input" value="-1e99" autocomplete="off">
          </div>
          <div class="input-group" style="margin-top: 15px;">
            <label for="input-distr-upper" class="input-label">Upper Bound =</label>
            <input type="text" id="input-distr-upper" class="equation-input" value="1.96" autocomplete="off">
          </div>
          <div class="input-group" style="margin-top: 15px;">
            <label for="input-distr-mean" class="input-label">Mean =</label>
            <input type="text" id="input-distr-mean" class="equation-input" value="0" autocomplete="off">
          </div>
          <div class="input-group" style="margin-top: 15px;">
            <label for="input-distr-stdev" class="input-label">Stdev =</label>
            <input type="text" id="input-distr-stdev" class="equation-input" value="1" autocomplete="off">
          </div>
        `;
        speechPrompt = "Normal cumulative distribution. Enter lower bound, upper bound, mean, and standard deviation.";
        break;
      case 'invnorm':
        solverName = "Inverse Normal Solver";
        fields.innerHTML = `
          <div class="input-group">
            <label for="input-distr-area" class="input-label">Area (Percentile) =</label>
            <input type="text" id="input-distr-area" class="equation-input" value="0.95" autocomplete="off">
          </div>
          <div class="input-group" style="margin-top: 15px;">
            <label for="input-distr-mean" class="input-label">Mean =</label>
            <input type="text" id="input-distr-mean" class="equation-input" value="0" autocomplete="off">
          </div>
          <div class="input-group" style="margin-top: 15px;">
            <label for="input-distr-stdev" class="input-label">Stdev =</label>
            <input type="text" id="input-distr-stdev" class="equation-input" value="1" autocomplete="off">
          </div>
        `;
        speechPrompt = "Inverse normal solver. Enter area, mean, and standard deviation.";
        break;
    }

    title.textContent = solverName;
    this.speechManager.speak(`${speechPrompt} Press Enter or select calculate button.`);

    const firstInput = fields.querySelector('input');
    if (firstInput) {
      firstInput.focus();
      firstInput.select();
      
      fields.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.executeSolver();
          }
        });
      });
    }
  }

  executeSolver() {
    const activeKey = this.state.activeEquationKey;
    const eq = this.state.equations[activeKey];

    const existingResult = document.getElementById('solver-result-panel');
    if (existingResult) existingResult.remove();

    const form = document.getElementById('solver-form');
    const solver = this.state.activeSolver;

    const isStatOrDistr = ['1var', '2var', 'linreg', 'normalcdf', 'invnorm'].includes(solver);

    if (!isStatOrDistr && (!eq || !eq.compiled)) {
      this.speechManager.speak(`Active equation ${activeKey.toUpperCase()} is empty or has errors.`, true);
      const errPanel = document.createElement('div');
      errPanel.id = 'solver-result-panel';
      errPanel.className = 'solver-result-panel';
      errPanel.innerHTML = `
        <div class="result-label">Error:</div>
        <div class="result-value">Equation is empty or has errors</div>
      `;
      form.appendChild(errPanel);
      return;
    }

    const angleMode = this.state.angleMode;
    let resultText = "";
    let speechText = "";
    this.currentStatsSpeechSummary = null;

    try {
      if (solver === 'val') {
        const xVal = parseFloat(document.getElementById('input-solver-val-x').value);
        if (isNaN(xVal)) throw new Error("Invalid X value");

        const rawY = CalcEngine.evaluateAt(eq.compiled, xVal, angleMode);
        const yVal = this.graphEngine.coerceToNumber(rawY);
        
        if (isNaN(yVal) || !isFinite(yVal)) {
          resultText = `Y = undefined`;
          speechText = `At X equals ${this.formatNumberSpeech(xVal)}, Y is undefined.`;
        } else {
          resultText = `Y = ${this.formatNumberValue(yVal)}`;
          speechText = `At X equals ${this.formatNumberSpeech(xVal)}, Y equals ${this.formatNumberSpeech(yVal)}.`;
          this.state.cursor.x = xVal;
          this.state.cursor.y = this.formatNumberValue(yVal);
          
          this.showCanvasSolverResult(`Value: Y(${xVal}) = ${this.formatNumberValue(yVal)}`);
        }
      } else if (solver === 'root') {
        const guessX = parseFloat(document.getElementById('input-solver-guess-x').value);
        if (isNaN(guessX)) throw new Error("Invalid starting guess X");

        const rootX = CalcEngine.findRoot(eq.compiled, this.graphEngine.xMin, this.graphEngine.xMax, angleMode, guessX);
        if (rootX === null) {
          resultText = "No zero found";
          speechText = "No zero found in the current screen window.";
          this.showCanvasSolverResult(`Zero Finder: No root found`);
        } else {
          const rootXVal = this.formatNumberValue(rootX);
          resultText = `Root at X = ${rootXVal}`;
          speechText = `Zero found at X equals ${this.formatNumberSpeech(rootXVal)}, Y equals 0.`;
          
          this.state.cursor.x = rootXVal;
          this.state.cursor.y = 0;
          this.showCanvasSolverResult(`Zero: X = ${rootXVal}, Y = 0`);
        }
      } else if (solver === 'min' || solver === 'max') {
        const guessX = parseFloat(document.getElementById('input-solver-guess-x').value);
        if (isNaN(guessX)) throw new Error("Invalid starting guess X");

        const ext = CalcEngine.findExtremum(eq.compiled, this.graphEngine.xMin, this.graphEngine.xMax, angleMode, solver, guessX);
        if (ext === null) {
          resultText = `No local ${solver} found`;
          speechText = `No local ${solver} found in the current screen window.`;
          this.showCanvasSolverResult(`${solver.toUpperCase()}: None found`);
        } else {
          const extX = this.formatNumberValue(ext.x);
          const extY = this.formatNumberValue(ext.y);
          resultText = `${solver === 'min' ? 'Min' : 'Max'}: X=${extX}, Y=${extY}`;
          speechText = `${solver === 'min' ? 'Minimum' : 'Maximum'} found at X equals ${this.formatNumberSpeech(extX)}, Y equals ${this.formatNumberSpeech(extY)}.`;
          
          this.state.cursor.x = extX;
          this.state.cursor.y = extY;
          this.showCanvasSolverResult(`${solver === 'min' ? 'Minimum' : 'Maximum'}: (${extX}, ${extY})`);
        }
      } else if (solver === 'deriv') {
        const xVal = parseFloat(document.getElementById('input-solver-deriv-x').value);
        if (isNaN(xVal)) throw new Error("Invalid X value");

        const slope = CalcEngine.derivative(eq.compiled, xVal, angleMode);
        if (isNaN(slope) || !isFinite(slope)) {
          resultText = `dy/dx = undefined`;
          speechText = `Slope at X equals ${this.formatNumberSpeech(xVal)} is undefined.`;
          this.showCanvasSolverResult(`dy/dx at ${xVal}: undefined`);
        } else {
          const slopeVal = this.formatNumberValue(slope);
          resultText = `dy/dx = ${slopeVal}`;
          speechText = `Derivative at X equals ${this.formatNumberSpeech(xVal)} is ${this.formatNumberSpeech(slopeVal)}.`;
          
          const rawY = CalcEngine.evaluateAt(eq.compiled, xVal, angleMode);
          const yVal = this.graphEngine.coerceToNumber(rawY);
          this.state.cursor.x = xVal;
          if (!isNaN(yVal)) this.state.cursor.y = yVal;
          
          this.showCanvasSolverResult(`dy/dx at ${xVal} = ${slopeVal}`);
        }
      } else if (solver === 'int') {
        const lower = parseFloat(document.getElementById('input-solver-int-lower').value);
        const upper = parseFloat(document.getElementById('input-solver-int-upper').value);

        if (isNaN(lower) || isNaN(upper)) throw new Error("Invalid integration limits");

        const area = CalcEngine.integrate(eq.compiled, lower, upper, angleMode);
        if (isNaN(area) || !isFinite(area)) {
          resultText = "Integral = undefined";
          speechText = `Integration is undefined.`;
          this.showCanvasSolverResult(`Def Integral: undefined`);
        } else {
          const areaVal = this.formatNumberValue(area);
          resultText = `Integral = ${areaVal}`;
          speechText = `Definite integral from X equals ${this.formatNumberSpeech(lower)} to ${this.formatNumberSpeech(upper)} is ${this.formatNumberSpeech(areaVal)}.`;
          
          this.state.integrationShading = {
            active: true,
            lower: lower,
            upper: upper,
            key: activeKey
          };
          this.showCanvasSolverResult(`Integral from ${lower} to ${upper} = ${areaVal}`);
        }
      } else if (solver === 'tangent') {
        const curveKey = document.getElementById('select-solver-tangent-curve').value;
        const cVal = parseFloat(document.getElementById('input-solver-tangent-c').value);
        if (isNaN(cVal)) throw new Error("Invalid X coordinate");

        const targetEq = this.state.equations[curveKey];
        if (!targetEq || !targetEq.compiled) {
          throw new Error(`Curve ${curveKey.toUpperCase()} is empty or has errors`);
        }

        const slope = CalcEngine.derivative(targetEq.compiled, cVal, angleMode);
        const yVal = this.graphEngine.coerceToNumber(CalcEngine.evaluateAt(targetEq.compiled, cVal, angleMode));

        if (isNaN(slope) || isNaN(yVal) || !isFinite(slope) || !isFinite(yVal)) {
          throw new Error("Function or derivative is undefined at this point");
        }

        const slopeVal = this.formatNumberValue(slope);
        const yValVal = this.formatNumberValue(yVal);
        const cValVal = this.formatNumberValue(cVal);

        // Construct tangent equation: Y = m*(x - c) + f(c)
        const tangentExpr = `${slopeVal} * (x - (${cValVal})) + (${yValVal})`;
        
        // Save to auxiliary slot
        this.state.equations.y_tangent = {
          text: tangentExpr,
          points: [],
          compiled: math.compile(tangentExpr),
          error: null,
          active: true
        };

        // Generate points for tangent
        const width = this.canvas.width;
        const height = this.canvas.height;
        const res = this.graphEngine.generateYPoints(tangentExpr, width, height, angleMode);
        this.state.equations.y_tangent.points = res.points;

        // Set cursor to tangent point
        this.state.cursor.x = cValVal;
        this.state.cursor.y = yValVal;

        resultText = `Y = ${slopeVal}(x - ${cValVal}) + ${yValVal}`;
        speechText = `Tangent line drawn at X equals ${this.formatNumberSpeech(cValVal)} for curve ${curveKey.toUpperCase()}. Slope is ${this.formatNumberSpeech(slopeVal)}, Y value is ${this.formatNumberSpeech(yValVal)}. Equation is Y equals ${slopeVal} times x minus ${cValVal} plus ${yValVal}.`;

        this.showCanvasSolverResult(`Tangent at X=${cValVal}: Y=${slopeVal}(x-${cValVal})+${yValVal}`);
        this.draw();
      } else if (solver === '1var') {
        const listKey = document.getElementById('select-stat-list').value;
        const listData = this.state[listKey];
        const result = StatEngine.compute1VarStats(listData);
        if (result.n === 0) throw new Error("Selected list contains no numerical entries");

        const f = (val) => this.formatNumberValue(val);
        const fSp = (val) => this.formatNumberSpeech(f(val));

        resultText = `1-Var Stats for ${listKey}:
          Mean (x̄) = ${f(result.mean)}
          Sum (Σx) = ${f(result.sum)}
          Sum Sq (Σx²) = ${f(result.sumSq)}
          Sx = ${f(result.Sx)}
          σx = ${f(result.sigMax)}
          n = ${result.n}
          MinX = ${f(result.min)}
          Q1 = ${f(result.q1)}
          Med = ${f(result.median)}
          Q3 = ${f(result.q3)}
          MaxX = ${f(result.max)}`;

        speechText = `1 Variable Statistics computed for ${listKey}. Sample size is ${result.n}. Mean is ${fSp(result.mean)}. Standard deviation Sx is ${fSp(result.Sx)}. Press S to hear full line by line summary.`;

        this.currentStatsSpeechSummary = [
          `One variable statistics for list ${listKey}`,
          `Sample size n is ${result.n}`,
          `Mean is ${fSp(result.mean)}`,
          `Sum is ${fSp(result.sum)}`,
          `Sum of squares is ${fSp(result.sumSq)}`,
          `Sample standard deviation Sx is ${fSp(result.Sx)}`,
          `Population standard deviation sigma x is ${fSp(result.sigMax)}`,
          `Minimum is ${fSp(result.min)}`,
          `Quartile 1 is ${fSp(result.q1)}`,
          `Median is ${fSp(result.median)}`,
          `Quartile 3 is ${fSp(result.q3)}`,
          `Maximum is ${fSp(result.max)}`
        ];
      } else if (solver === '2var') {
        const xKey = document.getElementById('select-stat-xlist').value;
        const yKey = document.getElementById('select-stat-ylist').value;
        const xData = this.state[xKey];
        const yData = this.state[yKey];
        const result = StatEngine.compute2VarStats(xData, yData);
        if (result.n === 0) throw new Error("Lists do not contain any matching data points");

        const f = (val) => this.formatNumberValue(val);
        const fSp = (val) => this.formatNumberSpeech(f(val));

        resultText = `2-Var Stats (${xKey}, ${yKey}):
          n = ${result.n}
          Mean X (x̄) = ${f(result.meanX)}
          Mean Y (ȳ) = ${f(result.meanY)}
          Sx = ${f(result.Sx)}
          Sy = ${f(result.Sy)}
          MinX = ${f(result.minX)}
          MaxX = ${f(result.maxX)}
          MinY = ${f(result.minY)}
          MaxY = ${f(result.maxY)}`;

        speechText = `2 Variable Statistics computed. Sample size is ${result.n}. Mean of X is ${fSp(result.meanX)}. Mean of Y is ${fSp(result.meanY)}. Press S to hear full line by line summary.`;

        this.currentStatsSpeechSummary = [
          `Two variable statistics for X list ${xKey} and Y list ${yKey}`,
          `Sample size n is ${result.n}`,
          `Mean of X is ${fSp(result.meanX)}`,
          `Mean of Y is ${fSp(result.meanY)}`,
          `X standard deviation Sx is ${fSp(result.Sx)}`,
          `Y standard deviation Sy is ${fSp(result.Sy)}`,
          `Minimum X is ${fSp(result.minX)}`,
          `Maximum X is ${fSp(result.maxX)}`,
          `Minimum Y is ${fSp(result.minY)}`,
          `Maximum Y is ${fSp(result.maxY)}`
        ];
      } else if (solver === 'linreg') {
        const xKey = document.getElementById('select-reg-xlist').value;
        const yKey = document.getElementById('select-reg-ylist').value;
        const xData = this.state[xKey];
        const yData = this.state[yKey];
        const result = StatEngine.computeLinReg(xData, yData);
        if (result.n === 0) throw new Error("Lists do not contain any matching data points");

        const f = (val) => this.formatNumberValue(val);
        const fSp = (val) => this.formatNumberSpeech(f(val));

        resultText = `Linear Reg (y=ax+b):
          a (slope) = ${f(result.a)}
          b (y-int) = ${f(result.b)}
          r = ${f(result.r)}
          r² = ${f(result.r2)}
          n = ${result.n}`;

        speechText = `Linear regression model computed. Slope a is ${fSp(result.a)}. Y intercept b is ${fSp(result.b)}. Correlation coefficient r is ${fSp(result.r)}. Press S to hear summary.`;

        // Save computed formula
        this.lastComputedRegressionEquation = `${result.a} * x + (${result.b})`;

        // Append accessible Copy Regression Line button
        resultText += `\n\n<button id="btn-macro-copy-y4" class="action-btn" style="width: 100%; margin-top: 10px; font-size: 22px;">Copy Regression Line to Y4</button>`;

        this.currentStatsSpeechSummary = [
          `Linear regression results for X list ${xKey} and Y list ${yKey}`,
          `Model is y equals a x plus b`,
          `Slope a is ${fSp(result.a)}`,
          `Y intercept b is ${fSp(result.b)}`,
          `Correlation coefficient r is ${fSp(result.r)}`,
          `Coefficient of determination r squared is ${fSp(result.r2)}`
        ];

        setTimeout(() => {
          const btnCopy = document.getElementById('btn-macro-copy-y4');
          if (btnCopy) {
            btnCopy.addEventListener('click', () => {
              this.copyRegressionLineToY4();
            });
          }
        }, 50);
      } else if (solver === 'normalcdf') {
        const lower = parseFloat(document.getElementById('input-distr-lower').value);
        const upper = parseFloat(document.getElementById('input-distr-upper').value);
        const mean = parseFloat(document.getElementById('input-distr-mean').value);
        const stdev = parseFloat(document.getElementById('input-distr-stdev').value);

        if (isNaN(lower) || isNaN(upper) || isNaN(mean) || isNaN(stdev)) {
          throw new Error("Invalid parameters");
        }
        if (stdev <= 0) {
          throw new Error("Standard deviation must be positive");
        }

        const prob = StatEngine.normalcdf(lower, upper, mean, stdev);
        const probVal = this.formatNumberValue(prob);
        resultText = `normalcdf(${lower}, ${upper}, ${mean}, ${stdev})\nProbability P = ${probVal}`;
        speechText = `Normal C D F probability is ${this.formatNumberSpeech(probVal)}.`;
        this.showCanvasSolverResult(`normalcdf: P = ${probVal}`);
      } else if (solver === 'invnorm') {
        const area = parseFloat(document.getElementById('input-distr-area').value);
        const mean = parseFloat(document.getElementById('input-distr-mean').value);
        const stdev = parseFloat(document.getElementById('input-distr-stdev').value);

        if (isNaN(area) || isNaN(mean) || isNaN(stdev)) {
          throw new Error("Invalid parameters");
        }
        if (area <= 0 || area >= 1) {
          throw new Error("Area must be in (0, 1)");
        }
        if (stdev <= 0) {
          throw new Error("Standard deviation must be positive");
        }

        const boundary = StatEngine.invNorm(area, mean, stdev);
        const boundaryVal = this.formatNumberValue(boundary);
        resultText = `invNorm(${area}, ${mean}, ${stdev})\nBoundary Value X = ${boundaryVal}`;
        speechText = `Boundary value X equals ${this.formatNumberSpeech(boundaryVal)}.`;
        this.showCanvasSolverResult(`invNorm: X = ${boundaryVal}`);
      }

      const resPanel = document.createElement('div');
      resPanel.id = 'solver-result-panel';
      resPanel.className = 'solver-result-panel';
      resPanel.setAttribute('tabindex', '0');
      resPanel.innerHTML = `
        <div class="result-label">Result:</div>
        <div class="result-value">${resultText}</div>
      `;
      form.appendChild(resPanel);
      resPanel.focus();

      this.speechManager.speak(speechText, true);
      
      this.draw();

    } catch (err) {
      const errPanel = document.createElement('div');
      errPanel.id = 'solver-result-panel';
      errPanel.className = 'solver-result-panel';
      errPanel.innerHTML = `
        <div class="result-label">Error:</div>
        <div class="result-value">${err.message}</div>
      `;
      form.appendChild(errPanel);
      this.speechManager.speak(`Calculation error: ${err.message}`, true);
    }
  }

  showCanvasSolverResult(text) {
    const el = document.getElementById('canvas-solver-result');
    if (el) {
      el.textContent = text;
      el.classList.remove('hidden');
    }
  }

  hideCanvasSolverResult() {
    const el = document.getElementById('canvas-solver-result');
    if (el) {
      el.classList.add('hidden');
    }
  }

  draw() {
    GraphRenderer.draw(this.ctx, this.canvas.width, this.canvas.height, this.graphEngine, this.state);
  }
}

// Instantiate the App when document loads
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
