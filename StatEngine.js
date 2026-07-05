/**
 * StatEngine.js
 * Lean, optimized statistical algorithms for descriptive stats and distributions.
 * Native JS array operations only. Designed for easy translation to C++/ESP32-S3.
 */

class StatEngine {
  /**
   * Standard Error Function (erf) approximation.
   * Abramowitz and Stegun approximation (formula 7.1.26)
   * Max error: 1.5e-7
   */
  static erf(x) {
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const p = 0.3275911;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;

    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
  }

  /**
   * Standard Normal PDF (phi)
   */
  static phi(z) {
    return Math.exp(-z * z / 2.0) / Math.sqrt(2.0 * Math.PI);
  }

  /**
   * Standard Normal CDF (Phi)
   */
  static Phi(z) {
    return 0.5 * (1.0 + StatEngine.erf(z / Math.sqrt(2.0)));
  }

  /**
   * Normal Cumulative Distribution Function (normalcdf)
   * Computes P(lower <= X <= upper) for X ~ N(mean, stdev)
   */
  static normalcdf(lower, upper, mean = 0, stdev = 1) {
    if (stdev <= 0) throw new Error("stdev must be positive");
    const zLower = (lower - mean) / stdev;
    const zUpper = (upper - mean) / stdev;
    return StatEngine.Phi(zUpper) - StatEngine.Phi(zLower);
  }

  /**
   * Inverse Normal boundary finder (invNorm)
   * Finds X such that P(X <= x) = area for X ~ N(mean, stdev)
   */
  static invNorm(area, mean = 0, stdev = 1) {
    if (area <= 0 || area >= 1) throw new Error("area must be in (0, 1)");
    if (stdev <= 0) throw new Error("stdev must be positive");

    const isNeg = area < 0.5;
    const q = isNeg ? area : 1.0 - area;

    const t = Math.sqrt(-2.0 * Math.log(q));
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;

    let z = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1.0);
    if (isNeg) {
      z = -z;
    }

    // Refine guess with 2 iterations of Newton-Raphson
    for (let i = 0; i < 2; i++) {
      const err = StatEngine.Phi(z) - area;
      const pdf = StatEngine.phi(z);
      if (pdf === 0) break;
      z = z - err / pdf;
    }

    return z * stdev + mean;
  }

  /**
   * Helper to parse and clean array input
   */
  static cleanList(list) {
    if (!list) return [];
    return list
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v) && typeof v === 'number');
  }

  /**
   * Compute 1-Variable Statistics
   */
  static compute1VarStats(list) {
    const data = StatEngine.cleanList(list);
    const n = data.length;

    if (n === 0) {
      return { n: 0, mean: 0, sum: 0, sumSq: 0, Sx: 0, sigMax: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    }

    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const val = data[i];
      sum += val;
      sumSq += val * val;
    }
    const mean = sum / n;

    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = data[i] - mean;
      varianceSum += diff * diff;
    }
    const Sx = n > 1 ? Math.sqrt(varianceSum / (n - 1)) : 0;
    const sigMax = Math.sqrt(varianceSum / n);

    // 5-Number Summary
    const sorted = [...data].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[n - 1];

    const getMedianVal = (arr) => {
      const len = arr.length;
      if (len === 0) return 0;
      const mid = Math.floor(len / 2);
      return len % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    const median = getMedianVal(sorted);
    const mid = Math.floor(n / 2);
    let lowerHalf, upperHalf;
    if (n % 2 === 0) {
      lowerHalf = sorted.slice(0, mid);
      upperHalf = sorted.slice(mid);
    } else {
      lowerHalf = sorted.slice(0, mid);
      upperHalf = sorted.slice(mid + 1);
    }
    const q1 = getMedianVal(lowerHalf);
    const q3 = getMedianVal(upperHalf);

    return { n, mean, sum, sumSq, Sx, sigMax, min, q1, median, q3, max };
  }

  /**
   * Compute 2-Variable Statistics
   */
  static compute2VarStats(xList, yList) {
    const xData = [];
    const yData = [];
    for (let i = 0; i < Math.min(xList.length, yList.length); i++) {
      const x = parseFloat(xList[i]);
      const y = parseFloat(yList[i]);
      if (!isNaN(x) && !isNaN(y)) {
        xData.push(x);
        yData.push(y);
      }
    }

    const n = xData.length;
    if (n === 0) {
      return { n: 0, meanX: 0, meanY: 0, Sx: 0, Sy: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let sumX = 0, sumY = 0;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < n; i++) {
      const x = xData[i];
      const y = yData[i];
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    let varSumX = 0, varSumY = 0;
    for (let i = 0; i < n; i++) {
      varSumX += (xData[i] - meanX) * (xData[i] - meanX);
      varSumY += (yData[i] - meanY) * (yData[i] - meanY);
    }

    const Sx = n > 1 ? Math.sqrt(varSumX / (n - 1)) : 0;
    const Sy = n > 1 ? Math.sqrt(varSumY / (n - 1)) : 0;

    return { n, meanX, meanY, Sx, Sy, minX, maxX, minY, maxY };
  }

  /**
   * Compute Linear Regression (y = ax + b)
   */
  static computeLinReg(xList, yList) {
    const xData = [];
    const yData = [];
    for (let i = 0; i < Math.min(xList.length, yList.length); i++) {
      const x = parseFloat(xList[i]);
      const y = parseFloat(yList[i]);
      if (!isNaN(x) && !isNaN(y)) {
        xData.push(x);
        yData.push(y);
      }
    }

    const n = xData.length;
    if (n === 0) {
      return { n: 0, a: 0, b: 0, r: 0, r2: 0 };
    }

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      const x = xData[i];
      const y = yData[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    const num = n * sumXY - sumX * sumY;
    const denSlope = n * sumX2 - sumX * sumX;

    let a = 0;
    if (denSlope !== 0) {
      a = num / denSlope;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;
    const b = meanY - a * meanX;

    const denCorr = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    let r = 0;
    if (denCorr !== 0) {
      r = num / denCorr;
    }
    const r2 = r * r;

    return { n, a, b, r, r2 };
  }
}

// Export for ESP32 parity and Node/Browser inclusion
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StatEngine;
} else {
  window.StatEngine = StatEngine;
}
