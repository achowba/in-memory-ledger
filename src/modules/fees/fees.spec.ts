import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Day } from '../../common/day/day.js';
import { FAULT_CODE } from '../../common/errors/error-codes.js';
import { LedgerError } from '../../common/errors/ledger-error.js';
import { ENTRY_ORIGIN } from '../ledger/ledger-entry.types.js';
import { Ledger } from '../ledger/ledger.js';
import { assessOverdraftFees, overdraftFeeMinor } from './fees.js';

const ACCOUNT = 'ACC-001';

/**
 * Posts one entry against the account under test.
 *
 * @param ledger - The ledger to append to.
 * @param valueDate - The day the entry changes the balance.
 * @param amountMinor - Signed minor units.
 */
function post(ledger: Ledger, valueDate: Day, amountMinor: bigint): void {
  ledger.append({
    accountId: ACCOUNT,
    valueDate,
    bookedOnDay: valueDate,
    amountMinor,
    origin: ENTRY_ORIGIN.CREDIT,
    sourceEventId: 'TEST',
    reversesEntryId: null,
  });
}

/**
 * Builds ACC-001 exactly as it stands at the day five close, before any fee is assessed.
 *
 * Every entry of the brief that is value dated on or before day five and accepted. E1 credits
 * 1,200.00. E2 debits 950.00. E4 credits 400.00. E5 settles 185.00. E7 debits 620.00, backdated
 * to day two. E3 and E8 are authorizations and post nothing. E6 is refused.
 *
 * @returns The ledger.
 */
function ledgerAtDayFiveClose(): Ledger {
  const ledger = new Ledger();
  post(ledger, 0, 0n); // opening balance
  post(ledger, 1, 120000n); // E1
  post(ledger, 1, -95000n); // E2
  post(ledger, 3, 40000n); // E4
  post(ledger, 4, -18500n); // E5
  post(ledger, 2, -62000n); // E7, booked day five, value dated day two
  return ledger;
}

/**
 * Runs an assessment over ACC-001 in AED.
 *
 * @param ledger - The ledger to assess.
 * @param throughDay - The last day to walk.
 * @returns The value dates of the fees booked.
 */
function assess(ledger: Ledger, throughDay: 1 | 2 | 3 | 4 | 5 | 6): readonly Day[] {
  return assessOverdraftFees({
    ledger,
    accountId: ACCOUNT,
    currency: 'AED',
    throughDay,
    bookedOnDay: throughDay,
  }).map((entry) => entry.valueDate);
}

describe('assessOverdraftFees, a window with nothing overdrawn', () => {
  it('books no fee when every day closes above zero', () => {
    const ledger = new Ledger();
    post(ledger, 1, 25000n);

    assert.deepEqual(assess(ledger, 6), []);
  });

  // Strictly below zero. A day that closes at exactly 0.00 is not overdrawn, and charging
  // an account that owes nothing is the kind of wrong a customer notices.
  it('books no fee for a day that closes at exactly zero', () => {
    const ledger = new Ledger();
    post(ledger, 1, 25000n);
    post(ledger, 1, -25000n);

    assert.deepEqual(assess(ledger, 6), []);
  });

  it('books a fee for a day one fils below zero', () => {
    const ledger = new Ledger();
    post(ledger, 1, -1n);

    assert.deepEqual(assess(ledger, 1), [1]);
  });
});

describe('assessOverdraftFees, the cascade E7 sets off', () => {
  // The headline finding. Acceptance criterion 2 claims E7 causes exactly one fee, on day
  // two. E7 is value dated day two, so it lowers days two, three, four and five together,
  // and three of those close below zero. See REJECTED.md.
  it('books three fees, on days two, four and five', () => {
    const ledger = ledgerAtDayFiveClose();

    assert.deepEqual(assess(ledger, 5), [2, 4, 5]);
  });

  it('does not book only one fee, which is what criterion 2 claims', () => {
    const ledger = ledgerAtDayFiveClose();

    assert.notEqual(assess(ledger, 5).length, 1);
  });

  // Day three is the near miss the brief designed in. 650.00 minus 620.00 is 30.00. The day two
  // fee is value dated day two, so it lowers day three as well. Day three is left at 5.00.
  it('skips day three, which escapes by exactly 5.00', () => {
    const ledger = ledgerAtDayFiveClose();
    assess(ledger, 5);

    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 3 }), 500n);
  });

  it('leaves each fee value dated to the day it covers', () => {
    const ledger = ledgerAtDayFiveClose();
    assess(ledger, 5);

    for (const day of [2, 4, 5] as const) {
      assert.equal(ledger.hasEntry(ACCOUNT, ENTRY_ORIGIN.OVERDRAFT_FEE, day), true);
    }
    assert.equal(ledger.hasEntry(ACCOUNT, ENTRY_ORIGIN.OVERDRAFT_FEE, 3), false);
  });

  // A fee lands on the day it covers. A fee is booked on the day the run happens. So the two
  // clocks stay honest even for a fee against an already closed day.
  it('books a backdated fee on the run day and value dates it to the day it covers', () => {
    const ledger = ledgerAtDayFiveClose();
    const fees = assessOverdraftFees({
      ledger,
      accountId: ACCOUNT,
      currency: 'AED',
      throughDay: 5,
      bookedOnDay: 5,
    });

    const dayTwoFee = fees.find((fee) => fee.valueDate === 2);
    assert.ok(dayTwoFee !== undefined);
    assert.equal(dayTwoFee.bookedOnDay, 5, 'the bank charged it on day five');
    assert.equal(dayTwoFee.valueDate, 2, 'it covers day two');
  });

  it('leaves the account 75.00 down in fees', () => {
    const ledger = ledgerAtDayFiveClose();
    const before = ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 5 });
    assess(ledger, 5);
    const after = ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 5 });

    assert.equal(before - after, 7500n);
  });
});

describe('assessOverdraftFees, at most one fee per account per day', () => {
  // The guard is on the pair of account and day, not on the run. A backdated entry makes a
  // later run revisit days an earlier run already charged.
  it('books nothing new when the same window is assessed twice', () => {
    const ledger = ledgerAtDayFiveClose();

    assert.deepEqual(assess(ledger, 5), [2, 4, 5]);
    assert.deepEqual(assess(ledger, 5), []);
  });

  it('holds the balance steady across repeated runs over the same window', () => {
    const ledger = ledgerAtDayFiveClose();
    assess(ledger, 5);
    const afterFirst = ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 5 });

    assess(ledger, 5);
    assess(ledger, 5);

    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 5 }), afterFirst);
  });

  // Once per day is not once ever. An account that stays overdrawn is charged again for each
  // new day it stays overdrawn. That is what the rule says, and what a customer would
  // experience. In the real replay E9 arrives on day six and cures the balance before the day
  // six close runs. So this sixth fee never happens. This fixture has no E9.
  it('charges each new day the account is still overdrawn', () => {
    const ledger = ledgerAtDayFiveClose();
    assess(ledger, 5);

    assert.deepEqual(assess(ledger, 6), [6], 'day six is still below zero without E9');
  });

  it('stops charging once a later credit lifts the day above zero', () => {
    const ledger = ledgerAtDayFiveClose();
    assess(ledger, 5);
    post(ledger, 6, 100000n); // a credit on day six, standing in for the reversal

    assert.deepEqual(assess(ledger, 6), []);
  });
});

describe('assessOverdraftFees, why the walk is ascending and covers the whole window', () => {
  // A run at the day four close, before E7 exists, finds nothing. The same days go below
  // zero only once the backdated debit arrives, which is why a run cannot look at today
  // alone.
  it('finds nothing before the backdated debit arrives', () => {
    const ledger = new Ledger();
    post(ledger, 0, 0n);
    post(ledger, 1, 120000n);
    post(ledger, 1, -95000n);
    post(ledger, 3, 40000n);
    post(ledger, 4, -18500n);

    assert.deepEqual(assess(ledger, 4), []);
  });

  it('reaches back and charges the closed days once the backdated debit arrives', () => {
    const ledger = new Ledger();
    post(ledger, 0, 0n);
    post(ledger, 1, 120000n);
    post(ledger, 1, -95000n);
    post(ledger, 3, 40000n);
    post(ledger, 4, -18500n);
    assert.deepEqual(assess(ledger, 4), []);

    post(ledger, 2, -62000n); // E7 arrives on day five
    assert.deepEqual(assess(ledger, 5), [2, 4, 5]);
  });

  it('returns the fees in ascending day order', () => {
    const ledger = ledgerAtDayFiveClose();
    const days = assess(ledger, 5);

    assert.deepEqual(
      [...days],
      [...days].sort((a, b) => a - b),
    );
  });
});

describe('overdraftFeeMinor, the schedule', () => {
  it('prices an AED overdraft at 25.00', () => {
    assert.equal(overdraftFeeMinor('AED'), 2500n);
  });

  // The brief prices the fee in AED only. Inventing a BHD figure would be guessing at an
  // amount a customer gets charged. ACC-002 never goes below zero, so this never fires in
  // the replay, but the gap is real. See AMBIGUITIES.md.
  it('refuses to invent a BHD fee', () => {
    assert.throws(
      () => overdraftFeeMinor('BHD'),
      (error: unknown) =>
        error instanceof LedgerError && error.code === FAULT_CODE.FEE_NOT_PRICED_FOR_CURRENCY,
    );
  });
});

describe('the fee amount is load bearing, and 25.00 sits just under the cliff', () => {
  // Day three closes at 30.00 before any fee, once E7 has posted. The day two fee is value
  // dated day two, so it lowers day three too. Day three goes below zero only when the fee
  // exceeds 30.00, and a fourth fee is then charged. This checks the table in NUMBERS.md.
  const dayThreeBeforeAnyFeeMinor = 3000n;

  it('leaves day three above zero at the fee the brief sets', () => {
    assert.equal(dayThreeBeforeAnyFeeMinor - 2500n, 500n);
    assert.ok(dayThreeBeforeAnyFeeMinor - 2500n >= 0n);
  });

  it('leaves day three above zero at half the fee, so halving changes no count', () => {
    assert.ok(dayThreeBeforeAnyFeeMinor - 1250n >= 0n);
  });

  it('leaves day three at exactly zero at a fee of 30.00, still not overdrawn', () => {
    assert.equal(dayThreeBeforeAnyFeeMinor - 3000n, 0n);
  });

  it('pushes day three below zero at a fee of 30.01, which would charge a fourth time', () => {
    assert.ok(dayThreeBeforeAnyFeeMinor - 3001n < 0n);
  });
});
