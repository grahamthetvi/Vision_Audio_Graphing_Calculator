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
  constructor(xMin = -10, xMax = 10, yMin = -10, yMax = 10) {
    this.xMin = xMin;
    this.xMax = xMax;
    this.yMin = yMin;
    this.yMax = yMax;
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
  generateYPoints(expression, width, height) {
    if (!expression || expression.trim() === '') {
      return { points: [], compiled: null, error: null };
    }

    try {
      const compiled = math.compile(expression);
      const points = [];

      for (let pixelX = 0; pixelX <= width; pixelX++) {
        const mathX = this.xMin + (pixelX / width) * (this.xMax - this.xMin);
        try {
          const rawY = compiled.evaluate({ x: mathX });
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
  generateXPoint(expression, width) {
    if (!expression || expression.trim() === '') {
      return { pixelX: null, mathX: null, error: null };
    }

    try {
      const rawVal = math.evaluate(expression);
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
    
    // Vertical grid lines
    for (let x = graphEngine.xMin; x <= graphEngine.xMax; x += 1) {
      if (x === 0) continue;
      const screenPt = graphEngine.mathToPixel(x, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(screenPt.x, 0);
      ctx.lineTo(screenPt.x, height);
      ctx.stroke();
    }
    // Horizontal grid lines
    for (let y = graphEngine.yMin; y <= graphEngine.yMax; y += 1) {
      if (y === 0) continue;
      const screenPt = graphEngine.mathToPixel(0, y, width, height);
      ctx.beginPath();
      ctx.moveTo(0, screenPt.y);
      ctx.lineTo(width, screenPt.y);
      ctx.stroke();
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

    // 4. Draw Axis Tick Marks and Numbers (Prominent at integer intervals)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // X Ticks
    for (let x = graphEngine.xMin; x <= graphEngine.xMax; x += 1) {
      if (x === 0) continue;
      const pt = graphEngine.mathToPixel(x, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - 8);
      ctx.lineTo(pt.x, pt.y + 8);
      ctx.stroke();
      
      // Draw labels at every 2 units to prevent text overlapping
      if (x % 2 === 0) {
        ctx.fillText(x.toString(), pt.x, pt.y + 12);
      }
    }

    // Y Ticks
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = graphEngine.yMin; y <= graphEngine.yMax; y += 1) {
      if (y === 0) continue;
      const pt = graphEngine.mathToPixel(0, y, width, height);
      ctx.beginPath();
      ctx.moveTo(pt.x - 8, pt.y);
      ctx.lineTo(pt.x + 8, pt.y);
      ctx.stroke();
      
      // Draw labels at every 2 units
      if (y % 2 === 0) {
        ctx.fillText(y.toString(), pt.x - 14, pt.y);
      }
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

    // 7. Draw Interactive Grid Cursor (Crosshair)
    const cursor = state.cursor;
    const cursorPt = graphEngine.mathToPixel(cursor.x, cursor.y, width, height);

    ctx.strokeStyle = '#FF4500'; // Neon Orange-Red
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    // Horizontal Cursor Line
    ctx.beginPath();
    ctx.moveTo(0, cursorPt.y);
    ctx.lineTo(width, cursorPt.y);
    ctx.stroke();

    // Vertical Cursor Line
    ctx.beginPath();
    ctx.moveTo(cursorPt.x, 0);
    ctx.lineTo(cursorPt.x, height);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Glowing Dot at Cursor Center
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

    this.primaryGain.connect(this.masterGain);
    this.sawGain.connect(this.masterGain);

    if (this.panNode) {
      this.masterGain.connect(this.panNode);
      this.panNode.connect(this.ctx.destination);
    } else {
      this.masterGain.connect(this.ctx.destination);
    }

    this.primaryOsc.start();
    this.sawOsc.start();
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
  }

  updateTracePoint(freq, pan, isNegative) {
    this.ensureRunning();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    this.primaryOsc.frequency.setTargetAtTime(freq, t, 0.015);
    this.sawOsc.frequency.setTargetAtTime(freq / 2.0, t, 0.015);

    const targetSawGain = isNegative ? 0.15 : 0.0;
    this.sawGain.gain.setTargetAtTime(targetSawGain, t, 0.015);

    if (this.panNode) {
      this.panNode.pan.setTargetAtTime(pan, t, 0.015);
    }
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
}

// ============================================================================
// 4. Application Orchestrator / UI Layer
// ============================================================================
class App {
  constructor() {
    this.speechManager = new SpeechManager();
    this.graphEngine = new GraphEngine(-10, 10, -10, 10);
    this.audioTraceEngine = new AudioTraceEngine();
    this.errorSpeechTimers = {};
    this.traceInactivityTimer = null;
    this.lastCriticalPointType = null;
    this.originalCursor = null;
    
    this.state = {
      equations: {
        y1: { text: '', points: [], compiled: null, error: null },
        y2: { text: '', points: [], compiled: null, error: null },
        y3: { text: '', points: [], compiled: null, error: null },
        y4: { text: '', points: [], compiled: null, error: null },
        x1: { text: '', pixelX: null, mathX: null, error: null },
        x2: { text: '', pixelX: null, mathX: null, error: null }
      },
      cursor: { x: 0, y: 0 },
      activeEquationKey: 'y1',
      traceModeActive: false,
      sweepActive: false
    };

    this.canvas = document.getElementById('graphCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.overlay = document.getElementById('helpOverlay');

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
        this.draw();
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
          this.draw();
        }
      });
    });

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

        this.draw();
        this.announceCoordinates();
      }
    });

    // Mouse Navigation on Canvas
    this.canvas.addEventListener('mousedown', (e) => {
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

      // Close overlays with Escape
      if (e.key === 'Escape') {
        if (!this.overlay.classList.contains('hidden')) {
          e.preventDefault();
          this.toggleHelp(false);
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
      const res = this.graphEngine.generateYPoints(rawValue, width, height);
      this.state.equations[key].points = res.points;
      this.state.equations[key].compiled = res.compiled;
      this.state.equations[key].error = res.error;

      const inputEl = document.getElementById(`input-${key}`);
      if (rawValue.trim() !== '' && res.error) {
        inputEl.style.borderColor = '#FF0000';
        inputEl.style.boxShadow = '0 0 10px #FF0000';
      } else {
        inputEl.style.borderColor = '';
        inputEl.style.boxShadow = '';
      }
    } else if (key.startsWith('x')) {
      const res = this.graphEngine.generateXPoint(rawValue, width);
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

  announceCoordinates() {
    const x = this.state.cursor.x;
    const y = this.state.cursor.y;

    // Direct UI output
    const coordEl = document.getElementById('footer-coordinates');
    if (coordEl) {
      coordEl.textContent = `Cursor: X = ${x.toFixed(2)}, Y = ${y.toFixed(2)}`;
    }

    // Format spoken values (e.g. read "negative 1 point 5")
    const formatNumberSpeech = (val) => {
      if (val === 0) return "0";
      let parts = val.toString().split('.');
      let integer = parseInt(parts[0]);
      let decimal = parts[1];

      let spoken = integer < 0 ? `negative ${Math.abs(integer)}` : `${integer}`;
      if (decimal) {
        spoken += " point ";
        for (let char of decimal) {
          spoken += char + " ";
        }
      }
      return spoken.trim();
    };

    const speechText = `X equals ${formatNumberSpeech(x)}, Y equals ${formatNumberSpeech(y)}`;
    
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
    if (!key.startsWith('y') || !this.state.equations[key].compiled) {
      const firstCompiled = ['y1', 'y2', 'y3', 'y4'].find(k => this.state.equations[k].compiled);
      if (firstCompiled) {
        key = firstCompiled;
        this.state.activeEquationKey = key;
        this.updateActiveEquationUI();
      } else {
        this.speechManager.speak("No equation available to hear.");
        return;
      }
    }

    const eq = this.state.equations[key];
    const compiled = eq.compiled;

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

      try {
        const rawY = compiled.evaluate({ x });
        const y = this.graphEngine.coerceToNumber(rawY);

        if (typeof y === 'number' && !isNaN(y) && isFinite(y)) {
          this.state.cursor.x = Math.round(x * 100) / 100;
          this.state.cursor.y = Math.round(y * 100) / 100;
          this.draw();

          const freq = SonificationMath.mapYToFrequency(y, yMin, yMax);
          const pan = SonificationMath.mapXToPan(x, xMin, xMax);
          const isNegative = y < 0;

          this.audioTraceEngine.updateTracePoint(freq, pan, isNegative);

          // Click pop on axis crossings
          if (prevXVal !== null && prevYVal !== null) {
            if (prevXVal * x <= 0 && prevXVal !== 0) {
              this.audioTraceEngine.playClick();
            } else if (prevYVal * y <= 0 && prevYVal !== 0) {
              this.audioTraceEngine.playClick();
            }
          }

          prevXVal = x;
          prevYVal = y;
        }
      } catch (err) {
        // Keep going
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
        if (typeof mathY === 'number' && !isNaN(mathY) && isFinite(mathY)) {
          this.state.cursor.y = Math.round(mathY * 100) / 100;
        } else {
          this.state.cursor.y = 0;
        }
      } catch {
        this.state.cursor.y = 0;
      }
    }
  }

  updateTraceAudioForCurrentPoint() {
    const x = this.state.cursor.x;
    const y = this.state.cursor.y;
    const xMin = this.graphEngine.xMin;
    const xMax = this.graphEngine.xMax;
    const yMin = this.graphEngine.yMin;
    const yMax = this.graphEngine.yMax;

    const freq = SonificationMath.mapYToFrequency(y, yMin, yMax);
    const pan = SonificationMath.mapXToPan(x, xMin, xMax);
    const isNegative = y < 0;

    this.audioTraceEngine.updateTracePoint(freq, pan, isNegative);
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

    let milestoneTriggered = false;

    // 1. Zero crossing
    if (this.previousTraceY !== null) {
      const signChange = (this.previousTraceY < 0 && y >= 0) || (this.previousTraceY > 0 && y <= 0);
      if (signChange || y === 0) {
        this.audioTraceEngine.playCriticalPointChime();
        this.lastCriticalPointType = 'root';
        milestoneTriggered = true;
      }
    }

    this.previousTraceY = y;

    if (milestoneTriggered) return;

    // 2. Extremum
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

    const coordEl = document.getElementById('footer-coordinates');
    if (coordEl) {
      coordEl.textContent = `Cursor: X = ${x.toFixed(2)}, Y = ${y.toFixed(2)}`;
    }

    const formatNumberSpeech = (val) => {
      if (val === 0) return "0";
      let rounded = Math.round(val * 100) / 100;
      let parts = rounded.toString().split('.');
      let integer = parseInt(parts[0]);
      let decimal = parts[1];

      let spoken = integer < 0 ? `negative ${Math.abs(integer)}` : `${integer}`;
      if (decimal) {
        spoken += " point ";
        for (let char of decimal) {
          spoken += char + " ";
        }
      }
      return spoken.trim();
    };

    let prefix = "";
    if (this.lastCriticalPointType) {
      prefix = `${this.lastCriticalPointType}. `;
    }

    const speechText = `${prefix}X equals ${formatNumberSpeech(x)}, Y equals ${formatNumberSpeech(y)}`;

    const srAnnouncer = document.getElementById('graph-announcement');
    if (srAnnouncer) {
      srAnnouncer.textContent = speechText;
    }

    this.speechManager.speak(speechText, true);
  }

  draw() {
    GraphRenderer.draw(this.ctx, this.canvas.width, this.canvas.height, this.graphEngine, this.state);
  }
}

// Instantiate the App when document loads
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
