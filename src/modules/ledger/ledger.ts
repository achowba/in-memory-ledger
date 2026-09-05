import { countsTowards, type Day } from '../../common/day/day.js';
import { sumMinor, type MinorUnits } from '../../common/money/money.js';
import type { EntryOrigin, ILedgerEntry, LedgerEntryDraft } from './ledger-entry.types.js';

/**
 * Which entries a balance query counts.
 *
 * @remarks
 * The two fields are the two clocks, and naming both at every call site is the point. A
 * helper that took only a day would be a correct answer to the wrong question, and somebody
 * would call it by mistake.
 *
 * @property valueDateOnOrBefore - Count entries that change the balance on or before this
 *   day. This selects which entries are economically in scope.
 * @property knownAsOfSequence - Count only entries appended at or before this position in
 *   the ledger's arrival order. Omit it to mean "everything known now". This selects what
 *   the system had learned at the moment being asked about.
 */
export interface IBalanceQuery {
  readonly valueDateOnOrBefore: Day;
  readonly knownAsOfSequence?: number | undefined;
}

/**
 * The append only store of balance-affecting entries, and the queries over it.
 *
 * @remarks
 * A day closing balance is not one number. It depends on when you ask, because a backdated
 * entry changes the answer for a day that already closed.  The brief proves it expects this.
 * Acceptance criterion 1 asks for the day two closing balance "evaluated at end of Day 5". That
 * qualifier only means something if the answer can differ.
 *
 * The Day 2 closing balance of ACC-001 in this replay has three values. It is 250.00 asked on
 * day two. It is (370.00) asked on day five. It is 225.00 asked on day six.
 *
 * Nothing here mutates. There is no update and no delete. A correction is a new entry.
 */
export class Ledger {
  private readonly entries: ILedgerEntry[] = [];

  /**
   * Appends an entry and returns it with its identifier and sequence number.
   *
   * @remarks
   * The identifier is derived from the sequence rather than generated randomly, so two runs
   * of the same event stream produce byte identical output. The testing convention forbids
   * unseeded randomness, and a ledger that cannot be replayed to the same result is not one.
   *
   * @param draft - The entry, without its identifier and sequence number.
   * @returns The frozen entry as stored.
   */
  public append(draft: LedgerEntryDraft): ILedgerEntry {
    const sequence = this.entries.length + 1;
    const entry = Object.freeze({ ...draft, entryId: `L${sequence}`, sequence });

    this.entries.push(entry);
    return entry;
  }

  /**
   * Returns the closing balance of an account for one day.
   *
   * @remarks
   * This is the only way a balance is ever produced. It is the plain sum of the signed
   * amounts of every entry that the query selects, so it is exact and it is reproducible.
   *
   * There is no running total held anywhere and nothing is cached. That is affordable at ten
   * events and is the first thing to break at scale, which is section one of ARCHITECTURE.md.
   *
   * @param accountId - The account to total.
   * @param query - Which entries to count, on both clocks.
   * @returns The closing balance in minor units.
   */
  public balanceMinor(accountId: string, query: IBalanceQuery): MinorUnits {
    return sumMinor(this.entriesFor(accountId, query).map((entry) => entry.amountMinor));
  }

  /**
   * Returns the entries of an account that a query selects, in arrival order.
   *
   * @param accountId - The account to filter by.
   * @param query - Which entries to count. Omit to return every entry of the account.
   * @returns The matching entries.
   */
  public entriesFor(accountId: string, query?: IBalanceQuery): readonly ILedgerEntry[] {
    return this.entries.filter((entry) => {
      if (entry.accountId !== accountId) return false;
      if (query === undefined) return true;
      if (!countsTowards(entry.valueDate, query.valueDateOnOrBefore)) return false;

      return query.knownAsOfSequence === undefined || entry.sequence <= query.knownAsOfSequence;
    });
  }

  /**
   * Reports whether an account already carries an entry of one origin on one value date.
   *
   * @remarks
   * This is the guard behind one overdraft fee per account per day, ever. The guard is on the
   * pair of account and day, not on the assessment run. A later run revisits days that an
   * earlier run already charged. Without the guard, the day two fee would be charged again at
   * every day close from day five onwards.
   *
   * @param accountId - The account to check.
   * @param origin - The kind of entry to look for.
   * @param valueDate - The day to look on.
   * @returns True when such an entry already exists.
   */
  public hasEntry(accountId: string, origin: EntryOrigin, valueDate: Day): boolean {
    return this.entries.some(
      (entry) =>
        entry.accountId === accountId && entry.origin === origin && entry.valueDate === valueDate,
    );
  }

  /**
   * Returns every entry in the ledger, in arrival order.
   *
   * @returns A frozen view, across all accounts.
   */
  public all(): readonly ILedgerEntry[] {
    return Object.freeze([...this.entries]);
  }

  /**
   * Returns the sequence number the next appended entry will be given.
   *
   * @remarks
   * A caller captures this before doing something, then uses it later as a
   * `knownAsOfSequence` bound to ask what the balance looked like beforehand. That is how
   * the report shows the day five balance both before and after the fees are assessed.
   *
   * @returns The next sequence number.
   */
  public nextSequence(): number {
    return this.entries.length + 1;
  }
}
