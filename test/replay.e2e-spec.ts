import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import type { ReplayDay } from '../src/common/day/day.js';
import { AUTHORIZATION_STATE } from '../src/modules/authorizations/authorization.types.js';
import { REFUSAL_CODE, WARNING_CODE } from '../src/common/errors/error-codes.js';
import { replay, type IReplayResult } from '../src/modules/replay/replay-engine.js';
import { renderReport } from '../src/modules/report/day-report.js';
import { ACCOUNTS, EVENT_STREAM } from '../src/modules/replay/scenario.js';
import type { IAccountDaySnapshot } from '../src/modules/replay/replay.types.js';

let result: IReplayResult;

before(() => {
  result = replay(ACCOUNTS, EVENT_STREAM);
});

/**
 * Returns one account's snapshot at the close of one day.
 *
 * @param day - Which day.
 * @param accountId - Which account.
 * @returns The snapshot.
 */
function snapshot(day: ReplayDay, accountId: string): IAccountDaySnapshot {
  const found = result.days
    .find((candidate) => candidate.day === day)
    ?.accounts.find((account) => account.accountId === accountId);

  assert.ok(found !== undefined, `no snapshot for ${accountId} on day ${day}`);
  return found;
}

/**
 * Returns the closing balance of an account as it stood at the close of one day.
 *
 * @param day - Which day.
 * @param accountId - Which account.
 * @returns The closing balance in minor units.
 */
function closingAt(day: ReplayDay, accountId = 'ACC-001'): bigint {
  return snapshot(day, accountId).closingBalanceMinor;
}

describe('the six day replay, closing balance as reported at each day close', () => {
  it('closes day one at 250.00', () => {
    assert.equal(closingAt(1), 25000n);
  });

  // Auth-A holds 200.00 but a hold never touches the ledger balance.
  it('closes day two at 250.00, unchanged by the 200.00 hold', () => {
    assert.equal(closingAt(2), 25000n);
    assert.equal(snapshot(2, 'ACC-001').activeHoldsMinor, 20000n);
    assert.equal(snapshot(2, 'ACC-001').availableBalanceMinor, 5000n);
  });

  it('closes day three at 650.00', () => {
    assert.equal(closingAt(3), 65000n);
  });

  // E5 settles 185.00 and releases the whole 200.00 hold. E6 is refused, so its 180.00
  // never leaves the account.
  it('closes day four at 465.00, with the hold released and E6 refused', () => {
    assert.equal(closingAt(4), 46500n);
    assert.equal(snapshot(4, 'ACC-001').activeHoldsMinor, 0n);
  });

  // E7 posts 620.00 backdated to day two, then three fees of 25.00 are assessed.
  it('closes day five at (230.00)', () => {
    assert.equal(closingAt(5), -23000n);
  });

  it('closes day six at 390.00, before interest is capitalized', () => {
    assert.equal(closingAt(6), 39000n);
  });

  it('credits ACC-002 with 10.000 on day five and nothing before', () => {
    assert.equal(closingAt(4, 'ACC-002'), 0n);
    assert.equal(closingAt(5, 'ACC-002'), 10000n);
  });
});

describe('the six day replay, what a backdated entry restates', () => {
  // The central idea of the exercise, as output. E7 arrives on day five and three already
  // reported days move.
  it('restates days two, three and four when E7 arrives on day five', () => {
    assert.deepEqual(
      snapshot(5, 'ACC-001').restatements.map((restatement) => [
        restatement.day,
        restatement.wasMinor,
        restatement.nowMinor,
      ]),
      [
        [2, 25000n, -39500n],
        [3, 65000n, 500n],
        [4, 46500n, -20500n],
      ],
    );
  });

  // Day three closes at 5.00 rather than 30.00 because the day two fee is value dated day
  // two and therefore lowers day three as well. It escapes by exactly 5.00.
  it('leaves day three above zero by exactly 5.00 after the day two fee lands', () => {
    const dayThree = snapshot(5, 'ACC-001').restatements.find(
      (restatement) => restatement.day === 3,
    );

    assert.ok(dayThree !== undefined);
    assert.equal(dayThree.nowMinor, 500n);
  });

  it('restates all four days back up when E9 reverses E7 on day six', () => {
    assert.deepEqual(
      snapshot(6, 'ACC-001').restatements.map((restatement) => [
        restatement.day,
        restatement.nowMinor,
      ]),
      [
        [2, 22500n],
        [3, 62500n],
        [4, 41500n],
        [5, 39000n],
      ],
    );
  });

  it('warns that E7 and E9 are back valued', () => {
    const backValued = result.eventLog
      .all()
      .filter((record) =>
        record.warnings.some((warning) => warning.code === WARNING_CODE.BACK_VALUED_POSTING),
      )
      .map((record) => record.event.eventId);

    assert.deepEqual(backValued, ['E7', 'E9']);
  });
});

describe('the six day replay, overdraft fees', () => {
  const feesOf = (day: ReplayDay): readonly bigint[] =>
    (result.days.find((candidate) => candidate.day === day)?.feesBooked ?? []).map(
      (fee) => BigInt(fee.valueDate),
    );

  it('assesses no fee on days one to four', () => {
    for (const day of [1, 2, 3, 4] as const) {
      assert.deepEqual(feesOf(day), [], `day ${day} should assess nothing`);
    }
  });

  // The headline finding, and the refutation of acceptance criterion 2.
  it('assesses three fees at the day five close, value dated days two, four and five', () => {
    assert.deepEqual(feesOf(5), [2n, 4n, 5n]);
  });

  it('assesses no further fee on day six, because E9 cured every day', () => {
    assert.deepEqual(feesOf(6), []);
  });

  it('charges 75.00 in total', () => {
    const total = result.ledger
      .all()
      .filter((entry) => entry.origin === 'OVERDRAFT_FEE')
      .reduce((sum, entry) => sum + entry.amountMinor, 0n);

    assert.equal(total, -7500n);
  });

  // Booked on day five, value dated to the day each one covers. Both clocks stay honest.
  it('books every fee on day five while value dating each to the day it covers', () => {
    const fees = result.ledger.all().filter((entry) => entry.origin === 'OVERDRAFT_FEE');

    assert.deepEqual(
      fees.map((fee) => [fee.bookedOnDay, fee.valueDate]),
      [
        [5, 2],
        [5, 4],
        [5, 5],
      ],
    );
  });
});

describe('the six day replay, authorizations', () => {
  it('approves Auth-A and settles it on day four for 185.00', () => {
    const authA = result.holds.find('Auth-A');

    assert.ok(authA !== undefined);
    assert.equal(authA.state, AUTHORIZATION_STATE.SETTLED);
    assert.equal(authA.amountMinor, 20000n, 'held 200.00');
    assert.equal(authA.settledAmountMinor, 18500n, 'settled 185.00');
    assert.equal(authA.settledOnDay, 4);
  });

  // Available was already (155.00) before the hold, so no hold size would have been
  // approved. This is why acceptance criterion 5 describes a state never reached.
  it('declines Auth-B', () => {
    const authB = result.holds.find('Auth-B');

    assert.ok(authB !== undefined);
    assert.equal(authB.state, AUTHORIZATION_STATE.DECLINED);
  });

  it('leaves no hold live at the end of the window', () => {
    assert.equal(result.holds.activeHoldsMinor('ACC-001'), 0n);
  });
});

describe('the six day replay, refusals', () => {
  const refusals = (): readonly [string, string][] =>
    result.eventLog
      .all()
      .filter((record) => record.outcome === 'REFUSED')
      .map((record) => [record.event.eventId, record.refusal?.code ?? '']);

  it('refuses exactly two events', () => {
    assert.equal(refusals().length, 2);
  });

  it('refuses E6, whose authorization was never requested', () => {
    assert.deepEqual(refusals()[0], ['E6', REFUSAL_CODE.SETTLEMENT_WITHOUT_AUTHORIZATION]);
  });

  it('refuses E8, whose hold would take available below zero', () => {
    assert.deepEqual(refusals()[1], [
      'E8',
      REFUSAL_CODE.AUTHORIZATION_DECLINED_INSUFFICIENT_AVAILABLE,
    ]);
  });

  // The 180.00 of E6 must not leave the account. Day four closes at 465.00, not 285.00.
  it('leaves the funds of the refused settlement in the account', () => {
    assert.equal(closingAt(4), 46500n);
    assert.notEqual(closingAt(4), 28500n);
  });

  it('books no ledger entry for either refused event', () => {
    const sources = result.ledger.all().map((entry) => entry.sourceEventId);

    assert.equal(sources.includes('E6'), false);
    assert.equal(sources.includes('E8'), false);
  });
});

describe('the six day replay, interest', () => {
  const interestFor = (accountId: string) =>
    result.interest.find((account) => account.accountId === accountId);

  it('accrues 0.10, 0.09, 0.25, 0.17, 0.16 and 0.16 on ACC-001', () => {
    assert.deepEqual(
      interestFor('ACC-001')?.accruals.map((accrual) => accrual.accrualMinor),
      [10n, 9n, 25n, 17n, 16n, 16n],
    );
  });

  it('capitalizes AED 0.93 on ACC-001', () => {
    assert.equal(interestFor('ACC-001')?.totalMinor, 93n);
  });

  it('capitalizes BHD 0.008 on ACC-002, from days five and six only', () => {
    assert.deepEqual(
      interestFor('ACC-002')?.accruals.map((accrual) => accrual.accrualMinor),
      [0n, 0n, 0n, 0n, 4n, 4n],
    );
    assert.equal(interestFor('ACC-002')?.totalMinor, 8n);
  });

  // The brief's rule, checked directly rather than assumed.
  it('makes the rounded daily accruals sum exactly to the capitalized total', () => {
    for (const account of result.interest) {
      const summed = account.accruals.reduce((total, accrual) => total + accrual.accrualMinor, 0n);

      assert.equal(summed, account.totalMinor, `${account.accountId} does not sum`);
    }
  });

  it('books one capitalization entry per account', () => {
    const entries = result.ledger
      .all()
      .filter((entry) => entry.origin === 'INTEREST_CAPITALIZATION');

    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((entry) => entry.valueDate),
      [6, 6],
    );
  });
});

describe('the six day replay, final balances', () => {
  it('leaves ACC-001 at 390.93', () => {
    assert.equal(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 6 }), 39093n);
  });

  it('leaves ACC-002 at 10.008', () => {
    assert.equal(result.ledger.balanceMinor('ACC-002', { valueDateOnOrBefore: 6 }), 10008n);
  });

  // The three BHD instalments, which cannot be equal at three decimal places.
  it('credits ACC-002 as 3.334, 3.333 and 3.333', () => {
    const instalments = result.ledger
      .entriesFor('ACC-002')
      .filter((entry) => entry.sourceEventId === 'E10')
      .map((entry) => entry.amountMinor);

    assert.deepEqual(instalments, [3334n, 3333n, 3333n]);
    assert.equal(instalments.reduce((sum, part) => sum + part, 0n), 10000n);
  });
});

describe('the six day replay, reproducibility', () => {
  // A ledger that cannot be replayed to the same result is not a ledger. No clock, no
  // randomness, no iteration order that depends on anything but the input.
  it('produces an identical report on a second run', () => {
    assert.equal(renderReport(replay(ACCOUNTS, EVENT_STREAM)), renderReport(result));
  });

  it('never mutates an entry once appended', () => {
    for (const entry of result.ledger.all()) {
      assert.equal(Object.isFrozen(entry), true, `${entry.entryId} is not frozen`);
    }
  });

  it('never removes an event from the log, including the refused ones', () => {
    assert.equal(result.eventLog.all().length, EVENT_STREAM.length);
  });
});
