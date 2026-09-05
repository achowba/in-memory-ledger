# Labels convention

Every pull request carries labels. They exist so a reader can tell, from the list alone, what a change touches and what kind of review it is asking for.

## The four families

| Family    | Colour | Rule                                                           |
| --------- | ------ | -------------------------------------------------------------- |
| `type:`   | green  | Exactly one. It matches the type of the commits in the branch. |
| `module:` | blue   | One per folder the change touches. More than one is normal.    |
| `area:`   | teal   | For a cross-cutting layer rather than a domain.                |
| concern   | amber  | For the three dimensions this project is most often wrong in.  |

## The vocabulary is the commit scope list

`module:` names match the scopes in [commits](commits.convention.md), which match the folders under `src/`. There is one vocabulary, not two.

A second taxonomy for the same idea is what the index discipline exists to prevent. The GitHub default labels were removed for that reason. `bug`, `documentation` and `enhancement` duplicate `type:fix`, `type:docs` and `type:feat`. None of them had ever been applied.

## The three concern labels earn their place

These are not decoration. Each names a failure this project has already had, and each asks for a specific kind of review rather than for review in general.

**`rounding`** marks a change touching a place a value can be created or lost. Every trap in this brief was a rounding trap. A reviewer needs to check the arithmetic, not the shape of the code.

**`append-only`** marks a change touching history or immutability. A shallow freeze let recorded history be rewritten and passed review once already.

**`numbers`** marks a change that moves a figure the documents quote. A figure here appears in up to five documents at once, so a change that updates one leaves four lying. This is the label that pairs with the `Numbers?` section of the pull request template.

## Applying them

```bash
gh pr edit <number> --add-label "type:feat,module:fees,rounding,numbers"
```

Read the current set with `gh label list` before applying. There is no local cache. Twenty labels fetch instantly, and a cache would be one more thing that can disagree with GitHub.

Create a missing label rather than forcing a change into a label that nearly fits:

```bash
gh label create "<name>" --color <hex> --description "<text>" --force
```

Keep one hue per family. Give every label its own hex, so two labels never look alike at a glance. Keep a description under 100 characters, which is the limit GitHub allows.

## What a label does not do

A label does not record when a change landed. It records what the change touches. A label naming a phase or a sprint goes stale the day after it is applied.
