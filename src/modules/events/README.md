# events

## What it does

Defines every kind of event that can arrive, and holds the append only record of what the system decided about each one.

## How it relates to the rest of the project

`modules/replay` reads the event stream and writes decisions here. `modules/report` reads back from here to print each day. Nothing reads an event to compute a balance: that is what `modules/ledger` is for.

The two collections have different jobs, and keeping them apart is deliberate.

| Collection | Holds                                             | Affects a balance |
| ---------- | ------------------------------------------------- | ----------------- |
| Event log  | Every input, accepted or refused, with its reason | No                |
| Ledger     | The balance-affecting entries only                | Yes               |

## The decisions it owns

### A refusal is recorded, not thrown

The brief requires the day four rejection of E6 and the day five decline of Auth-B to appear in the printed output. Both are expected outcomes of a correct replay, so both are recorded with a code and a reason, and the replay continues.

Throwing on either would end the run and produce no report at all, which is the opposite of what the brief asks for. See `.agents/conventions/error-handling.convention.md`.

A refused event still takes a sequence number. It happened, and a reader of the log needs to see that it happened. It simply produces no ledger entry.

### The event union is discriminated, not optional fields

An authorization has an `authId`. A reversal has a `reversesEventId`. A credit has an `instalmentCount`. Modelling those as optional fields on one wide interface would let a settlement be built with no `authId` and fail at runtime.

A discriminated union makes the compiler reject that. Narrowing on `type` gives exactly the fields that kind of event carries, and nothing else.

### One credit event can produce several ledger entries

E10 credits BHD 10.000 "as three equal instalments", so `ICreditEvent` carries an `instalmentCount`.

Splitting E10 into three separate credit events would also break the residual allocation. An
allocation only means anything across a known set of parts. Three independent credits of 3.333
would total 9.999 and quietly lose a fils.

### The log sequence is not the ledger sequence

The number this log hands out orders the log. It counts records, so it does not correspond to a
ledger entry sequence.

A refused event takes a number and posts nothing. One credit event posts three entries when it
is split into instalments. In this replay the log holds ten records and the ledger holds
sixteen entries.

The bound a balance query takes is `ILedgerEntry.sequence`, from `Ledger.nextSequence`. That
bound answers what the system thought the day two balance was, at the end of day five.
Acceptance criterion 1 asks exactly that.

`nextRecordSequence` is named the way it is so the two counters cannot be confused at a call
site.

## Its dependencies on other modules

`common/day` for the two date types, `common/money` for the amount type, and `common/errors` for the refusal and warning codes.
