# In memory account ledger

An append only, value dated account ledger core. No web layer, no persistence, no user interface, no database. One command replays a fixed stream of ten events across six days and two accounts, and prints what happened.

```
npm ci && npm start
```

---

## Where to look first

This README explains the reasoning behind each decision, so it is long. If you would rather see the thing work, run the two commands above.

### The one thing to understand before anything else

**A ledger has two clocks.** `valueDate` says when an entry changes the balance. The arrival sequence says when the system found out. They normally agree. Event E7 is booked on Day 5 and value dated Day 2, and that single mismatch is what the whole exercise is built on.

It means a day's closing balance is not one number:

| The Day 2 closing balance of ACC-001 | Value | Why |
|---|---|---|
| Asked on Day 2 | 250.00 | Only E1 and E2 exist |
| Asked on Day 5 | (370.00) | E7 has arrived, backdated to Day 2 |
| Asked on Day 6 | 225.00 | E9 has reversed E7, and the fee remains |

All three are correct. So every balance query names both clocks, and there is deliberately no convenience helper that takes a day alone.

### The three files worth reading

| File | Why |
|---|---|
| [`src/modules/ledger/ledger.ts`](src/modules/ledger/ledger.ts) | The two clock balance query, in about ten lines. Everything else in the project is downstream of this one function. |
| [`src/modules/fees/fees.ts`](src/modules/fees/fees.ts) | Why three overdraft fees are charged and not one. A fee is itself value dated, so fees cascade, which is why the walk is ascending and why it covers the whole window rather than today. |
| [`src/common/allocation/allocation.ts`](src/common/allocation/allocation.ts) | Ten lines that decide what a ledger is. BHD 10.000 does not divide by three, so equality and conservation cannot both hold, and only one of them is negotiable. |

### The three decisions most worth disagreeing with

[Interest accrues on restated balances](#interest-accrues-on-restated-balances), giving 0.93 rather than 0.81. [A reversal does not undo a fee](#a-reversal-repairs-interest-and-does-not-repair-a-fee), which leaves the customer 75.10 short. [A settlement with no authorization is refused](REJECTED.md#criterion-4-accepted-with-a-caveat), which no real card issuer could do.

### The suite reports one failure, on purpose

```
npm test             229 tests, 228 pass, 1 fail
npm run test:green   228 tests, 228 pass
```

The failure is in [`test/known-gap.e2e-spec.ts`](test/known-gap.e2e-spec.ts) and it is required by the brief. It is annotated in place with what it reveals. Do not fix it by weakening the assertion.

---

## Contents

- [Quickstart](#quickstart)
- [What the replay produces](#what-the-replay-produces)
- [The eight acceptance criteria](#the-eight-acceptance-criteria)
- [How to read the output](#how-to-read-the-output)
- [Design](#design)
- [Project structure](#project-structure)
- [Commands](#commands)
- [The documents](#the-documents)
- [What is deliberately missing](#what-is-deliberately-missing)

---

## Quickstart

Node 22 or newer. There is one runtime dependency, which is none.

```bash
npm ci        # installs TypeScript, eslint, prettier. Nothing at runtime.
npm start     # compiles and prints the six day report
npm test      # the full suite. Reports exactly one failure, on purpose.
npm run verify   # build, lint and the green suite in one gate
```

---

## What the replay produces

Two accounts. ACC-001 in AED at two decimal places, ACC-002 in BHD at three. Both open at zero.

### Closing balance, as reported at each day close

| Day | ACC-001 | ACC-002 | What happened |
|---|---|---|---|
| 1 | 250.00 | 0.000 | Credit 1,200.00, debit 950.00 |
| 2 | 250.00 | 0.000 | Auth-A approved, 200.00 held, available 50.00 |
| 3 | 650.00 | 0.000 | Credit 400.00 |
| 4 | 465.00 | 0.000 | Auth-A settles 185.00. **E6 refused**, its 180.00 stays put |
| 5 | (230.00) | 10.000 | **E7 lands backdated. Three fees. Auth-B declined** |
| 6 | 390.00 | 10.000 | E9 reverses E7. No new fee |

### The headline figures

| Figure | Value |
|---|---|
| Day 2 closing, at end of Day 5, before fees | **(370.00)** |
| Overdraft fees charged | **3**, on Days 2, 4 and 5, totalling **75.00** |
| Auth-B | **Declined** |
| ACC-001 capitalized interest | **0.93** |
| ACC-002 capitalized interest | **0.008** |
| ACC-001 final | **390.93** |
| ACC-002 final | **10.008** |

Every one of these is derived in [`NUMBERS.md`](NUMBERS.md) and asserted in [`test/replay.e2e-spec.ts`](test/replay.e2e-spec.ts).

### Three fees, and the one that got away

E7 is value dated Day 2, so it lowers every day from Day 2 onward. Three close below zero.

```
Day 2:  1200 - 950 - 620              = (370.00)   fee
Day 3:  1200 - 950 + 400 - 620 - 25   =     5.00   no fee
Day 4:  1200 - 950 + 400 - 185 - 620  = (155.00)   fee
Day 5:  same as Day 4                 = (155.00)   fee
```

Day 3 escapes by 5.00, and only because the fee is AED 25.00. At any fee above AED 30.00 it goes below zero and a fourth is charged. That margin is the most fragile number in the replay.

---

## The eight acceptance criteria

The brief states that some are wrong. Four are, one is untestable, and three hold.

| # | Criterion, in short | Verdict |
|---|---|---|
| 1 | Day 2 closing at end of Day 5, before fees, is (370.00) | Accepted |
| 2 | E7 causes exactly one fee, on Day 2 | **Refused.** Three fees |
| 3 | The Day 4 settlement of Auth-A must be accepted | Accepted |
| 4 | A settlement naming an unknown authorization is rejected | Accepted, with a caveat |
| 5 | If Auth-B is approved, its hold cuts available but not ledger | **Refused as a criterion.** Auth-B is declined |
| 6 | After E9, all balances and fees return to pre-E7 values | **Refused.** The fees stand |
| 7 | The three BHD instalments must each be 3.334 | **Refused.** That totals 10.002 |
| 8 | An interest remainder that does not sum is discarded | **Refused.** It destroys a fils |

Each refusal is argued in [`REJECTED.md`](REJECTED.md) and executed in [`test/rejected-criteria.e2e-spec.ts`](test/rejected-criteria.e2e-spec.ts). **A passing test in that file means the criterion is refuted, not satisfied.**

---

## How to read the output

Each day prints six sections, in this order.

| Section | Holds |
|---|---|
| `EVENTS` | What arrived, its value date, and whether it was accepted or refused |
| `CLOSING LEDGER BALANCE` | Closing, held, and available, per account |
| `RESTATED EARLIER DAYS` | Earlier days whose closing balance moved today. Appears only when something moved |
| `FEE ASSESSMENTS` | Fees booked at this day's close, with both clocks on each |
| `AUTHORIZATION STATES` | Every authorization known so far, whatever its state |
| `ERRORS AND WARNINGS` | Refusals, and notes that did not prevent acceptance |

Two conventions worth knowing.

**A negative amount prints in brackets.** `(230.00)`, not `-230.00`. The accounting convention, and it makes an overdrawn day impossible to miss when scanning a column.

**`RESTATED EARLIER DAYS` is the interesting one.** It is where the two clocks become visible. Day 5 prints Day 2 moving from 250.00 to (395.00), Day 3 from 650.00 to 5.00 and Day 4 from 465.00 to (205.00). Day 6 prints all four moving back.

The interest schedule at the end prints one line per day with a rule and a total under it, aligned, so the column can be added up by eye. That check is the brief's rule that the rounded accruals must sum exactly to the capitalized total.

---

## Design

### Money is an integer

A money value is a `bigint` counting the smallest unit of its currency. AED 415.00 is `41500n` fils, BHD 10.000 is `10000n` fils. There is no floating point anywhere and no decimal library.

A `number` cannot hold `0.1 + 0.2` exactly, which is disqualifying on its own. A decimal library would fix the arithmetic but would move every rounding decision inside somebody else's code behind a configuration option, and this exercise is almost entirely about rounding.

The result is a claim you can check in one pass: **the only rounding in the system is rounding somebody wrote on purpose**, and there are exactly two places it happens. [`common/rounding`](src/common/rounding/) divides. [`common/allocation`](src/common/allocation/) splits. Everything else is exact integer addition.

### Interest accrues on restated balances

The brief never says which version of a day's closing balance to accrue on, and by Day 6 four of the six days have two.

| Reading | ACC-001 total |
|---|---|
| Restated, recomputed with everything known | **0.93** |
| As known at each day's own close | 0.81 |

Restatement is chosen because criterion 1 already restates. It asks for the Day 2 balance "evaluated at end of Day 5", which is the same operation applied to the fee engine. Restating a balance in order to charge a customer, then refusing to restate it in order to pay one, is difficult to defend.

Both numbers are asserted in the spec, so the 0.12 is a stated figure rather than a claim. See [`AMBIGUITIES.md`](AMBIGUITIES.md#a6-which-closing-balance-interest-accrues-on).

### A reversal repairs interest and does not repair a fee

This is the most interesting consequence in the build, and it is deliberate.

**Interest is derived.** It is recomputed from the entries whenever needed, so reversing the cause repairs it with nobody intervening. The days E7 dragged below zero earn again, automatically.

**A fee is an assessed decision.** It records what the system concluded on Day 5 with the facts it had on Day 5. Reversing the cause does not retract the decision, and append only means it cannot be un-booked.

So the account ends **AED 75.10 short** of where it would have been had E7 never posted: 75.00 of fees, plus 0.10 of interest those fees cost by holding every later balance down.

Whether that is right depends on something the brief does not supply. If E7 was a bank error, the fees must be refunded. If the customer's payment was legitimately returned, the account really was overdrawn and they stand. **A reversal carries no reason code**, so this design cannot tell the two apart, applies one rule to both, and is wrong about one of them every time.

That is the one intentional failing test, and it is the control named in [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Value is conserved

Nothing is created and nothing is discarded. Two criteria in the brief break this, in opposite directions, and both are refused for the same reason.

```
criterion 7:  3.334 x 3 = 10.002        invents BHD 0.002
criterion 8:  discard the remainder     destroys AED 0.01
```

The correct answer to both is the same. A split allocates its residual rather than rounding each part independently, and the capitalized interest total is **defined** as the sum of the rounded daily accruals, so the brief's sum rule holds by construction rather than by luck.

---

## Project structure

```
src/
  common/          primitives with no knowledge of the ledger domain
    money/         minor units, the currency registry, parsing, formatting
    rounding/      the one division
    allocation/    the one split
    day/           which days exist, and the value date rule
    errors/        the code taxonomy, split by how each kind is handled
  modules/
    events/        the event union, and the append only log of outcomes
    ledger/        the entries, and the two clock balance query
    authorizations/  holds, and the approval gate
    fees/          the overdraft cascade
    interest/      daily accrual and capitalization
    replay/        the event stream as data, and the engine
    report/        rendering, which never computes a number
  main.ts
test/              the whole replay, the criteria, and the known gap
.agents/conventions/  the standards this repository holds itself to
```

Every folder under `src/` carries a `README.md` covering what it does, how it relates to the rest, and the decisions it owns. Unit tests sit beside their source as `*.spec.ts`; the replay specs live in `test/` as `*.e2e-spec.ts`.

`AGENTS.md` is the index of engineering standards, and `CLAUDE.md` is a symlink to it.

---

## Commands

| Command | Does |
|---|---|
| `npm start` | Compiles and prints the six day report |
| `npm test` | The full suite. **Exactly one failure, on purpose** |
| `npm run test:green` | The suite without the known gap. Clean |
| `npm run verify` | Build, lint and the green suite. The gate before a commit |
| `npm run build` | Compiles to `dist/`. A type error stops the pipeline |
| `npm run lint` | prettier and eslint |

### What the tooling enforces

**TSDoc is checked, not reviewed.** `tsdoc/syntax` is an eslint error, so a malformed tag or one not declared in `tsdoc.json` fails the build.

**A type error stops the pipeline.** `noEmitOnError` is on, so `npm test` cannot pass on code that does not compile.

---

## The documents

| File | Holds |
|---|---|
| [`NUMBERS.md`](NUMBERS.md) | Every constant, why that value, and what changes if it moves. Includes the fee sensitivity table and the rate plausibility check |
| [`AMBIGUITIES.md`](AMBIGUITIES.md) | Twenty two places the brief admits more than one reading, with the number each alternative produces |
| [`REJECTED.md`](REJECTED.md) | The four refused criteria with their arithmetic, criterion 5 under its own heading, and eight approaches abandoned during the build |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Append only at scale, value dating in a UAE licensed bank, the authorization lifecycle, and what was cut |
| [`WORKLOG.md`](WORKLOG.md) | What was done, when |

---

## What is deliberately missing

The full list with the risk each one defers is in [`ARCHITECTURE.md`](ARCHITECTURE.md). The four that matter most:

**Double entry.** This is single entry per customer account. There are no contra accounts for fee income or interest expense, no trial balance, and no way to prove value is conserved across the book rather than within one account. The largest cut by some distance.

**A closed period.** Nothing limits how far back a value date may reach. E7 reaches back three days; nothing would stop it reaching back three years. Every statement and every regulatory return is therefore permanently provisional.

**Authorization expiry.** An authorization here ends as settled or declined, or it does not end at all. Auth-B is declined so no hold survives the window and the gap never shows. It would show on Day 7, as a hold that never releases against funds a customer cannot use.

**Reversal reason codes.** The missing concept behind the one failing test.
