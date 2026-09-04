import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countsTowards, replayDaysThrough } from './day.js';
import { OPENING_DAY, REPLAY_DAYS } from './day.constants.js';

describe('the replay window', () => {
  it('covers six days, day one to day six inclusive', () => {
    assert.deepEqual([...REPLAY_DAYS], [1, 2, 3, 4, 5, 6]);
  });

  it('places the opening day outside the window', () => {
    assert.equal(OPENING_DAY, 0);
    assert.equal(REPLAY_DAYS.includes(OPENING_DAY as never), false);
  });
});

describe('replayDaysThrough', () => {
  it('returns the days up to and including the day given', () => {
    assert.deepEqual([...replayDaysThrough(4)], [1, 2, 3, 4]);
  });

  it('returns the whole window for the last day', () => {
    assert.deepEqual([...replayDaysThrough(6)], [1, 2, 3, 4, 5, 6]);
  });

  it('returns one day for the first day', () => {
    assert.deepEqual([...replayDaysThrough(1)], [1]);
  });

  // Nothing is assessed against the opening day, so a walk through it is empty.
  it('returns nothing for the opening day', () => {
    assert.deepEqual([...replayDaysThrough(OPENING_DAY)], []);
  });

  // Ascending order is what makes the fee cascade settle in a single pass.
  it('returns the days in ascending order', () => {
    const days = replayDaysThrough(6);
    const ascending = [...days].sort((a, b) => a - b);

    assert.deepEqual([...days], ascending);
  });
});

describe('countsTowards', () => {
  it('counts an entry value dated on the day itself', () => {
    assert.equal(countsTowards(3, 3), true);
  });

  it('counts an entry value dated earlier', () => {
    assert.equal(countsTowards(2, 5), true);
  });

  // A future dated entry does not count yet. This is what makes E4, value dated day three,
  // absent from the day two closing balance.
  it('does not count an entry value dated later', () => {
    assert.equal(countsTowards(3, 2), false);
  });

  it('counts the opening balance towards every day', () => {
    assert.equal(countsTowards(OPENING_DAY, 1), true);
    assert.equal(countsTowards(OPENING_DAY, 6), true);
  });
});
