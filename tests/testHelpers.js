/**
 * Shared Node setup for portable core tests.
 * Loads math.js as global `math` (browser parity) and core engines in dependency order.
 */
const { create, all } = require('mathjs');

global.math = create(all);

const GraphEngine = require('../GraphEngine');
const CalcEngine = require('../CalcEngine');
const SonificationMath = require('../SonificationMath');

// Mirror browser globals so GraphEngine.generateYPoints can reach CalcEngine
global.GraphEngine = GraphEngine;
global.CalcEngine = CalcEngine;
global.SonificationMath = SonificationMath;

function assertClose(actual, expected, precision = 1e-6, message = '') {
  if (typeof actual !== 'number' || isNaN(actual)) {
    throw new Error(message || `Expected a number close to ${expected}, got ${actual}`);
  }
  if (Math.abs(actual - expected) > precision) {
    throw new Error(message || `Expected ${actual} to be close to ${expected} (diff: ${Math.abs(actual - expected)} > ${precision})`);
  }
}

function compile(expr) {
  return math.compile(expr);
}

module.exports = {
  GraphEngine,
  CalcEngine,
  SonificationMath,
  assertClose,
  compile,
  math
};
