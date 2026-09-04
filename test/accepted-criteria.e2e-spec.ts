import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { AUTHORIZATION_STATE } from '../src/modules/authorizations/authorization.types.js';
import { replay, type IReplayResult } from '../src/modules/replay/replay-engine.js';
import { ACCOUNTS, EVENT_STREAM } from '../src/modules/replay/scenario.js';

/**
 * The acceptance criteria from the brief that survive scrutiny.
 *
 * The four that do not are refuted in `rejected-criteria.e2e-spec.ts` and argued in
 * `REJECTED.md`.
 */

let result: IReplayResult;

before(() => {
  result = replay(ACCOUNTS, EVENT_STREAM);
});

describe('criterion 1: the day two closing balance at the end of day five is (370.00)', () => {
  // ACCEPTED. The criterion is also the brief telling you to build a two clock ledger. The
  // phrase "evaluated at end of Day 5" only means something if a day's closing balance can
  // hold more than one value, and here it holds three.
  it('is (370.00) when asked at the end of day five, before any fee', () => {
    const afterE7 = result.ledger
      .all()
      .filter((entry) => entry.sourceEventId === 'E7')
      .reduce((highest, entry) => (entry.sequence > highest ? entry.sequence : highest), 0);

    assert.notEqual(afterE7, 0, 'E7 must have posted an entry');
    assert.equal(
      result.ledger.balanceMinor('ACC-001', {
        valueDateOnOrBefore: 2,
        knownAsOfSequence: afterE7,
      }),
      -37000n,
    );
  });

  it('is 1,200.00 minus 950.00 minus 620.00, and nothing else', () => {
    assert.equal(120000n - 95000n - 62000n, -37000n);
  });

  // The same day, asked at three different points, gives three different correct answers.
  it('is 250.00 asked on day two and 225.00 asked on day six', () => {
    const beforeE7 = result.ledger
      .all()
      .filter((entry) => entry.bookedOnDay <= 2)
      .reduce((highest, entry) => (entry.sequence > highest ? entry.sequence : highest), 0);

    assert.equal(
      result.ledger.balanceMinor('ACC-001', {
        valueDateOnOrBefore: 2,
        knownAsOfSequence: beforeE7,
      }),
      25000n,
    );
    assert.equal(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 2 }), 22500n);
  });
});

describe('criterion 3: the day four settlement of Auth-A is accepted', () => {
  // ACCEPTED. Auth-A is open, the presentment is smaller than the hold, and a settlement is
  // not gated on available balance because the funds were already reserved.
  it('accepts E5 and posts a debit of 185.00', () => {
    const record = result.eventLog.findAccepted('E5');

    assert.ok(record !== undefined);
    const posted = result.ledger.all().filter((entry) => entry.sourceEventId === 'E5');
    assert.deepEqual(
      posted.map((entry) => entry.amountMinor),
      [-18500n],
    );
  });

  it('marks Auth-A settled and releases the whole 200.00 hold', () => {
    assert.equal(result.holds.find('Auth-A')?.state, AUTHORIZATION_STATE.SETTLED);
    assert.equal(result.holds.activeHoldsMinor('ACC-001'), 0n);
  });
});

describe('criterion 4: a settlement naming an unknown authorization is refused', () => {
  // ACCEPTED as an implementable rule, with a production caveat recorded in REJECTED.md and
  // in ARCHITECTURE.md. A real card issuer must honour a force post or a late presentment
  // under scheme rules, and would post it to a suspense account rather than drop it.
  it('refuses E6, which names Auth-Z', () => {
    const record = result.eventLog
      .all()
      .find((candidate) => candidate.event.eventId === 'E6');

    assert.ok(record !== undefined);
    assert.equal(record.outcome, 'REFUSED');
  });

  it('leaves the 180.00 in the account', () => {
    const posted = result.ledger.all().filter((entry) => entry.sourceEventId === 'E6');

    assert.deepEqual(posted, []);
    assert.equal(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 4 }), 41500n);
  });

  // The refusal is recorded rather than discarded, so it appears in the printed report.
  it('records the refusal in the log with a reason', () => {
    const record = result.eventLog
      .all()
      .find((candidate) => candidate.event.eventId === 'E6');

    assert.ok(record?.refusal !== null && record?.refusal !== undefined);
    assert.match(record.refusal.detail, /never authorized/);
  });
});
