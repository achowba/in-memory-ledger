# test-counts

Keeps the suite counts quoted in [`README.md`](../../README.md) and
[`test/README.md`](../../test/README.md) equal to what the suite actually reports.

```
npm run docs:counts        rewrite both files from the suite
npm run docs:counts:check   fail when either file disagrees
```

`npm run verify` runs the check, so a stale count breaks the gate.

## Why this exists

These two numbers went stale twice in one day, and the second time within minutes of being
corrected. Both times the cause was the same: somebody typed a number that a later commit moved.

A count that is typed drifts silently, because nothing fails when it is wrong. The reader who
finds it has no way to tell whether the document is wrong or the suite regressed, which is the
worse of the two failures.

The repository's own pull request template carries a `Numbers?` section for exactly this. Asking
a person to check is what had already failed, so the check is derived now.

## How it works

`test-counts.mjs` runs both suites, reads the counts out of the TAP summary, and rewrites the
region between `<!-- test-counts:start -->` and `<!-- test-counts:end -->`.

Three details worth knowing, because each is a thing that would otherwise go wrong:

**The exit code is ignored.** `npm test` exits non-zero by design, because the suite carries one
intentional failure. A run that printed no TAP summary at all is a different matter and throws.

**A missing marker throws.** Silently doing nothing would let a file drift with the check
reporting success, which is the failure this tool exists to prevent.

**It reads the summary, not the source.** Counting `it(` calls would miss tests generated in a
loop and would count ones inside a comment. The summary is what ran.

## Adding the block to another file

Put the two markers in it and add the path to `TARGETS`. The block between them is generated, so
anything written there by hand is lost on the next write.
