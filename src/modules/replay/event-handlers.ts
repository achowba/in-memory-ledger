import { splitEvenly } from '../../common/allocation/allocation.js';
import { REFUSAL_CODE, WARNING_CODE } from '../../common/errors/error-codes.js';
import { formatAmount } from '../../common/money/money.js';
import { isApprovable } from '../authorizations/authorization.types.js';
import type { HoldRegister } from '../authorizations/hold-register.js';
import type { EventLog } from '../events/event-log.js';
import type {
  IAuthorizationEvent,
  ICreditEvent,
  IDebitEvent,
  IEventWarning,
  IOpeningBalanceEvent,
  IReversalEvent,
  ISettlementEvent,
  LedgerEvent,
} from '../events/event.types.js';
import { ENTRY_ORIGIN } from '../ledger/ledger-entry.types.js';
import type { Ledger } from '../ledger/ledger.js';
import type { IAccount } from './replay.types.js';

/**
 * What every handler needs, gathered once by the engine.
 *
 * @remarks
 * The engine resolves the account and collects the warnings before dispatching, because both
 * steps are the same for every event type. A handler receives them rather than repeating them.
 *
 * @property ledger - The ledger to append entries to.
 * @property eventLog - The log to record the outcome in.
 * @property holds - The authorization register.
 * @property account - The account the event belongs to, already known to exist.
 * @property warnings - Warnings gathered before the decision. A handler may add to this list,
 *   which is why it is mutable: an uneven split is only discovered while posting.
 */
export interface IHandlerContext {
  readonly ledger: Ledger;
  readonly eventLog: EventLog;
  readonly holds: HoldRegister;
  readonly account: IAccount;
  readonly warnings: IEventWarning[];
}

/**
 * Records an opening balance event.
 *
 * @remarks
 * The entry itself is posted by the engine before any event runs, because an opening balance
 * states a position that must exist before the first day. This records that the event was seen.
 *
 * @param context - What the handler needs.
 * @param event - The event to record.
 */
export function applyOpeningBalance(context: IHandlerContext, event: IOpeningBalanceEvent): void {
  context.eventLog.accept(event, context.warnings);
}

/**
 * Posts a credit, split into instalments when the event asks for more than one.
 *
 * @remarks
 * A split that does not divide evenly is accepted, not refused. The residual is allocated and
 * a warning is raised, because the customer is owed the whole amount and the only question is
 * which instalment carries the odd unit.
 *
 * @param context - What the handler needs.
 * @param event - The credit to post.
 */
export function applyCredit(context: IHandlerContext, event: ICreditEvent): void {
  const { ledger, eventLog, account, warnings } = context;
  const parts = splitEvenly(event.amountMinor, event.instalmentCount);

  if (parts.length > 1 && parts.some((part) => part !== parts[0])) {
    warnings.push({
      code: WARNING_CODE.UNEVEN_SPLIT,
      detail:
        `${formatAmount(account.currency, event.amountMinor)} does not divide into ` +
        `${event.instalmentCount} equal parts at this precision; the residual went to ` +
        `the earliest instalment`,
    });
  }

  for (const part of parts) {
    ledger.append({
      accountId: event.accountId,
      valueDate: event.valueDate,
      bookedOnDay: event.bookingDay,
      amountMinor: part,
      origin: ENTRY_ORIGIN.CREDIT,
      sourceEventId: event.eventId,
      reversesEntryId: null,
    });
  }
  eventLog.accept(event, warnings);
}

/**
 * Posts a debit.
 *
 * @remarks
 * Not gated on available balance. Only an authorization is. A direct debit posts and may
 * overdraw the account, which is the reason an overdraft fee exists.
 *
 * @param context - What the handler needs.
 * @param event - The debit to post.
 */
export function applyDebit(context: IHandlerContext, event: IDebitEvent): void {
  context.ledger.append({
    accountId: event.accountId,
    valueDate: event.valueDate,
    bookedOnDay: event.bookingDay,
    amountMinor: -event.amountMinor,
    origin: ENTRY_ORIGIN.DEBIT,
    sourceEventId: event.eventId,
    reversesEntryId: null,
  });
  context.eventLog.accept(event, context.warnings);
}

/**
 * Approves or declines an authorization, and creates the hold when it is approved.
 *
 * @remarks
 * An identifier that is already in the register is refused rather than treated as a retry.
 * Treating it as a retry would create a second hold for one purchase and lock twice the money.
 * This is refusal, not idempotency: a genuine idempotent path would return the first outcome.
 *
 * @steps
 * 1. Refuse a duplicate identifier.
 * 2. Work out the available balance: the ledger balance minus the holds already live.
 * 3. Decline when applying the hold would take available below zero, recording the reason.
 * 4. Otherwise approve, and put the hold live.
 *
 * @param context - What the handler needs.
 * @param event - The authorization requested.
 */
export function applyAuthorization(context: IHandlerContext, event: IAuthorizationEvent): void {
  const { ledger, eventLog, holds, account, warnings } = context;

  if (holds.find(event.authId) !== undefined) {
    eventLog.refuse(
      event,
      REFUSAL_CODE.AUTHORIZATION_ALREADY_EXISTS,
      `${event.authId} has already been requested`,
      warnings,
    );
    return;
  }

  const balanceMinor = ledger.balanceMinor(event.accountId, {
    valueDateOnOrBefore: event.bookingDay,
  });
  const availableMinor = balanceMinor - holds.activeHoldsMinor(event.accountId);

  if (!isApprovable(availableMinor, event.amountMinor)) {
    holds.decline(
      event.authId,
      event.accountId,
      event.amountMinor,
      event.bookingDay,
      `available ${formatAmount(account.currency, availableMinor)} would fall to ` +
        `${formatAmount(account.currency, availableMinor - event.amountMinor)}`,
    );
    eventLog.refuse(
      event,
      REFUSAL_CODE.AUTHORIZATION_DECLINED_INSUFFICIENT_AVAILABLE,
      `available ${formatAmount(account.currency, availableMinor)} minus a hold of ` +
        `${formatAmount(account.currency, event.amountMinor)} is below zero`,
      warnings,
    );
    return;
  }

  holds.approve(event.authId, event.accountId, event.amountMinor, event.bookingDay);
  eventLog.accept(event, warnings);
}

/**
 * Posts a settlement against an authorization, and releases its hold.
 *
 * @remarks
 * Not gated on available balance. The hold already reserved the funds and the bank is
 * committed to the payment.
 *
 * A settlement against an authorization that has already settled is refused. That guard is
 * what keeps a terminated authorization terminated, so a duplicate presentment cannot debit
 * the account twice.
 *
 * @steps
 * 1. Refuse a settlement naming an authorization the register has never seen.
 * 2. Refuse a settlement against an authorization belonging to another account.
 * 3. Refuse a settlement against an authorization that is no longer open.
 * 4. Post the presented amount and release the hold in full.
 *
 * @param context - What the handler needs.
 * @param event - The settlement presented.
 */
export function applySettlement(context: IHandlerContext, event: ISettlementEvent): void {
  const { ledger, eventLog, holds, warnings } = context;
  const authorization = holds.find(event.authId);

  if (authorization === undefined) {
    eventLog.refuse(
      event,
      REFUSAL_CODE.SETTLEMENT_WITHOUT_AUTHORIZATION,
      `${event.authId} was never authorized, so the funds stay in the account`,
      warnings,
    );
    return;
  }

  // The register is keyed on authId alone, so nothing else in the path compares the two
  // accounts. Without this guard a settlement naming account A with account B's authId would
  // debit A and release B's hold, and both accounts would be wrong with nothing to report it.
  if (authorization.accountId !== event.accountId) {
    eventLog.refuse(
      event,
      REFUSAL_CODE.SETTLEMENT_ACCOUNT_MISMATCH,
      `${event.authId} belongs to ${authorization.accountId}, not ${event.accountId}`,
      warnings,
    );
    return;
  }

  if (authorization.state !== 'APPROVED') {
    eventLog.refuse(
      event,
      REFUSAL_CODE.SETTLEMENT_AGAINST_CLOSED_AUTHORIZATION,
      `${event.authId} is ${authorization.state.toLowerCase()} and cannot settle again`,
      warnings,
    );
    return;
  }

  ledger.append({
    accountId: event.accountId,
    valueDate: event.valueDate,
    bookedOnDay: event.bookingDay,
    amountMinor: -event.amountMinor,
    origin: ENTRY_ORIGIN.SETTLEMENT,
    sourceEventId: event.eventId,
    reversesEntryId: null,
  });
  holds.settle(event.authId, event.bookingDay, event.amountMinor);
  eventLog.accept(event, warnings);
}

/**
 * Reverses an earlier event by posting the opposite of every entry it produced.
 *
 * @remarks
 * The original is never edited. Each reversal is a new opposite entry that inherits the
 * original value date. So the correction lands on the day the money was supposed to have
 * moved, not on the day the mistake was noticed.
 *
 * @steps
 * 1. Refuse a reversal naming an event that was never accepted.
 * 2. Refuse a second reversal of the same event, which would credit the account twice.
 * 3. Refuse a reversal of an event that posted no entry, since there is nothing to reverse.
 * 4. Post the opposite of each original entry, inheriting its value date.
 *
 * @param context - What the handler needs.
 * @param event - The reversal to apply.
 */
export function applyReversal(context: IHandlerContext, event: IReversalEvent): void {
  const { ledger, eventLog, warnings } = context;

  if (eventLog.findAccepted(event.reversesEventId) === undefined) {
    eventLog.refuse(
      event,
      REFUSAL_CODE.REVERSAL_TARGET_NOT_FOUND,
      `${event.reversesEventId} was never accepted, so there is nothing to reverse`,
      warnings,
    );
    return;
  }

  if (eventLog.hasReversalFor(event.reversesEventId)) {
    eventLog.refuse(
      event,
      REFUSAL_CODE.REVERSAL_TARGET_ALREADY_REVERSED,
      `${event.reversesEventId} has already been reversed`,
      warnings,
    );
    return;
  }

  const originals = ledger
    .entriesFor(event.accountId)
    .filter((entry) => entry.sourceEventId === event.reversesEventId);

  if (originals.length === 0) {
    eventLog.refuse(
      event,
      REFUSAL_CODE.REVERSAL_TARGET_NOT_REVERSIBLE,
      `${event.reversesEventId} posted no ledger entry`,
      warnings,
    );
    return;
  }

  for (const original of originals) {
    ledger.append({
      accountId: original.accountId,
      valueDate: original.valueDate,
      bookedOnDay: event.bookingDay,
      amountMinor: -original.amountMinor,
      origin: ENTRY_ORIGIN.REVERSAL,
      sourceEventId: event.eventId,
      reversesEntryId: original.entryId,
    });
  }
  eventLog.accept(event, warnings);
}

/**
 * Sends one event to the handler for its type.
 *
 * @remarks
 * The `default` arm assigns the narrowed event to `never`, which is what makes the switch
 * exhaustive. Without it a handler-less event type would compile and be silently ignored,
 * because a switch that returns `void` gives the compiler no reason to object to a missing
 * arm. The guard is the enforcement; listing every case is only the convention.
 *
 * @param context - What the handler needs.
 * @param event - The event to apply.
 * @throws RangeError When an event type reaches this at run time with no handler, which the
 *   type system has already made unreachable.
 */
export function applyEvent(context: IHandlerContext, event: LedgerEvent): void {
  switch (event.type) {
    case 'OPENING_BALANCE':
      return applyOpeningBalance(context, event);
    case 'CREDIT':
      return applyCredit(context, event);
    case 'DEBIT':
      return applyDebit(context, event);
    case 'AUTHORIZATION':
      return applyAuthorization(context, event);
    case 'SETTLEMENT':
      return applySettlement(context, event);
    case 'REVERSAL':
      return applyReversal(context, event);
    default: {
      // The narrowing to never is the enforcement. The throw only covers a type assertion
      // somewhere upstream, and it reads the discriminant directly: every other field on a
      // LedgerEvent may be a bigint, and JSON.stringify throws on those.
      const unhandled: never = event;
      throw new RangeError(`No handler for event type ${String((unhandled as LedgerEvent).type)}.`);
    }
  }
}
