import { splitEvenly } from '../../common/allocation/allocation.js';
import { OPENING_DAY, REPLAY_DAYS } from '../../common/day/day.constants.js';
import { replayDaysThrough, type ReplayDay } from '../../common/day/day.js';
import { FAULT_CODE, REFUSAL_CODE, WARNING_CODE } from '../../common/errors/error-codes.js';
import { LedgerError } from '../../common/errors/ledger-error.js';
import type { MinorUnits } from '../../common/money/money.js';
import { formatAmount } from '../../common/money/money.js';
import { isApprovable } from '../authorizations/authorization.types.js';
import { HoldRegister } from '../authorizations/hold-register.js';
import { EventLog } from '../events/event-log.js';
import type { IEventWarning, LedgerEvent } from '../events/event.types.js';
import { assessOverdraftFees } from '../fees/fees.js';
import { capitalizeInterest } from '../interest/interest.js';
import { ENTRY_ORIGIN, type ILedgerEntry } from '../ledger/ledger-entry.types.js';
import { Ledger } from '../ledger/ledger.js';
import type {
  IAccount,
  IAccountDaySnapshot,
  IDayResult,
  IInterestResult,
  IRestatement,
} from './replay.types.js';

/**
 * Everything the replay produced.
 *
 * @property accounts - The accounts, in the order they were given.
 * @property ledger - The append only entries, for any query the report wants to run.
 * @property eventLog - Every event and its outcome, including refusals.
 * @property holds - The final state of every authorization.
 * @property days - One result per day, in day order.
 * @property interest - One capitalization result per account.
 */
export interface IReplayResult {
  readonly accounts: readonly IAccount[];
  readonly ledger: Ledger;
  readonly eventLog: EventLog;
  readonly holds: HoldRegister;
  readonly days: readonly IDayResult[];
  readonly interest: readonly IInterestResult[];
}

/**
 * Finds the events that arrived after an event booked on a later day.
 *
 * @remarks
 * The brief lists E10 tenth but books it on day five, while E9 sits ninth and is booked on
 * day six. So the list is not in arrival order, or a booking date is wrong. Either way a
 * reader should be told rather than left to notice.
 *
 * The engine groups by booking day, so the anomaly changes nothing here. It is still raised,
 * because a silent reordering is the kind of helpfulness that hides a data quality problem.
 *
 * @param events - The stream in the order it was given.
 * @returns The identifiers of events whose booking day precedes that of an earlier event.
 */
function findOutOfOrderBookings(events: readonly LedgerEvent[]): ReadonlySet<string> {
  const outOfOrder = new Set<string>();
  let highestSeen = 0;

  for (const event of events) {
    if (event.bookingDay < highestSeen) {
      outOfOrder.add(event.eventId);
    }
    highestSeen = Math.max(highestSeen, event.bookingDay);
  }

  return outOfOrder;
}

/**
 * Replays an event stream across the six day window.
 *
 * @remarks
 * The order within a day is the order the events arrived. The order of the days is fixed. Each
 * day runs the same three steps. It applies the events booked that day. It assesses overdraft
 * fees across the whole window so far. It then snapshots every account.
 *
 * Interest is capitalized once, after the last day's fees, because an accrual is worked out
 * from the balances as they finally stand.
 *
 * @steps
 * 1. Book each opening balance as an entry value dated day zero.
 * 2. For each day, apply the events booked on it, in arrival order.
 * 3. Assess overdraft fees for each account, walking the window from the start.
 * 4. Snapshot each account, recording any earlier day whose closing balance moved.
 * 5. After the last day, capitalize interest for each account.
 *
 * @param accounts - The accounts to open.
 * @param events - The event stream, in the order the brief lists it.
 * @returns Everything the replay produced.
 */
export function replay(
  accounts: readonly IAccount[],
  events: readonly LedgerEvent[],
): IReplayResult {
  const ledger = new Ledger();
  const eventLog = new EventLog();
  const holds = new HoldRegister();
  const outOfOrder = findOutOfOrderBookings(events);

  /** The last closing balance reported for each account and day, to detect restatements. */
  const lastReported = new Map<string, Map<ReplayDay, MinorUnits>>();

  const accountOf = (accountId: string): IAccount | undefined =>
    accounts.find((account) => account.accountId === accountId);

  for (const account of accounts) {
    lastReported.set(account.accountId, new Map());
    ledger.append({
      accountId: account.accountId,
      valueDate: OPENING_DAY,
      bookedOnDay: OPENING_DAY,
      amountMinor: account.openingBalanceMinor,
      origin: ENTRY_ORIGIN.OPENING_BALANCE,
      sourceEventId: 'OPENING',
      reversesEntryId: null,
    });
  }

  /**
   * Collects the warnings an event carries before any decision is made about it.
   *
   * @param event - The event under consideration.
   * @returns The warnings, which never prevent acceptance.
   */
  const warningsFor = (event: LedgerEvent): IEventWarning[] => {
    const warnings: IEventWarning[] = [];

    if (event.valueDate < event.bookingDay) {
      warnings.push({
        code: WARNING_CODE.BACK_VALUED_POSTING,
        detail:
          `booked on day ${event.bookingDay}, value dated day ${event.valueDate}, so it ` +
          `restates every closing balance from day ${event.valueDate} onwards`,
      });
    }

    if (outOfOrder.has(event.eventId)) {
      warnings.push({
        code: WARNING_CODE.OUT_OF_ORDER_BOOKING,
        detail:
          `arrived after an event booked on a later day, so the stream is not in arrival ` +
          `order; grouped by booking day ${event.bookingDay}`,
      });
    }

    return warnings;
  };

  /**
   * Applies one event, appending any entries it produces and recording the outcome.
   *
   * @param event - The event to apply.
   */
  const apply = (event: LedgerEvent): void => {
    // Direction is carried by the event type, never by the sign of the input. The engine
    // negates unconditionally when it posts. So a debit carrying a negative amount would post
    // as a credit, and move money the wrong way, silently.
    //
    // An opening balance is exempt. It states a starting position rather than a movement, so
    // zero is normal and a negative opening balance is an account that opens overdrawn.
    if (event.type !== 'OPENING_BALANCE' && 'amountMinor' in event && event.amountMinor <= 0n) {
      throw new LedgerError(
        FAULT_CODE.NON_POSITIVE_AMOUNT,
        `${event.eventId} is a ${event.type} carrying ${event.amountMinor}. An amount is a ` +
          `magnitude, and the event type carries the direction.`,
      );
    }

    const account = accountOf(event.accountId);
    const warnings = warningsFor(event);

    // A fault, not a refusal. An event naming an account that was never opened is something
    // the model cannot represent, so it stops rather than continuing with a guessed answer.
    // Refusing it as SETTLEMENT_WITHOUT_AUTHORIZATION named the wrong situation, and left a
    // misleading code in the log for a reader and a test to branch on.
    if (account === undefined) {
      throw new LedgerError(
        FAULT_CODE.UNKNOWN_ACCOUNT,
        `${event.eventId} names account ${event.accountId}, which was never opened.`,
      );
    }

    switch (event.type) {
      case 'OPENING_BALANCE': {
        eventLog.accept(event, warnings);
        return;
      }

      case 'CREDIT': {
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
        return;
      }

      case 'DEBIT': {
        // Not gated on available balance. Only an authorization is. A direct debit posts and
        // may overdraw the account, which is the reason an overdraft fee exists.
        ledger.append({
          accountId: event.accountId,
          valueDate: event.valueDate,
          bookedOnDay: event.bookingDay,
          amountMinor: -event.amountMinor,
          origin: ENTRY_ORIGIN.DEBIT,
          sourceEventId: event.eventId,
          reversesEntryId: null,
        });
        eventLog.accept(event, warnings);
        return;
      }

      case 'AUTHORIZATION': {
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
        const heldMinor = holds.activeHoldsMinor(event.accountId);
        const availableMinor = balanceMinor - heldMinor;

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
        return;
      }

      case 'SETTLEMENT': {
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

        if (authorization.state !== 'APPROVED') {
          eventLog.refuse(
            event,
            REFUSAL_CODE.SETTLEMENT_AGAINST_CLOSED_AUTHORIZATION,
            `${event.authId} is ${authorization.state.toLowerCase()} and cannot settle again`,
            warnings,
          );
          return;
        }

        // Not gated on available balance. The hold already reserved the funds and the bank
        // is committed to the payment.
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
        return;
      }

      case 'REVERSAL': {
        const target = eventLog.findAccepted(event.reversesEventId);

        if (target === undefined) {
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

        // The original is never edited. Each reversal is a new opposite entry that inherits the
        // original value date. So the correction lands on the day the money was supposed to
        // have moved, not on the day the mistake was noticed.
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
        return;
      }

      default: {
        return;
      }
    }
  };

  const days: IDayResult[] = [];

  for (const day of REPLAY_DAYS) {
    for (const event of events.filter((candidate) => candidate.bookingDay === day)) {
      apply(event);
    }

    const feesBooked: ILedgerEntry[] = [];
    for (const account of accounts) {
      feesBooked.push(
        ...assessOverdraftFees({
          ledger,
          accountId: account.accountId,
          currency: account.currency,
          throughDay: day,
          bookedOnDay: day,
        }),
      );
    }

    const snapshots: IAccountDaySnapshot[] = accounts.map((account) => {
      const reported = lastReported.get(account.accountId) ?? new Map<ReplayDay, MinorUnits>();
      const restatements: IRestatement[] = [];

      for (const earlier of replayDaysThrough(day)) {
        const nowMinor = ledger.balanceMinor(account.accountId, {
          valueDateOnOrBefore: earlier,
        });
        const wasMinor = reported.get(earlier);

        if (earlier !== day && wasMinor !== undefined && wasMinor !== nowMinor) {
          restatements.push({ day: earlier, wasMinor, nowMinor });
        }
        reported.set(earlier, nowMinor);
      }

      const closingBalanceMinor = ledger.balanceMinor(account.accountId, {
        valueDateOnOrBefore: day,
      });
      const activeHoldsMinor = holds.activeHoldsMinor(account.accountId);

      return {
        accountId: account.accountId,
        currency: account.currency,
        closingBalanceMinor,
        activeHoldsMinor,
        availableBalanceMinor: closingBalanceMinor - activeHoldsMinor,
        restatements,
      };
    });

    days.push({
      day,
      events: eventLog.forBookingDay(day),
      feesBooked,
      accounts: snapshots,
      authorizations: accounts.flatMap((account) => holds.forAccount(account.accountId)),
    });
  }

  const interest: IInterestResult[] = accounts.map((account) => {
    const result = capitalizeInterest(ledger, account.accountId);

    return {
      accountId: account.accountId,
      currency: account.currency,
      accruals: result.accruals,
      totalMinor: result.totalMinor,
      entry: result.entry,
    };
  });

  return { accounts, ledger, eventLog, holds, days, interest };
}
