# Worklog

Real times, in CEST, recorded as the work happened. Newest entry at the bottom.

The brief asks for an intact history. `git log` is the authoritative record of what changed.
This file records why, and records the time spent on thinking that produced no commit.

## 2026-09-04

**11:56** Brief received. Started reading rather than coding. The event stream is small, so the
risk is not implementation effort. The risk is misreading the temporal semantics and then
building the wrong thing correctly.

**11:56 to 13:10** Worked the replay by hand on paper before writing any code. Two findings
decided the whole design.

First, acceptance criterion 1 says the Day 2 closing balance is evaluated "at end of Day 5".
That qualifier only means something if a day's closing balance can hold more than one value.
So the brief is asking for a two-clock ledger, whether or not it says so.

Second, once prior days are restated, E7 pushes Day 2, Day 4 and Day 5 below zero, not Day 2
alone. Three fees, not one. Acceptance criterion 2 contradicts acceptance criterion 1.

Checked Day 3 by hand three times because the margin is small. Day 3 closes at 5.00, which is
650 minus 620 minus the Day 2 fee of 25. Day 3 escapes. A fee above 30.00 would not escape.

**13:12** Raised the interest ambiguity before building anything. Accruing on restated balances
gives 0.93. Accruing on the balance known each night gives 0.81. The brief does not say which,
and the difference is visible in the headline number. Chose restatement, for consistency with
criterion 1. Recorded the alternative and its arithmetic rather than hiding the choice.

**13:37** Repository structure and documentation requirements agreed. Mirror an existing
reference repository: `.agents/conventions/`, a `.gitmessage` template, `CLAUDE.md` as a symlink
to `AGENTS.md`, and TSDoc on every declaration.

**14:04** Plan approved. `git init`.

**14:05** Scaffold. Node 22, TypeScript, `tsc` to `dist`, tests on the built in `node:test`.
No test framework and no runtime dependency.

**14:06** Verified the test runner rather than assuming it. First attempt used the glob
`dist/**/*.spec.js`, which silently matched none of the end to end specs. The reference
repository names those files `*.e2e-spec.ts` with a hyphen, so they end in `-spec.js` and not
in `.spec.js`. Corrected to `dist/**/*spec.js`. Also confirmed `--test-skip-pattern` works,
which is how `test:green` excludes the one intentional failure.

An assumed glob here would have produced a suite that looked green while running none of the
replay tests. That is the exact failure mode the exercise is testing for.

**14:07** Abandoned TypeScript 7.0.2. `typescript-eslint` 8.69.0 declares a peer range of
`>=4.8.4 <6.1.0`, so TypeScript 7 leaves the project with no linter, and therefore no
enforcement of the TSDoc rule. Dropped to 6.0.3. A supported toolchain is worth more than a
newer compiler. Recorded in REJECTED.md as an abandoned approach.

**14:08** Commit 1, the scaffold. Verified the lint rules actually fire by writing a probe file
that breaks five of them, then verified the two custom TSDoc tags are accepted.

## 2026-09-05
