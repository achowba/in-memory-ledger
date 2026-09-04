# Code standards convention

## Typing

- `strict` is on, with `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, and `exactOptionalPropertyTypes`. Do not weaken a compiler option to make code pass.
- `any` is a lint error. Use `unknown` and narrow it.
- A non-null assertion (`!`) is a lint error. Narrow the type, or handle the absent case.
- Prefer a union of string literals over an enum. Where a named set is clearer, use a `const` object with a derived type.
- Type every exported function's parameters and return value explicitly. Inference is fine for a local.
- A record that must never change is `readonly` on every field, and is frozen at construction.

## Naming

- `camelCase` for a variable and a function. `PascalCase` for a type. `SCREAMING_SNAKE_CASE` for a module constant.
- A file is `kebab-case` and carries its role: `hold-register.ts`, `event.types.ts`, `fees.constants.ts`.
- A money identifier ends in `Minor`. See the [ledger domain](ledger-domain.convention.md) convention.
- A boolean reads as a predicate: `isOverdrawn`, `hasFeeForDay`. Not `overdraft`, not `feeFlag`.
- Say what a thing is, not what it is not. `acceptedOnly` rather than `notRejected`.
- An acronym in a type name is fully uppercase. An identifier suffix keeps the conventional `Id` form, as in `accountId`, `authId`, `eventId`.

## Constants live in their own file

A module constant does not sit at the top of the file that uses it. A module constant goes in `<folder>.constants.ts` beside its module.

```
src/modules/fees/fees.constants.ts
src/modules/interest/interest.constants.ts
src/common/money/money.constants.ts
```

This is about where a value can be found and changed. Give each constant a doc block saying what it governs and why it holds that value. A number with no reason is a number nobody dares change. `NUMBERS.md` is the prose companion to these files, not a second source of truth.

## Structure

- A file holds one exported concern. Aim under 300 lines.
- No default exports. A named export keeps an import greppable and a rename honest.
- Dead code is deleted, not commented out. Git holds the history.
- A pure calculation does not read a clock, a random source, or the environment. Pass the day in.

## Imports

- The project is ESM with `nodenext` resolution. A relative import carries the `.js` extension, even from a `.ts` file.
- `import type` for a type-only import, which `verbatimModuleSyntax` enforces.
