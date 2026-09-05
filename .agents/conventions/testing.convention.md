# Testing convention

## Layout

- A unit test sits beside its source as `{name}.spec.ts`. `fees.ts` is tested by `fees.spec.ts` in the same folder.
- A full replay test lives in `test/` as `{name}.e2e-spec.ts`.
- No separate mirror tree. A test next to its subject is found and updated when that subject changes.

The runner is the built in `node:test`, with `node:assert/strict`. There is no test framework.

## What a test covers

Each unit under test gets three kinds of test. Cover the happy path. Cover the failure the code exists to reject. Cover the edge case that breaks a naive implementation.

These are the edge cases that matter here:

- A balance of exactly zero.
- A rounding tie.
- A total that does not divide evenly.
- A fee that cascades into a later day.
- A settlement larger than its hold.
- A second settlement against an authorization that already settled.
- A backdated entry that reopens a closed day.

- Assert on behaviour, not on how it was reached.
- One reason to fail per test. A test whose name contains "and" is usually two tests.
- A test name states the expected behaviour, not the method called.

## Proving a refusal

Where the brief supplies an acceptance criterion that is wrong, the suite does not merely assert the correct answer. The suite demonstrates the arithmetic that makes the criterion false, so `REJECTED.md` is executable rather than merely stated. See `test/rejected-criteria.e2e-spec.ts`.

## The one intentional failure

`test/known-gap.e2e-spec.ts` fails on purpose. Every test in that file that is expected to fail has a name beginning `known gap:`. That is how `npm run test:green` excludes it, with `--test-skip-pattern`.

The file also holds one passing test, showing the half of the asymmetry that does work. It carries no prefix on purpose. Prefixing it would skip a real assertion in the green run.

- `npm test` runs everything and exits non-zero with exactly one failure.
- `npm run test:green` skips the known gap and passes.

Do not fix the known gap by weakening its assertion. The failure is the deliverable.

## Determinism

- No unseeded randomness.
- No dependence on the real clock. The day is always passed in.
- No dependence on test order, and no shared mutable state between tests. Each test builds what it needs.
