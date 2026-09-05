# test

## What it does

Runs the event stream of the brief end to end and asserts what comes out. Unit tests sit beside their source under `src/`; these are the whole replay.

## The files

| File                             | Covers                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `replay.e2e-spec.ts`             | Every day: closing balances, restatements, fees, authorization states, refusals, interest, final balances, and reproducibility. |
| `accepted-criteria.e2e-spec.ts`  | The three acceptance criteria that survive scrutiny: 1, 3 and 4.                                                                |
| `rejected-criteria.e2e-spec.ts`  | The four that do not: 2, 6, 7 and 8, plus criterion 5, which is untestable rather than false.                                   |
| `order-independence.e2e-spec.ts` | That the E9 and E10 ordering ambiguity changes nothing, and that the warning is raised anyway.                                  |
| `known-gap.e2e-spec.ts`          | The one intentional failure.                                                                                                    |

## How to read a passing test in `rejected-criteria.e2e-spec.ts`

Each one runs the arithmetic that makes the criterion false. Three fees are charged rather than
one. Three parts of 3.334 total 10.002. Discarding the interest remainder loses a fils.

`REJECTED.md` argues those refusals in prose. This directory is what makes the argument checkable.

## The one intentional failure

`npm test` reports exactly one failure, in `known-gap.e2e-spec.ts`. That is required by the brief and is not a defect.

```
npm test         229 tests, 228 pass, 1 fail
npm run test:green   228 tests, 228 pass
```

`test:green` excludes it with `--test-skip-pattern="known gap"`, which is why every test in that file is named with that prefix.

Do not fix the failure by weakening its assertion. It reveals that this design cannot tell a
bank error from a legitimate customer return. A reversal carries no reason code. So the design
applies one fee rule to both, and is wrong about one of them every time. The full reasoning is
in the block comment at the top of that file.
