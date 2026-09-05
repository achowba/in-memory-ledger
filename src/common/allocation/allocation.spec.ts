import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FAULT_CODE } from '../errors/error-codes.js';
import { LedgerError } from '../errors/ledger-error.js';
import { splitEvenly } from './allocation.js';

/**
 * Adds up the parts of a split.
 *
 * @param parts - The parts returned by `splitEvenly`.
 * @returns Their total.
 */
function total(parts: readonly bigint[]): bigint {
  return parts.reduce((sum, part) => sum + part, 0n);
}

describe('splitEvenly, the BHD case from the brief', () => {
  // E10 credits BHD 10.000 as three equal instalments. 10000 fils over three parts.
  it('splits BHD 10.000 into 3.334, 3.333 and 3.333', () => {
    assert.deepEqual(splitEvenly(10000n, 3), [3334n, 3333n, 3333n]);
  });

  it('produces parts that sum to exactly the total', () => {
    assert.equal(total(splitEvenly(10000n, 3)), 10000n);
  });

  // Acceptance criterion 7 asks for three parts of 3.334. This is why that is refused: the
  // criterion creates BHD 0.002 that nobody deposited. See REJECTED.md.
  it('shows that three parts of 3.334 would create 0.002 from nothing', () => {
    assert.equal(3334n * 3n, 10002n);
    assert.notEqual(3334n * 3n, 10000n);
  });

  // Three genuinely equal parts do not exist at three decimal places. Equality and
  // conservation cannot both hold, and conservation is the one a ledger cannot give up.
  it('cannot make all three parts equal, and keeps the total instead', () => {
    const parts = splitEvenly(10000n, 3);
    const allEqual = parts.every((part) => part === parts[0]);

    assert.equal(allEqual, false, 'the parts are deliberately not all equal');
    assert.equal(total(parts), 10000n, 'the total is preserved exactly');
  });
});

describe('splitEvenly, residual placement', () => {
  it('produces equal parts when the total divides evenly', () => {
    assert.deepEqual(splitEvenly(9n, 3), [3n, 3n, 3n]);
  });

  it('gives a residual of one to the first part', () => {
    assert.deepEqual(splitEvenly(10n, 3), [4n, 3n, 3n]);
  });

  it('gives a residual of two to the first two parts', () => {
    assert.deepEqual(splitEvenly(11n, 3), [4n, 4n, 3n]);
  });

  it('splits zero into zeroes', () => {
    assert.deepEqual(splitEvenly(0n, 3), [0n, 0n, 0n]);
  });

  it('returns the whole total when there is one part', () => {
    assert.deepEqual(splitEvenly(10000n, 1), [10000n]);
  });

  it('handles more parts than there are minor units', () => {
    assert.deepEqual(splitEvenly(2n, 5), [1n, 1n, 0n, 0n, 0n]);
    assert.equal(total(splitEvenly(2n, 5)), 2n);
  });
});

describe('splitEvenly, negative totals', () => {
  // Splitting a debit is as meaningful as splitting a credit, and must not leak a unit.
  it('splits a negative total symmetrically', () => {
    assert.deepEqual(splitEvenly(-10000n, 3), [-3334n, -3333n, -3333n]);
  });

  it('preserves a negative total exactly', () => {
    assert.equal(total(splitEvenly(-10000n, 3)), -10000n);
  });
});

describe('splitEvenly, conservation of value', () => {
  // The one property that must hold for every input. Deterministic sweep, no randomness,
  // per the testing convention.
  it('always produces parts that sum to the total', () => {
    for (let amount = -500n; amount <= 500n; amount += 1n) {
      for (let parts = 1; parts <= 7; parts += 1) {
        assert.equal(
          total(splitEvenly(amount, parts)),
          amount,
          `lost value splitting ${amount} into ${parts}`,
        );
      }
    }
  });

  // Parts differ by at most one minor unit, which is what "as equal as the currency
  // allows" means. A split that dumped the whole residual on one part would also conserve
  // value, and would be wrong.
  it('never spreads the parts by more than one minor unit', () => {
    for (let amount = 0n; amount <= 500n; amount += 1n) {
      for (let parts = 1; parts <= 7; parts += 1) {
        const split = splitEvenly(amount, parts);
        const largest = split.reduce((a, b) => (a > b ? a : b));
        const smallest = split.reduce((a, b) => (a < b ? a : b));

        assert.ok(largest - smallest <= 1n, `spread too wide splitting ${amount} into ${parts}`);
      }
    }
  });
});

describe('splitEvenly, refusals', () => {
  it('refuses a part count of zero', () => {
    assert.throws(
      () => splitEvenly(100n, 0),
      (error: unknown) =>
        error instanceof LedgerError && error.code === FAULT_CODE.SPLIT_COUNT_INVALID,
    );
  });

  it('refuses a negative part count', () => {
    assert.throws(
      () => splitEvenly(100n, -3),
      (error: unknown) =>
        error instanceof LedgerError && error.code === FAULT_CODE.SPLIT_COUNT_INVALID,
    );
  });

  it('refuses a fractional part count', () => {
    assert.throws(
      () => splitEvenly(100n, 2.5),
      (error: unknown) =>
        error instanceof LedgerError && error.code === FAULT_CODE.SPLIT_COUNT_INVALID,
    );
  });
});
