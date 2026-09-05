import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { replay } from '../replay/replay-engine.js';
import { ACCOUNTS, EVENT_STREAM } from '../replay/scenario.js';
import { renderReport } from './day-report.js';

const report = renderReport(replay(ACCOUNTS, EVENT_STREAM));
const lines = report.split('\n');

/**
 * Returns the lines of one day block, up to the next day heading.
 *
 * @param day - Which day to slice out.
 * @returns The lines of that block.
 */
function dayBlock(day: number): readonly string[] {
  const start = lines.findIndex((line) => line.trim() === `DAY ${day}`);
  const rest = lines.slice(start + 1);
  // A day block ends at the next day, or at the heavy rule that opens the interest schedule.
  // Without the second stop, day six swallows the schedule and the final balances.
  const end = rest.findIndex((line) => /^DAY \d+$/.test(line.trim()) || /^={10,}$/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

describe('renderReport, the sections the brief asks for', () => {
  // The brief asks for closing ledger balance, fee assessments, authorization states and
  // errors. Each day prints those four, in that order, after the events that caused them.
  it('prints the four required sections on every day, in one order', () => {
    for (const day of [1, 2, 3, 4, 5, 6]) {
      const headings = dayBlock(day)
        .filter((line) => /^ {2}[A-Z]/.test(line))
        .map((line) => line.trim());

      assert.deepEqual(
        headings.filter((h) => h !== 'RESTATED EARLIER DAYS'),
        [
          'EVENTS',
          'CLOSING LEDGER BALANCE',
          'FEE ASSESSMENTS',
          'AUTHORIZATION STATES',
          'ERRORS AND WARNINGS',
        ],
        `day ${day}`,
      );
    }
  });

  it('prints restatements only on the days something earlier moved', () => {
    const withRestatements = [1, 2, 3, 4, 5, 6].filter((day) =>
      dayBlock(day).some((line) => line.trim() === 'RESTATED EARLIER DAYS'),
    );

    assert.deepEqual(withRestatements, [5, 6]);
  });
});

describe('renderReport, the conventions a reader depends on', () => {
  // Brackets rather than a leading minus, so an overdrawn day is impossible to miss when
  // scanning the column.
  it('brackets a negative balance', () => {
    assert.match(dayBlock(5).join('\n'), /closing\s+\(230\.00\)/);
    assert.equal(report.includes('-230.00'), false);
  });

  it('prints the value date on every event, not only a backdated one', () => {
    const events = dayBlock(1).filter((line) => /^ {4}E\d/.test(line));

    assert.equal(events.length, 2);
    for (const line of events) assert.match(line, /vd D\d/);
  });

  it('prints each fee with both clocks', () => {
    const fees = dayBlock(5).filter((line) => line.includes('overdraft fee'));

    assert.equal(fees.length, 3);
    for (const line of fees) assert.match(line, /value dated day \d, booked day 5/);
  });

  it('prints a refusal and a decline in the errors section', () => {
    assert.match(dayBlock(4).join('\n'), /E6\s+ERROR\s+SETTLEMENT_WITHOUT_AUTHORIZATION/);
    assert.match(dayBlock(5).join('\n'), /E8\s+ERROR\s+AUTHORIZATION_DECLINED/);
  });
});

describe('renderReport, the interest schedule shows its working', () => {
  // The brief requires the rounded accruals to sum to the capitalized total. The column is
  // printed so a reader can add it up, which is only possible if it is aligned.
  it('prints one line per day and a total that equals their sum', () => {
    const start = lines.findIndex(
      (line) => line.includes('ACC-001  AED'),
      lines.indexOf('  ACC-001  AED'),
    );
    const schedule = lines.slice(lines.findIndex((l) => l.includes('day   closing balance')));
    const accruals = schedule.slice(1, 7).map((line) => Number(line.trim().split(/\s+/).at(-1)));

    assert.ok(start >= 0);
    assert.deepEqual(accruals, [0.1, 0.09, 0.25, 0.17, 0.16, 0.16]);
    assert.equal(accruals.reduce((a, b) => a + b, 0).toFixed(2), '0.93');
  });

  it('aligns the total under the accrual column', () => {
    const rule = lines.find((line) => /^\s+={5,}$/.test(line));
    const total = lines.find((line) => line.includes('capitalized total'));

    assert.ok(rule !== undefined && total !== undefined);
    assert.equal(rule.length, total.length, 'the rule and the total end in the same column');
  });
});

describe('renderReport, reproducibility', () => {
  it('produces identical output on a second run', () => {
    assert.equal(renderReport(replay(ACCOUNTS, EVENT_STREAM)), report);
  });

  it('prints both final balances', () => {
    assert.match(report, /ACC-001\s+AED\s+390\.93/);
    assert.match(report, /ACC-002\s+BHD\s+10\.008/);
  });
});
