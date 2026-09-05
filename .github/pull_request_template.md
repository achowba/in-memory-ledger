## What?

<!-- What changed, at a level a reviewer can follow without opening the diff or an issue
tracker. Prose, not a ticket number. -->

## Why?

<!-- The goal this serves. Why the change is worth making now. -->

## How?

<!-- The decisions a reviewer should know about: the approach taken, the alternatives
rejected, anything in the diff that would otherwise look odd. Skip the line by line
narration; the diff covers that. -->

## Numbers?

<!-- Delete this section when the change moves no number.

Any change to money, rounding, the fee cascade, the interest schedule or the event stream
changes a figure that five documents quote. Say which figures moved, show the arithmetic,
and confirm NUMBERS.md, AMBIGUITIES.md, REJECTED.md, README.md and ARCHITECTURE.md were
updated in this pull request. A number in a document must be reproducible by running the
code. -->

## Testing?

<!-- What was added or changed, and how it was verified. Tests belong in this pull request,
not a later one. Include the commands run and their result. -->

## Anything Else?

<!-- Follow up work, technical debt taken on deliberately, or something worth a wider
discussion. Say so here rather than leaving it for somebody to find. -->

## Checklist

<!-- Run the `pr-patrol` skill against this diff before requesting review. It checks the
change against the conventions and writes its findings to artifacts/pr/reviews/. -->

- [ ] Follows the conventions in [AGENTS.md](https://github.com/achowba/in-memory-ledger/blob/main/AGENTS.md).
- [ ] Every exported declaration carries a TSDoc block, above the declaration.
- [ ] Every README affected by this change is updated in this pull request.
- [ ] Tests cover the happy path, the failure the code exists to reject, and the edge case.
- [ ] `npm run verify` passes. It runs the build, prettier, eslint, and the green suite.
- [ ] `npm test` reports **exactly one** failure, and it is `test/known-gap.e2e-spec.ts`.
- [ ] No number in any document went stale. See the `Numbers?` section.
- [ ] Money is a `bigint` of minor units. No floating point, and no new rounding outside `common/rounding` or `common/allocation`.
- [ ] Nothing mutates or deletes an appended record.
- [ ] Leaves the project in a working state on its own.
