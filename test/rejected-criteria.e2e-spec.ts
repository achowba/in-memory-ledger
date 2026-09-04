import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { splitEvenly } from '../src/common/allocation/allocation.js';
import { divideRounded } from '../src/common/rounding/rounding.js';
import { sumMinor } from '../src/common/money/money.js';
import { AUTHORIZATION_STATE } from '../src/modules/authorizations/authorization.types.js';
import { dailyAccrualMinor } from '../src/modules/interest/interest.js';
import { replay, type IReplayResult } from '../src/modules/replay/replay-engine.js';
import { ACCOUNTS, EVENT_STREAM } from '../src/modules/replay/scenario.js';

/**
 * The acceptance criteria from the brief that are wrong, each refuted by running the
 * arithmetic that makes it false.
 *
 * These tests pass. A passing test here means the criterion is refuted, not satisfied. The
 * reasoning is argued in `REJECTED.md`; this file is what makes that document checkable.
 */

let result: IReplayResult;

before(() => {
  result = replay(ACCOUNTS, EVENT_STREAM);
});

describe('criterion 2 is wrong: E7 does not cause exactly one fee on day two', () => {
  const feeDays = (): readonly number[] =>
    result.ledger
      .all()
      .filter((entry) => entry.origin === 'OVERDRAFT_FEE')
      .map((entry) => entry.valueDate);

  it('causes three fees, not one', () => {
    assert.equal(feeDays().length, 3);
    assert.notEqual(feeDays().length, 1);
  });

  it('charges them on days two, four and five', () => {
    assert.deepEqual(feeDays(), [2, 4, 5]);
  });

  // E7 is value dated day two, so it lowers days two through five together. Three of those
  // four close below zero. Only day three survives.
  it('is wrong because a day two value date lowers every later day too', () => {
    const withoutFees = new Map([
      [2, 120000n - 95000n - 62000n],
      [3, 120000n - 95000n + 40000n - 62000n],
      [4, 120000n - 95000n + 40000n - 18500n - 62000n],
    ]);

    assert.equal(withoutFees.get(2), -37000n, 'day two closes below zero');
    assert.equal(withoutFees.get(3), 3000n, 'day three closes at 30.00, above zero');
    assert.equal(withoutFees.get(4), -15500n, 'day four closes below zero');
  });

  // The criterion also contradicts criterion 1. You cannot restate day two in order to get
  // (370.00) and then decline to restate days four and five in the same pass.
  it('contradicts criterion 1, which restates day two using day five knowledge', () => {
    assert.equal(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 4 }), 41500n);
    assert.notEqual(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 4 }), 46500n);
  });

  it('costs the account 75.00, not 25.00', () => {
    const charged = result.ledger
      .all()
      .filter((entry) => entry.origin === 'OVERDRAFT_FEE')
      .reduce((total, entry) => total + entry.amountMinor, 0n);

    assert.equal(charged, -7500n);
  });
});

describe('criterion 5 is untestable: Auth-B is never approved', () => {
  // Not refused as false. The statement inside it is true: a hold reduces the available
  // balance and never touches the ledger balance, and that invariant holds here. What is
  // refused is the criterion, because its premise is never reached in this event stream.
  it('holds the invariant the criterion states, using Auth-A which was approved', () => {
    const dayTwo = result.days.find((day) => day.day === 2)?.accounts[0];

    assert.ok(dayTwo !== undefined);
    assert.equal(dayTwo.closingBalanceMinor, 25000n, 'the hold did not touch the ledger');
    assert.equal(dayTwo.activeHoldsMinor, 20000n);
    assert.equal(dayTwo.availableBalanceMinor, 5000n, 'the hold did reduce available');
  });

  it('declines Auth-B, so the premise of the criterion never holds', () => {
    assert.equal(result.holds.find('Auth-B')?.state, AUTHORIZATION_STATE.DECLINED);
  });

  // Available was (155.00) before the hold was even applied, so no hold size was approvable.
  it('would have been declined at any hold size', () => {
    const availableBeforeMinor = -15500n;

    assert.ok(availableBeforeMinor - 9000n < 0n, 'the requested 90.00 fails');
    assert.ok(availableBeforeMinor - 1n < 0n, 'a hold of one fils fails');
    assert.ok(availableBeforeMinor - 0n < 0n, 'even a hold of zero fails');
  });
});

describe('criterion 6 is wrong: nothing returns to its pre-E7 value after E9', () => {
  it('leaves the three fees booked', () => {
    const fees = result.ledger.all().filter((entry) => entry.origin === 'OVERDRAFT_FEE');

    assert.equal(fees.length, 3);
  });

  // Pre-E7 those days closed at 250.00 and 465.00. They do not return to it.
  it('leaves day two at 225.00 and day four at 415.00, not 250.00 and 465.00', () => {
    assert.equal(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 2 }), 22500n);
    assert.equal(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 4 }), 41500n);
    assert.notEqual(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 2 }), 25000n);
    assert.notEqual(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 4 }), 46500n);
  });

  // Append only forbids un-booking. E7 is still there, and so is its reversal.
  it('keeps E7 in the ledger rather than removing it', () => {
    const e7 = result.ledger.all().filter((entry) => entry.sourceEventId === 'E7');
    const e9 = result.ledger.all().filter((entry) => entry.sourceEventId === 'E9');

    const [originalDebit] = e7;
    const [reversalEntry] = e9;
    assert.ok(originalDebit !== undefined, 'the original debit is still there');
    assert.ok(reversalEntry !== undefined, 'the reversal sits beside it');

    assert.equal(originalDebit.amountMinor, -62000n);
    assert.equal(reversalEntry.amountMinor, 62000n);
    assert.equal(reversalEntry.reversesEntryId, originalDebit.entryId);
  });

  // The fees also cost interest the customer no longer earns. 75.00 directly, 0.10 more in
  // foregone interest.
  it('leaves the account short on interest as well as on fees', () => {
    const hadE7NeverHappened = [25000n, 25000n, 65000n, 46500n, 46500n, 46500n];
    const counterfactualMinor = sumMinor(hadE7NeverHappened.map(dailyAccrualMinor));
    const actualMinor = result.interest.find((account) => account.accountId === 'ACC-001')
      ?.totalMinor;

    assert.equal(counterfactualMinor, 103n);
    assert.equal(actualMinor, 93n);
    assert.equal(counterfactualMinor - 93n, 10n);
  });
});

describe('criterion 7 is wrong: three BHD instalments of 3.334 create money', () => {
  it('would total 10.002, which is 0.002 more than was credited', () => {
    assert.equal(3334n * 3n, 10002n);
    assert.equal(10002n - 10000n, 2n);
  });

  it('splits into 3.334, 3.333 and 3.333 instead', () => {
    assert.deepEqual(splitEvenly(10000n, 3), [3334n, 3333n, 3333n]);
  });

  it('posts exactly 10.000 to ACC-002', () => {
    const instalments = result.ledger
      .entriesFor('ACC-002')
      .filter((entry) => entry.sourceEventId === 'E10')
      .map((entry) => entry.amountMinor);

    assert.equal(instalments.length, 3);
    assert.equal(sumMinor(instalments), 10000n);
  });

  // Three genuinely equal parts do not exist at three decimal places. Equality and
  // conservation cannot both hold, and conservation is the one a ledger cannot give up.
  it('cannot make the parts equal without inventing money', () => {
    const parts = splitEvenly(10000n, 3);

    assert.equal(parts.every((part) => part === parts[0]), false);
    assert.equal(sumMinor(parts), 10000n);
  });
});

describe('criterion 8 is wrong: an interest remainder is not discarded', () => {
  const RESTATED = [25000n, 22500n, 62500n, 41500n, 39000n, 39000n];

  it('would discard one fils of a customer money', () => {
    const sumOfRounded = sumMinor(RESTATED.map(dailyAccrualMinor));
    const roundedSum = divideRounded(sumMinor(RESTATED) * 4n, 10000n);

    assert.equal(sumOfRounded, 93n);
    assert.equal(roundedSum, 92n);
    assert.equal(sumOfRounded - roundedSum, 1n);
  });

  // The criterion contradicts the non-negotiable rule printed beside it, which says the
  // rounded daily accruals must sum exactly to the capitalized total. Discarding a remainder
  // guarantees that they do not.
  it('contradicts the rule that the accruals must sum to the total', () => {
    for (const account of result.interest) {
      const summed = sumMinor(account.accruals.map((accrual) => accrual.accrualMinor));

      assert.equal(summed, account.totalMinor, `${account.accountId} does not sum`);
    }
  });

  it('capitalizes 0.93 rather than 0.92', () => {
    assert.equal(
      result.interest.find((account) => account.accountId === 'ACC-001')?.totalMinor,
      93n,
    );
  });
});
