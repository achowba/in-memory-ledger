import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LedgerEvent } from '../src/modules/events/event.types.js';
import { WARNING_CODE } from '../src/common/errors/error-codes.js';
import { replay } from '../src/modules/replay/replay-engine.js';
import { renderReport } from '../src/modules/report/day-report.js';
import { ACCOUNTS, EVENT_STREAM } from '../src/modules/replay/scenario.js';

/**
 * The brief lists E10 tenth and books it on day five, while E9 sits ninth and is booked on
 * day six. So the list is not in arrival order, or a booking date is wrong.
 *
 * The engine groups by booking day and raises a warning. These tests show that the choice
 * changes nothing, so the ambiguity is real but harmless here. They also show that the warning
 * is raised anyway, rather than the anomaly being reordered away in silence.
 */

/** The same stream with E10 moved to where its booking day says it belongs. */
const REORDERED: readonly LedgerEvent[] = [
  ...EVENT_STREAM.filter((event) => event.eventId !== 'E10' && event.eventId !== 'E9'),
  ...EVENT_STREAM.filter((event) => event.eventId === 'E10'),
  ...EVENT_STREAM.filter((event) => event.eventId === 'E9'),
];

describe('the E9 and E10 ordering ambiguity', () => {
  it('is a real ambiguity, since the two orderings differ', () => {
    assert.notDeepEqual(
      EVENT_STREAM.map((event) => event.eventId),
      REORDERED.map((event) => event.eventId),
    );
  });

  // The two events touch different accounts, and no rule in this ledger crosses accounts.
  it('produces the same final balance on both accounts either way', () => {
    const asListed = replay(ACCOUNTS, EVENT_STREAM);
    const asBooked = replay(ACCOUNTS, REORDERED);

    for (const accountId of ['ACC-001', 'ACC-002']) {
      assert.equal(
        asListed.ledger.balanceMinor(accountId, { valueDateOnOrBefore: 6 }),
        asBooked.ledger.balanceMinor(accountId, { valueDateOnOrBefore: 6 }),
        `${accountId} differs between the two orderings`,
      );
    }
  });

  it('produces the same fees either way', () => {
    const feesOf = (events: readonly LedgerEvent[]): readonly number[] =>
      replay(ACCOUNTS, events)
        .ledger.all()
        .filter((entry) => entry.origin === 'OVERDRAFT_FEE')
        .map((entry) => entry.valueDate);

    assert.deepEqual(feesOf(EVENT_STREAM), feesOf(REORDERED));
  });

  it('produces the same interest either way', () => {
    const totalsOf = (events: readonly LedgerEvent[]): readonly bigint[] =>
      replay(ACCOUNTS, events).interest.map((account) => account.totalMinor);

    assert.deepEqual(totalsOf(EVENT_STREAM), totalsOf(REORDERED));
  });

  // The report differs only in the warning, which is the point: reordering silently would
  // have produced an identical report and hidden a data quality problem.
  it('raises the warning on the stream as the brief lists it', () => {
    const warned = replay(ACCOUNTS, EVENT_STREAM)
      .eventLog.all()
      .filter((record) =>
        record.warnings.some((warning) => warning.code === WARNING_CODE.OUT_OF_ORDER_BOOKING),
      )
      .map((record) => record.event.eventId);

    assert.deepEqual(warned, ['E10']);
  });

  it('raises no such warning once the stream is in booking order', () => {
    const warned = replay(ACCOUNTS, REORDERED)
      .eventLog.all()
      .filter((record) =>
        record.warnings.some((warning) => warning.code === WARNING_CODE.OUT_OF_ORDER_BOOKING),
      );

    assert.deepEqual(warned, []);
  });

  it('differs between the two runs only in that warning', () => {
    const stripWarnings = (text: string): string =>
      text
        .split('\n')
        .filter((line) => !line.includes(WARNING_CODE.OUT_OF_ORDER_BOOKING))
        .join('\n');

    assert.equal(
      stripWarnings(renderReport(replay(ACCOUNTS, EVENT_STREAM))),
      stripWarnings(renderReport(replay(ACCOUNTS, REORDERED))),
    );
  });
});
