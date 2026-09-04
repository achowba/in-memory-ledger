# errors

## What it does

Holds the stable code taxonomy for everything that can go wrong, and the single exception type the ledger throws.

## How it relates to the rest of the project

Every module imports codes from here. Nothing here imports anything else, so this folder sits at the bottom of the dependency graph and can never take part in a cycle.

## The decision it owns

**A refusal is not an exception.** The codes are split into three sets, and the split decides the handling.

| Set | Meaning | Handling |
|---|---|---|
| `REFUSAL_CODE` | The system is working correctly and is declining an input on purpose. | Append a rejected record to the event log. Continue the replay. |
| `FAULT_CODE` | The model was handed something it cannot represent. | Throw `LedgerError`. Stop the replay. |
| `WARNING_CODE` | Nothing is refused, but a reader must be told. | Attach to the day's report. Change no balance. |

The reason for the split is that the brief requires refusals to be printed. A settlement against an unknown authorization and a declined authorization are both expected outputs of a correct replay, and both appear in the day's error list. Throwing on either would end the run and produce no report at all.

A fault is the opposite case. An unregistered currency or an amount with more precision than its currency means the system would have to guess. A guess in a ledger is worse than a stop, because a stop is loud and a guess is silent.

There is one exception class rather than a hierarchy. A caller branches on `code`, which is stable. A message is written for a human and may be reworded without breaking a test.

## Its dependencies on other modules

None, deliberately.
