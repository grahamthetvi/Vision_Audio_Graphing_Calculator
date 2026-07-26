/**
 * CalcEngine.js
 * Numerical solvers and expression evaluation at X. DOM-free.
 * Expression backend is global `math` (math.js) via compiled exprs; ESP replaces with TinyExpr.
 */

class CalcEngine {
  /**
   * Coerce any complex/fraction/bigNumber to a real number.
   * Imaginary residuals below 1e-12 are treated as real.
   */
  static coerceToReal(val) {
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

  /**
   * Formats a value, handling numbers and math.js complex objects.
   */
  static formatComplexValue(val, precisionMode) {
    if (typeof val === 'number') {
      return CalcEngine.formatReal(val, precisionMode);
    }

    // Check if it is a complex number from math.js
    if (val && typeof val.re === 'number' && typeof val.im === 'number') {
      const re = val.re;
      const im = val.im;

      // If imaginary part is practically zero, format as real
      if (Math.abs(im) < 1e-12) {
        return CalcEngine.formatReal(re, precisionMode);
      }

      // If real part is practically zero, format as imaginary
      if (Math.abs(re) < 1e-12) {
        return CalcEngine.formatImaginary(im, precisionMode);
      }

      // Both real and imaginary parts are present: a + bi or a - bi
      const reStr = CalcEngine.formatReal(re, precisionMode);
      const imStr = CalcEngine.formatImaginary(Math.abs(im), precisionMode);
      const sign = im > 0 ? ' + ' : ' - ';

      return `${reStr}${sign}${imStr}`;
    }

    if (val && typeof val.toString === 'function') {
      return val.toString();
    }
    return String(val);
  }

  static formatReal(val, precisionMode) {
    if (typeof val !== 'number' || isNaN(val)) return "NaN";
    if (!isFinite(val)) return val > 0 ? "Infinity" : "-Infinity";
    if (precisionMode === 'float') {
      return parseFloat(val.toFixed(6)).toString();
    }
    const prec = parseInt(precisionMode.slice(3)) || 2;
    return val.toFixed(prec);
  }

  static formatImaginary(im, precisionMode) {
    if (im === 1) return 'i';
    if (im === -1) return '-i';
    const formatted = CalcEngine.formatReal(im, precisionMode);
    return `${formatted}i`;
  }

  /**
   * Evaluates the equation at X, respecting Angle Mode (rad vs deg).
   * Always returns a coerced real number, or NaN.
   * @param {Object} compiled - Compiled math.js expression
   * @param {number} xVal - The X coordinate
   * @param {string} angleMode - 'rad' or 'deg'
   * @returns {number}
   */
  static evaluateAt(compiled, xVal, angleMode) {
    if (!compiled) return NaN;
    try {
      const scope = { x: xVal };
      if (angleMode === 'deg') {
        scope.sin = (val) => Math.sin(val * Math.PI / 180);
        scope.cos = (val) => Math.cos(val * Math.PI / 180);
        scope.tan = (val) => Math.tan(val * Math.PI / 180);
        scope.asin = (val) => Math.asin(val) * 180 / Math.PI;
        scope.acos = (val) => Math.acos(val) * 180 / Math.PI;
        scope.atan = (val) => Math.atan(val) * 180 / Math.PI;
      }
      const raw = compiled.evaluate(scope);
      return CalcEngine.coerceToReal(raw);
    } catch {
      return NaN;
    }
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
        if (isFinite(yLeft) && isFinite(yRight)) {
          if (yLeft > y && yLeft > yRight) {
            x = x - step;
          } else if (yRight > y && yRight > yLeft) {
            x = x + step;
          } else {
            step /= 2;
          }
        } else {
          step /= 2;
        }
      } else {
        if (isFinite(yLeft) && isFinite(yRight)) {
          if (yLeft < y && yLeft < yRight) {
            x = x - step;
          } else if (yRight < y && yRight < yLeft) {
            x = x + step;
          } else {
            step /= 2;
          }
        } else {
          step /= 2;
        }
      }
    }

    const finalY = this.evaluateAt(compiled, x, angleMode);
    if (isNaN(finalY) || !isFinite(finalY)) return null;
    return { x, y: finalY };
  }

  /**
   * Calculates dy/dx at xVal
   */
  static derivative(compiled, xVal, angleMode) {
    const h = 1e-5;
    try {
      const y1 = this.evaluateAt(compiled, xVal - h, angleMode);
      const y2 = this.evaluateAt(compiled, xVal + h, angleMode);
      if (isNaN(y1) || isNaN(y2) || !isFinite(y1) || !isFinite(y2)) return NaN;
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

      if (isNaN(yStart) || isNaN(yEnd) || !isFinite(yStart) || !isFinite(yEnd)) return NaN;

      let sum = 0.5 * (yStart + yEnd);
      for (let i = 1; i < N; i++) {
        const yVal = this.evaluateAt(compiled, lower + i * h, angleMode);
        if (isNaN(yVal) || !isFinite(yVal)) return NaN;
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalcEngine;
} else {
  window.CalcEngine = CalcEngine;
}
