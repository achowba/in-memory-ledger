import type { RefusalCode } from '../../common/errors/error-codes.js';
import type { ReplayDay } from '../../common/day/day.js';
import type { IEventWarning, IRecordedEvent, LedgerEvent } from './event.types.js';

/**
 * The append only record of every event the system saw, and what it decided about each one.
 *
 * @remarks
 * Two properties make this a log rather than a list.
 *
 * Nothing is ever removed or edited. There is no `delete`, no `update`, and every record is
 * frozen on the way in, so an accidental mutation throws in strict mode rather than
 * corrupting history quietly.
 *
 * A refusal is recorded, not discarded. The brief requires the day four rejection of E6 and
 * the day five decline of Auth-B to appear in the printed output, so a refusal is an outcome
 * the log carries rather than an error that escapes. See the error handling convention.
 *
 * The sequence number this class hands out is the second of the two clocks. A ledger balance
 * query uses it to ask what the system knew at a chosen point in the replay, which is how
 * acceptance criterion 1 gets its answer of (370.00) at the end of day five.
 */
export class EventLog {
  private readonly records: IRecordedEvent[] = [];

  /**
   * Records an event the system acted on.
   *
   * @param event - The event as it arrived.
   * @param warnings - Notes that did not prevent acceptance, such as a back valued posting.
   * @returns The frozen record, including the sequence number it was given.
   */
  public accept(event: LedgerEvent, warnings: readonly IEventWarning[] = []): IRecordedEvent {
    return this.append({
      sequence: this.records.length + 1,
      event,
      outcome: 'ACCEPTED',
      refusal: null,
      warnings,
    });
  }

  /**
   * Records an event the system declined, and why.
   *
   * @remarks
   * A refused event still takes a sequence number and still occupies a place in history. It
   * happened, and a reader of the log needs to see that it happened. It simply produces no
   * ledger entry, so it changes no balance.
   *
   * @param event - The event as it arrived.
   * @param code - The stable refusal code.
   * @param detail - A sentence naming the specific values involved, for the printed report.
   * @param warnings - Notes gathered before the refusal was decided.
   * @returns The frozen record.
   */
  public refuse(
    event: LedgerEvent,
    code: RefusalCode,
    detail: string,
    warnings: readonly IEventWarning[] = [],
  ): IRecordedEvent {
    return this.append({
      sequence: this.records.length + 1,
      event,
      outcome: 'REFUSED',
      refusal: { code, detail },
      warnings,
    });
  }

  /**
   * Returns every record, in arrival order.
   *
   * @returns A frozen view of the log.
   */
  public all(): readonly IRecordedEvent[] {
    return Object.freeze([...this.records]);
  }

  /**
   * Returns the records booked on one day, in arrival order.
   *
   * @remarks
   * The report groups by booking day rather than by value date, because the report describes
   * what the bank did each day. A backdated entry appears on the day it arrived, and the day
   * it restates is shown separately.
   *
   * @param bookingDay - The day to filter by.
   * @returns The records booked on that day.
   */
  public forBookingDay(bookingDay: ReplayDay): readonly IRecordedEvent[] {
    return this.records.filter((record) => record.event.bookingDay === bookingDay);
  }

  /**
   * Finds an accepted event by its identifier.
   *
   * @remarks
   * Used by a reversal to check that its target exists and was actually acted on. A reversal
   * naming a refused event must not succeed, because nothing was posted to reverse.
   *
   * @param eventId - The identifier to look for, such as `E7`.
   * @returns The record, or undefined when no accepted event carries that identifier.
   */
  public findAccepted(eventId: string): IRecordedEvent | undefined {
    return this.records.find(
      (record) => record.event.eventId === eventId && record.outcome === 'ACCEPTED',
    );
  }

  /**
   * Reports whether any accepted reversal already names a target.
   *
   * @remarks
   * Guards against reversing the same posting twice, which would credit the account for an
   * amount that only ever left it once.
   *
   * @param eventId - The identifier of the event that might already be reversed.
   * @returns True when an accepted reversal already names it.
   */
  public hasReversalFor(eventId: string): boolean {
    return this.records.some(
      (record) =>
        record.outcome === 'ACCEPTED' &&
        record.event.type === 'REVERSAL' &&
        record.event.reversesEventId === eventId,
    );
  }

  /**
   * Returns the sequence number the next record will be given.
   *
   * @remarks
   * A balance query takes a sequence bound, and a caller often needs the bound that means
   * "everything the system knew just before this event was processed".
   *
   * @returns The next sequence number.
   */
  public nextSequence(): number {
    return this.records.length + 1;
  }

  /**
   * Freezes a record and adds it to the log.
   *
   * @param record - The record to store.
   * @returns The same record, frozen.
   */
  private append(record: IRecordedEvent): IRecordedEvent {
    const frozen = Object.freeze(record);
    this.records.push(frozen);
    return frozen;
  }
}
