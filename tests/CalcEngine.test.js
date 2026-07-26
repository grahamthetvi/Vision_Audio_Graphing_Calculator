const { test, describe } = require('node:test');
const assert = require('node:assert');
const { CalcEngine, assertClose, compile } = require('./testHelpers');

describe('CalcEngine - evaluateAt', () => {
  test('returns real numbers in radian mode', () => {
    const compiled = compile('sin(x)');
    assertClose(CalcEngine.evaluateAt(compiled, 0, 'rad'), 0);
    assertClose(CalcEngine.evaluateAt(compiled, Math.PI / 2, 'rad'), 1, 1e-9);
  });

  test('respects degree mode for trig', () => {
    const compiled = compile('sin(x)');
    assertClose(CalcEngine.evaluateAt(compiled, 90, 'deg'), 1, 1e-9);
    assertClose(CalcEngine.evaluateAt(compiled, 0, 'deg'), 0);
    assertClose(CalcEngine.evaluateAt(compiled, 180, 'deg'), 0, 1e-9);
  });

  test('coerces near-zero imaginary residuals to real', () => {
    // sqrt of negative yields complex from math.js; should become NaN (non-real)
    const compiled = compile('sqrt(x)');
    const y = CalcEngine.evaluateAt(compiled, -1, 'rad');
    assert.ok(isNaN(y));
  });

  test('returns NaN for null compiled', () => {
    assert.ok(isNaN(CalcEngine.evaluateAt(null, 0, 'rad')));
  });
});

describe('CalcEngine - findRoot', () => {
  test('finds root of x^2 - 4 near guess 3', () => {
    const compiled = compile('x^2 - 4');
    const root = CalcEngine.findRoot(compiled, -10, 10, 'rad', 3);
    assertClose(root, 2, 1e-6);
  });

  test('finds root of sin(x) near pi in radians', () => {
    const compiled = compile('sin(x)');
    const root = CalcEngine.findRoot(compiled, 0, 6, 'rad', 3);
    assertClose(root, Math.PI, 1e-5);
  });

  test('finds root of sin(x) near 180 in degrees', () => {
    const compiled = compile('sin(x)');
    const root = CalcEngine.findRoot(compiled, 0, 360, 'deg', 180);
    assertClose(root, 180, 1e-3);
  });

  test('returns null when no root in window', () => {
    const compiled = compile('x^2 + 1');
    const root = CalcEngine.findRoot(compiled, -2, 2, 'rad', 0);
    assert.strictEqual(root, null);
  });
});

describe('CalcEngine - findExtremum', () => {
  test('finds minimum of x^2 near 0', () => {
    const compiled = compile('x^2');
    const result = CalcEngine.findExtremum(compiled, -5, 5, 'rad', 'min', 0);
    assert.ok(result);
    assertClose(result.x, 0, 1e-3);
    assertClose(result.y, 0, 1e-3);
  });

  test('finds maximum of -x^2 near 0', () => {
    const compiled = compile('-x^2');
    const result = CalcEngine.findExtremum(compiled, -5, 5, 'rad', 'max', 0);
    assert.ok(result);
    assertClose(result.x, 0, 1e-3);
    assertClose(result.y, 0, 1e-3);
  });

  test('finds maximum of sin(x) near 90 degrees', () => {
    const compiled = compile('sin(x)');
    const result = CalcEngine.findExtremum(compiled, 0, 180, 'deg', 'max', 90);
    assert.ok(result);
    assertClose(result.x, 90, 0.5);
    assertClose(result.y, 1, 1e-3);
  });
});

describe('CalcEngine - derivative and integrate', () => {
  test('derivative of x^2 at 3 is ~6', () => {
    const compiled = compile('x^2');
    assertClose(CalcEngine.derivative(compiled, 3, 'rad'), 6, 1e-4);
  });

  test('integral of x from 0 to 1 is ~0.5', () => {
    const compiled = compile('x');
    assertClose(CalcEngine.integrate(compiled, 0, 1, 'rad'), 0.5, 1e-4);
  });

  test('integral returns NaN across discontinuity of 1/x', () => {
    const compiled = compile('1/x');
    const result = CalcEngine.integrate(compiled, -1, 1, 'rad');
    assert.ok(isNaN(result));
  });
});

describe('CalcEngine - secondDerivative and inflection', () => {
  test('second derivative of x^3 at 0 is ~0', () => {
    const compiled = compile('x^3');
    assertClose(CalcEngine.secondDerivative(compiled, 0, 'rad'), 0, 1e-3);
  });

  test('finds inflection of x^3 near 0', () => {
    const compiled = compile('x^3');
    const inf = CalcEngine.findInflectionPoint(compiled, -1, 1, 'rad');
    assertClose(inf, 0, 1e-3);
  });
});

describe('CalcEngine - formatComplexValue', () => {
  test('formats real numbers', () => {
    assert.strictEqual(CalcEngine.formatComplexValue(1.5, 'fix2'), '1.50');
  });

  test('formats complex with negligible imaginary as real', () => {
    assert.strictEqual(CalcEngine.formatComplexValue({ re: 2, im: 1e-15 }, 'fix2'), '2.00');
  });
});
