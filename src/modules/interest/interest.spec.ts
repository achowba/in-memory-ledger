import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Day } from '../../common/day/day.js';
import { sumMinor } from '../../common/money/money.js';
import { divideRounded } from '../../common/rounding/rounding.js';
import { DAILY_RATE_DENOMINATOR, DAILY_RATE_NUMERATOR } from './interest.constants.js';
import { ENTRY_ORIGIN, type EntryOrigin } from '../ledger/ledger-entry.types.js';
import { Ledger } from '../ledger/ledger.js';
import { capitalizeInterest, dailyAccrualMinor, dailyAccruals } from './interest.js';

const ACCOUNT = 'ACC-001';

/**
 * Posts one entry against an account.
 *
 * @param ledger - The ledger to append to.
 * @param accountId - The account.
 * @param valueDate - The day the entry changes the balance.
 * @param amountMinor - Signed minor units.
 * @param origin - Why the entry exists.
 */
function post(
  ledger: Ledger,
  accountId: string,
  valueDate: Day,
  amountMinor: bigint,
  origin: EntryOrigin = ENTRY_ORIGIN.CREDIT,
): void {
  ledger.append({
    accountId,
    valueDate,
    bookedOnDay: valueDate,
    amountMinor,
    origin,
    sourceEventId: 'TEST',
    reversesEntryId: null,
  });
}

/**
 * Builds ACC-001 exactly as it stands at the end of day six, after E9 and all three fees.
 *
 * @remarks
 * Restated closing balances are 250.00, 225.00, 625.00, 415.00, 390.00 and 390.00.
 *
 * @returns The ledger.
 */
function ledgerAtEndOfWindow(): Ledger {
  const ledger = new Ledger();
  post(ledger, ACCOUNT, 0, 0n, ENTRY_ORIGIN.OPENING_BALANCE);
  post(ledger, ACCOUNT, 1, 120000n); // E1
  post(ledger, ACCOUNT, 1, -95000n); // E2
  post(ledger, ACCOUNT, 3, 40000n); // E4
  post(ledger, ACCOUNT, 4, -18500n); // E5
  post(ledger, ACCOUNT, 2, -62000n); // E7
  post(ledger, ACCOUNT, 2, 62000n, ENTRY_ORIGIN.REVERSAL); // E9
  post(ledger, ACCOUNT, 2, -2500n, ENTRY_ORIGIN.OVERDRAFT_FEE);
  post(ledger, ACCOUNT, 4, -2500n, ENTRY_ORIGIN.OVERDRAFT_FEE);
  post(ledger, ACCOUNT, 5, -2500n, ENTRY_ORIGIN.OVERDRAFT_FEE);
  return ledger;
}

describe('dailyAccrualMinor, one day at 0.04 percent', () => {
  it('accrues nothing on a zero balance, because zero is not positive', () => {
    assert.equal(dailyAccrualMinor(0n), 0n);
  });

  // No debit interest in this model. An overdrawn day is priced by the flat fee instead.
  it('accrues nothing on a negative balance', () => {
    assert.equal(dailyAccrualMinor(-37000n), 0n);
  });

  it('accrues 0.10 on 250.00', () => {
    assert.equal(dailyAccrualMinor(25000n), 10n);
  });

  it('accrues 0.09 on 225.00', () => {
    assert.equal(dailyAccrualMinor(22500n), 9n);
  });

  it('accrues 0.25 on 625.00', () => {
    assert.equal(dailyAccrualMinor(62500n), 25n);
  });

  it('accrues 0.17 on 415.00, rounding 16.6 fils up', () => {
    assert.equal(dailyAccrualMinor(41500n), 17n);
  });

  it('accrues 0.16 on 390.00, rounding 15.6 fils up', () => {
    assert.equal(dailyAccrualMinor(39000n), 16n);
  });

  it('accrues 0.004 on BHD 10.000, exactly', () => {
    assert.equal(dailyAccrualMinor(10000n), 4n);
  });
});

describe('dailyAccruals, restated across the whole window', () => {
  it('reads the six restated closing balances', () => {
    const accruals = dailyAccruals(ledgerAtEndOfWindow(), ACCOUNT);

    assert.deepEqual(
      accruals.map((accrual) => accrual.closingBalanceMinor),
      [25000n, 22500n, 62500n, 41500n, 39000n, 39000n],
    );
  });

  it('produces the six rounded accruals', () => {
    const accruals = dailyAccruals(ledgerAtEndOfWindow(), ACCOUNT);

    assert.deepEqual(
      accruals.map((accrual) => accrual.accrualMinor),
      [10n, 9n, 25n, 17n, 16n, 16n],
    );
  });

  it('covers all six days of the window', () => {
    const accruals = dailyAccruals(ledgerAtEndOfWindow(), ACCOUNT);

    assert.deepEqual(
      accruals.map((accrual) => accrual.day),
      [1, 2, 3, 4, 5, 6],
    );
  });
});

describe('capitalizeInterest, the single credit', () => {
  it('capitalizes AED 0.93 for ACC-001', () => {
    const { totalMinor } = capitalizeInterest(ledgerAtEndOfWindow(), ACCOUNT);

    assert.equal(totalMinor, 93n);
  });

  // The brief requires the rounded daily accruals to sum exactly to the capitalized total.
  // Defining the total as the sum is what makes that true by construction.
  it('makes the total equal the sum of the rounded accruals, by construction', () => {
    const { accruals, totalMinor } = capitalizeInterest(ledgerAtEndOfWindow(), ACCOUNT);

    assert.equal(sumMinor(accruals.map((accrual) => accrual.accrualMinor)), totalMinor);
  });

  it('books one credit, value dated the last day', () => {
    const ledger = ledgerAtEndOfWindow();
    const { entry } = capitalizeInterest(ledger, ACCOUNT);

    assert.ok(entry !== null);
    assert.equal(entry.origin, ENTRY_ORIGIN.INTEREST_CAPITALIZATION);
    assert.equal(entry.valueDate, 6);
    assert.equal(entry.amountMinor, 93n);
  });

  it('leaves ACC-001 at 390.93', () => {
    const ledger = ledgerAtEndOfWindow();
    capitalizeInterest(ledger, ACCOUNT);

    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 6 }), 39093n);
  });

  // Accruing on the balance after capitalization would make the calculation depend on its
  // own result. Day six accrues on 390.00, not on 390.93.
  it('accrues day six before the credit lands, not after', () => {
    const ledger = ledgerAtEndOfWindow();
    const { accruals } = capitalizeInterest(ledger, ACCOUNT);
    const daySix = accruals.find((accrual) => accrual.day === 6);

    assert.ok(daySix !== undefined);
    assert.equal(daySix.closingBalanceMinor, 39000n);
    assert.equal(daySix.accrualMinor, 16n);
  });

  it('books nothing when the whole window accrues nothing', () => {
    const ledger = new Ledger();
    post(ledger, ACCOUNT, 1, 0n, ENTRY_ORIGIN.OPENING_BALANCE);

    const { totalMinor, entry } = capitalizeInterest(ledger, ACCOUNT);

    assert.equal(totalMinor, 0n);
    assert.equal(entry, null);
  });
});

describe('capitalizeInterest, ACC-002 in BHD', () => {
  it('accrues on days five and six only, and capitalizes 0.008', () => {
    const ledger = new Ledger();
    post(ledger, 'ACC-002', 0, 0n, ENTRY_ORIGIN.OPENING_BALANCE);
    post(ledger, 'ACC-002', 5, 3334n);
    post(ledger, 'ACC-002', 5, 3333n);
    post(ledger, 'ACC-002', 5, 3333n);

    const { accruals, totalMinor } = capitalizeInterest(ledger, 'ACC-002');

    assert.deepEqual(
      accruals.map((accrual) => accrual.accrualMinor),
      [0n, 0n, 0n, 0n, 4n, 4n],
    );
    assert.equal(totalMinor, 8n);
    assert.equal(ledger.balanceMinor('ACC-002', { valueDateOnOrBefore: 6 }), 10008n);
  });

  // Days one to four hold exactly zero, and zero is not positive.
  it('accrues nothing on the four days the account holds zero', () => {
    const ledger = new Ledger();
    post(ledger, 'ACC-002', 0, 0n, ENTRY_ORIGIN.OPENING_BALANCE);
    post(ledger, 'ACC-002', 5, 10000n);

    const accruals = dailyAccruals(ledger, 'ACC-002');

    assert.equal(sumMinor(accruals.slice(0, 4).map((accrual) => accrual.accrualMinor)), 0n);
  });
});

describe('why the capitalized total is the sum of the parts', () => {
  const RESTATED = [25000n, 22500n, 62500n, 41500n, 39000n, 39000n];

  // Acceptance criterion 8 says a remainder that does not sum is discarded. This is the
  // remainder it means: one fils. Discarding it breaks the rule it sits beside and destroys
  // a customer's money. See REJECTED.md.
  it('differs by one fils from applying the rate to the summed balances', () => {
    const sumOfRounded = sumMinor(RESTATED.map(dailyAccrualMinor));
    const roundedSum = divideRounded(
      sumMinor(RESTATED) * DAILY_RATE_NUMERATOR,
      DAILY_RATE_DENOMINATOR,
    );

    assert.equal(sumOfRounded, 93n);
    assert.equal(roundedSum, 92n);
    assert.equal(sumOfRounded - roundedSum, 1n);
  });
});

describe('the interest reading that was not taken', () => {
  // Accruing on the balance visible at each day's own close, never restated, gives 0.81.
  // Restating gives 0.93. The brief does not say which, and the choice is documented in
  // AMBIGUITIES.md rather than left implicit. This test pins the alternative so the 0.12
  // difference stays a stated number rather than a claim.
  it('would give 0.81 if each day accrued on the balance known at its own close', () => {
    const asKnownAtEachClose = [25000n, 25000n, 65000n, 46500n, -23000n, 39000n];

    assert.equal(sumMinor(asKnownAtEachClose.map(dailyAccrualMinor)), 81n);
  });

  it('gives 0.93 under the restatement this ledger uses', () => {
    const { totalMinor } = capitalizeInterest(ledgerAtEndOfWindow(), ACCOUNT);

    assert.equal(totalMinor, 93n);
  });

  // Had E7 never been posted at all, the window would have earned 1.03. The three fees cost
  // the customer 75.00 directly and a further 0.10 in interest they no longer earn.
  it('would have given 1.03 had E7 never happened, so the fees also cost 0.10 of interest', () => {
    const withoutE7 = [25000n, 25000n, 65000n, 46500n, 46500n, 46500n];

    assert.equal(sumMinor(withoutE7.map(dailyAccrualMinor)), 103n);
    assert.equal(103n - 93n, 10n);
  });
});
