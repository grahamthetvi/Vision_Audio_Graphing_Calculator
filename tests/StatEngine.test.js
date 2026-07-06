const { test, describe } = require('node:test');
const assert = require('node:assert');
const StatEngine = require('../StatEngine');

// Helper to assert float values are close within a precision tolerance
function assertClose(actual, expected, precision = 1e-6, message = '') {
  if (Math.abs(actual - expected) > precision) {
    assert.fail(message || `Expected ${actual} to be close to ${expected} (diff: ${Math.abs(actual - expected)} > ${precision})`);
  }
}

describe('StatEngine - Distribution Functions', () => {
  test('erf(x) matches standard values', () => {
    assert.strictEqual(StatEngine.erf(0), 0);
    
    // erf(1) is approximately 0.84270079
    assertClose(StatEngine.erf(1), 0.84270079, 1e-6);
    
    // erf(-1) should be symmetric
    assertClose(StatEngine.erf(-1), -0.84270079, 1e-6);
    
    // erf(large) should approach 1
    assertClose(StatEngine.erf(5), 1.0, 1e-6);
    assertClose(StatEngine.erf(-5), -1.0, 1e-6);
  });

  test('phi(z) - Standard Normal PDF', () => {
    // phi(0) = 1/sqrt(2pi) approx 0.398942
    assertClose(StatEngine.phi(0), 0.39894228, 1e-6);
    
    // phi(1) approx 0.241971
    assertClose(StatEngine.phi(1), 0.24197072, 1e-6);
    
    // phi(-1) should equal phi(1)
    assertClose(StatEngine.phi(-1), StatEngine.phi(1), 1e-9);
  });

  test('Phi(z) - Standard Normal CDF', () => {
    assert.strictEqual(StatEngine.Phi(0), 0.5);
    
    // Phi(1) approx 0.841345
    assertClose(StatEngine.Phi(1), 0.84134474, 1e-6);
    
    // Phi(-1) approx 0.158655
    assertClose(StatEngine.Phi(-1), 0.15865525, 1e-6);
    
    // Phi(1) + Phi(-1) should equal 1
    assertClose(StatEngine.Phi(1) + StatEngine.Phi(-1), 1.0, 1e-9);
  });

  test('normalcdf calculates range probabilities', () => {
    // Standard Normal: within 1 standard deviation approx 68.27%
    assertClose(StatEngine.normalcdf(-1, 1, 0, 1), 0.68268949, 1e-6);
    
    // Standard Normal: within 1.96 standard deviations approx 95%
    assertClose(StatEngine.normalcdf(-1.95996, 1.95996, 0, 1), 0.950004, 1e-5);
    
    // General Normal: lower=3, upper=7, mean=5, stdev=2 (which is z between -1 and 1)
    assertClose(StatEngine.normalcdf(3, 7, 5, 2), 0.68268949, 1e-6);
    
    // Infinite ranges
    assertClose(StatEngine.normalcdf(-Infinity, Infinity, 0, 1), 1.0, 1e-6);
    assertClose(StatEngine.normalcdf(-Infinity, 0, 0, 1), 0.5, 1e-6);
    
    // Invalid standard deviation should throw an error
    assert.throws(() => StatEngine.normalcdf(0, 1, 0, 0), /stdev must be positive/);
    assert.throws(() => StatEngine.normalcdf(0, 1, 0, -2.5), /stdev must be positive/);
  });

  test('invNorm calculates boundaries from areas', () => {
    // invNorm(0.5) = mean
    assert.strictEqual(StatEngine.invNorm(0.5, 0, 1), 0);
    assert.strictEqual(StatEngine.invNorm(0.5, 10, 5), 10);
    
    // invNorm(0.975) approx 1.95996
    assertClose(StatEngine.invNorm(0.975, 0, 1), 1.95996398, 2e-6);
    
    // invNorm(0.15865525, mean=5, stdev=2) approx 3 (z = -1)
    assertClose(StatEngine.invNorm(0.15865525, 5, 2), 3.0, 1e-5);
    
    // Invalid area or stdev should throw an error
    assert.throws(() => StatEngine.invNorm(0, 0, 1), /area must be in \(0, 1\)/);
    assert.throws(() => StatEngine.invNorm(1.1, 0, 1), /area must be in \(0, 1\)/);
    assert.throws(() => StatEngine.invNorm(-0.5, 0, 1), /area must be in \(0, 1\)/);
    assert.throws(() => StatEngine.invNorm(0.5, 0, -1), /stdev must be positive/);
    assert.throws(() => StatEngine.invNorm(0.5, 0, 0), /stdev must be positive/);
  });
});

describe('StatEngine - List Sanitization & 1-Variable Stats', () => {
  test('cleanList filters and parses inputs correctly', () => {
    const mixedList = ['1', ' 2.5 ', 'abc', null, undefined, NaN, 10, '3.14e1'];
    const cleaned = StatEngine.cleanList(mixedList);
    assert.deepStrictEqual(cleaned, [1, 2.5, 10, 31.4]);
    
    assert.deepStrictEqual(StatEngine.cleanList([]), []);
    assert.deepStrictEqual(StatEngine.cleanList(null), []);
    assert.deepStrictEqual(StatEngine.cleanList(undefined), []);
  });

  test('compute1VarStats with standard odd length list', () => {
    const list = [1, 2, 3, 4, 5];
    const stats = StatEngine.compute1VarStats(list);
    
    assert.strictEqual(stats.n, 5);
    assert.strictEqual(stats.mean, 3);
    assert.strictEqual(stats.sum, 15);
    assert.strictEqual(stats.sumSq, 55);
    
    // Sx (sample stdev) = sqrt(2.5) approx 1.5811388
    assertClose(stats.Sx, 1.5811388, 1e-6);
    
    // sigMax (population stdev) = sqrt(2) approx 1.4142136
    assertClose(stats.sigMax, 1.4142136, 1e-6);
    
    // 5-Number Summary
    assert.strictEqual(stats.min, 1);
    assert.strictEqual(stats.q1, 1.5);
    assert.strictEqual(stats.median, 3);
    assert.strictEqual(stats.q3, 4.5);
    assert.strictEqual(stats.max, 5);
  });

  test('compute1VarStats with standard even length list', () => {
    const list = [10, 20, 50, 60];
    const stats = StatEngine.compute1VarStats(list);
    
    assert.strictEqual(stats.n, 4);
    assert.strictEqual(stats.mean, 35);
    assert.strictEqual(stats.sum, 140);
    
    // Median of [10, 20, 50, 60] is 35
    assert.strictEqual(stats.median, 35);
    
    // q1 is median of [10, 20] = 15
    assert.strictEqual(stats.q1, 15);
    
    // q3 is median of [50, 60] = 55
    assert.strictEqual(stats.q3, 55);
  });

  test('compute1VarStats handles single element list', () => {
    const list = [42];
    const stats = StatEngine.compute1VarStats(list);
    
    assert.strictEqual(stats.n, 1);
    assert.strictEqual(stats.mean, 42);
    assert.strictEqual(stats.Sx, 0);
    assert.strictEqual(stats.sigMax, 0);
    assert.strictEqual(stats.min, 42);
    assert.strictEqual(stats.median, 42);
    assert.strictEqual(stats.max, 42);
  });

  test('compute1VarStats handles empty or invalid list', () => {
    const stats = StatEngine.compute1VarStats([]);
    assert.strictEqual(stats.n, 0);
    assert.strictEqual(stats.mean, 0);
    assert.strictEqual(stats.sum, 0);
    
    const statsInvalid = StatEngine.compute1VarStats(['abc', null]);
    assert.strictEqual(statsInvalid.n, 0);
  });
});

describe('StatEngine - 2-Variable Stats & Linear Regression', () => {
  test('compute2VarStats with valid bivariate list', () => {
    const xList = [1, 2, 3];
    const yList = [10, 20, 30];
    const stats = StatEngine.compute2VarStats(xList, yList);
    
    assert.strictEqual(stats.n, 3);
    assert.strictEqual(stats.meanX, 2);
    assert.strictEqual(stats.meanY, 20);
    assert.strictEqual(stats.Sx, 1);
    assertClose(stats.Sy, 10, 1e-6);
    assert.strictEqual(stats.minX, 1);
    assert.strictEqual(stats.maxX, 3);
    assert.strictEqual(stats.minY, 10);
    assert.strictEqual(stats.maxY, 30);
  });

  test('compute2VarStats handles size mismatch and bad data filtering', () => {
    // xList is longer than yList, and contains a non-numeric value
    const xList = [1, 'skipped', 3, 4, 5];
    const yList = [10, 20, 30, 40];
    
    // Pairwise processing:
    // (1, 10) -> valid
    // ('skipped', 20) -> invalid, skipped
    // (3, 30) -> valid
    // (4, 40) -> valid
    // (5, undefined) -> truncated/invalid
    
    const stats = StatEngine.compute2VarStats(xList, yList);
    
    assert.strictEqual(stats.n, 3); // (1,10), (3,30), (4,40)
    assertClose(stats.meanX, (1 + 3 + 4) / 3, 1e-6);
    assertClose(stats.meanY, (10 + 30 + 40) / 3, 1e-6);
    assert.strictEqual(stats.minX, 1);
    assert.strictEqual(stats.maxX, 4);
    assert.strictEqual(stats.minY, 10);
    assert.strictEqual(stats.maxY, 40);
  });

  test('compute2VarStats handles empty lists', () => {
    const stats = StatEngine.compute2VarStats([], []);
    assert.strictEqual(stats.n, 0);
    assert.strictEqual(stats.meanX, 0);
  });

  test('computeLinReg computes slope, intercept, and correlation coefficients', () => {
    const xList = [1, 2, 3];
    const yList = [2, 4, 5];
    const regression = StatEngine.computeLinReg(xList, yList);
    
    assert.strictEqual(regression.n, 3);
    
    // For x=[1, 2, 3], y=[2, 4, 5]:
    // slope a = 1.5, intercept b = 2/3
    assertClose(regression.a, 1.5, 1e-6);
    assertClose(regression.b, 0.66666667, 1e-6);
    
    // correlation coefficient r approx 0.9819805
    assertClose(regression.r, 0.9819805, 1e-6);
    assertClose(regression.r2, 0.9642857, 1e-6);
  });

  test('computeLinReg handles vertical line (division by zero for slope)', () => {
    const xList = [2, 2, 2];
    const yList = [1, 2, 3];
    const regression = StatEngine.computeLinReg(xList, yList);
    
    assert.strictEqual(regression.n, 3);
    assert.strictEqual(regression.a, 0); // Slope defaults to 0 when division by zero
    assert.strictEqual(regression.b, 2); // Intercept defaults to meanY
    assert.strictEqual(regression.r, 0);
    assert.strictEqual(regression.r2, 0);
  });

  test('computeLinReg handles empty lists', () => {
    const regression = StatEngine.computeLinReg([], []);
    assert.strictEqual(regression.n, 0);
    assert.strictEqual(regression.a, 0);
    assert.strictEqual(regression.b, 0);
    assert.strictEqual(regression.r, 0);
  });
});
