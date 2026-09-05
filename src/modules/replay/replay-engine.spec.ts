import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FAULT_CODE, type FaultCode } from '../../common/errors/error-codes.js';
import { LedgerError } from '../../common/errors/ledger-error.js';
import { parseAmount } from '../../common/money/money.js';
import { WARNING_CODE } from '../../common/errors/error-codes.js';
import type { LedgerEvent } from '../events/event.types.js';
import { ENTRY_ORIGIN } from '../ledger/ledger-entry.types.js';
import { replay } from './replay-engine.js';
import { ACCOUNTS as SCENARIO_ACCOUNTS, EVENT_STREAM } from './scenario.js';
import type { IAccount } from './replay.types.js';

/** One AED account, opening at zero, for the guard tests. */
const ACCOUNTS: readonly IAccount[] = [
  { accountId: 'ACC-001', currency: 'AED', openingBalanceMinor: 0n },
];

/**
 * Builds an assertion that a thrown value is a LedgerError carrying one code.
 *
 * @param code - The fault code the call is expected to throw.
 * @returns A predicate for the second argument of `assert.throws`.
 */
function throwsCode(code: FaultCode): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof LedgerError && error.code === code;
}

/**
 * Builds one event with the fields a guard test needs.
 *
 * @param overrides - The fields that differ from an ordinary day one debit.
 * @returns The event.
 */
function event(overrides: Partial<LedgerEvent> & { type: LedgerEvent['type'] }): LedgerEvent {
  return {
    eventId: 'X1',
    accountId: 'ACC-001',
    bookingDay: 1,
    valueDate: 1,
    amountMinor: parseAmount('AED', '100.00'),
    ...overrides,
  } as LedgerEvent;
}

describe('replay, an amount that carries its own direction', () => {
  // The engine negates unconditionally when it posts. Without this guard a debit of minus
  // 500.00 posts as a credit of plus 500.00, with no refusal and no warning.
  it('stops the replay on a debit carrying a negative amount', () => {
    assert.throws(
      () =>
        replay(ACCOUNTS, [event({ type: 'DEBIT', amountMinor: parseAmount('AED', '-500.00') })]),
      throwsCode(FAULT_CODE.NON_POSITIVE_AMOUNT),
    );
  });

  it('stops the replay on a credit carrying a negative amount', () => {
    assert.throws(
      () =>
        replay(ACCOUNTS, [
          event({ type: 'CREDIT', instalmentCount: 1, amountMinor: parseAmount('AED', '-1.00') }),
        ]),
      throwsCode(FAULT_CODE.NON_POSITIVE_AMOUNT),
    );
  });

  it('stops the replay on an amount of exactly zero, which moves nothing', () => {
    assert.throws(
      () => replay(ACCOUNTS, [event({ type: 'DEBIT', amountMinor: 0n })]),
      throwsCode(FAULT_CODE.NON_POSITIVE_AMOUNT),
    );
  });

  it('stops the replay on an authorization carrying a negative hold', () => {
    assert.throws(
      () =>
        replay(ACCOUNTS, [event({ type: 'AUTHORIZATION', authId: 'Auth-X', amountMinor: -1n })]),
      throwsCode(FAULT_CODE.NON_POSITIVE_AMOUNT),
    );
  });

  it('stops the replay on a settlement carrying a negative amount', () => {
    assert.throws(
      () => replay(ACCOUNTS, [event({ type: 'SETTLEMENT', authId: 'Auth-X', amountMinor: -1n })]),
      throwsCode(FAULT_CODE.NON_POSITIVE_AMOUNT),
    );
  });

  // An opening balance states a starting position rather than a movement. Both accounts in
  // the brief open at exactly zero, so exempting it is not a convenience.
  it('allows an opening balance of zero', () => {
    const result = replay(ACCOUNTS, []);

    assert.equal(result.ledger.balanceMinor('ACC-001', { valueDateOnOrBefore: 1 }), 0n);
  });

  // These two assert the entry rather than the balance. An account below zero draws an
  // overdraft fee on every day it stays there. The balance would answer a question about the
  // fee engine, not about the guard under test.
  it('allows an account that opens overdrawn', () => {
    const overdrawn: readonly IAccount[] = [
      { accountId: 'ACC-001', currency: 'AED', openingBalanceMinor: parseAmount('AED', '-50.00') },
    ];
    const opening = replay(overdrawn, [])
      .ledger.all()
      .filter((entry) => entry.origin === ENTRY_ORIGIN.OPENING_BALANCE);

    assert.deepEqual(
      opening.map((entry) => entry.amountMinor),
      [-5000n],
    );
  });

  it('accepts an ordinary positive debit and posts it as a negative entry', () => {
    const posted = replay(ACCOUNTS, [event({ type: 'DEBIT' })])
      .ledger.all()
      .filter((entry) => entry.sourceEventId === 'X1');

    assert.deepEqual(
      posted.map((entry) => entry.amountMinor),
      [-10000n],
    );
  });
});

describe('replay, an event naming an account that was never opened', () => {
  // A fault, not a refusal. Refusing it as SETTLEMENT_WITHOUT_AUTHORIZATION named the wrong
  // situation and left a misleading code in the log for a reader to branch on.
  it('stops the replay rather than recording a refusal', () => {
    assert.throws(
      () => replay(ACCOUNTS, [event({ type: 'DEBIT', accountId: 'ACC-999' })]),
      throwsCode(FAULT_CODE.UNKNOWN_ACCOUNT),
    );
  });

  it('names the account in the message', () => {
    assert.throws(
      () => replay(ACCOUNTS, [event({ type: 'DEBIT', accountId: 'ACC-999' })]),
      /ACC-999/,
    );
  });
});

describe('replay, sequencing across the window', () => {
  const result = (): ReturnType<typeof replay> => replay(SCENARIO_ACCOUNTS, EVENT_STREAM);

  it('groups events by the day they were booked, not by the order they were listed', () => {
    assert.deepEqual(
      result()
        .days.map((day) => day.events.map((record) => record.event.eventId))
        .flat(),
      ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E10', 'E9'],
    );
  });

  // E10 is listed tenth and booked fifth, after E9 which is booked sixth. It is grouped by
  // booking day and the anomaly is raised rather than reordered away in silence.
  it('warns that one event arrived out of booking order', () => {
    const warned = result()
      .eventLog.all()
      .filter((record) =>
        record.warnings.some((warning) => warning.code === WARNING_CODE.OUT_OF_ORDER_BOOKING),
      )
      .map((record) => record.event.eventId);

    assert.deepEqual(warned, ['E10']);
  });

  it('assesses fees only at the day five close, in ascending value date order', () => {
    assert.deepEqual(
      result().days.map((day) => day.feesBooked.map((fee) => fee.valueDate)),
      [[], [], [], [], [2, 4, 5], []],
    );
  });

  // A fee is assessed after the day's events, so a backdated entry arriving today is already
  // in the ledger when the window is reassessed.
  it('assesses fees after the events of the day, never before', () => {
    const dayFive = result().days.find((day) => day.day === 5);
    const backdated = dayFive?.events.find((record) => record.event.eventId === 'E7');

    assert.ok(backdated !== undefined);
    assert.equal(dayFive?.feesBooked.length, 3, 'the fees see E7, so they are assessed after it');
  });

  it('detects the days a backdated entry restates, and only those', () => {
    const dayFive = result().days.find((day) => day.day === 5)?.accounts[0];

    assert.deepEqual(
      dayFive?.restatements.map((restatement) => restatement.day),
      [2, 3, 4],
      'day one did not move, and day five is the current day rather than a restatement',
    );
  });

  it('reports no restatement on a day that changed nothing earlier', () => {
    for (const day of [1, 2, 3, 4] as const) {
      const snapshot = result().days.find((candidate) => candidate.day === day)?.accounts[0];
      assert.deepEqual(snapshot?.restatements, [], `day ${day} should restate nothing`);
    }
  });

  it('capitalizes interest once per account, after the last day', () => {
    const entries = result()
      .ledger.all()
      .filter((entry) => entry.origin === ENTRY_ORIGIN.INTEREST_CAPITALIZATION);

    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((entry) => entry.valueDate),
      [6, 6],
    );
  });
});
