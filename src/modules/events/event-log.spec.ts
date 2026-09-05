import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { REFUSAL_CODE, WARNING_CODE } from '../../common/errors/error-codes.js';
import { EventLog } from './event-log.js';
import type { LedgerEvent } from './event.types.js';

/**
 * Builds a debit event with the fields a test cares about.
 *
 * @param eventId - The identifier, such as `E7`.
 * @param bookingDay - The day the system learns of it.
 * @param valueDate - The day it would change the balance.
 * @returns The event.
 */
function debit(eventId: string, bookingDay: 1 | 2 | 3 | 4 | 5 | 6, valueDate: 1 | 2): LedgerEvent {
  return {
    eventId,
    type: 'DEBIT',
    bookingDay,
    valueDate,
    accountId: 'ACC-001',
    amountMinor: 62000n,
  };
}

/**
 * Builds a reversal event naming a target.
 *
 * @param eventId - The identifier of the reversal itself.
 * @param target - The identifier of the event being reversed.
 * @returns The event.
 */
function reversal(eventId: string, target: string): LedgerEvent {
  return {
    eventId,
    type: 'REVERSAL',
    bookingDay: 6,
    valueDate: 2,
    accountId: 'ACC-001',
    reversesEventId: target,
  };
}

describe('EventLog, arrival order', () => {
  it('numbers records from one, in the order they arrive', () => {
    const log = new EventLog();

    assert.equal(log.accept(debit('E7', 5, 2)).sequence, 1);
    assert.equal(log.accept(debit('E8', 5, 2)).sequence, 2);
  });

  // A refusal still occupies a place in history. It happened.
  it('gives a refused event a sequence number too', () => {
    const log = new EventLog();
    log.accept(debit('E7', 5, 2));

    const refused = log.refuse(debit('E8', 5, 2), REFUSAL_CODE.SETTLEMENT_WITHOUT_AUTHORIZATION, 'no such authorization');

    assert.equal(refused.sequence, 2);
    assert.equal(log.all().length, 2);
  });

  it('reports the sequence the next record will take', () => {
    const log = new EventLog();
    assert.equal(log.nextSequence(), 1);

    log.accept(debit('E7', 5, 2));
    assert.equal(log.nextSequence(), 2);
  });
});

describe('EventLog, recording a refusal rather than throwing it away', () => {
  it('keeps the refusal code and the reason', () => {
    const log = new EventLog();
    const record = log.refuse(
      debit('E6', 4, 1),
      REFUSAL_CODE.SETTLEMENT_WITHOUT_AUTHORIZATION,
      'Auth-Z was never authorized.',
    );

    assert.equal(record.outcome, 'REFUSED');
    assert.deepEqual(record.refusal, {
      code: REFUSAL_CODE.SETTLEMENT_WITHOUT_AUTHORIZATION,
      detail: 'Auth-Z was never authorized.',
    });
  });

  it('leaves an accepted record with no refusal attached', () => {
    const log = new EventLog();

    assert.equal(log.accept(debit('E7', 5, 2)).refusal, null);
  });

  it('keeps warnings on an event that was still accepted', () => {
    const log = new EventLog();
    const record = log.accept(debit('E7', 5, 2), [
      { code: WARNING_CODE.BACK_VALUED_POSTING, detail: 'booked day 5, value dated day 2' },
    ]);

    assert.equal(record.outcome, 'ACCEPTED');
    assert.equal(record.warnings[0]?.code, WARNING_CODE.BACK_VALUED_POSTING);
  });
});

describe('EventLog, immutability', () => {
  it('freezes a record so it cannot be edited after it is appended', () => {
    const log = new EventLog();
    const record = log.accept(debit('E7', 5, 2));

    assert.throws(() => {
      (record as { outcome: string }).outcome = 'REFUSED';
    }, TypeError);
  });
});

describe('EventLog, lookups a reversal depends on', () => {
  it('finds an accepted event by identifier', () => {
    const log = new EventLog();
    log.accept(debit('E7', 5, 2));

    assert.equal(log.findAccepted('E7')?.event.eventId, 'E7');
  });

  // A reversal must not succeed against an event that was itself refused. Nothing posted,
  // so there is nothing to reverse.
  it('does not find a refused event', () => {
    const log = new EventLog();
    log.refuse(debit('E6', 4, 1), REFUSAL_CODE.SETTLEMENT_WITHOUT_AUTHORIZATION, 'unknown');

    assert.equal(log.findAccepted('E6'), undefined);
  });

  it('reports no reversal before one is recorded', () => {
    const log = new EventLog();
    log.accept(debit('E7', 5, 2));

    assert.equal(log.hasReversalFor('E7'), false);
  });

  // Reversing the same posting twice would credit the account for money that only ever
  // left it once.
  it('reports a reversal once one is accepted', () => {
    const log = new EventLog();
    log.accept(debit('E7', 5, 2));
    log.accept(reversal('E9', 'E7'));

    assert.equal(log.hasReversalFor('E7'), true);
  });

  it('does not count a refused reversal', () => {
    const log = new EventLog();
    log.accept(debit('E7', 5, 2));
    log.refuse(reversal('E9', 'E7'), REFUSAL_CODE.REVERSAL_TARGET_ALREADY_REVERSED, 'already');

    assert.equal(log.hasReversalFor('E7'), false);
  });
});

describe('EventLog, grouping for the report', () => {
  // The report groups by booking day, because it describes what the bank did each day. A
  // backdated entry appears on the day it arrived, not on the day it restates.
  it('groups records by the day they were booked, not by value date', () => {
    const log = new EventLog();
    log.accept(debit('E2', 1, 1));
    log.accept(debit('E7', 5, 2));

    assert.deepEqual(
      log.forBookingDay(5).map((record) => record.event.eventId),
      ['E7'],
    );
    assert.deepEqual(
      log.forBookingDay(1).map((record) => record.event.eventId),
      ['E2'],
    );
  });
});
