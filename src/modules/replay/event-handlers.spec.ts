import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { REFUSAL_CODE, type RefusalCode } from '../../common/errors/error-codes.js';
import { AUTHORIZATION_STATE } from '../authorizations/authorization.types.js';
import { HoldRegister } from '../authorizations/hold-register.js';
import { EventLog } from '../events/event-log.js';
import type { LedgerEvent } from '../events/event.types.js';
import { ENTRY_ORIGIN } from '../ledger/ledger-entry.types.js';
import { Ledger } from '../ledger/ledger.js';
import { applyEvent, type IHandlerContext } from './event-handlers.js';
import type { IAccount } from './replay.types.js';

const ACCOUNT: IAccount = { accountId: 'ACC-001', currency: 'AED', openingBalanceMinor: 0n };

/**
 * Builds a fresh context, with the account already funded so an authorization can approve.
 *
 * @param fundMinor - How much to credit the account on day one before anything else runs.
 * @returns The context, and the collaborators so a test can assert on them.
 */
function context(fundMinor = 100000n): IHandlerContext {
  const ledger = new Ledger();
  if (fundMinor !== 0n) {
    ledger.append({
      accountId: ACCOUNT.accountId,
      valueDate: 1,
      bookedOnDay: 1,
      amountMinor: fundMinor,
      origin: ENTRY_ORIGIN.CREDIT,
      sourceEventId: 'FUND',
      reversesEntryId: null,
    });
  }
  return {
    ledger,
    eventLog: new EventLog(),
    holds: new HoldRegister(),
    account: ACCOUNT,
    warnings: [],
  };
}

/**
 * Runs one event through the dispatcher with a fresh warning list.
 *
 * @param ctx - The context to run against.
 * @param event - The event to apply.
 */
function run(ctx: IHandlerContext, event: LedgerEvent): void {
  applyEvent({ ...ctx, warnings: [] }, event);
}

/**
 * Returns the refusal code recorded for one event, or undefined when it was accepted.
 *
 * @param ctx - The context holding the log.
 * @param eventId - Which event to look up.
 * @returns The refusal code, or undefined.
 */
function refusalFor(ctx: IHandlerContext, eventId: string): RefusalCode | undefined {
  const record = ctx.eventLog.all().find((r) => r.event.eventId === eventId);
  return record?.refusal?.code;
}

const auth = (eventId: string, authId: string, amountMinor = 20000n): LedgerEvent => ({
  eventId,
  type: 'AUTHORIZATION',
  accountId: ACCOUNT.accountId,
  bookingDay: 2,
  valueDate: 2,
  authId,
  amountMinor,
});

const settle = (eventId: string, authId: string, amountMinor = 18500n): LedgerEvent => ({
  eventId,
  type: 'SETTLEMENT',
  accountId: ACCOUNT.accountId,
  bookingDay: 4,
  valueDate: 4,
  authId,
  amountMinor,
});

const debit = (eventId: string): LedgerEvent => ({
  eventId,
  type: 'DEBIT',
  accountId: ACCOUNT.accountId,
  bookingDay: 3,
  valueDate: 3,
  amountMinor: 5000n,
});

const reverse = (eventId: string, target: string): LedgerEvent => ({
  eventId,
  type: 'REVERSAL',
  accountId: ACCOUNT.accountId,
  bookingDay: 6,
  valueDate: 3,
  reversesEventId: target,
});

describe('a settlement naming an authorization that belongs to another account', () => {
  // The register is keyed on authId alone, and nothing else in the settlement path compares
  // the two accounts. Unreachable from the six day stream, which is why it survived review of
  // the behaviour and was found only by reading the guards.
  it('refuses it rather than debiting one account and releasing another account`s hold', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));

    const foreign = { ...settle('E2', 'Auth-A'), accountId: 'ACC-002' };
    run(ctx, foreign);

    assert.equal(refusalFor(ctx, 'E2'), REFUSAL_CODE.SETTLEMENT_ACCOUNT_MISMATCH);
  });

  it('leaves the hold live, so the owning account keeps its funds reserved', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));
    run(ctx, { ...settle('E2', 'Auth-A'), accountId: 'ACC-002' });

    assert.equal(ctx.holds.find('Auth-A')?.state, AUTHORIZATION_STATE.APPROVED);
    assert.equal(ctx.holds.activeHoldsMinor(ACCOUNT.accountId), 20000n);
  });

  it('posts nothing, so neither account moves', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));
    run(ctx, { ...settle('E2', 'Auth-A'), accountId: 'ACC-002' });

    assert.equal(ctx.ledger.balanceMinor(ACCOUNT.accountId, { valueDateOnOrBefore: 6 }), 100000n);
    assert.equal(ctx.ledger.balanceMinor('ACC-002', { valueDateOnOrBefore: 6 }), 0n);
  });

  it('still settles when the account matches, so the guard is not simply refusing everything', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));
    run(ctx, settle('E2', 'Auth-A'));

    assert.equal(refusalFor(ctx, 'E2'), undefined);
    assert.equal(ctx.holds.find('Auth-A')?.state, AUTHORIZATION_STATE.SETTLED);
  });
});

describe('an authorization identifier that is already in the register', () => {
  // Refusal, not idempotency. A genuine idempotent path would return the first outcome so the
  // retry succeeds. This refuses, because treating a retry as a new request creates a second
  // hold for one purchase and locks twice the money.
  it('refuses the second request', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));
    run(ctx, auth('E2', 'Auth-A'));

    assert.equal(refusalFor(ctx, 'E2'), REFUSAL_CODE.AUTHORIZATION_ALREADY_EXISTS);
  });

  it('leaves the first hold untouched', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A', 20000n));
    run(ctx, auth('E2', 'Auth-A', 30000n));

    assert.equal(ctx.holds.activeHoldsMinor(ACCOUNT.accountId), 20000n, 'one hold, the first');
    assert.equal(ctx.holds.find('Auth-A')?.amountMinor, 20000n);
  });
});

describe('a settlement against an authorization that has already settled', () => {
  // The guard that keeps a terminated authorization terminated. Without it a duplicate
  // presentment debits the account twice.
  it('refuses the second settlement', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));
    run(ctx, settle('E2', 'Auth-A'));
    run(ctx, settle('E3', 'Auth-A'));

    assert.equal(refusalFor(ctx, 'E3'), REFUSAL_CODE.SETTLEMENT_AGAINST_CLOSED_AUTHORIZATION);
  });

  it('posts the debit once, not twice', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));
    run(ctx, settle('E2', 'Auth-A'));
    run(ctx, settle('E3', 'Auth-A'));

    const settlements = ctx.ledger.all().filter((e) => e.origin === ENTRY_ORIGIN.SETTLEMENT);
    assert.equal(settlements.length, 1);
  });

  it('refuses a settlement against a declined authorization too', () => {
    const ctx = context(0n);
    run(ctx, auth('E1', 'Auth-B', 9000n));
    assert.equal(ctx.holds.find('Auth-B')?.state, AUTHORIZATION_STATE.DECLINED);

    run(ctx, settle('E2', 'Auth-B'));
    assert.equal(refusalFor(ctx, 'E2'), REFUSAL_CODE.SETTLEMENT_AGAINST_CLOSED_AUTHORIZATION);
  });
});

describe('a reversal naming an event the log has never accepted', () => {
  it('refuses a reversal of an unknown identifier', () => {
    const ctx = context();
    run(ctx, reverse('E9', 'E-does-not-exist'));

    assert.equal(refusalFor(ctx, 'E9'), REFUSAL_CODE.REVERSAL_TARGET_NOT_FOUND);
  });

  // Nothing posted, so there is nothing to reverse. Reversing a refused event would credit
  // the account for money that never left it.
  it('refuses a reversal of an event that was itself refused', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));
    run(ctx, auth('E2', 'Auth-A'));
    assert.equal(refusalFor(ctx, 'E2'), REFUSAL_CODE.AUTHORIZATION_ALREADY_EXISTS);

    run(ctx, reverse('E9', 'E2'));
    assert.equal(refusalFor(ctx, 'E9'), REFUSAL_CODE.REVERSAL_TARGET_NOT_FOUND);
  });

  it('posts nothing for the refused reversal', () => {
    const ctx = context();
    const before = ctx.ledger.all().length;
    run(ctx, reverse('E9', 'E-does-not-exist'));

    assert.equal(ctx.ledger.all().length, before);
  });
});

describe('a reversal of an accepted event that posted no ledger entry', () => {
  // An authorization is accepted and produces a hold, never an entry. There is nothing to
  // reverse, and the code must say that rather than the target being missing.
  it('refuses it as not reversible, not as not found', () => {
    const ctx = context();
    run(ctx, auth('E1', 'Auth-A'));
    assert.equal(refusalFor(ctx, 'E1'), undefined, 'the authorization was accepted');

    run(ctx, reverse('E9', 'E1'));
    assert.equal(refusalFor(ctx, 'E9'), REFUSAL_CODE.REVERSAL_TARGET_NOT_REVERSIBLE);
  });
});

describe('a second reversal of the same event', () => {
  it('refuses it, so the account is not credited twice', () => {
    const ctx = context();
    run(ctx, debit('E7'));
    run(ctx, reverse('E9', 'E7'));
    run(ctx, reverse('E10', 'E7'));

    assert.equal(refusalFor(ctx, 'E10'), REFUSAL_CODE.REVERSAL_TARGET_ALREADY_REVERSED);
    assert.equal(ctx.ledger.all().filter((e) => e.origin === ENTRY_ORIGIN.REVERSAL).length, 1);
  });
});
