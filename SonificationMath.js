/**
 * SonificationMath.js
 * Pitch/pan mapping and critical-point detection. DOM-free.
 * Depends on CalcEngine.evaluateAt for angle-mode-aware evaluation.
 */

function resolveCalcEngine() {
  if (typeof CalcEngine !== 'undefined') return CalcEngine;
  if (typeof globalThis !== 'undefined' && globalThis.CalcEngine) return globalThis.CalcEngine;
  return require('./CalcEngine');
}

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

  /**
   * Detect local min/max or near-root at x using angle-mode-aware evaluation.
   * @param {number} x
   * @param {Object} compiled
   * @param {string} angleMode - 'rad' or 'deg'
   * @returns {{type: string, y: number}|null}
   */
  static checkCriticalPoint(x, compiled, angleMode = 'rad') {
    if (!compiled) return null;

    const CE = resolveCalcEngine();

    try {
      const y = CE.evaluateAt(compiled, x, angleMode);
      if (isNaN(y) || !isFinite(y)) return null;

      const eps = 0.005; // Small delta for derivative check
      const yPrev = CE.evaluateAt(compiled, x - eps, angleMode);
      const yNext = CE.evaluateAt(compiled, x + eps, angleMode);

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SonificationMath;
} else {
  window.SonificationMath = SonificationMath;
}
