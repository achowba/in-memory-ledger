import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { divideRounded } from './rounding.js';

describe('divideRounded, placing a quotient against the halfway point', () => {
  it('returns an exact quotient unchanged', () => {
    assert.equal(divideRounded(100n, 10n), 10n);
  });

  it('rounds down below the halfway point', () => {
    assert.equal(divideRounded(104n, 10n), 10n);
  });

  it('rounds up above the halfway point', () => {
    assert.equal(divideRounded(106n, 10n), 11n);
  });

  it('rejects a zero divisor', () => {
    assert.throws(() => divideRounded(1n, 0n), RangeError);
  });
});

describe('divideRounded, resolving an exact tie', () => {
  it('rounds a tie away from zero under HALF_UP', () => {
    assert.equal(divideRounded(105n, 10n, 'HALF_UP'), 11n);
  });

  it('rounds a tie to the even quotient under HALF_EVEN', () => {
    assert.equal(divideRounded(105n, 10n, 'HALF_EVEN'), 10n);
  });

  it('rounds a tie up under HALF_EVEN when the lower quotient is odd', () => {
    assert.equal(divideRounded(115n, 10n, 'HALF_EVEN'), 12n);
  });
});

describe('divideRounded, sign handling', () => {
  // HALF_UP means away from zero, matching Java BigDecimal and the Python decimal module.
  it('rounds a negative tie away from zero', () => {
    assert.equal(divideRounded(-3n, 2n), -2n);
  });

  it('rounds a negative quotient down in magnitude below the halfway point', () => {
    assert.equal(divideRounded(-104n, 10n), -10n);
  });

  it('treats a negative divisor the same as a negative numerator', () => {
    assert.equal(divideRounded(106n, -10n), -11n);
  });

  // A rounding rule that treats a debit differently from a credit of the same size leaks
  // value in one direction. Every magnitude in the window is checked for symmetry.
  it('is symmetric about zero', () => {
    for (let numerator = -250n; numerator <= 250n; numerator += 1n) {
      assert.equal(
        divideRounded(-numerator, 7n),
        -divideRounded(numerator, 7n),
        `asymmetric at ${numerator}`,
      );
    }
  });
});

describe('divideRounded, the six daily accruals of the replay', () => {
  // Interest is balanceMinor * 4n / 10000n, which is 0.04 percent per day.
  const accrue = (balanceMinor: bigint): bigint => divideRounded(balanceMinor * 4n, 10000n);

  it('accrues 0.10 on AED 250.00, exactly', () => {
    assert.equal(accrue(25000n), 10n);
  });

  it('accrues 0.09 on AED 225.00, exactly', () => {
    assert.equal(accrue(22500n), 9n);
  });

  it('accrues 0.25 on AED 625.00, exactly', () => {
    assert.equal(accrue(62500n), 25n);
  });

  // 415.00 gives 16.6 fils. This one actually rounds, and it rounds up.
  it('accrues 0.17 on AED 415.00, rounding 16.6 up', () => {
    assert.equal(accrue(41500n), 17n);
  });

  // 390.00 gives 15.6 fils. Also rounds up.
  it('accrues 0.16 on AED 390.00, rounding 15.6 up', () => {
    assert.equal(accrue(39000n), 16n);
  });

  it('accrues 0.004 on BHD 10.000, exactly', () => {
    assert.equal(accrue(10000n), 4n);
  });

  // The whole reason the brief demands that the rounded dailies sum to the capitalized
  // total. Summing the rounded parts and rounding the summed whole disagree by one fils.
  it('shows that summing rounded parts differs from rounding the summed whole', () => {
    const balances = [25000n, 22500n, 62500n, 41500n, 39000n, 39000n];

    const sumOfRounded = balances.reduce((total, balance) => total + accrue(balance), 0n);
    const roundedSum = accrue(balances.reduce((total, balance) => total + balance, 0n));

    assert.equal(sumOfRounded, 93n, 'the six rounded accruals total 0.93');
    assert.equal(roundedSum, 92n, 'the rate applied to the summed balances gives 0.92');
    assert.notEqual(sumOfRounded, roundedSum);
  });
});

describe('divideRounded, why the rounding mode is fixed rather than left implicit', () => {
  // No tie occurs at 0.04 percent, so the mode changes nothing in the replay. Halve the
  // rate and two of the six accruals land exactly on a tie. See NUMBERS.md.
  const accrueAtHalfRate = (balanceMinor: bigint, mode: 'HALF_UP' | 'HALF_EVEN'): bigint =>
    divideRounded(balanceMinor * 2n, 10000n, mode);

  it('splits on AED 225.00 at half the rate, where 4.5 fils is an exact tie', () => {
    assert.equal(accrueAtHalfRate(22500n, 'HALF_UP'), 5n);
    assert.equal(accrueAtHalfRate(22500n, 'HALF_EVEN'), 4n);
  });

  it('splits on AED 625.00 at half the rate, where 12.5 fils is an exact tie', () => {
    assert.equal(accrueAtHalfRate(62500n, 'HALF_UP'), 13n);
    assert.equal(accrueAtHalfRate(62500n, 'HALF_EVEN'), 12n);
  });
});
