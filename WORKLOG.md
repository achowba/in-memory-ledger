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

**15:08** Corrected the times above. A review of the published pull requests flagged one range
running backwards, from 15:35 to 14:56. Checking the rest against `git log` showed the whole
afternoon block had been estimated rather than read off the clock, and that one entry sat out
of chronological order as a result. Every time from 14:13 onward now matches the commit it
describes. The brief asks for a real worklog, and an estimated timestamp is not one.

**15:08** Re-audited ARCHITECTURE.md against the literal wording of Part 2 rather than
against my memory of it, and found one real gap.

Section 3 is asked for "every way an authorization in your model can end". I had claimed
exactly one, plus one way it fails to end. Reading the terminal paths in the engine rather
than the state list, there are three endings and one non-ending. I had missed a duplicate
authorization identifier, which is refused at creation and never becomes an authorization,
and I had described settlement for an amount other than the amount held as something
production must add, when the model already does it and releases the residual in full.

That second one was the more useful mistake. It had been filed under work not done, when it
is actually a decision already taken with a global policy where the policy should be per
product.

Fixing it also exposed a contradiction in the next subsection, which claimed six further
endings "none of which this model has". Two of the six were already handled here, one of
them wrongly. Corrected to four endings plus one mirror case, with the duplicate removed
rather than left in both lists.

**18:50** Restructured the README so the contents list is the first section rather than the
third, and expanded it from nine flat links to every heading with a one line gloss on each.

Twenty five anchors written by hand is where a contents list rots. A comma in a heading is the
usual reason: GitHub drops punctuation from a slug, so `### Three fees, and the one that got
away` becomes `#three-fees-and-the-one-that-got-away`, and an anchor keeping the comma renders
as a normal link that goes nowhere. Generated the anchors from the headings rather than typing
them.

**19:11** Reworked the contents list to match the shape used in the reference repository:
heading of "Table of contents", plain nested bullets, two levels, no glosses. The previous
version had bold top level entries and a sentence on each, which was more informative and
did not look like the rest of the family of repositories. Consistency wins for something a
reader recognises by shape before they read it.

Generated the twenty two entries from the headings rather than typing them, so the list cannot
disagree with the document it describes.

## 2026-09-05
