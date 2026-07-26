const { test, describe } = require('node:test');
const assert = require('node:assert');
const { SonificationMath, assertClose, compile } = require('./testHelpers');

describe('SonificationMath - mapYToFrequency', () => {
  test('maps yMin to 200 Hz and yMax to 1000 Hz', () => {
    assertClose(SonificationMath.mapYToFrequency(-10, -10, 10), 200);
    assertClose(SonificationMath.mapYToFrequency(10, -10, 10), 1000);
  });

  test('maps midpoint to geometric mean of 200 and 1000', () => {
    // 200 * 5^0.5 = 200 * sqrt(5) ≈ 447.2136
    assertClose(SonificationMath.mapYToFrequency(0, -10, 10), 200 * Math.sqrt(5), 1e-6);
  });

  test('clamps outside window', () => {
    assertClose(SonificationMath.mapYToFrequency(-100, -10, 10), 200);
    assertClose(SonificationMath.mapYToFrequency(100, -10, 10), 1000);
  });
});

describe('SonificationMath - mapXToPan', () => {
  test('maps xMin to -1 and xMax to 1', () => {
    assertClose(SonificationMath.mapXToPan(-10, -10, 10), -1);
    assertClose(SonificationMath.mapXToPan(10, -10, 10), 1);
  });

  test('maps midpoint to 0', () => {
    assertClose(SonificationMath.mapXToPan(0, -10, 10), 0);
  });

  test('clamps outside window', () => {
    assertClose(SonificationMath.mapXToPan(-100, -10, 10), -1);
    assertClose(SonificationMath.mapXToPan(100, -10, 10), 1);
  });
});

describe('SonificationMath - checkCriticalPoint', () => {
  test('detects maximum of -x^2 at 0 in radians', () => {
    const compiled = compile('-x^2');
    const result = SonificationMath.checkCriticalPoint(0, compiled, 'rad');
    assert.ok(result);
    assert.strictEqual(result.type, 'maximum');
  });

  test('detects minimum of x^2 at 0 in radians', () => {
    const compiled = compile('x^2');
    const result = SonificationMath.checkCriticalPoint(0, compiled, 'rad');
    assert.ok(result);
    assert.strictEqual(result.type, 'minimum');
  });

  test('detects root of x at 0', () => {
    const compiled = compile('x');
    const result = SonificationMath.checkCriticalPoint(0, compiled, 'rad');
    assert.ok(result);
    assert.strictEqual(result.type, 'root');
  });

  test('detects maximum of sin(x) at 90 degrees', () => {
    const compiled = compile('sin(x)');
    const result = SonificationMath.checkCriticalPoint(90, compiled, 'deg');
    assert.ok(result, 'expected maximum at 90° in degree mode');
    assert.strictEqual(result.type, 'maximum');
    assertClose(result.y, 1, 1e-4);
  });

  test('does not falsely report max at 90 when angle mode is radians', () => {
    const compiled = compile('sin(x)');
    // In radians, x=90 is far past several periods; not a local max of sin
    const result = SonificationMath.checkCriticalPoint(90, compiled, 'rad');
    // Unlikely to be maximum; allow null or non-maximum
    if (result) {
      assert.notStrictEqual(result.type, 'maximum');
    }
  });

  test('returns null for null compiled', () => {
    assert.strictEqual(SonificationMath.checkCriticalPoint(0, null, 'rad'), null);
  });
});
