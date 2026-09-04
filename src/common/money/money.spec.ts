import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FAULT_CODE, type FaultCode } from '../errors/error-codes.js';
import { LedgerError } from '../errors/ledger-error.js';
import { exponentOf, formatAmount, parseAmount, scaleOf, sumMinor } from './money.js';

/**
 * Builds an assertion that a thrown value is a LedgerError carrying one specific code.
 *
 * @param code - The fault code the call is expected to throw.
 * @returns A predicate suitable for the second argument of `assert.throws`.
 */
function throwsCode(code: FaultCode): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof LedgerError && error.code === code;
}

describe('exponentOf and scaleOf', () => {
  it('reports two decimal places and a scale of 100 for AED', () => {
    assert.equal(exponentOf('AED'), 2);
    assert.equal(scaleOf('AED'), 100n);
  });

  it('reports three decimal places and a scale of 1000 for BHD', () => {
    assert.equal(exponentOf('BHD'), 3);
    assert.equal(scaleOf('BHD'), 1000n);
  });
});

describe('parseAmount', () => {
  it('converts an AED amount to fils', () => {
    assert.equal(parseAmount('AED', '1200.00'), 120000n);
  });

  it('converts a BHD amount to fils at three places', () => {
    assert.equal(parseAmount('BHD', '10.000'), 10000n);
  });

  it('converts a negative amount', () => {
    assert.equal(parseAmount('AED', '-620.00'), -62000n);
  });

  it('accepts an amount written with no fraction', () => {
    assert.equal(parseAmount('AED', '1200'), 120000n);
  });

  it('pads a fraction shorter than the currency precision', () => {
    assert.equal(parseAmount('AED', '1200.5'), 120050n);
  });

  it('ignores digit grouping so the brief can be transcribed verbatim', () => {
    assert.equal(parseAmount('AED', '1,200.00'), 120000n);
  });

  it('converts zero', () => {
    assert.equal(parseAmount('AED', '0.00'), 0n);
  });

  // Edge case: the sign must survive a whole part of zero. A naive implementation that
  // builds the integer from the parts and then applies the sign returns 1n here.
  it('keeps the sign when the whole part is zero', () => {
    assert.equal(parseAmount('AED', '-0.01'), -1n);
  });

  it('refuses an AED amount carrying three decimal places', () => {
    assert.throws(
      () => parseAmount('AED', '1.005'),
      throwsCode(FAULT_CODE.PRECISION_EXCEEDS_CURRENCY),
    );
  });

  // The same text is valid in BHD. Precision is a property of the currency, not a global.
  it('accepts three decimal places in BHD', () => {
    assert.equal(parseAmount('BHD', '1.005'), 1005n);
  });

  it('refuses text that is not a decimal amount', () => {
    assert.throws(() => parseAmount('AED', 'nine'), throwsCode(FAULT_CODE.MALFORMED_AMOUNT));
  });
});

describe('formatAmount', () => {
  it('groups thousands and keeps AED at two places', () => {
    assert.equal(formatAmount('AED', 120000n), '1,200.00');
  });

  it('keeps BHD at three places', () => {
    assert.equal(formatAmount('BHD', 10000n), '10.000');
  });

  it('pads a fraction smaller than one major unit', () => {
    assert.equal(formatAmount('BHD', 8n), '0.008');
  });

  // Brackets rather than a leading minus. This is the accounting convention, and it makes
  // an overdrawn day impossible to miss when scanning a column of the printed report.
  it('brackets a negative amount', () => {
    assert.equal(formatAmount('AED', -37000n), '(370.00)');
  });

  it('renders zero without a sign', () => {
    assert.equal(formatAmount('AED', 0n), '0.00');
  });
});

describe('sumMinor', () => {
  it('totals an empty list as zero', () => {
    assert.equal(sumMinor([]), 0n);
  });

  // The Day 1 balance of ACC-001, built the only way a balance is ever built.
  it('adds a credit and a debit exactly', () => {
    assert.equal(sumMinor([120000n, -95000n]), 25000n);
  });

  // A sum that a float would get wrong. 0.1 + 0.2 !== 0.3 in binary floating point, but
  // 10n + 20n === 30n always. This test is the whole argument for minor units in one line.
  it('adds amounts that binary floating point cannot represent', () => {
    assert.equal(sumMinor([10n, 20n]), 30n);
    assert.equal(formatAmount('AED', sumMinor([10n, 20n])), '0.30');
  });
});
