import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Day } from '../../common/day/day.js';
import { ENTRY_ORIGIN, type EntryOrigin } from './ledger-entry.types.js';
import { Ledger } from './ledger.js';

const ACCOUNT = 'ACC-001';

/**
 * Appends one entry with the fields a test cares about and sensible values for the rest.
 *
 * @param ledger - The ledger to append to.
 * @param valueDate - The day the entry changes the balance.
 * @param amountMinor - Signed minor units.
 * @param origin - Why the entry exists. Defaults to a plain credit.
 * @returns The sequence number the entry was given.
 */
function post(
  ledger: Ledger,
  valueDate: Day,
  amountMinor: bigint,
  origin: EntryOrigin = ENTRY_ORIGIN.CREDIT,
): number {
  return ledger.append({
    accountId: ACCOUNT,
    valueDate,
    bookedOnDay: valueDate,
    amountMinor,
    origin,
    sourceEventId: 'TEST',
    reversesEntryId: null,
  }).sequence;
}

describe('Ledger, append only behaviour', () => {
  it('assigns sequence numbers from one, in arrival order', () => {
    const ledger = new Ledger();

    assert.equal(post(ledger, 1, 100n), 1);
    assert.equal(post(ledger, 1, 100n), 2);
  });

  it('assigns deterministic identifiers so two runs match byte for byte', () => {
    const ledger = new Ledger();
    const entry = ledger.append({
      accountId: ACCOUNT,
      valueDate: 1,
      bookedOnDay: 1,
      amountMinor: 100n,
      origin: ENTRY_ORIGIN.CREDIT,
      sourceEventId: 'E1',
      reversesEntryId: null,
    });

    assert.equal(entry.entryId, 'L1');
  });

  // Invariant 2: no record is ever changed. The freeze makes an accidental edit throw
  // rather than corrupt history quietly.
  it('freezes an entry so it cannot be edited after it is appended', () => {
    const ledger = new Ledger();
    post(ledger, 1, 100n);

    const stored = ledger.all()[0];
    assert.ok(stored !== undefined);

    assert.throws(() => {
      (stored as { amountMinor: bigint }).amountMinor = 999n;
    }, TypeError);
    assert.equal(stored.amountMinor, 100n);
  });
});

describe('Ledger, the value date clock', () => {
  it('sums the signed amounts of the entries it selects', () => {
    const ledger = new Ledger();
    post(ledger, 1, 120000n);
    post(ledger, 1, -95000n);

    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 1 }), 25000n);
  });

  // E4 is value dated day three, so it is absent from the day two closing balance even
  // though the system already knows about it.
  it('excludes an entry value dated after the day being asked about', () => {
    const ledger = new Ledger();
    post(ledger, 1, 25000n);
    post(ledger, 3, 40000n);

    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 2 }), 25000n);
    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 3 }), 65000n);
  });

  it('counts an opening balance value dated day zero towards every day', () => {
    const ledger = new Ledger();
    post(ledger, 0, 5000n, ENTRY_ORIGIN.OPENING_BALANCE);

    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 1 }), 5000n);
    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 6 }), 5000n);
  });

  it('keeps the entries of one account out of the balance of another', () => {
    const ledger = new Ledger();
    post(ledger, 1, 25000n);
    ledger.append({
      accountId: 'ACC-002',
      valueDate: 1,
      bookedOnDay: 1,
      amountMinor: 10000n,
      origin: ENTRY_ORIGIN.CREDIT,
      sourceEventId: 'TEST',
      reversesEntryId: null,
    });

    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 1 }), 25000n);
    assert.equal(ledger.balanceMinor('ACC-002', { valueDateOnOrBefore: 1 }), 10000n);
  });
});

describe('Ledger, the arrival clock', () => {
  // This is the whole design in one test. The same day, asked three times, gives three
  // different and equally correct answers, because a backdated entry restates a closed day.
  it('gives three different day two balances as the replay progresses', () => {
    const ledger = new Ledger();

    // Day 1: E1 credits 1,200.00 and E2 debits 950.00, both value dated day one.
    post(ledger, 1, 120000n);
    post(ledger, 1, -95000n);
    const afterDayTwo = ledger.nextSequence() - 1;

    // Day 5: E7 debits 620.00, value dated back to day two.
    post(ledger, 2, -62000n);
    const afterBackdatedDebit = ledger.nextSequence() - 1;

    // Day 5 close: the overdraft fee for day two, value dated day two.
    post(ledger, 2, -2500n, ENTRY_ORIGIN.OVERDRAFT_FEE);

    // Day 6: E9 reverses E7, inheriting its value date of day two.
    post(ledger, 2, 62000n, ENTRY_ORIGIN.REVERSAL);

    const askedOnDayTwo = ledger.balanceMinor(ACCOUNT, {
      valueDateOnOrBefore: 2,
      knownAsOfSequence: afterDayTwo,
    });
    const askedOnDayFive = ledger.balanceMinor(ACCOUNT, {
      valueDateOnOrBefore: 2,
      knownAsOfSequence: afterBackdatedDebit,
    });
    const askedOnDaySix = ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 2 });

    assert.equal(askedOnDayTwo, 25000n, 'day two closes at 250.00 when asked on day two');
    assert.equal(askedOnDayFive, -37000n, 'day two closes at (370.00) when asked on day five');
    assert.equal(askedOnDaySix, 22500n, 'day two closes at 225.00 once E9 has reversed E7');
  });

  it('treats an omitted sequence bound as everything known now', () => {
    const ledger = new Ledger();
    post(ledger, 1, 100n);
    post(ledger, 1, 200n);

    assert.equal(ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 1 }), 300n);
    assert.equal(
      ledger.balanceMinor(ACCOUNT, { valueDateOnOrBefore: 1, knownAsOfSequence: 1 }),
      100n,
    );
  });
});

describe('Ledger, the once per account per day guard', () => {
  it('reports no fee before one is booked', () => {
    const ledger = new Ledger();

    assert.equal(ledger.hasEntry(ACCOUNT, ENTRY_ORIGIN.OVERDRAFT_FEE, 2), false);
  });

  it('reports a fee once one is booked on that day', () => {
    const ledger = new Ledger();
    post(ledger, 2, -2500n, ENTRY_ORIGIN.OVERDRAFT_FEE);

    assert.equal(ledger.hasEntry(ACCOUNT, ENTRY_ORIGIN.OVERDRAFT_FEE, 2), true);
  });

  // The guard is per day, not per account. A fee on day two must not suppress day four.
  it('does not report a fee on a different day', () => {
    const ledger = new Ledger();
    post(ledger, 2, -2500n, ENTRY_ORIGIN.OVERDRAFT_FEE);

    assert.equal(ledger.hasEntry(ACCOUNT, ENTRY_ORIGIN.OVERDRAFT_FEE, 4), false);
  });

  // A debit on day two is not a fee on day two.
  it('does not confuse an entry of a different origin', () => {
    const ledger = new Ledger();
    post(ledger, 2, -62000n, ENTRY_ORIGIN.DEBIT);

    assert.equal(ledger.hasEntry(ACCOUNT, ENTRY_ORIGIN.OVERDRAFT_FEE, 2), false);
  });
});
