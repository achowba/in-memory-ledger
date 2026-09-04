# Testing convention

## Layout

- A unit test sits beside its source as `{name}.spec.ts`. `fees.ts` is tested by `fees.spec.ts` in the same folder.
- A full replay test lives in `test/` as `{name}.e2e-spec.ts`.
- No separate mirror tree. A test next to its subject is found and updated when that subject changes.

The runner is the built in `node:test`, with `node:assert/strict`. There is no test framework.

## What a test covers

Each unit under test gets three kinds of test: the happy path, the failure the code exists to reject, and the edge case that breaks a naive implementation.

For this project the edge cases that matter are a balance of exactly zero, a rounding tie, a total that does not divide evenly, a fee that cascades into a later day, a settlement larger than its hold, a second settlement against an already settled authorization, and a backdated entry that reopens a closed day.

- Assert on behaviour, not on how it was reached.
- One reason to fail per test. A test whose name contains "and" is usually two tests.
- A test name states the expected behaviour, not the method called.

## Proving a refusal

Where the brief supplies an acceptance criterion that is wrong, the suite does not merely assert the correct answer. The suite demonstrates the arithmetic that makes the criterion false, so `REJECTED.md` is executable rather than merely stated. See `test/rejected-criteria.e2e-spec.ts`.

## The one intentional failure

`test/known-gap.e2e-spec.ts` fails on purpose. Every test in that file has a name beginning `known gap:`, which is how `npm run test:green` excludes them with `--test-skip-pattern`.

- `npm test` runs everything and exits non-zero with exactly one failure.
- `npm run test:green` skips the known gap and passes.

Do not fix the known gap by weakening its assertion. The failure is the deliverable.

## Determinism

- No unseeded randomness.
- No dependence on the real clock. The day is always passed in.
- No dependence on test order, and no shared mutable state between tests. Each test builds what it needs.
