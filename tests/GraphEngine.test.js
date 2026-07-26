const { test, describe } = require('node:test');
const assert = require('node:assert');
const { GraphEngine, assertClose } = require('./testHelpers');

describe('GraphEngine - transforms', () => {
  test('mathToPixel and pixelToMath round-trip', () => {
    const ge = new GraphEngine(-10, 10, -10, 10, 1, 1);
    const width = 320;
    const height = 240;
    const { x: px, y: py } = ge.mathToPixel(0, 0, width, height);
    const back = ge.pixelToMath(px, py, width, height);
    assertClose(back.x, 0, 1e-9);
    assertClose(back.y, 0, 1e-9);
  });

  test('maps window corners to canvas corners', () => {
    const ge = new GraphEngine(-10, 10, -10, 10, 1, 1);
    const tl = ge.mathToPixel(-10, 10, 100, 100);
    assertClose(tl.x, 0, 1e-9);
    assertClose(tl.y, 0, 1e-9);
    const br = ge.mathToPixel(10, -10, 100, 100);
    assertClose(br.x, 100, 1e-9);
    assertClose(br.y, 100, 1e-9);
  });
});

describe('GraphEngine - coerceToNumber', () => {
  test('passes through finite numbers', () => {
    assert.strictEqual(GraphEngine.coerceToNumber(3.5), 3.5);
  });

  test('treats tiny imaginary part as real', () => {
    assertClose(GraphEngine.coerceToNumber({ re: 4, im: 1e-13 }), 4);
  });

  test('rejects meaningful imaginary part as NaN', () => {
    assert.ok(isNaN(GraphEngine.coerceToNumber({ re: 1, im: 0.5 })));
  });

  test('instance method matches static', () => {
    const ge = new GraphEngine();
    assert.strictEqual(ge.coerceToNumber(2), GraphEngine.coerceToNumber(2));
  });
});

describe('GraphEngine - generateYPoints', () => {
  test('samples continuous line y=x', () => {
    const ge = new GraphEngine(-10, 10, -10, 10, 1, 1);
    const { points, compiled, error } = ge.generateYPoints('x', 10, 10, 'rad');
    assert.strictEqual(error, null);
    assert.ok(compiled);
    assert.strictEqual(points.length, 11);
    // At pixelX=5 (mid), mathX=0, mathY=0
    assertClose(points[5].mathY, 0, 1e-9);
  });

  test('inserts NaN gaps for sqrt(x) left of 0', () => {
    const ge = new GraphEngine(-10, 10, -10, 10, 1, 1);
    const { points, error } = ge.generateYPoints('sqrt(x)', 20, 20, 'rad');
    assert.strictEqual(error, null);
    // Left half of window is x < 0 → NaN mathY
    const left = points.filter((p) => p.x < 10);
    assert.ok(left.some((p) => isNaN(p.mathY)));
    const right = points.filter((p) => p.x > 10);
    assert.ok(right.some((p) => !isNaN(p.mathY) && isFinite(p.mathY)));
  });

  test('samples sin(x) correctly in degree mode at 90°', () => {
    const ge = new GraphEngine(0, 180, -2, 2, 1, 1);
    const { points, error } = ge.generateYPoints('sin(x)', 180, 40, 'deg');
    assert.strictEqual(error, null);
    // pixelX corresponding to x=90
    const pt = points.find((p) => Math.abs(p.mathY - 1) < 0.02);
    assert.ok(pt, 'expected a sample near sin(90°)=1');
  });

  test('empty expression returns empty points', () => {
    const ge = new GraphEngine();
    const res = ge.generateYPoints('', 10, 10, 'rad');
    assert.deepStrictEqual(res.points, []);
    assert.strictEqual(res.compiled, null);
  });
});

describe('GraphEngine - generateXPoint', () => {
  test('maps constant vertical line', () => {
    const ge = new GraphEngine(-10, 10, -10, 10, 1, 1);
    const { pixelX, mathX, error } = ge.generateXPoint('2', 100, 'rad');
    assert.strictEqual(error, null);
    assertClose(mathX, 2);
    assertClose(pixelX, 60, 1e-9); // (-10→10) span 20; 2 is 12/20 of width
  });
});
