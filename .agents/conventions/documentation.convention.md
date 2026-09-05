# Documentation convention

## Doc blocks

See [tsdoc](tsdoc.convention.md). That file covers where a block goes, which tags exist, and what a block must say.

## Comments in the body

- A comment explains why, not what. The code says what.
- Comment the non-obvious decision: why the days are walked in ascending order, why zero is not treated as negative, why a residual goes to the first part.
- Do not narrate. `// add the amount` above `total += amount` is noise.
- Where a line exists because of a specific acceptance criterion or a specific ambiguity, name it. `See AMBIGUITIES.md A8.5` is worth more than a paragraph.

## Module README

Every folder under `src/common/` and `src/modules/` has a `README.md` covering:

1. **What it does.** One paragraph.
2. **How it relates to the rest of the project.** What calls it, and what it calls.
3. **The decisions it owns,** and the reasoning for each.
4. **Its dependencies on other modules,** and why each is needed.

## Keeping docs true

- A README changes in the same commit as the code it describes. Never in a follow up.
- A number that appears in a document must be reproducible by running the code. If a number changes, every document that quotes it changes in the same commit.
