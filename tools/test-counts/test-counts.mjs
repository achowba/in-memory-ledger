/**
 * Keeps the suite counts quoted in the READMEs equal to the counts the suite actually reports.
 *
 * These numbers went stale twice in one day, both times because somebody typed them. They are
 * derived now: `--write` rewrites the block, and the default `--check` fails when a README
 * disagrees with the suite, so the gate catches the drift rather than a reader catching it.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/** The files that carry the block, relative to the repository root. */
const TARGETS = ['README.md', 'test/README.md'];

/** Opens the generated region. Everything to the closing marker is replaced. */
const START = '<!-- test-counts:start -->';

/** Closes the generated region. */
const END = '<!-- test-counts:end -->';

/** The glob node itself expands. Quoting matters: the shell must not see it first. */
const SPEC_GLOB = 'dist/**/*spec.js';

/**
 * Runs one suite and reads its counts out of the TAP summary.
 *
 * @remarks
 * The full suite exits non-zero, because it carries one intentional failure. So the exit code
 * is ignored and the summary is parsed either way. A suite that printed no summary at all is a
 * different problem, and throws.
 *
 * @param args - Extra arguments for `node --test`, such as the skip pattern.
 * @returns The test, pass and fail counts.
 * @throws Error When the run produced no TAP summary, which means it did not run.
 */
function countsFor(args) {
  const run = spawnSync('node', ['--test', ...args, SPEC_GLOB], { encoding: 'utf8' });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const read = (field) => {
    const match = new RegExp(`^# ${field} (\\d+)$`, 'm').exec(output);
    if (match === null) {
      throw new Error(`The suite printed no "# ${field}" line. Did it run? Is dist/ built?`);
    }
    return Number(match[1]);
  };
  return { tests: read('tests'), pass: read('pass'), fail: read('fail') };
}

/**
 * Renders the block exactly as it appears between the markers.
 *
 * @remarks
 * The column is padded to the width of the longer command, so the two rows line up in the
 * fenced block. The green run states no failure count, because zero is the only value it can
 * have and printing it invites the reader to wonder when it might not be zero.
 *
 * @param full - Counts from the whole suite.
 * @param green - Counts from the suite without the known gap.
 * @returns The fenced block, with no surrounding blank lines.
 */
function render(full, green) {
  const label = (command) => command.padEnd('npm run test:green'.length);
  return [
    '```',
    `${label('npm test')}   ${full.tests} tests, ${full.pass} pass, ${full.fail} fail`,
    `${label('npm run test:green')}   ${green.tests} tests, ${green.pass} pass`,
    '```',
  ].join('\n');
}

/**
 * Replaces the marked region of one file.
 *
 * @param text - The file's current content.
 * @param block - What the region should hold.
 * @returns The content with the region replaced.
 * @throws Error When either marker is missing, since a silent no-op would let the file drift.
 */
function splice(text, block) {
  const from = text.indexOf(START);
  const to = text.indexOf(END);
  if (from === -1 || to === -1) {
    throw new Error(`Missing ${START} or ${END}.`);
  }
  return `${text.slice(0, from + START.length)}\n\n${block}\n\n${text.slice(to)}`;
}

const write = process.argv.includes('--write');
const full = countsFor([]);
const green = countsFor(['--test-skip-pattern=known gap']);
const block = render(full, green);
const stale = [];

for (const target of TARGETS) {
  const before = readFileSync(target, 'utf8');
  const after = splice(before, block);
  if (before === after) {
    continue;
  }
  if (write) {
    writeFileSync(target, after);
    console.log(`updated  ${target}`);
  } else {
    stale.push(target);
  }
}

if (stale.length > 0) {
  console.error(`The suite counts are stale in: ${stale.join(', ')}`);
  console.error(`Run "npm run docs:counts" to update them. The suite reports:\n${block}`);
  process.exit(1);
}

console.log(
  write
    ? `counts written: ${full.tests} tests, ${full.pass} pass, ${full.fail} fail`
    : `counts current: ${full.tests} tests, ${full.pass} pass, ${full.fail} fail`,
);
