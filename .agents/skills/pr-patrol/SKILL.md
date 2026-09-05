---
name: pr-patrol
description: Reviews a diff against this repository's conventions, its ledger invariants and its checklist, then writes a severity rated review. Use before merging, or to review somebody else's branch.
---

# pr-patrol

## Purpose

Reviews a diff against the standards this repository already committed to, so a finding cites a rule rather than a preference. Produces a written review, with each finding rated blocking, non-blocking or minor.

## Inputs

| Input  | Default        | Meaning                                                        |
| ------ | -------------- | -------------------------------------------------------------- |
| target | current branch | A pull request number, a branch name, or a base and head pair. |
| scope  | whole diff     | Restrict to given paths.                                       |

## Workflow

1. **Gather the diff.** Use `gh pr diff <number>` for a pull request. Use `git diff <base>...<head>` for a branch. Read the full files behind the hunks. A diff alone hides whether a guard already exists above the change.
2. **Load the standards.** Read every file in `.agents/conventions/` and the checklist in `.github/pull_request_template.md`.
3. **Run the gates first.** `npm run verify` and `npm test`. A finding a tool already reports is not worth a human sentence, and a tool failure the author did not mention is itself a finding.
4. **Review against each dimension.** The list is below.
5. **Verify before reporting.** Read the code path end to end. Confirm the finding is real. State the concrete input or state that produces the wrong result. Discard anything that does not survive this step.
6. **Rate each finding.**
7. **Write the review.** Group by severity, most severe first.

## The dimensions

**Ledger invariants.** The ones this project exists to hold. Each is in [ledger domain](../../conventions/ledger-domain.convention.md).

- Money is a `bigint` of minor units. No floating point. No new rounding outside `common/rounding` and `common/allocation`.
- Nothing mutates or deletes an appended record. A new nested object inside a record must be frozen too, not just the wrapper.
- A balance query names both clocks. Reject any helper that takes a day alone.
- Value is conserved. A split sums to its total. A rounding residual is placed, never discarded.
- The fee walk is ascending, covers the whole window, and charges at most once per account per day.
- Both zero tests stay strict. Overdraft is `< 0n`. Interest is `> 0n`. The availability gate is the deliberate exception at `>= 0n`.

**Correctness.** Does it do what it claims, including at the boundaries. Trace the path rather than reading the summary.

**Error handling.** A refusal is recorded and the replay continues. A fault throws and the replay stops. A code names the situation rather than the message. Nothing both refuses and throws for the same cause. A declared code that nothing raises is dead, and a doc block describing a guard that no code performs is worse than no doc block.

**Determinism.** No clock, no unseeded randomness, no dependence on iteration order that the input does not fix. Two runs must produce a byte identical report.

**Tests.** The happy path, the failure the code exists to reject, and the edge case that breaks a naive implementation. A new refusal path needs a test that reaches it. A test that asserts a balance where it means to assert an entry will break when an unrelated module changes.

**Documentation.** TSDoc above every exported declaration, never inside. Every affected README updated in the same change. Every figure in every document still reproducible by running the code.

## Severity

- **Blocking.** Incorrect behaviour, a broken ledger invariant, a data integrity problem, or new logic with no test.
- **Non-blocking.** A real problem that does not have to stop the merge. Say what should happen and when.
- **Minor.** Naming, wording or structure. Explicitly optional.

## Output

- `artifacts/pr/reviews/<descriptor>_<YYYYMMDDHHMMSS>.review.md`, path printed.
- A summary: counts by severity, and a clear statement of whether anything blocks the merge.
- An empty findings list is a valid result. Say so plainly rather than manufacturing a comment.

## Rules

- Cite the convention. A finding with neither a rule nor a demonstrated failure is a preference. It belongs in Minor, or nowhere.
- Do not restate what the diff does. Report what is wrong with it.
- Do not comment on formatting. Prettier and eslint own it, and `npm run verify` already fails on it.
- Do not report the one intentional failure in `test/known-gap.e2e-spec.ts` as a finding. Report its **absence** as a blocking one.
