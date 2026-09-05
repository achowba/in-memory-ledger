import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { formatAmount, sumMinor } from '../src/common/money/money.js';
import { dailyAccrualMinor } from '../src/modules/interest/interest.js';
import { replay, type IReplayResult } from '../src/modules/replay/replay-engine.js';
import { ACCOUNTS, EVENT_STREAM } from '../src/modules/replay/scenario.js';

/**
 * The one failing test the brief asks for. It fails against this design on purpose.
 *
 * The failing test is named `known gap: ...`, which is how `npm run test:green` excludes it
 * with `--test-skip-pattern`. `npm test` includes it and reports exactly one failure. Do not
 * fix it by weakening the assertion. The failure is the deliverable.
 *
 * WHAT IT REVEALS
 *
 * E9 reverses E7 in full, at E7's own value date of day two, so every trace of E7 in the
 * balances is undone. The customer is still not made whole, and this design cannot make them
 * whole, because it treats the two consequences of E7 in opposite ways.
 *
 * Interest is a DERIVED quantity. It is recomputed from the entries whenever it is needed,
 * so reversing the cause repairs it with nobody intervening. The days E7 dragged below zero
 * earn again, automatically. The passing test at the bottom of this file shows that working.
 *
 * A fee is an ASSESSED DECISION. It records what the system concluded on day five with the
 * facts it had on day five. Reversing the cause does not retract the decision, and the append
 * only invariant means it cannot be un-booked. The three fees stand.
 *
 * That asymmetry is defensible on its own terms and it is deliberate. The gap is that this
 * design has no way to decide when it should NOT hold.
 *
 * WHY THE DESIGN CANNOT DECIDE
 *
 * A reversal carries no reason code. The event says only "E9 reverses E7". So the system
 * cannot tell these two situations apart:
 *
 *   The bank posted E7 in error. The fees are the bank's own fault, and under the CBUAE
 *   Consumer Protection Standards the bank must correct the error and refund them.
 *
 *   The customer's payment was legitimately returned. The account really was overdrawn on
 *   days two, four and five. The fees were correctly charged and should stand.
 *
 * Identical events, opposite correct answers. The model has no field that separates them, so
 * it applies one rule to both and is wrong about one of them every time.
 *
 * WHAT WOULD FIX IT
 *
 * Not a change to the fee engine. A missing domain concept: a reason code on the reversal,
 * drawn from a closed list. Bank error routes to a fee reversal workflow under maker checker.
 * Customer return leaves the fees in place. That is the control named in section three of
 * ARCHITECTURE.md. It is named there rather than built here because of scope, not because the
 * gap went unnoticed.
 *
 * THE COST, IN THIS REPLAY
 *
 * Had E7 never posted, ACC-001 would close at AED 466.03. That is a balance of 465.00 plus
 * 1.03 of interest. It closes at 390.93. The shortfall is AED 75.10. That is 75.00 of fees,
 * plus 0.10 of interest those fees cost by holding every later balance down.
 *
 * On a balance of 466.03 that is 16 percent of the account. It is decided by a rule the
 * customer cannot see, and one the system cannot justify either way.
 */

/** The closing balances of ACC-001 had E7 never been posted at all. */
const CLOSING_BALANCES_WITHOUT_E7 = [25000n, 25000n, 65000n, 46500n, 46500n, 46500n];

/** What ACC-001 would close at without E7: the day six balance plus the interest it earns. */
const WITHOUT_E7_FINAL_MINOR =
  46500n + sumMinor(CLOSING_BALANCES_WITHOUT_E7.map(dailyAccrualMinor));

let result: IReplayResult;

before(() => {
  result = replay(ACCOUNTS, EVENT_STREAM);
});

describe('a reversal that undoes its cause', () => {
  // The account is AED 75.10 short of where it would be had E7 never posted. That is 75.00 of
  // fees, which append only forbids un-booking. It is also 0.10 of interest those fees cost, by
  // holding every later balance down.
  it('known gap: leaves the customer where they would have been without E7', () => {
    const actualMinor = result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 6 });
    const shortfallMinor = WITHOUT_E7_FINAL_MINOR - actualMinor;

    assert.equal(
      actualMinor,
      WITHOUT_E7_FINAL_MINOR,
      `expected AED ${formatAmount('AED', WITHOUT_E7_FINAL_MINOR)}, the balance had E7 never ` +
        `posted, but got AED ${formatAmount('AED', actualMinor)}. The account is ` +
        `AED ${formatAmount('AED', shortfallMinor)} short: AED 75.00 of fees the reversal did ` +
        `not undo, plus AED 0.10 of interest those fees cost. The design cannot tell whether ` +
        `E7 was a bank error, in which case the fees must be refunded, or a legitimate return, ` +
        `in which case they must stand. A REVERSAL carries no reason code.`,
    );
  });
});

describe('the half of the asymmetry that does work', () => {
  // PASSES. It is here so the failure above reads as a policy gap rather than a bug.
  // Interest repairs itself with nobody intervening, because it is derived rather than
  // assessed. That is exactly what a fee cannot do.
  it('restores the interest on every day E7 had dragged below zero', () => {
    const accruals =
      result.interest.find((account) => account.accountId === 'ACC-001')?.accruals ?? [];

    assert.equal(accruals.length, 6);
    for (const accrual of accruals) {
      assert.ok(
        accrual.accrualMinor > 0n,
        `day ${accrual.day} accrued nothing, so the reversal did not restore it`,
      );
    }
  });
});
