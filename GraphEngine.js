/**
 * GraphEngine.js
 * Coordinate transforms and curve sampling. DOM-free; depends on CalcEngine.evaluateAt
 * and global `math` (math.js) for expression compilation. ESP32 will replace math.js with TinyExpr.
 */

function resolveCalcEngine() {
  if (typeof CalcEngine !== 'undefined') return CalcEngine;
  if (typeof globalThis !== 'undefined' && globalThis.CalcEngine) return globalThis.CalcEngine;
  return require('./CalcEngine');
}

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

  /**
   * Coerce any complex, fraction, or bigNumber to a real number.
   * Imaginary residuals below 1e-12 are treated as real.
   */
  static coerceToNumber(val) {
    if (typeof val === 'number') {
      return val;
    }
    if (val && typeof val.toNumber === 'function') {
      return val.toNumber();
    }
    if (val && typeof val.im === 'number' && typeof val.re === 'number') {
      return Math.abs(val.im) < 1e-12 ? val.re : NaN;
    }
    return NaN;
  }

  coerceToNumber(val) {
    return GraphEngine.coerceToNumber(val);
  }

  /**
   * Generates a coordinate vector of pixel points for a given Y = f(x) equation.
   * Runs independently of the DOM.
   */
  generateYPoints(expression, width, height, angleMode = 'rad') {
    if (!expression || expression.trim() === '') {
      return { points: [], compiled: null, error: null };
    }

    const CE = resolveCalcEngine();

    try {
      const compiled = math.compile(expression);
      const points = [];

      for (let pixelX = 0; pixelX <= width; pixelX++) {
        const mathX = this.xMin + (pixelX / width) * (this.xMax - this.xMin);
        try {
          // evaluateAt already returns a coerced real number or NaN
          const mathY = CE.evaluateAt(compiled, mathX, angleMode);

          if (typeof mathY === 'number' && !isNaN(mathY) && isFinite(mathY)) {
            const pixelY = height - ((mathY - this.yMin) / (this.yMax - this.yMin)) * height;
            points.push({ x: pixelX, y: pixelY, mathY: mathY });
          } else {
            points.push({ x: pixelX, y: NaN, mathY: mathY });
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

    const CE = resolveCalcEngine();

    try {
      const compiled = math.compile(expression);
      const val = CE.evaluateAt(compiled, 0, angleMode);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GraphEngine;
} else {
  window.GraphEngine = GraphEngine;
}
