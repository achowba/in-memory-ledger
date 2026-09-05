# AGENTS.md

Engineering standards for this repository, for humans and for AI coding agents alike.

**This file is an index and must stay one.** Every rule lives in a file under `.agents/conventions/`, listed here with a single line. Read the relevant convention before writing code in that area. Do not add detailed rules to this file, and do not restate a rule that already has a home. One rule, one place.

## What this repository is

An in-memory account ledger core. No web layer, no persistence, no user interface, no database. A runnable script replays a fixed event stream across six days and prints the result. See [README](README.md).

## Critical invariants

Non-negotiable. Each line links to the convention that holds the detail.

1. **Money is an integer count of minor units.** Never a floating point number, and never a third party decimal type. [ledger domain](.agents/conventions/ledger-domain.convention.md)
2. **The ledger is append only.** No record is changed. No record is deleted. A reversal is a new opposite entry. [ledger domain](.agents/conventions/ledger-domain.convention.md)
3. **Every entry carries two clocks:** a value date and an arrival sequence. A balance query names both. [ledger domain](.agents/conventions/ledger-domain.convention.md)
4. **Value is conserved.** A split, an allocation, or a rounding step sums exactly to its total. Nothing is created and nothing is discarded. [ledger domain](.agents/conventions/ledger-domain.convention.md)
5. **Strictest typing.** No `any`, no non-null assertion, no default export, no compiler option weakened to make code pass. [code standards](.agents/conventions/code-standards.convention.md)
6. **Every exported declaration carries a TSDoc block,** above the declaration and never inside it. [tsdoc](.agents/conventions/tsdoc.convention.md), [documentation](.agents/conventions/documentation.convention.md)
7. **Every commit is `type(scope): description`** with a required scope. [commits](.agents/conventions/commits.convention.md)

## Conventions

| Convention                                                                 | Covers                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [artifacts](.agents/conventions/artifacts.convention.md)                   | Where working output is written, and why it is not committed.      |
| [code-standards](.agents/conventions/code-standards.convention.md)         | Typing, naming, constants, module boundaries, file size.           |
| [commits](.agents/conventions/commits.convention.md)                       | Conventional Commits, the scope list, and the history rule.        |
| [documentation](.agents/conventions/documentation.convention.md)           | The module README contract, and comments in the body.              |
| [error-handling](.agents/conventions/error-handling.convention.md)         | Rejection versus exception, error codes, what the log records.     |
| [language-and-style](.agents/conventions/language-and-style.convention.md) | How prose in this repository is written.                           |
| [ledger-domain](.agents/conventions/ledger-domain.convention.md)           | Money, the two clocks, append only, rounding, and the fee cascade. |
| [testing](.agents/conventions/testing.convention.md)                       | Layout, naming, the three cases every test covers, determinism.    |
| [tsdoc](.agents/conventions/tsdoc.convention.md)                           | Where a doc block goes, which tags exist, what it must say.        |

## Layout

| Path                   | Holds                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `src/common/`          | Primitives with no knowledge of the ledger domain: money, rounding, allocation, errors. |
| `src/modules/`         | One folder per concern, each owning its types, its logic, its tests, and its README.    |
| `src/main.ts`          | The entry point. Runs the replay and prints the report.                                 |
| `test/`                | Full replay specs, named `*.e2e-spec.ts`.                                               |
| `.agents/conventions/` | The standards above.                                                                    |
| `.agents/skills/`      | Repeatable workflows: the pull request description, and the review.                     |
| `.github/`             | The pull request template, and its checklist.                                           |
| `artifacts/`           | Workflow output. Not committed. See the artifacts convention.                           |

## The deliverable documents

| File                            | Holds                                                            |
| ------------------------------- | ---------------------------------------------------------------- |
| [README](README.md)             | How to run the suite, and how to read the output.                |
| [NUMBERS](NUMBERS.md)           | Every constant, why that value, and what changes if it moves.    |
| [AMBIGUITIES](AMBIGUITIES.md)   | Every ambiguity found in the brief, and how it was resolved.     |
| [REJECTED](REJECTED.md)         | Acceptance criteria refused, and approaches abandoned mid build. |
| [ARCHITECTURE](ARCHITECTURE.md) | Production considerations arising from the implementation.       |
| [WORKLOG](WORKLOG.md)           | What was done, when.                                             |
